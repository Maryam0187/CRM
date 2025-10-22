import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../lib/twilio';

export async function POST() {
  // Get recording callback URL
  const recordingCallbackUrl = getWebhookUrl('/api/twilio/recording-callback');
  
  const twiml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say voice="alice">Hello, this is a call from your CRM system.</Say>
      <Pause length="1"/>
      <Record 
        maxLength="300" 
        action="${recordingCallbackUrl}" 
        playBeep="true" 
        recordingStatusCallback="${recordingCallbackUrl}"
        transcribe="true"
        transcribeCallback="${recordingCallbackUrl}"
      />
      <Say voice="alice">Thank you for your time. Have a great day!</Say>
      <Hangup/>
    </Response>
  `;

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' }
  });
}
