import { NextResponse } from 'next/server';
import { getClient, getWebhookUrl, validatePhoneNumber } from '../../../../lib/twilio';
import sequelizeDb from '../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';

export async function POST(request) {
  let phoneNumber = null;
  let formattedNumber = null;
  
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const user = authResult.user;
    const body = await request.json();
    
    const {
      customerId,
      saleId,
      agentId = user.id,
      phoneNumber: phoneNum,
      callPurpose = 'follow_up',
      customMessage
    } = body;
    
    phoneNumber = phoneNum;
    
    // Validate required fields
    if (!agentId || !phoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Agent ID and phone number are required' },
        { status: 400 }
      );
    }

    // Get agent information
    const agent = await sequelizeDb.User.findByPk(parseInt(agentId), {
      attributes: ['id', 'firstName', 'lastName']
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, message: 'Agent not found' },
        { status: 404 }
      );
    }

    // Validate and format phone number
    formattedNumber = validatePhoneNumber(phoneNumber);
    if (!formattedNumber) {
      return NextResponse.json(
        { success: false, message: `Invalid phone number format: ${phoneNumber}` },
        { status: 400 }
      );
    }

    // OUTBOUND FLOW (No early media - customer joins conference only after answering):
    // 1. Call customer with simple <Say> TwiML (holding message)
    // 2. statusCallback listens for 'answered' event
    // 3. On 'answered', REST API redirects call to join conference
    // This ensures customer only joins conference AFTER they actually answer

    // Update agent status to busy (agent is starting an outbound attempt)
    await agent.update({ 
      callStatus: 'busy',
      lastCallTime: new Date(),
      totalCalls: (agent.totalCalls || 0) + 1
    });

    const conferenceName = `call-${parseInt(agentId, 10)}`;

    const fromNumber = validatePhoneNumber(process.env.TWILIO_PHONE_NUMBER);
    if (!fromNumber) {
      return NextResponse.json(
        { success: false, message: 'TWILIO_PHONE_NUMBER is not set or invalid' },
        { status: 500 }
      );
    }

    const client = getClient();

    // TwiML URL: Simple holding message (customer waits here until we redirect them)
    // The actual redirect to conference happens in the statusCallback when 'answered'
    const holdingTwimlUrl = new URL(getWebhookUrl('/api/twilio/customer-holding'));
    holdingTwimlUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    holdingTwimlUrl.searchParams.set('conferenceName', conferenceName);

    // Status callback - THIS IS WHERE WE DETECT 'answered' AND ADD TO CONFERENCE
    const statusCallbackUrl = new URL(getWebhookUrl('/api/twilio/call-status-callback'));
    statusCallbackUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    statusCallbackUrl.searchParams.set('direction', 'outbound-api');
    statusCallbackUrl.searchParams.set('callPurpose', String(callPurpose));
    statusCallbackUrl.searchParams.set('conferenceName', conferenceName);
    statusCallbackUrl.searchParams.set('customerPhone', formattedNumber);
    if (customerId) statusCallbackUrl.searchParams.set('customerId', String(customerId));
    if (saleId) statusCallbackUrl.searchParams.set('saleId', String(saleId));

    const timeout = parseInt(process.env.TWILIO_OUTBOUND_RING_TIMEOUT || '30', 10);

    // Place call to customer with holding TwiML
    const call = await client.calls.create({
      to: formattedNumber,
      from: fromNumber,
      url: holdingTwimlUrl.toString(),
      method: 'POST',
      timeout,
      statusCallback: statusCallbackUrl.toString(),
      statusCallbackMethod: 'POST',
      // Listen for 'answered' - this is when we'll redirect to conference
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    console.log('📞 [CALL INITIATE] Outbound call created (will join conference on answer):', {
      customerCallSid: call.sid,
      conferenceName,
      agentId: parseInt(agentId, 10),
      toNumber: formattedNumber,
      fromNumber,
      customerIdParam: customerId || null,
      saleIdParam: saleId || null
    });

    // Create call log immediately
    try {
      await sequelizeDb.CallLog.create({
        callSid: call.sid,
        customerCallSid: call.sid,
        conferenceName: conferenceName,
        agentId: parseInt(agentId, 10),
        customerId: customerId ? parseInt(customerId, 10) : null,
        saleId: saleId ? parseInt(saleId, 10) : null,
        direction: 'outbound',
        fromNumber: fromNumber,
        toNumber: formattedNumber,
        status: 'queued',
        callPurpose: callPurpose || 'follow_up',
        twilioData: {
          customerCallSid: call.sid,
          conferenceName: conferenceName,
          initiatedAt: new Date().toISOString(),
          flowType: 'answer-then-conference'  // New flow type
        }
      });
      console.log('💾 [CALL INITIATE] Call log created:', call.sid);
    } catch (dbError) {
      // Log but don't fail the call if DB save fails
      console.error('❌ [CALL INITIATE] Failed to create initial call log:', dbError.message);
    }

    // Return call info for agent
    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        conferenceName,
        to: formattedNumber,
        agentId: parseInt(agentId, 10),
        customerId: customerId || null,
        saleId: saleId || null,
        callPurpose,
        direction: 'outbound',
        message: 'Outbound call started. Agent should join conference via Twilio Voice SDK.'
      },
      message: 'Call initiated successfully'
    });

  } catch (error) {
    console.error('❌ Error initiating call:', error);
    
    const errorCode = error.code;
    const errorMessage = error.message || 'Failed to initiate call';
    const errorStatus = error.status || 500;
    
    let userMessage = errorMessage;
    
    if (errorMessage.includes('Account not allowed to call')) {
      userMessage = `Account not allowed to call ${formattedNumber || phoneNumber}. Please verify the number in Twilio Console.`;
    } else if (errorCode === 21211) {
      userMessage = `Invalid phone number format: ${formattedNumber || phoneNumber}`;
    } else if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
      userMessage = 'Insufficient account balance. Please add credits to your Twilio account.';
    }
    
    return NextResponse.json(
      { 
        success: false, 
        message: userMessage,
        error: errorMessage,
        code: errorCode,
        status: errorStatus
      },
      { status: errorStatus }
    );
  }
}

// Get call history for a customer or agent
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const agentId = searchParams.get('agentId');
    const saleId = searchParams.get('saleId');
    const limit = parseInt(searchParams.get('limit')) || 50;
    const offset = parseInt(searchParams.get('offset')) || 0;

    const where = {};
    
    if (customerId) where.customerId = customerId;
    if (agentId) where.agentId = agentId;
    if (saleId) where.saleId = saleId;

    const calls = await sequelizeDb.CallLog.findAndCountAll({
      where,
      include: [
        {
          model: sequelizeDb.Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'phone']
        },
        {
          model: sequelizeDb.User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: sequelizeDb.Sale,
          as: 'sale',
          attributes: ['id', 'status']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return NextResponse.json({
      success: true,
      data: {
        calls: calls.rows,
        total: calls.count,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('Error fetching call history:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch call history',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
