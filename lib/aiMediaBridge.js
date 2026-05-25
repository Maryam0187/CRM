const { WebSocketServer, WebSocket } = require('ws');
const { URL } = require('url');
const {
  getOpenAiRealtimeConfig,
  buildOpenAiRealtimeWsHeaders,
  buildSessionUpdatePayload,
  describeCloseCode
} = require('./aiRealtimeConfig');
const BRIDGE_PATH = '/ws/ai-media-stream';
const INITIAL_AUDIO_RETRY_MS = parseInt(process.env.AI_INITIAL_AUDIO_RETRY_MS || '2500', 10);
/** Buffer outbound audio if OpenAI emits before Twilio sends stream start (else chunks were dropped = long silence). */
const PENDING_OUTBOUND_AUDIO_MAX_CHUNKS = parseInt(process.env.AI_PENDING_AUDIO_MAX_CHUNKS || '200', 10);
const TWILIO_MULAW_FRAME_BYTES = 160; // 20ms at 8kHz, 8-bit mu-law
const sessionStateByCallSid = new Map();

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

/** Twilio sample sends each OpenAI delta as one media message (bidirectional Connect stream). */
function sendAudioPayloadToTwilio(twilioWs, streamSid, audioB64) {
  if (!audioB64 || !streamSid) return;
  if (process.env.AI_TWILIO_AUDIO_CHUNKING === 'true') {
    try {
      const raw = Buffer.from(audioB64, 'base64');
      if (!raw.length) return;
      for (let i = 0; i < raw.length; i += TWILIO_MULAW_FRAME_BYTES) {
        const frame = raw.subarray(i, i + TWILIO_MULAW_FRAME_BYTES);
        sendJson(twilioWs, {
          event: 'media',
          streamSid,
          media: { payload: frame.toString('base64') }
        });
      }
    } catch (error) {
      console.error('[AI BRIDGE] Failed to chunk/send audio for Twilio:', error.message);
    }
    return;
  }
  sendJson(twilioWs, {
    event: 'media',
    streamSid,
    media: { payload: audioB64 }
  });
}

function buildInitialResponsePayload() {
  return { type: 'response.create' };
}

function buildInitialConversationItemPayload() {
  return {
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [
        {
          type: 'input_text',
          text: 'Start the call now: introduce yourself as Rebecca and follow the opening script through asking if their television is on.'
        }
      ]
    }
  };
}

function triggerInitialAssistantTurn(openAiWs) {
  // Seed one user item to avoid silent starts on some realtime session states.
  sendJson(openAiWs, buildInitialConversationItemPayload());
  sendJson(openAiWs, buildInitialResponsePayload());
}

