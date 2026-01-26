import { NextResponse } from 'next/server';
import { getWebhookUrl, validatePhoneNumber } from '../../../../lib/twilio';

// Handle both GET and POST requests (Twilio can use either)
export async function GET(request) {
  return handleTransferVoiceResponse(request);
}

export async function POST(request) {
  return handleTransferVoiceResponse(request);
}

async function handleTransferVoiceResponse(request) {
  try {
    const url = new URL(request.url);
    let transferTo = url.searchParams.get('to');
    const agentId = url.searchParams.get('agentId');
    
    if (!transferTo && request.method === 'POST') {
      try {
        const formData = await request.formData();
        transferTo = formData.get('to') || url.searchParams.get('to');
      } catch (e) {
        // Ignore
      }
    }
    
    if (!transferTo) {
      console.error('❌ Transfer destination not provided');
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Transfer failed. Please try again.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Validate and format phone number
    const formattedNumber = validatePhoneNumber(transferTo);
    if (!formattedNumber) {
      console.error('❌ Invalid transfer destination:', transferTo);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Invalid transfer destination. Please try again.</Say>
  <Hangup/>
</Response>`;
      return new NextResponse(errorTwiml, {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    console.log('📞 Transferring call to:', formattedNumber);

    // Create TwiML to dial the transfer destination
    // Recording is DISABLED
    const dialStatusCallbackUrl = getWebhookUrl(
      `/api/twilio/call-status-callback${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`
    );

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we transfer your call.</Say>
  <Dial record="false"
        timeout="30"
        timeLimit="3600"
        answerOnMedia="false"
        answerOnBridge="true"
        statusCallback="${dialStatusCallbackUrl}"
        statusCallbackMethod="POST"
        statusCallbackEvent="initiated ringing answered completed">
    <Number>${formattedNumber}</Number>
  </Dial>
  <Hangup/>
</Response>`;

    console.log('📞 Transfer TwiML:', twiml);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('❌ Error in transfer voice response:', error);
    
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

