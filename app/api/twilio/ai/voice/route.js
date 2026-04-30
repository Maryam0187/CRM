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

function buildAiVoiceTwiML(requestUrl, formContext = {}) {
  const url = new URL(requestUrl);
  const params = url.searchParams;
  const callSid = formContext.callSid || params.get('CallSid');
  const agentId = formContext.agentId || params.get('agentId');
  const customerId = formContext.customerId || params.get('customerId');
  const saleId = formContext.saleId || params.get('saleId');
  const aiAgentVersion = formContext.aiAgentVersion || params.get('aiAgentVersion') || 'v1';
  const supervisedAi = (formContext.supervisedAi || params.get('supervisedAi') || '') === 'true';

  const streamUrl = new URL(getMediaStreamBaseUrl());
  if (callSid) streamUrl.searchParams.set('callSid', String(callSid));
  if (agentId) streamUrl.searchParams.set('agentId', String(agentId));
  if (customerId) streamUrl.searchParams.set('customerId', String(customerId));
  if (saleId) streamUrl.searchParams.set('saleId', String(saleId));
  streamUrl.searchParams.set('aiAgentVersion', String(aiAgentVersion));
  streamUrl.searchParams.set('supervisedAi', supervisedAi ? 'true' : 'false');

  const safeStreamUrl = xmlEscapeAttribute(streamUrl.toString());
  const safeCallSid = callSid ? xmlEscapeAttribute(callSid) : '';
  const safeAgentId = agentId ? xmlEscapeAttribute(agentId) : '';
  const safeCustomerId = customerId ? xmlEscapeAttribute(customerId) : '';
  const safeSaleId = saleId ? xmlEscapeAttribute(saleId) : '';
  const safeAiAgentVersion = xmlEscapeAttribute(String(aiAgentVersion));
  const safeSupervisedAi = supervisedAi ? 'true' : 'false';

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hi, this is Rebecca from TV technical support.</Say>
  <Say voice="alice">Is this a good time to do a quick receiver check?</Say>
  <Connect>
    <Stream url="${safeStreamUrl}" track="inbound_track">
      <Parameter name="callSid" value="${safeCallSid}"></Parameter>
      <Parameter name="agentId" value="${safeAgentId}"></Parameter>
      <Parameter name="customerId" value="${safeCustomerId}"></Parameter>
      <Parameter name="saleId" value="${safeSaleId}"></Parameter>
      <Parameter name="aiAgentVersion" value="${safeAiAgentVersion}"></Parameter>
      <Parameter name="supervisedAi" value="${safeSupervisedAi}"></Parameter>
    </Stream>
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

    const formContext = {
      callSid: null,
      agentId: null,
      customerId: null,
      saleId: null,
      aiAgentVersion: null,
      supervisedAi: null
    };
    if (request.method === 'POST') {
      try {
        const formData = await request.formData();
        formContext.callSid = formData.get('CallSid');
        formContext.agentId = formData.get('agentId');
        formContext.customerId = formData.get('customerId');
        formContext.saleId = formData.get('saleId');
        formContext.aiAgentVersion = formData.get('aiAgentVersion');
        formContext.supervisedAi = formData.get('supervisedAi');
      } catch (error) {
        console.warn('Unable to parse Twilio form data for AI voice route:', error);
      }
    }

    const twiml = buildAiVoiceTwiML(request.url, formContext);
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

