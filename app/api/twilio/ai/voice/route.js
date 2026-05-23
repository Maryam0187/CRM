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

/** Opt-in only — Start+Conference breaks bidirectional AI playback (Twilio sample uses Connect only). */
function supervisedConferenceModeEnabled() {
  return process.env.AI_SUPERVISED_CONFERENCE_MODE === 'true';
}

function buildStreamParametersXml({
  safeCallSid,
  safeAgentId,
  safeCustomerId,
  safeSaleId,
  safeAiAgentVersion,
  safeSupervisedAi,
  safeSource
}) {
  return `
      <Parameter name="callSid" value="${safeCallSid}"></Parameter>
      <Parameter name="agentId" value="${safeAgentId}"></Parameter>
      <Parameter name="customerId" value="${safeCustomerId}"></Parameter>
      <Parameter name="saleId" value="${safeSaleId}"></Parameter>
      <Parameter name="aiAgentVersion" value="${safeAiAgentVersion}"></Parameter>
      <Parameter name="supervisedAi" value="${safeSupervisedAi}"></Parameter>
      <Parameter name="source" value="${safeSource}"></Parameter>`;
}

/**
 * Outbound customer leg (REST calls.create → customer phone).
 * Uses <Connect><Stream> like Twilio's realtime sample — bidirectional audio so Rebecca can speak.
 * track="inbound_track" = audio from the callee (customer), which is correct for outbound.
 */
