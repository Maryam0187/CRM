/**
 * OpenAI Realtime WebSocket config (GA vs legacy beta preview).
 * Twilio's current sample uses GA: model=gpt-realtime, no OpenAI-Beta header.
 */

function toWsUrl(httpUrl) {
  if (httpUrl.startsWith('https://')) return httpUrl.replace('https://', 'wss://');
  if (httpUrl.startsWith('http://')) return httpUrl.replace('http://', 'ws://');
  return httpUrl;
}

function resolveGaMode(model) {
  const flag = process.env.OPENAI_REALTIME_GA;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  // Auto: newer gpt-realtime* models use GA session shape (no beta header).
  return /^gpt-realtime/i.test(model);
}

function getDefaultModel() {
  return process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
}

function getOpenAiRealtimeConfig() {
  const model = getDefaultModel();
  const isGa = resolveGaMode(model);
  const temperature = process.env.OPENAI_REALTIME_TEMPERATURE;
  const query = new URLSearchParams({ model });
  if (temperature != null && temperature !== '') {
    query.set('temperature', String(temperature));
  }
  return {
    model,
    isGa,
    url: `wss://api.openai.com/v1/realtime?${query.toString()}`
  };
}

function buildOpenAiRealtimeWsHeaders(apiKey, isGa) {
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (!isGa) {
    headers['OpenAI-Beta'] = 'realtime=v1';
  }
  return headers;
}

function buildSessionUpdatePayload(context, isGa) {
  const voice = process.env.OPENAI_REALTIME_VOICE || 'alloy';
  const instructions = context.instructions;

  if (isGa) {
    return {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: context.model,
        output_modalities: ['audio'],
        instructions,
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            turn_detection: { type: 'server_vad' }
          },
          output: {
            format: { type: 'audio/pcmu' },
            voice
          }
        }
      }
    };
  }

  return {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      voice,
      input_audio_format: 'g711_ulaw',
      output_audio_format: 'g711_ulaw',
      turn_detection: { type: 'server_vad' },
      instructions
    }
  };
}

function getAiMediaStreamWsUrl(getWebhookUrlFn) {
  if (process.env.AI_MEDIA_STREAM_WS_URL) {
    return process.env.AI_MEDIA_STREAM_WS_URL.replace(/\/$/, '');
  }
  const railwayHost =
    process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RAILWAY_STATIC_URL;
  if (railwayHost) {
    const host = String(railwayHost).replace(/^https?:\/\//, '');
    return `wss://${host}/ws/ai-media-stream`;
  }
  return toWsUrl(getWebhookUrlFn('/ws/ai-media-stream'));
}

function describeCloseCode(code) {
  const map = {
    1000: 'normal closure',
    1006: 'abnormal closure (no close frame — often handshake/auth failure)',
    1008: 'policy violation',
    1011: 'server error',
    4000: 'OpenAI client error',
    4001: 'OpenAI auth failed — check OPENAI_API_KEY',
    4002: 'OpenAI invalid request',
    4003: 'OpenAI rate limit'
  };
  return map[code] || 'see RFC 6455 / OpenAI Realtime docs';
}

module.exports = {
  getOpenAiRealtimeConfig,
  buildOpenAiRealtimeWsHeaders,
  buildSessionUpdatePayload,
  getAiMediaStreamWsUrl,
  describeCloseCode,
  toWsUrl
};
