import { NextResponse } from 'next/server';
import { getClient, validatePhoneNumber } from '../../../../lib/twilio';
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
    const { callSid, transferTo } = body;

    if (!callSid) {
      return NextResponse.json(
        { success: false, message: 'Call SID is required' },
        { status: 400 }
      );
    }

    if (!transferTo) {
      return NextResponse.json(
        { success: false, message: 'Transfer destination phone number is required' },
        { status: 400 }
      );
    }

    // Validate phone number
    const formattedNumber = validatePhoneNumber(transferTo);
    if (!formattedNumber) {
      return NextResponse.json(
        { success: false, message: 'Invalid phone number format' },
        { status: 400 }
      );
    }

    // Get Twilio client
    const client = getClient();

    // Fetch the call to check its current status
    let call;
    try {
      call = await client.calls(callSid).fetch();
      console.log('📞 Current call status:', call.status);
    } catch (fetchErr) {
      console.error('❌ Error fetching call:', fetchErr);
      return NextResponse.json(
        { success: false, message: 'Call not found or inaccessible' },
        { status: 404 }
      );
    }

    // Check if call is in a transferable state
    if (call.status !== 'in-progress' && call.status !== 'ringing') {
      return NextResponse.json(
        { success: false, message: `Call cannot be transferred. Current status: ${call.status}` },
        { status: 400 }
      );
    }

    // Get webhook URL for the transfer
    const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_BASE_URL || '';
    const transferUrl = `${baseUrl}/api/twilio/transfer-voice-response?to=${encodeURIComponent(formattedNumber)}`;

    // Update the call to redirect to transfer URL
    // This will redirect the call to the new destination
    try {
      const updatedCall = await client.calls(callSid).update({
        url: transferUrl,
        method: 'POST'
      });

      console.log('📞 Call transferred:', {
        callSid: updatedCall.sid,
        status: updatedCall.status,
        transferTo: formattedNumber
      });

      return NextResponse.json({
        success: true,
        data: {
          callSid: updatedCall.sid,
          status: updatedCall.status,
          transferTo: formattedNumber
        },
        message: 'Call transfer initiated successfully'
      });
    } catch (updateErr) {
      console.error('❌ Error transferring call:', updateErr);
      throw new Error(`Failed to transfer call: ${updateErr.message}`);
    }

  } catch (error) {
    console.error('Error transferring call:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to transfer call',
        error: error.message
      },
      { status: 500 }
    );
  }
}

