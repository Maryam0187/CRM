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
      agentId = user.id,
      phoneNumber: phoneNum
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
    const agent = await sequelizeDb.User.findByPk(parseInt(agentId, 10), {
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

    // Generate unique conference name for IVR calls
    // Format: ivr-call-{agentId}-{timestamp}
    const timestamp = Date.now();
    const conferenceName = `ivr-call-${parseInt(agentId, 10)}-${timestamp}`;

    // Note: We don't update agent status to 'busy' for IVR calls
    // This allows agents to use IVR dialer while maintaining CRM call status

    // Use IVR-specific phone number if set, otherwise fall back to default Twilio number
    const ivrPhoneNumber = process.env.TWILIO_IVR_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;
    const fromNumber = validatePhoneNumber(ivrPhoneNumber);
    if (!fromNumber) {
      return NextResponse.json(
        { success: false, message: 'TWILIO_IVR_PHONE_NUMBER or TWILIO_PHONE_NUMBER is not set or invalid' },
        { status: 500 }
      );
    }

    const client = getClient();

    // Status callback for call status updates
    const statusCallbackUrl = new URL(getWebhookUrl('/api/twilio/call-status-callback'));
    statusCallbackUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    statusCallbackUrl.searchParams.set('direction', 'outbound-ivr');
    statusCallbackUrl.searchParams.set('callPurpose', 'ivr_dialer');
    statusCallbackUrl.searchParams.set('conferenceName', conferenceName);
    statusCallbackUrl.searchParams.set('phoneNumber', formattedNumber);
    statusCallbackUrl.searchParams.set('isIvrCall', 'true');

    const timeout = parseInt(process.env.TWILIO_OUTBOUND_RING_TIMEOUT || '30', 10);

    // TwiML URL: Customer joins conference directly
    const twimlUrl = new URL(getWebhookUrl('/api/twilio/voice-response'));
    twimlUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    twimlUrl.searchParams.set('conferenceName', conferenceName);
    twimlUrl.searchParams.set('isIvrCall', 'true');

    // Place call to customer - they join conference via TwiML
    const call = await client.calls.create({
      to: formattedNumber,
      from: fromNumber,
      url: twimlUrl.toString(),
      method: 'POST',
      timeout,
      statusCallback: statusCallbackUrl.toString(),
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    console.log('📞 [IVR CALL INITIATE]', { 
      callSid: call.sid, 
      conferenceName, 
      to: formattedNumber,
      agentId: parseInt(agentId, 10)
    });

    // Create call log immediately
    try {
      await sequelizeDb.CallLog.create({
        callSid: call.sid,
        customerCallSid: call.sid,
        conferenceName: conferenceName,
        agentId: parseInt(agentId, 10),
        customerId: null, // IVR calls are manual, no customer record
        saleId: null,     // IVR calls are manual, no sale record
        direction: 'outbound',
        fromNumber: fromNumber,
        toNumber: formattedNumber,
        status: 'queued',
        callPurpose: 'ivr_dialer',
        twilioData: {
          customerCallSid: call.sid,
          conferenceName: conferenceName,
          initiatedAt: new Date().toISOString(),
          isIvrCall: true,
          source: 'ivr_dialer'
        }
      });
      console.log('✅ [IVR CALL INITIATE] Call log created successfully');
    } catch (dbError) {
      // Log but don't fail the call if DB save fails
      console.error('❌ [IVR CALL INITIATE] Failed to create initial call log:', dbError.message);
    }

    // Return call info for IVR Dialer
    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        conferenceName,
        to: formattedNumber,
        from: fromNumber,
        agentId: parseInt(agentId, 10),
        customerId: null,
        saleId: null,
        callPurpose: 'ivr_dialer',
        direction: 'outbound-ivr',
        isIvrCall: true,
        message: 'IVR call started. Agent should join conference via Twilio Voice SDK in IVR Dialer.'
      },
      message: 'IVR call initiated successfully'
    });

  } catch (error) {
    console.error('❌ Error initiating IVR call:', error);
    
    const errorCode = error.code;
    const errorMessage = error.message || 'Failed to initiate IVR call';
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
