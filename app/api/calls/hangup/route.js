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

    // Hang up the call by updating its status to 'completed'
    const call = await client.calls(callSid).update({
      status: 'completed'
    });

    console.log('📞 Call hung up:', {
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

