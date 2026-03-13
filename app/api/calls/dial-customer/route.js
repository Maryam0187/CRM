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
      customerName,
      state,
      city,
      zipcode,
      conferenceName,
      callPurpose = 'follow_up',
      callSource,
      customMessage,
      callNotes
    } = body;
    
    phoneNumber = phoneNum;
    
    // Validate required fields
    if (!agentId || !phoneNumber || !conferenceName) {
      return NextResponse.json(
        { success: false, message: 'Agent ID, phone number, and conference name are required' },
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

    const fromNumber = validatePhoneNumber(process.env.TWILIO_PHONE_NUMBER);
    if (!fromNumber) {
      return NextResponse.json(
        { success: false, message: 'TWILIO_PHONE_NUMBER is not set or invalid' },
        { status: 500 }
      );
    }

    const client = getClient();

    // Status callback for call status updates
    const statusCallbackUrl = new URL(getWebhookUrl('/api/twilio/call-status-callback'));
    statusCallbackUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    statusCallbackUrl.searchParams.set('direction', 'outbound-api');
    statusCallbackUrl.searchParams.set('callPurpose', String(callPurpose));
    statusCallbackUrl.searchParams.set('conferenceName', conferenceName);
    statusCallbackUrl.searchParams.set('customerPhone', formattedNumber);
    if (customerId) statusCallbackUrl.searchParams.set('customerId', String(customerId));
    if (saleId) statusCallbackUrl.searchParams.set('saleId', String(saleId));

    const timeout = parseInt(process.env.TWILIO_OUTBOUND_RING_TIMEOUT || '30', 10);

    // TwiML URL: Customer joins existing conference
    const twimlUrl = new URL(getWebhookUrl('/api/twilio/voice-response'));
    twimlUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    twimlUrl.searchParams.set('conferenceName', conferenceName);

    // Place call to customer - they join existing conference via TwiML
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

    console.log('📞 [DIAL CUSTOMER]', { callSid: call.sid, conferenceName, to: formattedNumber });

    // Update or create call log
    try {
      // Try to find existing call log by conference name
      let callLog = await sequelizeDb.CallLog.findOne({
        where: { conferenceName: conferenceName },
        order: [['created_at', 'DESC']]
      });

      if (callLog) {
        // Update existing call log with customer call SID and optional customerName
        const updateData = {
          callSid: call.sid,
          customerCallSid: call.sid,
          status: 'queued',
          twilioData: {
            ...(callLog.twilioData || {}),
            customerCallSid: call.sid,
            dialedAt: new Date().toISOString()
          }
        };
        if (customerName != null && customerName !== '') {
          updateData.customerName = customerName;
        }
        if (state != null) updateData.state = state;
        if (city != null) updateData.city = city;
        if (zipcode != null) updateData.zipcode = zipcode;
        if (callNotes != null) updateData.callNotes = callNotes;
        if (callSource != null) updateData.callSource = callSource;
        await callLog.update(updateData);
      } else {
        // Create new call log if not found (agentId, saleId null, customerId null for quick dial)
        callLog = await sequelizeDb.CallLog.create({
          callSid: call.sid,
          customerCallSid: call.sid,
          conferenceName: conferenceName,
          agentId: parseInt(agentId, 10),
          customerId: customerId ? parseInt(customerId, 10) : null,
          saleId: saleId ? parseInt(saleId, 10) : null,
          customerName: customerName || null,
          state: state || null,
          city: city || null,
          zipcode: zipcode || null,
          callNotes: callNotes != null ? String(callNotes) : null,
          direction: 'outbound',
          fromNumber: fromNumber,
          toNumber: formattedNumber,
          status: 'queued',
          callPurpose: callPurpose || 'follow_up',
          callSource: callSource || null,
          twilioData: {
            customerCallSid: call.sid,
            conferenceName: conferenceName,
            dialedAt: new Date().toISOString()
          }
        });
      }
    } catch (dbError) {
      // Log but don't fail the call if DB save fails
      console.error('❌ [DIAL CUSTOMER] Failed to update/create call log:', dbError.message);
    }

    // Return call info
    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        conferenceName,
        to: formattedNumber,
        from: fromNumber
      }
    });
  } catch (error) {
    console.error('❌ [DIAL CUSTOMER] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        message: error.message || 'Failed to dial customer',
        error: error.message
      },
      { status: 500 }
    );
  }
}