function buildSystemPrompt(context) {
  const lines = [
    'You are Rebecca, a friendly professional placing an outbound call about a TV satellite receiver check.',
    'Use English only for everything you say. Do not switch to another language. If the customer uses another language, stay in clear, simple English.',
    'Speak in short, natural sentences. One question at a time. Acknowledge the customer before the next question.',
    '',
    'Dish Network vs DIRECTV — you must pick ONE path to follow.',
    'If the customer already said Dish, DISH, Hopper, Wally, SAT/DVR on the remote, or similar, use the Dish path.',
    'If they said DIRECTV, Genie, orange Select button, or similar, use the DIRECTV path.',
    'If it is still unclear, make your best guess from context (how they describe the remote or service).',
    'Say one brief line if needed, for example: "I will walk you through the Dish steps first" or the DIRECTV equivalent — then continue.',
    'If the customer says you have the wrong provider, apologize once and switch to the other path from where you are in the flow.',
    '',
    'OPENING (use this content, adapt slightly to sound human):',
    'Introduce: you are Rebecca calling from their television satellite company. Ask how they are today.',
    'If they ask which television company, say: Dish Network.',
    'Explain: there were satellite changes and you need to check receiver boxes. Ask: Is your television ON right now?',
    '',
    'If TV is OFF or they say no:',
    '- Say that if they do not update the receiver with the new software they may lose reception on the TV screen.',
    '- Ask them to turn the television ON for 2 minutes, then continue.',
    'If TV is ON or they say yes:',
    '- Ask them to grab the remote control.',
    '- Then follow either DISH PATH or DIRECTV PATH below (based on your guess or what they said).',
    '',
    'DISH PATH:',
    'Ask: Look at the top left corner of your remote — do you see SAT or DVR?',
    'If SAT: Below SAT is the menu button — press menu two times.',
    'If DVR: Beside DVR is the house picture button — press the house button three times.',
    'Ask: Do you see system information on the TV screen?',
    'Ask for the Receiver ID starting with R1 or R0.',
    'Above the Receiver ID ask for the model: VIP, Wally, Hopper, or Joey.',
    'Ask how many televisions they have at home.',
    'Ask: Are you the account holder — the one who pays the bills?',
    'Verification (follow carefully, one item at a time):',
    'Do not ask for any PIN or passcode. For verification, ask the security question: What are the last 4 digits of the account holder Social Security number?',
    'Close Dish: Say you will call back in 25 to 30 minutes with feedback on the receiver box. Ask if they will be available. Say goodbye.',
    '',
    'DIRECTV PATH:',
    'Ask: In the middle of the remote do you see an orange Select button?',
    'Below Select is INFO — press and hold INFO for 7 seconds then release.',
    'Ask: Do you see Run System Test on the TV screen?',
    'Ask for Receiver ID starting with 0.',
    'Above the ID ask for model: H, HR, or C.',
    'Ask how many televisions they are using right now.',
    'Ask: Are you the account holder — the one who pays the bills?',
    'Verification:',
    'Do not ask for any PIN or passcode. For verification, ask: What is the date of birth of the account holder?',
    'Close DIRECTV: Say your supervisor will call back in 25 to 30 minutes with feedback. Ask availability. Ask them to keep the TV on in the meantime. Say goodbye.',
    '',
    'General rules:',
    '- Never ask for a PIN, passcode, card security code, or similar.',
    '- English only for the entire call.',
    '- If not interested, be polite; one soft follow-up is OK then end.',
    '- If busy, ask for a better callback time.',
    '- If they ask for a human, offer a specialist callback.',
    '- If they ask to stop or opt out, apologize and end.',
    '- If confused, simplify instructions.'
  ];

  if (context.customerId) lines.push(`Customer ID: ${context.customerId}`);
  if (context.saleId) lines.push(`Sale ID: ${context.saleId}`);
  if (context.agentId) lines.push(`Agent ID: ${context.agentId}`);
  if (context.source) lines.push(`Call Source: ${context.source}`);

  return lines.join('\n');
}

function getSessionState(callSid) {
  if (!callSid) return { mode: 'active' };
  if (!sessionStateByCallSid.has(callSid)) {
    sessionStateByCallSid.set(callSid, {
      mode: 'active', // active | paused | takeover | ended
      ownerAgentId: null,
      updatedAt: new Date().toISOString()
    });
  }
  return sessionStateByCallSid.get(callSid);
}

function setSessionMode(callSid, mode) {
  if (!callSid) return null;
  const next = {
    ...getSessionState(callSid),
    mode,
    updatedAt: new Date().toISOString()
  };
  sessionStateByCallSid.set(callSid, next);
  return next;
}

function setSessionOwner(callSid, ownerAgentId) {
  if (!callSid || !ownerAgentId) return null;
  const next = {
    ...getSessionState(callSid),
    ownerAgentId: parseInt(ownerAgentId, 10),
    updatedAt: new Date().toISOString()
  };
  sessionStateByCallSid.set(callSid, next);
  return next;
}

