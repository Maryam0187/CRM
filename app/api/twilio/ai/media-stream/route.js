import { NextResponse } from 'next/server';
import { ensureAiCallingEnabled } from '../../../../../lib/aiCalling';

export async function GET() {
  const aiGateResponse = ensureAiCallingEnabled();
  if (aiGateResponse) return aiGateResponse;

  return NextResponse.json({
    success: false,
    message: 'Twilio Media Streams requires a WebSocket server. Configure your WS bridge URL here before enabling production traffic.'
  }, { status: 501 });
}

export async function POST() {
  const aiGateResponse = ensureAiCallingEnabled();
  if (aiGateResponse) return aiGateResponse;

  return NextResponse.json({
    success: false,
    message: 'WebSocket transport is not configured on this endpoint.'
  }, { status: 501 });
}

