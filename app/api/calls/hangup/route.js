import { NextResponse } from 'next/server';
import { getClient } from '../../../../lib/twilio';
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

