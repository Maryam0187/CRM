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

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi, this is Rebecca from TV technical support.</Say>
  <Say voice="alice">Is this a good time to do a quick receiver check?</Say>
  <Connect>
    <Stream url="${streamUrl.toString()}" track="inbound_track" />
  </Connect>
</Response>`;
}

async function handleVoice(request) {
  const aiGateResponse = ensureAiCallingEnabled();
  if (aiGateResponse) return aiGateResponse;

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
}

export async function GET(request) {
  return handleVoice(request);
}

export async function POST(request) {
  return handleVoice(request);
}

