import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../lib/twilio';

// Handle both GET and POST requests (Twilio can use either)
export async function GET(request) {
  return handleVoiceResponse(request);
}

export async function POST(request) {
  return handleVoiceResponse(request);
}

async function handleVoiceResponse(request) {
  try {
    const url = new URL(request.url);
    let agentId = url.searchParams.get('agentId');
    
    if (!agentId && request.method === 'POST') {
      try {
        const formData = await request.formData();
        agentId = formData.get('agentId');
      } catch (e) {
        // Ignore
      }
    }
    
    // Check if call recording is enabled (default to false)
    const recordingEnabled = process.env.TWILIO_ENABLE_RECORDING === 'true';
    
    // Get recording callback URL (only if recording is enabled)
    const recordingCallbackUrl = recordingEnabled ? getWebhookUrl('/api/twilio/recording-callback') : null;
    
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (agentId) {
      // Connect customer directly - agent phone will NOT ring
      const conferenceName = `call-${agentId}-${Date.now()}`;
      
      twiml += `\n  <Dial record="${recordingEnabled ? 'true' : 'false'}"`;
      
      if (recordingEnabled && recordingCallbackUrl) {
        twiml += ` recordingStatusCallback="${recordingCallbackUrl}"`;
      }
      
      twiml += `>`;
      twiml += `\n    <Conference startConferenceOnEnter="true" endConferenceOnExit="true">${conferenceName}</Conference>`;
      twiml += `\n  </Dial>`;
    } else {
      // Fallback: automated message
      twiml += `\n  <Say voice="alice">Hello, this is a call from your CRM system.</Say>`;
      
      if (recordingEnabled && recordingCallbackUrl) {
        twiml += `\n  <Record maxLength="300" action="${recordingCallbackUrl}" playBeep="true" recordingStatusCallback="${recordingCallbackUrl}"/>`;
      }
      
      twiml += `\n  <Say voice="alice">Thank you for your time. Have a great day!</Say>`;
    }
    
    twiml += `\n  <Hangup/>
</Response>`;

    console.log('🎙️ Voice response TwiML:', twiml);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('🎙️ Error in voice response:', error);
    
    // Fallback TwiML
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry, we're unable to connect you at this time. Please try again later.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}
