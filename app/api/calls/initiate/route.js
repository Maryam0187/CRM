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

    const body = await request.json();
    
    // Call recording is DISABLED - no calls will be recorded
    const recordingEnabled = false;
    
    const {
      customerId,
      saleId,
      agentId, 
      phoneNumber: phoneNum, 
      callPurpose = 'follow_up',
      customMessage,
      recordCall = false // Ignored - recording is disabled
    } = body;
    
    phoneNumber = phoneNum;
    
    // Recording is always disabled
    const shouldRecord = false;

    // Validate required fields
    if (!agentId || !phoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Agent ID and phone number are required' },
        { status: 400 }
      );
    }

    // Validate and format phone number
    formattedNumber = validatePhoneNumber(phoneNumber);
    if (!formattedNumber) {
      console.error('❌ Invalid phone number format:', phoneNumber);
      return NextResponse.json(
        { success: false, message: `Invalid phone number format: ${phoneNumber}. Please use E.164 format (e.g., +1234567890)` },
        { status: 400 }
      );
    }
    
    console.log('📞 Phone number validation:', {
      original: phoneNumber,
      formatted: formattedNumber,
      digitsOnly: phoneNumber.replace(/\D/g, ''),
      length: phoneNumber.replace(/\D/g, '').length
    });

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
    
    // Validate Twilio phone number format
    const formattedTwilioNumber = validatePhoneNumber(twilioPhoneNumber);
    if (!formattedTwilioNumber) {
      console.warn('⚠️ Twilio phone number may not be in correct format:', twilioPhoneNumber);
    }

    const statusCallbackUrl = getWebhookUrl('/api/twilio/call-status-callback');

    const voiceUrl = `${getWebhookUrl('/api/twilio/voice-response')}?agentId=${agentId}`;
    const callOptions = {
      url: voiceUrl,
      to: formattedNumber,
      from: twilioPhoneNumber,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      // Disable machine detection to eliminate delay - connect immediately when customer answers
      // machineDetection: 'Enable', // REMOVED - causes ~10 second delay
      answerOnMedia: false // Connect immediately, don't wait for media
      // Note: record option is NOT set - calls will NOT be recorded
    };
    
    console.log('📞 Call request details:', {
      requestPayload: {
        customerId,
        saleId,
        agentId,
        phoneNumber,
        callPurpose
      },
      twilioCallOptions: {
        to: callOptions.to,
        from: callOptions.from,
        url: callOptions.url,
        statusCallback: callOptions.statusCallback
      },
      validation: {
        originalPhoneNumber: phoneNumber,
        formattedPhoneNumber: formattedNumber,
        twilioPhoneNumber: twilioPhoneNumber,
        formattedTwilioNumber: formattedTwilioNumber || twilioPhoneNumber
      }
    });
    
    const call = await client.calls.create(callOptions);
    
    console.log('✅ Call created successfully:', {
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
    console.error('❌ Error initiating call:', error);
    console.error('❌ Error details:', {
      code: error.code,
      message: error.message,
      status: error.status,
      moreInfo: error.moreInfo,
      stack: error.stack
    });
    
    // Extract detailed error information
    const errorCode = error.code;
    const errorMessage = error.message || 'Failed to initiate call';
    const errorStatus = error.status || 500;
    
    // Check for specific Twilio error patterns
    let userMessage = errorMessage;
    
    if (errorMessage.includes('Account not allowed to call')) {
      userMessage = `Account not allowed to call ${formattedNumber || phoneNumber}. This may be due to:
- Geographic restrictions (check Twilio Console → Settings → Geo Permissions)
- Number on deny list (high-risk for fraud)
- Trial account limitations
- Number verification required

Please verify the number in Twilio Console or contact Twilio support.`;
    } else if (errorCode === 21211) {
      userMessage = `Invalid phone number format: ${formattedNumber || phoneNumber}. Please check the number and try again.`;
    } else if (errorCode === 21212) {
      userMessage = `Invalid destination number: ${formattedNumber || phoneNumber}. Please verify the number is correct.`;
    } else if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
      userMessage = 'Insufficient account balance. Please add credits to your Twilio account.';
    }
    
    return NextResponse.json(
      { 
        success: false, 
        message: userMessage,
        error: errorMessage,
        code: errorCode,
        status: errorStatus,
        moreInfo: error.moreInfo || null
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
