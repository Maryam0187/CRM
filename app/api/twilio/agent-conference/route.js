import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../lib/twilio';

export async function GET(request) {
  return handleAgentConference(request);
}

export async function POST(request) {
  return handleAgentConference(request);
}

async function handleAgentConference(request) {
  try {
    const url = new URL(request.url);
    const conferenceName = url.searchParams.get('conferenceName');
    
    if (!conferenceName) {
      console.error('❌ Agent conference: Missing conference name');
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Error: Conference name missing.</Say><Hangup/></Response>`,
        { headers: { 'Content-Type': 'text/xml' }, status: 400 }
      );
    }
    
    const recordingEnabled = process.env.TWILIO_ENABLE_RECORDING === 'true';
    const recordingCallbackUrl = recordingEnabled ? getWebhookUrl('/api/twilio/recording-callback') : null;
    
    console.log(`📞 Agent joining conference: ${conferenceName}`);
    
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
    console.error('❌ Error in agent conference TwiML:', error);
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

