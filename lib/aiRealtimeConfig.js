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
  return process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-1.5';
}

function getDefaultTemperature() {
  const raw = process.env.OPENAI_REALTIME_TEMPERATURE;
  if (raw != null && raw !== '') return String(raw);
  return '0.85';
}

function getTurnDetectionConfig(createResponse) {
  const threshold = parseFloat(process.env.OPENAI_REALTIME_VAD_THRESHOLD || '0.5', 10);
  const prefixPaddingMs = parseInt(process.env.OPENAI_REALTIME_VAD_PREFIX_MS || '300', 10);
  const silenceDurationMs = parseInt(process.env.OPENAI_REALTIME_VAD_SILENCE_MS || '1000', 10);
  return {
    type: 'server_vad',
    threshold: Number.isFinite(threshold) ? threshold : 0.5,
    prefix_padding_ms: prefixPaddingMs,
    silence_duration_ms: silenceDurationMs,
    create_response: createResponse
  };
}

function getDefaultVoice() {
  return process.env.OPENAI_REALTIME_VOICE || 'coral';
}

function getOpenAiRealtimeConfig() {
  const model = getDefaultModel();
  const isGa = resolveGaMode(model);
  const temperature = getDefaultTemperature();
  const query = new URLSearchParams({ model });
  query.set('temperature', temperature);
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
  const voice = getDefaultVoice();
  const instructions = context.instructions;
  const createResponse = context.allowAutoResponse !== false;
  const enableTurnDetection = context.enableTurnDetection !== false;

  if (isGa) {
    const input = {
      format: { type: 'audio/pcmu' }
    };
    if (enableTurnDetection) {
      input.turn_detection = getTurnDetectionConfig(createResponse);
    } else {
      input.turn_detection = null;
    }
    return {
      type: 'session.update',
      session: {
        type: 'realtime',
        model: context.model,
        output_modalities: ['audio'],
        instructions,
        audio: {
          input,
          output: {
            format: { type: 'audio/pcmu' },
            voice
          }
        }
      }
    };
  }

  const session = {
    modalities: ['text', 'audio'],
    voice,
    input_audio_format: 'g711_ulaw',
    output_audio_format: 'g711_ulaw',
    instructions
  };
  if (enableTurnDetection) {
    session.turn_detection = getTurnDetectionConfig(createResponse);
  } else {
    session.turn_detection = null;
  }
  return {
    type: 'session.update',
    session
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
  toWsUrl,
  getDefaultVoice,
  getTurnDetectionConfig
};
