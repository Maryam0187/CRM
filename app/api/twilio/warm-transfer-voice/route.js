import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../lib/twilio';

// Handle both GET and POST requests (Twilio can use either)
export async function GET(request) {
  return handleWarmTransferVoice(request);
}

export async function POST(request) {
  return handleWarmTransferVoice(request);
}

async function handleWarmTransferVoice(request) {
  try {
    const url = new URL(request.url);
    let conferenceName = url.searchParams.get('conference');
    
    if (!conferenceName && request.method === 'POST') {
      try {
        const formData = await request.formData();
        conferenceName = formData.get('conference') || url.searchParams.get('conference');
      } catch (e) {
        // Ignore
      }
    }
    
    if (!conferenceName) {
      console.error('❌ Warm transfer: Conference name not provided');
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Transfer failed. Conference not found.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Escape conference name to prevent XML injection
    const safeConferenceName = conferenceName.replace(/[<>&"']/g, '');

    console.log('📞 Warm transfer: Adding participant to conference:', safeConferenceName);

    // Get conference callback URL for tracking conference events
    const conferenceCallbackUrl = getWebhookUrl('/api/twilio/call-status-callback');

    // Create TwiML to join the existing conference
    // Recording is DISABLED
    // startConferenceOnEnter="false" = don't start conference (it already exists)
    // endConferenceOnExit="false" = don't end conference when this participant leaves
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you to the call.</Say>
  <Dial record="false" timeout="30" timeLimit="3600" answerOnMedia="false" answerOnBridge="true">
    <Conference startConferenceOnEnter="false" endConferenceOnExit="false" beep="true" maxParticipants="10" muted="false" statusCallback="${conferenceCallbackUrl}" statusCallbackMethod="POST" statusCallbackEvent="start end join leave mute hold speaker">${safeConferenceName}</Conference>
  </Dial>
  <Hangup/>
</Response>`;

    console.log('📞 Warm transfer TwiML:', twiml);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('❌ Error in warm transfer voice response:', error);
    
    // Fallback TwiML
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry, we're unable to transfer your call at this time. Please try again later.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}

