const { WebSocketServer, WebSocket } = require('ws');
const { URL } = require('url');

const DEFAULT_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview';
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(DEFAULT_MODEL)}`;
const BRIDGE_PATH = '/ws/ai-media-stream';
const INITIAL_AUDIO_RETRY_MS = parseInt(process.env.AI_INITIAL_AUDIO_RETRY_MS || '1200', 10);
const sessionStateByCallSid = new Map();

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function buildSessionUpdatePayload(context) {
  const voice = process.env.OPENAI_REALTIME_VOICE || 'alloy';

  return {
    type: 'session.update',
    session: {
      modalities: ['text', 'audio'],
      voice,
      input_audio_format: 'g711_ulaw',
      output_audio_format: 'g711_ulaw',
      turn_detection: { type: 'server_vad' },
      instructions: buildSystemPrompt(context),
    }
  };
}

function buildInitialResponsePayload() {
  return {
    type: 'response.create',
    response: {
      instructions:
        'Start with a short greeting and ask if this is a good time to discuss their receiver check.'
    }
  };
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
          text: 'Please greet the customer now and begin the receiver check conversation.'
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
    'You are Rebecca, a friendly and professional call center agent.',
    '',
    'Your goals:',
    '- Guide the customer through a receiver check process.',
    '- Ask structured questions step by step.',
    '- Qualify the customer as a potential lead.',
    '- Schedule a callback with a specialist.',
    '',
    'Conversation style:',
    '- Speak naturally like a human, not robotic.',
    '- Keep every response short (1 to 2 sentences max).',
    '- Always acknowledge the customer before asking the next question.',
    '- Ask only ONE question at a time.',
    '- Use soft, polite language.',
    '',
    'Rules:',
    '- NEVER ask for sensitive information (no PIN, SSN, DOB, passwords).',
    '- If customer asks which company, say exactly: "We work with providers like Dish Network and similar services".',
    '- If customer is not interested, respond politely, try one soft follow-up, then exit.',
    '- If customer is busy, ask for a better callback time.',
    '- If customer asks for a human, offer callback with a specialist.',
    '- Do NOT sound forceful or suspicious.',
    '- If customer asks to stop or opt-out, apologize politely and end the call.',
    '',
    'Flow states you must follow in order:',
    '1) OPENING',
    '2) DEVICE_CHECK',
    '3) INFO_COLLECTION',
    '4) QUALIFICATION',
    '5) CLOSE',
    '',
    'State behavior:',
    'OPENING:',
    '- Greet customer.',
    '- Ask how they are.',
    '- Ask if TV is ON.',
    '',
    'DEVICE_CHECK:',
    '- Guide customer step by step based on responses.',
    '- If TV is OFF, ask them to turn it ON.',
    '- If TV is ON, ask remote actions for Dish or DIRECTV.',
    '',
    'INFO_COLLECTION:',
    '- Ask receiver ID.',
    '- Ask model type.',
    '- Ask number of TVs.',
    '',
    'QUALIFICATION:',
    '- Ask if they are the account holder.',
    '- Show mild interest in helping improve service.',
    '',
    'CLOSE:',
    '- Offer callback within 25 to 30 minutes.',
    '- Confirm availability.',
    '- End politely.',
    '',
    'Important behavior:',
    '- Adapt to customer responses and do not repeat script blindly.',
    '- If customer is confused, simplify instructions.',
    '- If customer interrupts, respond immediately.',
    '- If customer says "not interested", respond exactly: "No problem, just quickly—are you already satisfied with your current setup?"',
    '',
    'Tone examples:',
    '- "Got it, thank you..."',
    '- "Perfect, that helps..."',
    '- "Just a quick question..."',
    '',
    'End goal:',
    '- Capture interest and confirm callback availability.'
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
      console.error('[AI BRIDGE] OPENAI_API_KEY missing, closing Twilio WS', { callSid: runtimeCallSid });
      twilioWs.close(1011, 'OPENAI_API_KEY is not configured');
      return;
    }

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
    const openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    openAiWs.on('open', () => {
      console.log('[AI BRIDGE] OpenAI WS opened', { callSid: runtimeCallSid, model: DEFAULT_MODEL });
      openAiReady = true;
      sendJson(
        openAiWs,
        buildSessionUpdatePayload({
          agentId: runtimeAgentId,
          customerId: runtimeCustomerId,
          saleId: runtimeSaleId,
          source: runtimeSource,
          aiAgentVersion
        })
      );
    });

    openAiWs.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        console.log('[OPENAI EVENT]', event.type);
        if (event.type === 'error') {
          console.error('[AI BRIDGE] OpenAI server error event', event);
          return;
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
        if (audioB64 && streamSid) {
          console.log('[SENDING AUDIO]', audioB64.length);
          hasSentAudioToTwilio = true;
          if (startupRetryTimer) {
            clearTimeout(startupRetryTimer);
            startupRetryTimer = null;
          }
          sendJson(twilioWs, {
            event: 'media',
            streamSid,
            media: { payload: audioB64 }
          });
          return;
        }

        if (event.type === 'input_audio_buffer.speech_started' && streamSid) {
          // Clear any buffered outbound audio to reduce overlap during barge-in.
          sendJson(twilioWs, { event: 'clear', streamSid });
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
      console.log('[AI BRIDGE] OpenAI WS closed', {
        callSid: runtimeCallSid,
        code,
        reason: reason?.toString?.() || ''
      });
      openAiReady = false;
      if (startupRetryTimer) {
        clearTimeout(startupRetryTimer);
        startupRetryTimer = null;
      }
      if (code !== 1000) {
        openAiFailed = true;
      }
      if (twilioWs.readyState === WebSocket.OPEN && openAiFailed) {
        // If AI is unavailable, close call leg instead of leaving customer in silence.
        setTimeout(() => {
          if (twilioWs.readyState === WebSocket.OPEN) {
            twilioWs.close(1011, 'AI service unavailable');
          }
        }, 500);
      }
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
            console.log('[AI BRIDGE] Twilio stream start', {
              callSid: runtimeCallSid,
              streamSid,
              mode: sessionState.mode,
              agentId: runtimeAgentId,
              source: runtimeSource
            });
            shouldCreateInitialResponse = true;
            if (openAiReady && openAiSessionUpdated) {
              triggerInitialAssistantTurn(openAiWs);
              if (!startupRetryTimer && !startupRetryAttempted) {
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
            }
            break;
          case 'media':
            if (!streamSid) {
              console.log('[AI BRIDGE] Media before start ignored', { callSid: runtimeCallSid });
            }
            if (!openAiReady) return;
            if (sessionState.mode === 'paused' || sessionState.mode === 'takeover' || sessionState.mode === 'ended') return;
            if (!message.media?.payload) return;
            sendJson(openAiWs, {
              type: 'input_audio_buffer.append',
              audio: message.media.payload
            });
            break;
          case 'stop':
            console.log('[AI BRIDGE] Twilio stream stop', { callSid: runtimeCallSid, streamSid });
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

  console.log(`[AI BRIDGE] Listening for Twilio media streams on ${BRIDGE_PATH}`);
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

