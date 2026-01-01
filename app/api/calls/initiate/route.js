import { NextResponse } from 'next/server';
import { getClient, validatePhoneNumber, getWebhookUrl } from '../../../../lib/twilio';
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
      attributes: ['id', 'firstName', 'lastName', 'callStatus']
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, message: 'Agent not found' },
        { status: 404 }
      );
    }

    // Check if agent is available
    if (agent.callStatus === 'busy') {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Agent is currently busy on another call' 
        },
        { status: 409 }
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

    // Get Twilio client
    const client = getClient();
    
    // Get Twilio phone number from environment
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioPhoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Twilio phone number not configured' },
        { status: 500 }
      );
    }

    // Include agentId in status callback URL so we don't need to extract it later
    const statusCallbackUrl = `${getWebhookUrl('/api/twilio/call-status-callback')}?agentId=${agentId}`;
    const voiceUrl = `${getWebhookUrl('/api/twilio/voice-response')}?agentId=${agentId}`;

    // Conference name for agent to join via Voice SDK
    const conferenceName = `call-${agentId}`;

    console.log('📞 Call Initiation:', {
      agentId: agent.id,
      customerPhone: formattedNumber,
      conferenceName: conferenceName
    });

    // Create call: Customer → Twilio → Conference (Agent joins via Voice SDK)
    const callOptions = {
      url: voiceUrl,
      to: formattedNumber,  // Customer phone number
      from: twilioPhoneNumber,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      // Enable Answering Machine Detection (AMD) to detect voicemail
      machineDetection: 'Enable',
      machineDetectionTimeout: 30, // Wait up to 30 seconds for AMD result
      machineDetectionSpeechThreshold: 5000, // 5 seconds of speech to confirm human
      machineDetectionSpeechEndThreshold: 2400, // 2.4 seconds of silence to confirm machine
      // Route agent via SIP Domain
      // We'll dial the customer first, then connect to agent via SIP in the voice response
      answerOnMedia: false,
      // Method for TwiML URL - Twilio will use POST by default, but we support both
      method: 'POST'
    };

    console.log('📞 Creating Twilio call with options:', {
      url: voiceUrl,
      to: formattedNumber,
      from: twilioPhoneNumber,
      method: callOptions.method
    });

    const call = await client.calls.create(callOptions);
    
    console.log('✅ Call created successfully:', {
      callSid: call.sid,
      status: call.status,
      to: call.to,
      from: call.from,
      conferenceName: conferenceName
    });

    // Update agent status to busy
    await agent.update({ 
      callStatus: 'busy',
      lastCallTime: new Date(),
      totalCalls: (agent.totalCalls || 0) + 1
    });

    // Create call log entry
    const callLog = await sequelizeDb.CallLog.create({
      callSid: call.sid,
      customerId: customerId || null,
      saleId: saleId || null,
      agentId,
      direction: 'outbound',
      fromNumber: twilioPhoneNumber,
      toNumber: formattedNumber,
      status: 'queued',
      callPurpose,
      twilioData: {
        callSid: call.sid,
        accountSid: call.accountSid,
        to: call.to,
        from: call.from,
        status: call.status,
        direction: call.direction,
        conferenceName: conferenceName
      }
    });

    // Return call info for agent
    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        status: call.status,
        to: call.to,
        from: call.from,
        callLogId: callLog.id,
        conferenceName: conferenceName,
        message: 'Call initiated - agent should join via Voice SDK'
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
