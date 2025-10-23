import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../lib/twilio';

export async function POST() {
  try {
    const recordingCallbackUrl = getWebhookUrl('/api/twilio/recording-callback');
    
    console.log('🎙️ Test voice - Recording callback URL:', recordingCallbackUrl);
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This is a test call with recording.</Say>
  <Record maxLength="60" action="${recordingCallbackUrl}" playBeep="true" recordingStatusCallback="${recordingCallbackUrl}"/>
  <Say voice="alice">Recording complete. Thank you!</Say>
  <Hangup/>
</Response>`;

    console.log('🎙️ Test voice TwiML:', twiml);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('🎙️ Error in test voice response:', error);
    
    return new NextResponse('Error', { status: 500 });
  }
}
