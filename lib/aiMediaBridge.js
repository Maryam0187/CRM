const { WebSocketServer, WebSocket } = require('ws');
const { URL } = require('url');

const DEFAULT_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(DEFAULT_MODEL)}`;
const BRIDGE_PATH = '/ws/ai-media-stream';
const sessionStateByCallSid = new Map();

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify(payload));
}

function buildSystemPrompt(context) {
  const lines = [
    'You are Rebecca, a TV technical support voice assistant.',
    'Speak naturally, politely, and keep responses short.',
    'Follow a support workflow for Dish Network and DIRECTV receiver checks.',
    'Never impersonate a specific carrier if the customer asks for identity; state that you are TV technical support and can assist Dish/DIRECTV checks.',
    'Never ask for or collect full SSN, account password, security PIN, card numbers, or other highly sensitive secrets.',
    'If customer asks to stop, opt-out, or seems uncomfortable, apologize and end the call politely.',
    '',
    'Opening:',
    'Say: "Hi, this is Rebecca from TV Technical Support. Is this a good time to do a quick receiver check?"',
    'If asked which company, say: "We support Dish Network and DIRECTV receiver health checks. Which service do you use?"',
    '',
    'Purpose:',
    'Say we are running a receiver software verification to prevent interruption.',
    'Ask: "Is your TV on right now?"',
    'If no: ask them to turn it on for 2 minutes.',
    'If yes: ask them to keep the remote ready.',
    '',
    'Dish flow:',
    '- Ask if they see SAT or DVR near top-left of remote.',
    '- If SAT: ask to press MENU twice.',
    '- If DVR: ask to press HOME/house button three times.',
    '- Ask if System Information is visible.',
    '- Ask for Receiver ID and model (VIP, Wally, Hopper, Joey).',
    '- Ask how many TVs are connected.',
    '',
    'DIRECTV flow:',
    '- Ask if they see orange SELECT button.',
    '- Ask to hold INFO for 7 seconds, then release.',
    '- Ask if "Run System Test" appears.',
    '- Ask for Receiver ID and model (H, HR, C).',
    '- Ask how many TVs are in use.',
    '',
    'Verification (safe only):',
    '- Ask for full name and service ZIP code only.',
    '- Optionally ask for last 2 digits of registered contact number.',
    '- If verification fails, offer secure callback from account support.',
    '',
    'Closing:',
    '- Offer supervisor callback in 25-30 minutes and ask availability.',
    '- Ask customer to keep TV on meanwhile.',
    '- End politely with thanks.'
  ];

  if (context.customerId) lines.push(`Customer ID: ${context.customerId}`);
  if (context.saleId) lines.push(`Sale ID: ${context.saleId}`);
  if (context.agentId) lines.push(`Agent ID: ${context.agentId}`);

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
    const callSid = requestUrl.searchParams.get('callSid');
    const agentId = requestUrl.searchParams.get('agentId');
    const customerId = requestUrl.searchParams.get('customerId');
    const saleId = requestUrl.searchParams.get('saleId');
    const aiAgentVersion = requestUrl.searchParams.get('aiAgentVersion') || 'v1';
    console.log('[AI BRIDGE] Twilio WS connected', {
      callSid,
      agentId,
      customerId,
      saleId,
      aiAgentVersion
    });
    if (callSid && agentId) {
      setSessionOwner(callSid, agentId);
    }

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      console.error('[AI BRIDGE] OPENAI_API_KEY missing, closing Twilio WS', { callSid });
      twilioWs.close(1011, 'OPENAI_API_KEY is not configured');
      return;
    }

    let streamSid = null;
    let openAiReady = false;
    let shouldCreateInitialResponse = false;
    let openAiFailed = false;
    const openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    openAiWs.on('open', () => {
      console.log('[AI BRIDGE] OpenAI WS opened', { callSid, model: DEFAULT_MODEL });
      openAiReady = true;
      sendJson(openAiWs, {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          voice: process.env.OPENAI_REALTIME_VOICE || 'alloy',
          input_audio_format: 'g711_ulaw',
          output_audio_format: 'g711_ulaw',
          turn_detection: { type: 'server_vad' },
          instructions: buildSystemPrompt({ agentId, customerId, saleId, aiAgentVersion })
        }
      });

      // Twilio 'start' may arrive before OpenAI socket is open.
      if (shouldCreateInitialResponse) {
        sendJson(openAiWs, {
          type: 'response.create',
          response: {
            modalities: ['text', 'audio'],
            instructions: 'Start with a short greeting and ask if this is a good time to discuss their needs.'
          }
        });
      }
    });

    openAiWs.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
        const sessionState = getSessionState(callSid);
        if (sessionState.mode === 'paused' || sessionState.mode === 'takeover' || sessionState.mode === 'ended') {
          return;
        }
        if (event.type === 'response.audio.delta' && event.delta && streamSid) {
          sendJson(twilioWs, {
            event: 'media',
            streamSid,
            media: { payload: event.delta }
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
        callSid,
        code,
        reason: reason?.toString?.() || ''
      });
      openAiReady = false;
      if (twilioWs.readyState === WebSocket.OPEN && openAiFailed) {
        // Graceful close after brief delay instead of immediate disconnect tone.
        setTimeout(() => {
          if (twilioWs.readyState === WebSocket.OPEN) {
            twilioWs.close(1011, 'AI service unavailable');
          }
        }, 3000);
      }
    });

    twilioWs.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        const sessionState = getSessionState(callSid);
        switch (message.event) {
          case 'start':
            streamSid = message.start?.streamSid || null;
            console.log('[AI BRIDGE] Twilio stream start', {
              callSid,
              streamSid,
              mode: sessionState.mode
            });
            shouldCreateInitialResponse = true;
            if (openAiReady) {
              sendJson(openAiWs, {
                type: 'response.create',
                response: {
                  modalities: ['text', 'audio'],
                  instructions: 'Start with a short greeting and ask if this is a good time to discuss their needs.'
                }
              });
            }
            break;
          case 'media':
            if (!streamSid) {
              console.log('[AI BRIDGE] Media before start ignored', { callSid });
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
            console.log('[AI BRIDGE] Twilio stream stop', { callSid, streamSid });
            if (callSid) {
              setSessionMode(callSid, 'ended');
              sessionStateByCallSid.delete(callSid);
            }
            if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close(1000, 'Twilio stream stopped');
            break;
          default:
            if (message.event) {
              console.log('[AI BRIDGE] Twilio event', { callSid, event: message.event });
            }
            break;
        }
      } catch (error) {
        console.error('[AI BRIDGE] Failed to process Twilio media message:', error.message);
      }
    });

    twilioWs.on('close', (code, reason) => {
      console.log('[AI BRIDGE] Twilio WS closed', {
        callSid,
        code,
        reason: reason?.toString?.() || ''
      });
      if (callSid) sessionStateByCallSid.delete(callSid);
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
      console.log('[AI BRIDGE] Control action applied', { callSid, action: normalized, mode: state.mode });
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

