import { NextResponse } from 'next/server';
import { getClient } from '../../../../lib/twilio';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';

/**
 * IVR Hangup API - For IVR Dialer calls only
 * 
 * This endpoint is specifically for hanging up IVR calls initiated through
 * the IVR Dialer component. It handles IVR calls separately from CRM calls.
 */
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
    const { callSid, conferenceName } = body;

    if (!callSid) {
      return NextResponse.json(
        { success: false, message: 'Call SID is required' },
        { status: 400 }
      );
    }

    // Get Twilio client
    const client = getClient();

    // First, fetch the call to check its current status
    let call;
    try {
      call = await client.calls(callSid).fetch();
      console.log('📞 [IVR HANGUP] Current call status:', call.status);
    } catch (fetchErr) {
      console.error('❌ [IVR HANGUP] Error fetching call:', fetchErr);
      throw new Error(`Failed to fetch call: ${fetchErr.message}`);
    }

    // Make API idempotent: if call is already ended, return success
    if (call.status === 'completed' || call.status === 'canceled' || call.status === 'failed') {
      console.log('📞 [IVR HANGUP] Call already ended, returning success (idempotent)');
      return NextResponse.json({
        success: true,
        data: {
          callSid: call.sid,
          status: call.status,
          isIvrCall: true
        },
        message: 'IVR call already ended'
      });
    }

    // Hang up or cancel the call based on its status
    if (call.status === 'ringing' || call.status === 'queued') {
      // Cancel the call if it's still ringing
      console.log('📞 [IVR HANGUP] Canceling ringing call');
      call = await client.calls(callSid).update({
        status: 'canceled'
      });
    } else {
      // Complete the call if it's in progress
      console.log('📞 [IVR HANGUP] Completing in-progress call');
      call = await client.calls(callSid).update({
        status: 'completed'
      });
    }

    console.log('📞 [IVR HANGUP] Call terminated:', {
      callSid: call.sid,
      status: call.status,
      conferenceName: conferenceName || 'N/A'
    });

    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        status: call.status,
        conferenceName: conferenceName || null,
        isIvrCall: true
      },
      message: 'IVR call hung up successfully'
    });

  } catch (error) {
    console.error('❌ [IVR HANGUP] Error hanging up IVR call:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to hang up IVR call',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
