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
    const conferenceName = url.searchParams.get('conferenceName') || url.searchParams.get('To')?.replace('conference:', '');
    
    const recordingEnabled = process.env.TWILIO_ENABLE_RECORDING === 'true';
    const recordingCallbackUrl = recordingEnabled ? getWebhookUrl('/api/twilio/recording-callback') : null;
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (conferenceName) {
      // Join the conference
      twiml += `\n  <Dial record="${recordingEnabled ? 'true' : 'false'}"`;
      
      if (recordingEnabled && recordingCallbackUrl) {
        twiml += ` recordingStatusCallback="${recordingCallbackUrl}"`;
      }
      
      twiml += `>`;
      twiml += `\n    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false">${conferenceName}</Conference>`;
      twiml += `\n  </Dial>`;
    } else {
      twiml += `\n  <Say voice="alice">Conference room not found.</Say>`;
    }
    
    twiml += `\n  <Hangup/>
</Response>`;

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('Error in join conference:', error);
    
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Unable to connect to conference.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}

