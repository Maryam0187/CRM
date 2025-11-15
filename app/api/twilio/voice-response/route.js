import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../lib/twilio';

export async function POST(request) {
  try {
    // Check if call recording is enabled (default to false)
    const recordingEnabled = process.env.TWILIO_ENABLE_RECORDING === 'true';
    
    // Get recording callback URL (only if recording is enabled)
    const recordingCallbackUrl = recordingEnabled ? getWebhookUrl('/api/twilio/recording-callback') : null;
    
    console.log('🎙️ Voice response - Recording enabled:', recordingEnabled);
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello, this is a call from your CRM system.</Say>
  <Pause length="1"/>`;
    
    // Only add recording if enabled
    if (recordingEnabled && recordingCallbackUrl) {
      twiml += `\n  <Record maxLength="300" action="${recordingCallbackUrl}" playBeep="true" recordingStatusCallback="${recordingCallbackUrl}" transcribe="true" transcribeCallback="${recordingCallbackUrl}"/>`;
    }
    
    twiml += `\n  <Say voice="alice">Thank you for your time. Have a great day!</Say>
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
