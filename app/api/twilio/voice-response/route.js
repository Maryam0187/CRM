import { NextResponse } from 'next/server';

export async function POST() {
  const twiml = `
    <?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Say voice="alice">Hello, this is a call from your CRM system.</Say>
      <Pause length="1"/>
      <Say voice="alice">Have a great day!</Say>
      <Hangup/>
    </Response>
  `;

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' }
  });
}
