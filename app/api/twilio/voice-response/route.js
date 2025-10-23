import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../lib/twilio';

export async function POST(request) {
  try {
    // Get recording callback URL
    const recordingCallbackUrl = getWebhookUrl('/api/twilio/recording-callback');
    
    console.log('🎙️ Voice response - Recording callback URL:', recordingCallbackUrl);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is a call from your CRM system.</Say>
  <Pause length="1"/>
  <Record maxLength="300" action="${recordingCallbackUrl}" playBeep="true" recordingStatusCallback="${recordingCallbackUrl}" transcribe="true" transcribeCallback="${recordingCallbackUrl}"/>
  <Say voice="alice">Thank you for your time. Have a great day!</Say>
  <Hangup/>
</Response>`;

    console.log('🎙️ Voice response TwiML:', twiml);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('🎙️ Error in voice response:', error);
    
    // Fallback TwiML without recording
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is a call from your CRM system.</Say>
  <Say voice="alice">Thank you for your time. Have a great day!</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}
