import { NextResponse } from 'next/server';
import { getClient } from '../../../../lib/twilio';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';

/**
 * Hangup API - ONLY for server-side initiated hangups
 * 
 * ⚠️ DO NOT call this when user clicks hangup button!
 * The Twilio Web SDK automatically handles client-side disconnects and sends
 * status updates to the backend via call-status-callback.
 * 
 * This API is ONLY for:
 * - Admin forcing agent to hang up
 * - Auto timeout hangup
 * - IVR logic
 * - Server-side scheduling
 * 
 * Calling this API during a client-side hangup creates a race condition:
 * - SDK sends disconnect → Twilio updates call status
 * - API also tries to update status → conflict
 * - Device states don't match → crashes
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
    const { callSid } = body;

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
      console.log('📞 Current call status:', call.status);
    } catch (fetchErr) {
      console.error('❌ Error fetching call:', fetchErr);
      throw new Error(`Failed to fetch call: ${fetchErr.message}`);
    }

    // Make API idempotent: if call is already ended, return success
    // This prevents errors when frontend calls this after SDK already disconnected
    if (call.status === 'completed' || call.status === 'canceled' || call.status === 'failed') {
      console.log('📞 Call already ended, returning success (idempotent)');
      return NextResponse.json({
        success: true,
        data: {
          callSid: call.sid,
          status: call.status
        },
        message: 'Call already ended'
      });
    }

    // Hang up or cancel the call based on its status
    // If call is ringing, we need to cancel it
    // If call is in-progress, we complete it
    if (call.status === 'ringing' || call.status === 'queued') {
      // Cancel the call if it's still ringing
      console.log('📞 Canceling ringing call');
      call = await client.calls(callSid).update({
        status: 'canceled'
      });
    } else {
      // Complete the call if it's in progress
      console.log('📞 Completing in-progress call');
      call = await client.calls(callSid).update({
        status: 'completed'
      });
    }

    console.log('📞 Call terminated:', {
      callSid: call.sid,
      status: call.status
    });

    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        status: call.status
      },
      message: 'Call hung up successfully'
    });

  } catch (error) {
    console.error('Error hanging up call:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to hang up call',
        error: error.message 
      },
      { status: 500 }
    );
  }
}