function buildOutboundConnectStreamTwiML(requestUrl, formContext = {}) {
  const url = new URL(requestUrl);
  const params = url.searchParams;
  const callSid = formContext.callSid || params.get('CallSid');
  const agentId = formContext.agentId || params.get('agentId');
  const customerId = formContext.customerId || params.get('customerId');
  const saleId = formContext.saleId || params.get('saleId');
  const aiAgentVersion = formContext.aiAgentVersion || params.get('aiAgentVersion') || 'v1';
  const supervisedAi = (formContext.supervisedAi || params.get('supervisedAi') || '') === 'true';
  const source = formContext.source || params.get('source') || (supervisedAi ? 'ai_supervised' : 'ai_unsupervised');

  const streamUrl = new URL(getMediaStreamBaseUrl());
  if (callSid) streamUrl.searchParams.set('callSid', String(callSid));
  if (agentId) streamUrl.searchParams.set('agentId', String(agentId));
  if (customerId) streamUrl.searchParams.set('customerId', String(customerId));
  if (saleId) streamUrl.searchParams.set('saleId', String(saleId));
  streamUrl.searchParams.set('aiAgentVersion', String(aiAgentVersion));
  streamUrl.searchParams.set('supervisedAi', supervisedAi ? 'true' : 'false');
  streamUrl.searchParams.set('source', String(source));
  streamUrl.searchParams.set('direction', 'outbound-api');

  const safeStreamUrl = xmlEscapeAttribute(streamUrl.toString());
  const innerStreamParams = buildStreamParametersXml({
    safeCallSid: callSid ? xmlEscapeAttribute(callSid) : '',
    safeAgentId: agentId ? xmlEscapeAttribute(agentId) : '',
    safeCustomerId: customerId ? xmlEscapeAttribute(customerId) : '',
    safeSaleId: saleId ? xmlEscapeAttribute(saleId) : '',
    safeAiAgentVersion: xmlEscapeAttribute(String(aiAgentVersion)),
    safeSupervisedAi: supervisedAi ? 'true' : 'false',
    safeSource: xmlEscapeAttribute(String(source))
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${safeStreamUrl}">${innerStreamParams}
    </Stream>
  </Connect>
</Response>`;
}

function buildSupervisedConferenceTwiML(requestUrl, formContext = {}) {
  const url = new URL(requestUrl);
  const params = url.searchParams;
  const callSid = formContext.callSid || params.get('CallSid');
  const agentId = formContext.agentId || params.get('agentId');
  const customerId = formContext.customerId || params.get('customerId');
  const saleId = formContext.saleId || params.get('saleId');
  const aiAgentVersion = formContext.aiAgentVersion || params.get('aiAgentVersion') || 'v1';
  const source = formContext.source || params.get('source') || 'ai_supervised';
  const conferenceNameRaw =
    params.get('conferenceName') || (callSid ? `ai-supervised-${callSid}` : '');
  const safeConferenceName = conferenceNameRaw ? xmlEscapeAttribute(conferenceNameRaw) : '';

  const streamUrl = new URL(getMediaStreamBaseUrl());
  if (callSid) streamUrl.searchParams.set('callSid', String(callSid));
  if (agentId) streamUrl.searchParams.set('agentId', String(agentId));
  if (customerId) streamUrl.searchParams.set('customerId', String(customerId));
  if (saleId) streamUrl.searchParams.set('saleId', String(saleId));
  streamUrl.searchParams.set('aiAgentVersion', String(aiAgentVersion));
  streamUrl.searchParams.set('supervisedAi', 'true');
  streamUrl.searchParams.set('source', String(source));
  streamUrl.searchParams.set('supervisedConference', 'true');

  const safeStreamUrl = xmlEscapeAttribute(streamUrl.toString());
  const innerStreamParams = buildStreamParametersXml({
    safeCallSid: callSid ? xmlEscapeAttribute(callSid) : '',
    safeAgentId: agentId ? xmlEscapeAttribute(agentId) : '',
    safeCustomerId: customerId ? xmlEscapeAttribute(customerId) : '',
    safeSaleId: saleId ? xmlEscapeAttribute(saleId) : '',
    safeAiAgentVersion: xmlEscapeAttribute(String(aiAgentVersion)),
    safeSupervisedAi: 'true',
    safeSource: xmlEscapeAttribute(String(source))
  });

  const conferenceHoldMusicUrl = xmlEscapeAttribute(getWebhookUrl('/api/twilio/conference-hold-music'));
  const conferenceCallbackUrl = xmlEscapeAttribute(getWebhookUrl('/api/twilio/call-status-callback'));

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Start>
    <Stream name="ai_supervised_rt" url="${safeStreamUrl}" track="inbound_track">${innerStreamParams}
    </Stream>
  </Start>
  <Dial record="false" timeout="30" timeLimit="3600" answerOnBridge="false" hangupOnStar="false">
    <Conference
      startConferenceOnEnter="true"
      endConferenceOnExit="true"
      beep="false"
      maxParticipants="10"
      waitUrl="${conferenceHoldMusicUrl}"
      waitMethod="GET"
      statusCallback="${conferenceCallbackUrl}"
      statusCallbackMethod="POST"
      statusCallbackEvent="start end join leave mute hold speaker"
    >${safeConferenceName}</Conference>
  </Dial>
</Response>`;
}

function buildAiVoiceTwiML(requestUrl, formContext = {}) {
  const url = new URL(requestUrl);
  const params = url.searchParams;
  const supervisedAi = (formContext.supervisedAi || params.get('supervisedAi') || '') === 'true';
  const direction = String(formContext.direction || params.get('direction') || 'outbound-api');

  const isOutbound = direction === 'outbound' || direction === 'outbound-api';
  if (!isOutbound) {
    console.warn('[AI VOICE] Non-outbound direction on AI voice route, using outbound Connect stream anyway', {
      direction
    });
  }

  if (supervisedAi && supervisedConferenceModeEnabled()) {
    return buildSupervisedConferenceTwiML(requestUrl, formContext);
  }
  return buildOutboundConnectStreamTwiML(requestUrl, formContext);
}

function buildFallbackTwiML() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup></Hangup>
</Response>`;
}

async function handleVoice(request) {
  try {
    const aiGateResponse = ensureAiCallingEnabled();
    if (aiGateResponse) {
      console.warn('AI voice: AI calling disabled, returning hangup TwiML (no TTS).');
      return new NextResponse(buildFallbackTwiML(), {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const formContext = {
      callSid: null,
      direction: 'outbound-api',
      agentId: null,
      customerId: null,
      saleId: null,
      aiAgentVersion: null,
      supervisedAi: null,
      source: null
    };
    if (request.method === 'POST') {
      try {
        const formData = await request.formData();
        formContext.callSid = formData.get('CallSid');
        formContext.direction = formData.get('Direction') || formContext.direction;
        formContext.agentId = formData.get('agentId');
        formContext.customerId = formData.get('customerId');
        formContext.saleId = formData.get('saleId');
        formContext.aiAgentVersion = formData.get('aiAgentVersion');
        formContext.supervisedAi = formData.get('supervisedAi');
        formContext.source = formData.get('source');
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
    return new NextResponse(buildFallbackTwiML(), {
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
