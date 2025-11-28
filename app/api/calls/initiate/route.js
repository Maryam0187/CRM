import { NextResponse } from 'next/server';
import { getClient, validatePhoneNumber, getWebhookUrl } from '../../../../lib/twilio';
import sequelizeDb from '../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';

export async function POST(request) {
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    
    // Check if call recording is enabled (default to false)
    const recordingEnabled = process.env.TWILIO_ENABLE_RECORDING === 'true';
    
    const { 
      customerId, 
      saleId, 
      agentId, 
      phoneNumber, 
      callPurpose = 'follow_up',
      customMessage,
      recordCall = false // Default to false, can be overridden by request
    } = body;
    
    // Only allow recording if globally enabled AND explicitly requested
    const shouldRecord = recordingEnabled && recordCall;

    // Validate required fields
    if (!agentId || !phoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Agent ID and phone number are required' },
        { status: 400 }
      );
    }

    // Validate and format phone number
    const formattedNumber = validatePhoneNumber(phoneNumber);
    if (!formattedNumber) {
      return NextResponse.json(
        { success: false, message: 'Invalid phone number format' },
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
    

    const statusCallbackUrl = getWebhookUrl('/api/twilio/call-status-callback');
    const recordingCallbackUrl = getWebhookUrl('/api/twilio/recording-callback');

    const voiceUrl = `${getWebhookUrl('/api/twilio/voice-response')}?agentId=${agentId}`;
    const callOptions = {
      url: voiceUrl,
      to: formattedNumber,
      from: twilioPhoneNumber,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      machineDetection: 'Enable',
      machineDetectionTimeout: 30,
      answerOnMedia: false
    };
    
    if (shouldRecord) {
      callOptions.record = true;
      callOptions.recordingStatusCallback = recordingCallbackUrl;
    }
    
    const call = await client.calls.create(callOptions);
    
    console.log('📞 Call created:', {
      callSid: call.sid,
      status: call.status,
      to: call.to,
      from: call.from,
      direction: call.direction
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
        startTime: call.startTime,
        endTime: call.endTime
      }
    });

    // Conference name for agent to join via web
    const conferenceName = `call-${agentId}`;

    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        status: call.status,
        to: call.to,
        from: call.from,
        callLogId: callLog.id,
        conferenceName: conferenceName
      },
      message: 'Call initiated successfully - join via web interface'
    });

  } catch (error) {
    console.error('Error initiating call:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to initiate call',
        error: error.message 
      },
      { status: 500 }
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
