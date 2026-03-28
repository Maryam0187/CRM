import { NextResponse } from 'next/server';

/** Twilio-hosted classical hold loop (public HTTPS). */
const HOLD_MUSIC_URL =
  'https://com.twilio.music.classical.s3.amazonaws.com/ith_brahms-116-4.mp3';

function holdMusicTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play loop="0">${HOLD_MUSIC_URL}</Play>
</Response>`;
}

export async function GET() {
  return new NextResponse(holdMusicTwiml(), {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' }
  });
}

export async function POST() {
  return new NextResponse(holdMusicTwiml(), {
    headers: { 'Content-Type': 'text/xml; charset=utf-8' }
  });
}