function initializeAiMediaBridge(server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (twilioWs, request) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    let runtimeCallSid = requestUrl.searchParams.get('callSid');
    let runtimeAgentId = requestUrl.searchParams.get('agentId');
    let runtimeCustomerId = requestUrl.searchParams.get('customerId');
    let runtimeSaleId = requestUrl.searchParams.get('saleId');
    let runtimeSource = requestUrl.searchParams.get('source');
    const aiAgentVersion = requestUrl.searchParams.get('aiAgentVersion') || 'v1';
    console.log('[AI BRIDGE] Twilio WS connected', {
      callSid: runtimeCallSid,
      agentId: runtimeAgentId,
      customerId: runtimeCustomerId,
      saleId: runtimeSaleId,
      source: runtimeSource,
      aiAgentVersion
    });
    if (runtimeCallSid && runtimeAgentId) {
      setSessionOwner(runtimeCallSid, runtimeAgentId);
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      console.error('[AI BRIDGE] OPENAI_API_KEY missing, closing Twilio WS (Twilio error 31921)', {
        callSid: runtimeCallSid
      });
      twilioWs.close(1011, 'OPENAI_API_KEY is not configured');
      return;
    }

    const { model: realtimeModel, isGa, url: openAiRealtimeUrl } = getOpenAiRealtimeConfig();

    let streamSid = null;
    let openAiReady = false;
    let openAiSessionUpdated = false;
    let shouldCreateInitialResponse = false;
    let openAiFailed = false;
    let hasSentAudioToTwilio = false;
    let startupRetryTimer = null;
    let startupRetryAttempted = false;
    let sawOpenAiResponseCreated = false;
    let sawOpenAiResponseDone = false;
    let pendingOutboundAudio = [];
    let latestMediaTimestamp = 0;
    let responseStartTimestampTwilio = null;
    let lastAssistantItem = null;
    const markQueue = [];

    function sendMark() {
      if (!streamSid) return;
      sendJson(twilioWs, {
        event: 'mark',
        streamSid,
        mark: { name: 'responsePart' }
      });
      markQueue.push('responsePart');
    }

    function handleSpeechStartedEvent() {
      if (markQueue.length === 0 || responseStartTimestampTwilio == null) return;
      const elapsedTime = latestMediaTimestamp - responseStartTimestampTwilio;
      if (lastAssistantItem && elapsedTime >= 0) {
        sendJson(openAiWs, {
          type: 'conversation.item.truncate',
          item_id: lastAssistantItem,
          content_index: 0,
          audio_end_ms: elapsedTime
        });
      }
      sendJson(twilioWs, { event: 'clear', streamSid });
      markQueue.length = 0;
      lastAssistantItem = null;
      responseStartTimestampTwilio = null;
    }

    function flushPendingOutboundAudio() {
      if (!streamSid || pendingOutboundAudio.length === 0) return;
      for (const chunk of pendingOutboundAudio) {
        sendAudioPayloadToTwilio(twilioWs, streamSid, chunk);
      }
      pendingOutboundAudio = [];
      hasSentAudioToTwilio = true;
      if (startupRetryTimer) {
        clearTimeout(startupRetryTimer);
        startupRetryTimer = null;
      }
      console.log('[AI BRIDGE] Flushed pending outbound audio (arrived before Twilio stream start)', {
        callSid: runtimeCallSid
      });
    }

    function handleOutboundAudioDelta(audioB64, itemId) {
      if (!audioB64) return;
      if (streamSid) {
        if (pendingOutboundAudio.length > 0) {
          flushPendingOutboundAudio();
        }
        if (responseStartTimestampTwilio == null) {
          responseStartTimestampTwilio = latestMediaTimestamp;
        }
        if (itemId) {
          lastAssistantItem = itemId;
        }
        sendAudioPayloadToTwilio(twilioWs, streamSid, audioB64);
        sendMark();
        hasSentAudioToTwilio = true;
        if (startupRetryTimer) {
          clearTimeout(startupRetryTimer);
          startupRetryTimer = null;
        }
      } else {
        if (pendingOutboundAudio.length >= PENDING_OUTBOUND_AUDIO_MAX_CHUNKS) {
          pendingOutboundAudio.shift();
          console.warn('[AI BRIDGE] Pending outbound audio cap reached, dropping oldest chunk', {
            callSid: runtimeCallSid
          });
        }
        pendingOutboundAudio.push(audioB64);
      }
    }

    function scheduleStartupAudioRetry() {
      if (startupRetryTimer || startupRetryAttempted || !streamSid) return;
      startupRetryTimer = setTimeout(() => {
        startupRetryTimer = null;
        if (!hasSentAudioToTwilio && openAiReady && twilioWs.readyState === WebSocket.OPEN) {
          startupRetryAttempted = true;
          console.warn('[AI BRIDGE] No initial audio yet, retrying assistant turn', {
            callSid: runtimeCallSid,
            streamSid
          });
          triggerInitialAssistantTurn(openAiWs);
        }
      }, INITIAL_AUDIO_RETRY_MS);
    }

    const openAiWs = new WebSocket(openAiRealtimeUrl, {
      headers: buildOpenAiRealtimeWsHeaders(openAiKey, isGa)
    });

    openAiWs.on('unexpected-response', (request, response) => {
      let body = '';
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        console.error('[AI BRIDGE] OpenAI WS handshake failed (causes Twilio 31921 if we close)', {
          callSid: runtimeCallSid,
          statusCode: response.statusCode,
          statusMessage: response.statusMessage,
          model: realtimeModel,
          mode: isGa ? 'ga' : 'beta',
          bodyPreview: body.slice(0, 400)
        });
        openAiFailed = true;
      });
    });

    openAiWs.on('open', () => {
      console.log('[AI BRIDGE] OpenAI WS opened', {
        callSid: runtimeCallSid,
        model: realtimeModel,
        mode: isGa ? 'ga' : 'beta'
      });
      openAiReady = true;
      const instructions = buildSystemPrompt({
        agentId: runtimeAgentId,
        customerId: runtimeCustomerId,
        saleId: runtimeSaleId,
        source: runtimeSource,
        aiAgentVersion
      });
      const sessionUpdate = buildSessionUpdatePayload(
        { model: realtimeModel, instructions },
        isGa
      );
      setTimeout(() => {
        if (openAiWs.readyState === WebSocket.OPEN) {
          sendJson(openAiWs, sessionUpdate);
        }
      }, 100);
    });

    openAiWs.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        console.log('[OPENAI EVENT]', event.type);
        if (event.type === 'error') {
          console.error('[AI BRIDGE] OpenAI server error event', {
            callSid: runtimeCallSid,
            message: event.error?.message,
            type: event.error?.type,
            code: event.error?.code,
            param: event.error?.param,
            mode: isGa ? 'ga' : 'beta',
            model: realtimeModel
          });
          if (
            event.error?.code === 'invalid_api_key' ||
            event.error?.code === 'model_not_found' ||
            event.error?.type === 'invalid_request_error'
          ) {
            openAiFailed = true;
          }
          return;
        }
        if (event.type === 'session.created') {
          console.log('[AI BRIDGE] OpenAI session.created', { callSid: runtimeCallSid });
        }
        if (event.type === 'response.created' && !sawOpenAiResponseCreated) {
          sawOpenAiResponseCreated = true;
          console.log('[AI BRIDGE] OpenAI response.created', { callSid: runtimeCallSid });
        }
        if (event.type === 'response.done' && !sawOpenAiResponseDone) {
          sawOpenAiResponseDone = true;
          console.log('[AI BRIDGE] OpenAI response.done', { callSid: runtimeCallSid });
        }
        if (event.type === 'session.updated') {
          openAiSessionUpdated = true;
          console.log('[AI BRIDGE] OpenAI session.updated', { callSid: runtimeCallSid });
          if (shouldCreateInitialResponse) {
            console.log('[TRIGGER] from session.updated');
            triggerInitialAssistantTurn(openAiWs);
            scheduleStartupAudioRetry();
          }
          return;
        }
        const sessionState = getSessionState(runtimeCallSid);
        if (sessionState.mode === 'paused' || sessionState.mode === 'takeover' || sessionState.mode === 'ended') {
          return;
        }
        // GA Realtime uses response.output_audio.delta; legacy preview used response.audio.delta
        const audioB64 =
          event.type === 'response.output_audio.delta'
            ? event.delta
            : event.type === 'response.audio.delta'
              ? event.delta
              : null;
        if (audioB64) {
          console.log('[SENDING AUDIO]', audioB64.length, streamSid ? 'live' : 'buffered-until-start');
          handleOutboundAudioDelta(audioB64, event.item_id);
          return;
        }

        if (event.type === 'input_audio_buffer.speech_started' && streamSid) {
          handleSpeechStartedEvent();
        }
      } catch (error) {
        console.error('[AI BRIDGE] Failed to process OpenAI message:', error.message);
      }
    });

    openAiWs.on('error', (error) => {
      console.error('[AI BRIDGE] OpenAI websocket error:', error.message);
      openAiFailed = true;
      // Do not abruptly close Twilio leg here; allow a short grace window for troubleshooting.
    });

    openAiWs.on('close', (code, reason) => {
      const reasonStr = reason?.toString?.() || '';
      console.error('[AI BRIDGE] OpenAI WS closed', {
        callSid: runtimeCallSid,
        code,
        reason: reasonStr,
        hint: describeCloseCode(code),
        model: realtimeModel,
        mode: isGa ? 'ga' : 'beta',
        openAiFailed
      });
      openAiReady = false;
      pendingOutboundAudio = [];
      if (startupRetryTimer) {
        clearTimeout(startupRetryTimer);
        startupRetryTimer = null;
      }
      if (code !== 1000) {
        openAiFailed = true;
      }
      // Do not close Twilio WS here — that triggers Twilio debugger error 31921.
      // Keep the PSTN leg up; logs above show why AI audio stopped.
    });

    twilioWs.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        const sessionState = getSessionState(runtimeCallSid);
        switch (message.event) {
          case 'start':
            if (message.start?.customParameters) {
              runtimeCallSid = runtimeCallSid || message.start.customParameters.callSid || null;
              runtimeAgentId = runtimeAgentId || message.start.customParameters.agentId || null;
              runtimeCustomerId = runtimeCustomerId || message.start.customParameters.customerId || null;
              runtimeSaleId = runtimeSaleId || message.start.customParameters.saleId || null;
              runtimeSource = runtimeSource || message.start.customParameters.source || null;
              if (runtimeCallSid && runtimeAgentId) {
                setSessionOwner(runtimeCallSid, runtimeAgentId);
              }
            }
            streamSid = message.start?.streamSid || null;
            responseStartTimestampTwilio = null;
            latestMediaTimestamp = 0;
            markQueue.length = 0;
            lastAssistantItem = null;
            console.log('[AI BRIDGE] Twilio stream start', {
              callSid: runtimeCallSid,
              streamSid,
              mode: sessionState.mode,
              agentId: runtimeAgentId,
              source: runtimeSource
            });
            flushPendingOutboundAudio();
            shouldCreateInitialResponse = true;
            if (openAiReady && openAiSessionUpdated) {
              triggerInitialAssistantTurn(openAiWs);
              scheduleStartupAudioRetry();
            }
            break;
          case 'media':
            if (!streamSid) {
              console.log('[AI BRIDGE] Media before start ignored', { callSid: runtimeCallSid });
            }
            if (message.media?.timestamp != null) {
              latestMediaTimestamp = message.media.timestamp;
            }
            if (!openAiReady) return;
            if (sessionState.mode === 'paused' || sessionState.mode === 'takeover' || sessionState.mode === 'ended') return;
            if (!message.media?.payload) return;
            sendJson(openAiWs, {
              type: 'input_audio_buffer.append',
              audio: message.media.payload
            });
            break;
          case 'mark':
            if (markQueue.length > 0) {
              markQueue.shift();
            }
            break;
          case 'stop':
            console.log('[AI BRIDGE] Twilio stream stop', { callSid: runtimeCallSid, streamSid });
            pendingOutboundAudio = [];
            if (runtimeCallSid) {
              setSessionMode(runtimeCallSid, 'ended');
              sessionStateByCallSid.delete(runtimeCallSid);
            }
            if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close(1000, 'Twilio stream stopped');
            break;
          default:
            if (message.event) {
              console.log('[AI BRIDGE] Twilio event', { callSid: runtimeCallSid, event: message.event });
            }
            break;
        }
      } catch (error) {
        console.error('[AI BRIDGE] Failed to process Twilio media message:', error.message);
      }
    });

    twilioWs.on('close', (code, reason) => {
      console.log('[AI BRIDGE] Twilio WS closed', {
        callSid: runtimeCallSid,
        code,
        reason: reason?.toString?.() || ''
      });
      pendingOutboundAudio = [];
      if (startupRetryTimer) {
        clearTimeout(startupRetryTimer);
        startupRetryTimer = null;
      }
      if (runtimeCallSid) sessionStateByCallSid.delete(runtimeCallSid);
      if (openAiWs.readyState === WebSocket.OPEN || openAiWs.readyState === WebSocket.CONNECTING) {
        openAiWs.close(1000, 'Twilio websocket closed');
      }
    });

    twilioWs.on('error', (error) => {
      console.error('[AI BRIDGE] Twilio websocket error:', error.message);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (pathname !== BRIDGE_PATH) return;
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (error) {
      console.error('[AI BRIDGE] Upgrade failure:', error.message);
      socket.destroy();
    }
  });

  const { model, isGa } = getOpenAiRealtimeConfig();
  console.log(`[AI BRIDGE] Listening for Twilio media streams on ${BRIDGE_PATH}`, {
    model,
    openAiRealtimeMode: isGa ? 'ga' : 'beta',
    hasOpenAiKey: Boolean(process.env.OPENAI_API_KEY),
    hint:
      'Twilio 31921 = server closed media WS. Fix OpenAI handshake (see logs). Try OPENAI_REALTIME_MODEL=gpt-realtime and OPENAI_REALTIME_GA=true.'
  });
}

