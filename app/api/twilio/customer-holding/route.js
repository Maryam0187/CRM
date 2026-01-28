import { NextResponse } from 'next/server';

// This TwiML is served to the customer while waiting to be connected to the conference
// The customer will be redirected to the conference when they answer (via statusCallback)

export async function POST(request) {
  return handleHoldingTwiml(request);
}

export async function GET(request) {
  return handleHoldingTwiml(request);
}

async function handleHoldingTwiml(request) {
  try {
    const url = new URL(request.url);
    const agentId = url.searchParams.get('agentId');
    const conferenceName = url.searchParams.get('conferenceName');
    
    console.log('📞 [CUSTOMER HOLDING] Generating holding TwiML:', {
      agentId,
      conferenceName
    });

    // Simple holding TwiML - customer hears a brief message then holds
    // They will be redirected to conference when the statusCallback detects 'answered'
    // Using <Pause> with long duration to keep the call alive while we redirect
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you.</Say>
  <Pause length="60"/>
  <Say voice="alice">Thank you for holding. Please continue to hold.</Say>
  <Pause length="60"/>
  <Say voice="alice">We apologize for the delay. Your call is important to us.</Say>
  <Pause length="60"/>
</Response>`;

    return new NextResponse(twiml, {
      headers: { 
        'Content-Type': 'text/xml',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('❌ [CUSTOMER HOLDING] Error:', error);
    
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold.</Say>
  <Pause length="120"/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}

