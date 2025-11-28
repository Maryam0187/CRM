import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../lib/twilio';

export async function GET(request) {
  return handleJoinConference(request);
}

export async function POST(request) {
  return handleJoinConference(request);
}

async function handleJoinConference(request) {
  try {
    const url = new URL(request.url);
    // When using Twilio Client SDK with a TwiML App, the 'To' parameter
    // in device.connect() is passed as a query parameter to the Voice URL.
    // We expect this 'To' parameter to be the conference name.
    const conferenceName = url.searchParams.get('To');

    if (!conferenceName) {
      console.error('❌ Join Conference: Missing conference name in "To" parameter.');
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Error: Conference name missing.</Say><Hangup/></Response>`,
        { headers: { 'Content-Type': 'text/xml' }, status: 400 }
      );
    }

    const recordingEnabled = process.env.TWILIO_ENABLE_RECORDING === 'true';
    const recordingCallbackUrl = recordingEnabled ? getWebhookUrl('/api/twilio/recording-callback') : null;

    console.log(`📞 Agent joining conference via web: ${conferenceName}`);

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="${recordingEnabled ? 'true' : 'false'}"${recordingEnabled && recordingCallbackUrl ? ` recordingStatusCallback="${recordingCallbackUrl}"` : ''}>
    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${conferenceName}</Conference>
  </Dial>
</Response>`;

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('❌ Error in join conference TwiML:', error);
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Unable to connect to conference.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 500
    });
  }
}