module.exports = {
  initializeAiMediaBridge,
  BRIDGE_PATH,
  setAiControlAction(callSid, action, actorUserId = null) {
    const normalized = String(action || '').toLowerCase();
    if (!callSid) return { ok: false, message: 'callSid is required' };
    const state = getSessionState(callSid);
    if (actorUserId && state.ownerAgentId && parseInt(actorUserId, 10) !== parseInt(state.ownerAgentId, 10)) {
      return { ok: false, message: 'Only call initiator can control AI for this call' };
    }
    if (normalized === 'pause') {
      const state = setSessionMode(callSid, 'paused');
      console.log('[AI BRIDGE] Control action applied', { callSid, action: normalized, mode: state.mode });
      return { ok: true, state };
    }
    if (normalized === 'resume') {
      const state = setSessionMode(callSid, 'active');
      console.log('[AI BRIDGE] Control action applied', { callSid, action: normalized, mode: state.mode });
      return { ok: true, state };
    }
    if (normalized === 'takeover') {
      const state = setSessionMode(callSid, 'takeover');
      console.log('[AI BRIDGE] Control action applied', {
        callSid,
        action: normalized,
        mode: state.mode
      });
      return { ok: true, state };
    }
    if (normalized === 'end_ai') {
      const state = setSessionMode(callSid, 'ended');
      console.log('[AI BRIDGE] Control action applied', { callSid, action: normalized, mode: state.mode });
      return { ok: true, state };
    }
    return { ok: false, message: 'Unsupported action' };
  },
  getAiControlState(callSid) {
    return getSessionState(callSid);
  }
};

