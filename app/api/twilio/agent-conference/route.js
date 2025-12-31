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
    
    // Recording is DISABLED - no calls will be recorded
    console.log(`📞 Agent joining conference: ${conferenceName}`);
    
    // startConferenceOnEnter="false" prevents hold music while waiting for other participants
    // Conference will start automatically when second participant joins
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="false">
    <Conference startConferenceOnEnter="false" endConferenceOnExit="true" beep="false">${conferenceName}</Conference>
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

