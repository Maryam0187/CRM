import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { getClient, getWebhookUrl } from '../../../../lib/twilio';

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

    const user = authResult.user;
    const body = await request.json();
    const { conferenceName } = body;

    if (!conferenceName) {
      return NextResponse.json(
        { error: 'Conference name is required' },
        { status: 400 }
      );
    }

    const client = getClient();
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    const twilioAppSid = process.env.TWILIO_APP_SID;

    if (!twilioPhoneNumber || !twilioAppSid) {
      return NextResponse.json(
        { error: 'Twilio configuration missing' },
        { status: 500 }
      );
    }

    // Create a call that connects the agent to the conference
    // Using TwiML App which will route to join-conference endpoint
    const agentIdentity = `agent-${user.id}`;
    const joinConferenceUrl = `${getWebhookUrl('/api/twilio/join-conference')}?To=${encodeURIComponent(conferenceName)}`;

    console.log(`📞 Creating call for agent ${user.id} to join conference ${conferenceName}`);
    console.log(`📞 From number: ${twilioPhoneNumber}`);
    console.log(`📞 To number: client:${agentIdentity}`);

    // Use Twilio REST API to create a call using the TwiML App
    // This will use the TwiML App's Voice URL to connect to the conference
    const call = await client.calls.create({
      url: joinConferenceUrl,
      to: `client:${agentIdentity}`, // Use client: prefix for Twilio Client
      from: twilioPhoneNumber,
      statusCallback: getWebhookUrl('/api/twilio/call-status-callback'),
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    console.log(`📞 Agent call created: ${call.sid}`);

    return NextResponse.json({
      success: true,
      callSid: call.sid,
      conferenceName: conferenceName
    });

  } catch (error) {
    console.error('Error connecting agent to conference:', error);
    return NextResponse.json(
      { error: 'Failed to connect agent to conference', message: error.message },
      { status: 500 }
    );
  }
}

