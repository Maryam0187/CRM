import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../../lib/twilio';
import { ensureAiCallingEnabled } from '../../../../../lib/aiCalling';

function toWsUrl(httpUrl) {
  if (httpUrl.startsWith('https://')) return httpUrl.replace('https://', 'wss://');
  if (httpUrl.startsWith('http://')) return httpUrl.replace('http://', 'ws://');
  return httpUrl;
}

function getMediaStreamBaseUrl() {
  if (process.env.AI_MEDIA_STREAM_WS_URL) return process.env.AI_MEDIA_STREAM_WS_URL;
  return toWsUrl(getWebhookUrl('/ws/ai-media-stream'));
}

function xmlEscapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;');
}

function buildAiVoiceTwiML(requestUrl, formCallSid = null) {
  const url = new URL(requestUrl);
  const params = url.searchParams;
  const callSid = formCallSid || params.get('CallSid');
  const agentId = params.get('agentId');
  const customerId = params.get('customerId');
  const saleId = params.get('saleId');
  const aiAgentVersion = params.get('aiAgentVersion') || 'v1';

  const streamUrl = new URL(getMediaStreamBaseUrl());
  if (callSid) streamUrl.searchParams.set('callSid', String(callSid));
  if (agentId) streamUrl.searchParams.set('agentId', String(agentId));
  if (customerId) streamUrl.searchParams.set('customerId', String(customerId));
  if (saleId) streamUrl.searchParams.set('saleId', String(saleId));
  streamUrl.searchParams.set('aiAgentVersion', String(aiAgentVersion));

  const safeStreamUrl = xmlEscapeAttribute(streamUrl.toString());

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi, this is Rebecca from TV technical support.</Say>
  <Say voice="alice">Is this a good time to do a quick receiver check?</Say>
  <Connect>
    <Stream url="${safeStreamUrl}" track="inbound_track"></Stream>
  </Connect>
</Response>`;
}

function buildFallbackTwiML(message = 'We are unable to connect your call right now. Please try again later.') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${message}</Say>
  <Hangup></Hangup>
</Response>`;
}

async function handleVoice(request) {
  try {
    const aiGateResponse = ensureAiCallingEnabled();
    if (aiGateResponse) {
      const fallback = buildFallbackTwiML('AI calling is currently unavailable.');
      return new NextResponse(fallback, {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    let formCallSid = null;
    if (request.method === 'POST') {
      try {
        const formData = await request.formData();
        formCallSid = formData.get('CallSid');
      } catch (error) {
        console.warn('Unable to parse Twilio form data for AI voice route:', error);
      }
    }

    const twiml = buildAiVoiceTwiML(request.url, formCallSid);
    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('AI voice route failure:', error);
    const fallback = buildFallbackTwiML();
    return new NextResponse(fallback, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}

export async function GET(request) {
  return handleVoice(request);
}

export async function POST(request) {
  return handleVoice(request);
}

