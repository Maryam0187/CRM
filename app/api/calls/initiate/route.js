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

    // SIMPLE OUTBOUND FLOW:
    // - Server creates the customer PSTN call via Twilio REST API.
    // - Both customer and agent join a conference named `call-<agentId>`.
    // - Frontend connects the agent to that conference using Twilio Voice SDK.

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

    // TwiML URL: customer leg joins the conference
    const twimlUrl = new URL(getWebhookUrl('/api/twilio/voice-response'));
    twimlUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    twimlUrl.searchParams.set('conferenceName', conferenceName);

    // Status callback for customer leg
    const statusCallbackUrl = new URL(getWebhookUrl('/api/twilio/call-status-callback'));
    statusCallbackUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    statusCallbackUrl.searchParams.set('direction', 'outbound-api');
    statusCallbackUrl.searchParams.set('callPurpose', String(callPurpose));
    if (customerId) statusCallbackUrl.searchParams.set('customerId', String(customerId));
    if (saleId) statusCallbackUrl.searchParams.set('saleId', String(saleId));

    const timeout = parseInt(process.env.TWILIO_OUTBOUND_RING_TIMEOUT || '90', 10);

    const call = await client.calls.create({
      to: formattedNumber,
      from: fromNumber,
      url: twimlUrl.toString(),
      method: 'POST',
      timeout,
      statusCallback: statusCallbackUrl.toString(),
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'queued', 'in-progress', 'ringing', 'answered', 'completed']
    });

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
