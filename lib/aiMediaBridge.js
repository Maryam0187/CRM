const { WebSocketServer, WebSocket } = require('ws');
const { URL } = require('url');
const {
  getOpenAiRealtimeConfig,
  buildOpenAiRealtimeWsHeaders,
  buildSessionUpdatePayload,
  describeCloseCode
} = require('./aiRealtimeConfig');
const { broadcastMonitorAudio, notifyMonitorState } = require('./aiSupervisorBroadcast');
const {
  markAiCallAnswered,
  markAiCallAnsweredNow,
  isAiCallAnswered,
  getAiCallAnsweredAt,
  clearAiCallAnswered
} = require('./aiCallAnswerGate');
const { getAiBridgeGlobalState } = require('./aiBridgeGlobalState');

const {
  activeSessionHooksByCallSid,
  pendingManualStartByCallSid,
  sessionStateByCallSid
} = getAiBridgeGlobalState();

/** Customer monitor: forward every Twilio frame (~20ms). AI can stay slightly throttled. */
const MONITOR_CUSTOMER_AUDIO_MS = parseInt(process.env.AI_MONITOR_CUSTOMER_INTERVAL_MS || '20', 10);
const MONITOR_AI_AUDIO_MS = parseInt(
  process.env.AI_MONITOR_AI_INTERVAL_MS || process.env.AI_MONITOR_AUDIO_INTERVAL_MS || '40',
  10
);
/** When false (default), Rebecca only speaks after agent clicks Start AI Stream. */
const AI_AUTO_START_ON_ANSWER = process.env.AI_AUTO_START_ON_ANSWER === 'true';
const BRIDGE_PATH = '/ws/ai-media-stream';
const INITIAL_AUDIO_RETRY_MS = parseInt(process.env.AI_INITIAL_AUDIO_RETRY_MS || '2500', 10);
/** If customer does not speak first, Rebecca opens after this (ms). */
const CUSTOMER_FIRST_TIMEOUT_MS = parseInt(process.env.AI_CUSTOMER_FIRST_TIMEOUT_MS || '10000', 10);
/** Wait after true answer before Rebecca can speak (avoids talking during ring/early media). */
const POST_ANSWER_GRACE_MS = parseInt(process.env.AI_POST_ANSWER_GRACE_MS || '2000', 10);
/** Pause before Rebecca speaks after the customer finishes (or before scripted opening). */
const AI_REPLY_DELAY_MS = parseInt(process.env.AI_REPLY_DELAY_MS || '1000', 10);
/** Buffer outbound audio if OpenAI emits before Twilio sends stream start (else chunks were dropped = long silence). */
const PENDING_OUTBOUND_AUDIO_MAX_CHUNKS = parseInt(process.env.AI_PENDING_AUDIO_MAX_CHUNKS || '200', 10);
const TWILIO_MULAW_FRAME_BYTES = 160; // 20ms at 8kHz, 8-bit mu-law

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

const RESPONSE_DELIVERY_HINT =
  'Speak in a warm, natural phone voice — 1–3 short sentences. Moderate pace, not rushed. Sound like a real person, not a script or IVR.';

function buildInitialResponsePayload() {
  return {
    type: 'response.create',
    response: {
      instructions: RESPONSE_DELIVERY_HINT
    }
  };
}

function buildOpeningConversationItemPayload({ customerGreetedFirst }) {
  const text = customerGreetedFirst
    ? 'The customer just said hello on a live phone call. Reply like a real person on the phone: a quick warm "Hi, how are you?", then naturally introduce yourself as Rebecca from their TV satellite company. Keep it short, relaxed, and conversational — not a sales pitch or automated greeting.'
    : 'You are on a live outbound phone call and the customer has not spoken yet. Say hello naturally — like a friendly neighbor calling — introduce yourself as Rebecca from their television satellite company, and ask how they are. Sound human, not like a recorded message.';
  return {
    type: 'conversation.item.create',
    item: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text }]
    }
  };
}

function scheduleAssistantReply(openAiWs, { customerGreetedFirst }, timerRef) {
  sendJson(openAiWs, buildOpeningConversationItemPayload({ customerGreetedFirst }));
  if (timerRef?.current) {
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }
  timerRef.current = setTimeout(() => {
    timerRef.current = null;
    if (openAiWs.readyState === WebSocket.OPEN) {
      sendJson(openAiWs, buildInitialResponsePayload());
    }
  }, AI_REPLY_DELAY_MS);
}

function buildSystemPrompt(context) {
  const lines = [
    '# Role & Objective',
    'You are Rebecca, a friendly professional woman on a live outbound phone call about a TV satellite receiver check.',
    '',
    '# Personality & Tone',
    '## Personality',
    '- Warm, calm, and approachable — like a helpful real person on a normal phone call, not a telemarketer or robot.',
    '## Tone',
    '- Conversational and relaxed. Confident but never pushy. Never overly cheerful or stiff.',
    '## Length',
    '- Usually 1–3 short sentences per turn. One question at a time.',
    '## Pacing & delivery (critical)',
    '- Speak at a moderate, natural phone pace — not rushed, not slow or over-enunciated.',
    '- Use contractions: I\'m, you\'re, we\'ll, that\'s, sure.',
    '- Brief reactions before the next step: "Oh perfect", "Got it", "Sure thing", "Okay great".',
    '- Light fillers sparingly when thinking: "okay", "let me see", "mm-hmm" — never in every sentence.',
    '- Paraphrase the script in your own words. Vary phrasing; do not repeat the same line twice in a row.',
    '- Pause briefly between ideas. Do not stack multiple questions in one breath.',
    '- After the customer finishes speaking, leave a brief beat (~1 second) before you reply.',
    '- Match the customer\'s energy — if they are brief, stay concise; if chatty, be a little warmer.',
    '- Read numbers for speech: receiver IDs digit-by-digit with tiny pauses; say "twenty-five to thirty minutes" naturally.',
    '- Never sound like you are reading a script, IVR menu, or bullet list aloud.',
    '- Never mention being an AI unless the customer directly asks.',
    '',
    'Use English only for everything you say. Do not switch to another language. If the customer uses another language, stay in clear, simple English.',
    'One question at a time. Acknowledge the customer before the next question.',
    '',
    'OUTBOUND OPENING (critical):',
    '- Do NOT speak first. Stay silent and listen when the call connects.',
    '- Wait for the customer to say hello or speak first.',
    '- After they greet you (or say anything), respond warmly, then give your Rebecca introduction and opening script.',
    '- If the line is silent for a long time, you may say hello and introduce yourself.',
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

function isAiStreamLiveMode(mode) {
  return mode === 'active';
}

function getSessionState(callSid) {
  if (!callSid) return { mode: AI_AUTO_START_ON_ANSWER ? 'active' : 'standby' };
  if (!sessionStateByCallSid.has(callSid)) {
    sessionStateByCallSid.set(callSid, {
      mode: AI_AUTO_START_ON_ANSWER ? 'active' : 'standby', // standby | active | paused | takeover | ended
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
    let assistantOpeningStarted = false;
    let customerGreetedFirst = false;
    let customerWaitFallbackTimer = null;
    let postAnswerGraceTimer = null;
    let aiConversationEnabled = false;
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
    const lastMonitorAt = { customer: 0, ai: 0 };
    const openingDelayTimerRef = { current: null };
    let outboundHoldUntil = 0;
    let replyHoldBuffer = [];
    let replyHoldFlushTimer = null;

    function clearOpeningDelayTimer() {
      if (openingDelayTimerRef.current) {
        clearTimeout(openingDelayTimerRef.current);
        openingDelayTimerRef.current = null;
      }
    }

    function clearReplyHoldFlushTimer() {
      if (replyHoldFlushTimer) {
        clearTimeout(replyHoldFlushTimer);
        replyHoldFlushTimer = null;
      }
    }

    function armOutboundReplyHold() {
      outboundHoldUntil = Date.now() + AI_REPLY_DELAY_MS;
    }

    function flushReplyHoldBuffer() {
      if (!streamSid || replyHoldBuffer.length === 0) return;
      const chunks = replyHoldBuffer.splice(0, replyHoldBuffer.length);
      for (const { audioB64, itemId } of chunks) {
        sendOutboundAudioNow(audioB64, itemId);
      }
    }

    function scheduleReplyHoldFlush() {
      if (replyHoldFlushTimer) return;
      const waitMs = Math.max(0, outboundHoldUntil - Date.now());
      replyHoldFlushTimer = setTimeout(() => {
        replyHoldFlushTimer = null;
        flushReplyHoldBuffer();
      }, waitMs);
    }

    function sendOutboundAudioNow(audioB64, itemId) {
      if (!audioB64 || !streamSid) return;
      if (responseStartTimestampTwilio == null) {
        responseStartTimestampTwilio = latestMediaTimestamp;
      }
      if (itemId) {
        lastAssistantItem = itemId;
      }
      sendAudioPayloadToTwilio(twilioWs, streamSid, audioB64);
      maybeMonitorAudio('ai', audioB64);
      sendMark();
      hasSentAudioToTwilio = true;
      if (startupRetryTimer) {
        clearTimeout(startupRetryTimer);
        startupRetryTimer = null;
      }
    }

    function maybeMonitorAudio(track, payload) {
      if (!runtimeCallSid || !runtimeAgentId || !payload) return;
      const intervalMs = track === 'ai' ? MONITOR_AI_AUDIO_MS : MONITOR_CUSTOMER_AUDIO_MS;
      const now = Date.now();
      if (now - lastMonitorAt[track] < intervalMs) return;
      lastMonitorAt[track] = now;
      broadcastMonitorAudio({
        callSid: runtimeCallSid,
        agentId: runtimeAgentId,
        track,
        payload
      });
    }

    function isInboundCustomerMedia(media) {
      if (!media?.payload) return false;
      const track = String(media.track || '').toLowerCase();
      if (!track) return true;
      return track === 'inbound' || track === 'inbound_track';
    }

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
      if (!audioB64 || !canRunAiConversation() || !aiConversationEnabled) return;
      if (streamSid) {
        if (pendingOutboundAudio.length > 0) {
          flushPendingOutboundAudio();
        }
        if (Date.now() < outboundHoldUntil) {
          replyHoldBuffer.push({ audioB64, itemId });
          scheduleReplyHoldFlush();
          return;
        }
        sendOutboundAudioNow(audioB64, itemId);
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

    function clearCustomerWaitFallback() {
      if (customerWaitFallbackTimer) {
        clearTimeout(customerWaitFallbackTimer);
        customerWaitFallbackTimer = null;
      }
    }

    function clearPostAnswerGraceTimer() {
      if (postAnswerGraceTimer) {
        clearTimeout(postAnswerGraceTimer);
        postAnswerGraceTimer = null;
      }
    }

    function canRunAiConversation() {
      if (!runtimeCallSid || !streamSid || !openAiReady || !openAiSessionUpdated) return false;
      if (!isAiStreamLiveMode(getSessionState(runtimeCallSid).mode)) return false;
      if (!isAiCallAnswered(runtimeCallSid)) return false;
      const answeredAt = getAiCallAnsweredAt(runtimeCallSid);
      if (!answeredAt) return false;
      return Date.now() - answeredAt >= POST_ANSWER_GRACE_MS;
    }

    function enableAiConversationTurns() {
      if (aiConversationEnabled || !openAiReady) return;
      aiConversationEnabled = true;
      const instructions = buildSystemPrompt({
        agentId: runtimeAgentId,
        customerId: runtimeCustomerId,
        saleId: runtimeSaleId,
        source: runtimeSource,
        aiAgentVersion
      });
      const sessionUpdate = buildSessionUpdatePayload(
        {
          model: realtimeModel,
          instructions,
          allowAutoResponse: true,
          enableTurnDetection: true
        },
        isGa
      );
      sendJson(openAiWs, sessionUpdate);
      console.log('[AI BRIDGE] Customer answered — AI conversation enabled', {
        callSid: runtimeCallSid,
        graceMs: POST_ANSWER_GRACE_MS
      });
      scheduleCustomerWaitFallback();
    }

    function schedulePostAnswerGrace() {
      if (!runtimeCallSid || postAnswerGraceTimer) return;
      markAiCallAnswered(runtimeCallSid);
      const answeredAt = getAiCallAnsweredAt(runtimeCallSid) || Date.now();
      const remaining = Math.max(0, POST_ANSWER_GRACE_MS - (Date.now() - answeredAt));
      postAnswerGraceTimer = setTimeout(() => {
        postAnswerGraceTimer = null;
        if (!streamSid || sessionStateByCallSid.get(runtimeCallSid)?.mode === 'ended') return;
        enableAiConversationTurns();
        if (aiConversationEnabled) {
          notifyMonitorState({
            callSid: runtimeCallSid,
            agentId: runtimeAgentId,
            state: 'active'
          });
        }
      }, remaining);
      console.log('[AI BRIDGE] Waiting after answer before AI speaks', {
        callSid: runtimeCallSid,
        remainingMs: remaining
      });
    }

    function forceStartAiStreamManually() {
      if (!runtimeCallSid) {
        return { ok: false, message: 'Call SID not available on media stream yet' };
      }
      const sessionState = getSessionState(runtimeCallSid);
      if (sessionState.mode === 'ended') {
        return { ok: false, message: 'AI stream has already ended for this call' };
      }
      if (!streamSid) {
        return {
          ok: false,
          message:
            'Twilio media stream is not connected yet. Wait until the customer line is live, then try again.'
        };
      }
      if (!openAiReady || !openAiSessionUpdated) {
        return {
          ok: false,
          message: 'OpenAI session is still starting. Wait a few seconds and try again.'
        };
      }

      clearPostAnswerGraceTimer();
      markAiCallAnsweredNow(runtimeCallSid, POST_ANSWER_GRACE_MS);
      setSessionMode(runtimeCallSid, 'active');

      enableAiConversationTurns();

      if (aiConversationEnabled && !assistantOpeningStarted) {
        assistantOpeningStarted = true;
        console.log('[AI BRIDGE] Manual start — Rebecca opening', { callSid: runtimeCallSid });
        scheduleAssistantReply(openAiWs, { customerGreetedFirst: false }, openingDelayTimerRef);
        scheduleStartupAudioRetry();
      }

      notifyMonitorState({
        callSid: runtimeCallSid,
        agentId: runtimeAgentId,
        state: 'active'
      });

      return {
        ok: true,
        message: 'Rebecca is now speaking on the customer line',
        aiConversationEnabled,
        streamConnected: Boolean(streamSid),
        aiPipeReady: Boolean(openAiReady && openAiSessionUpdated),
        mode: 'active'
      };
    }

    function bindSessionHooks(callSid) {
      if (!callSid) return;
      activeSessionHooksByCallSid.set(String(callSid), {
        forceStart: forceStartAiStreamManually,
        snapshot: () => ({
          streamSid,
          openAiReady,
          openAiSessionUpdated,
          aiConversationEnabled,
          mode: getSessionState(callSid).mode
        })
      });
      console.log('[AI BRIDGE] Session hooks bound', {
        callSid: String(callSid),
        activeStreams: activeSessionHooksByCallSid.size
      });
    }

    function unbindSessionHooks(callSid) {
      if (callSid) activeSessionHooksByCallSid.delete(String(callSid));
    }

    if (runtimeCallSid) {
      bindSessionHooks(runtimeCallSid);
    }

    function noteCustomerAnswerFromMedia() {
      if (!runtimeCallSid || !AI_AUTO_START_ON_ANSWER) return;
      if (!isAiCallAnswered(runtimeCallSid)) {
        markAiCallAnswered(runtimeCallSid);
        console.log('[AI BRIDGE] Customer answer inferred from inbound audio', {
          callSid: runtimeCallSid
        });
      }
      if (!aiConversationEnabled && !postAnswerGraceTimer && isAiStreamLiveMode(getSessionState(runtimeCallSid).mode)) {
        schedulePostAnswerGrace();
      }
    }

    function maybeAutoStartAfterAnswer() {
      if (!AI_AUTO_START_ON_ANSWER || !runtimeCallSid) return;
      if (!isAiStreamLiveMode(getSessionState(runtimeCallSid).mode)) return;
      if (!aiConversationEnabled && !postAnswerGraceTimer) {
        schedulePostAnswerGrace();
      }
    }

    function scheduleCustomerWaitFallback() {
      if (!canRunAiConversation() || !aiConversationEnabled) return;
      if (customerWaitFallbackTimer || assistantOpeningStarted || !streamSid) return;
      customerWaitFallbackTimer = setTimeout(() => {
        customerWaitFallbackTimer = null;
        if (assistantOpeningStarted || !openAiReady || !openAiSessionUpdated) return;
        console.warn('[AI BRIDGE] Customer silent — Rebecca opening', { callSid: runtimeCallSid });
        assistantOpeningStarted = true;
        scheduleAssistantReply(openAiWs, { customerGreetedFirst: false }, openingDelayTimerRef);
        scheduleStartupAudioRetry();
      }, CUSTOMER_FIRST_TIMEOUT_MS);
    }

    function scheduleStartupAudioRetry() {
      if (startupRetryTimer || startupRetryAttempted || !streamSid) return;
      startupRetryTimer = setTimeout(() => {
        startupRetryTimer = null;
        if (!hasSentAudioToTwilio && openAiReady && twilioWs.readyState === WebSocket.OPEN) {
          startupRetryAttempted = true;
          console.warn('[AI BRIDGE] No Rebecca audio yet, retrying opening', {
            callSid: runtimeCallSid,
            streamSid,
            customerGreetedFirst
          });
          if (customerGreetedFirst && !assistantOpeningStarted) {
            assistantOpeningStarted = true;
            scheduleAssistantReply(openAiWs, { customerGreetedFirst: true }, openingDelayTimerRef);
          } else if (!assistantOpeningStarted) {
            assistantOpeningStarted = true;
            scheduleAssistantReply(openAiWs, { customerGreetedFirst: false }, openingDelayTimerRef);
          } else {
            sendJson(openAiWs, buildInitialResponsePayload());
          }
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
        {
          model: realtimeModel,
          instructions,
          allowAutoResponse: false,
          enableTurnDetection: false
        },
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
          if (runtimeCallSid && pendingManualStartByCallSid.has(String(runtimeCallSid))) {
            pendingManualStartByCallSid.delete(String(runtimeCallSid));
            const manual = forceStartAiStreamManually();
            console.log('[AI BRIDGE] Pending manual start applied', {
              callSid: runtimeCallSid,
              ok: manual.ok,
              message: manual.message
            });
          } else if (
            streamSid &&
            getSessionState(runtimeCallSid).mode === 'standby' &&
            !AI_AUTO_START_ON_ANSWER
          ) {
            console.log('[AI BRIDGE] AI pipe connected (silent until Start AI Stream)', {
              callSid: runtimeCallSid
            });
            notifyMonitorState({
              callSid: runtimeCallSid,
              agentId: runtimeAgentId,
              state: 'connected'
            });
          } else if (streamSid && AI_AUTO_START_ON_ANSWER && isAiCallAnswered(runtimeCallSid)) {
            if (canRunAiConversation() && !aiConversationEnabled) {
              enableAiConversationTurns();
            } else {
              maybeAutoStartAfterAnswer();
            }
          } else if (streamSid && aiConversationEnabled) {
            scheduleCustomerWaitFallback();
          }
          return;
        }
        if (event.type === 'response.created' && customerGreetedFirst && !assistantOpeningStarted) {
          assistantOpeningStarted = true;
          console.log('[AI BRIDGE] Rebecca responding after customer greeting', { callSid: runtimeCallSid });
        }
        const sessionState = getSessionState(runtimeCallSid);
        if (
          sessionState.mode === 'paused' ||
          sessionState.mode === 'takeover' ||
          sessionState.mode === 'ended' ||
          sessionState.mode === 'standby'
        ) {
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
          if (
            canRunAiConversation() &&
            aiConversationEnabled &&
            !assistantOpeningStarted &&
            !hasSentAudioToTwilio
          ) {
            customerGreetedFirst = true;
            clearCustomerWaitFallback();
            console.log('[AI BRIDGE] Customer spoke first — waiting for VAD turn', {
              callSid: runtimeCallSid
            });
            scheduleStartupAudioRetry();
          }
          handleSpeechStartedEvent();
        }
        if (event.type === 'input_audio_buffer.speech_stopped' && streamSid) {
          armOutboundReplyHold();
          console.log('[AI BRIDGE] Customer finished speaking — reply hold armed', {
            callSid: runtimeCallSid,
            delayMs: AI_REPLY_DELAY_MS
          });
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
      clearCustomerWaitFallback();
      clearPostAnswerGraceTimer();
      clearOpeningDelayTimer();
      clearReplyHoldFlushTimer();
      replyHoldBuffer = [];
      outboundHoldUntil = 0;
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
            notifyMonitorState({
              callSid: runtimeCallSid,
              agentId: runtimeAgentId,
              state: AI_AUTO_START_ON_ANSWER ? 'connecting' : 'standby'
            });
            flushPendingOutboundAudio();
            bindSessionHooks(runtimeCallSid);
            if (!AI_AUTO_START_ON_ANSWER) {
              setSessionMode(runtimeCallSid, 'standby');
              console.log('[AI BRIDGE] Stream ready — waiting for manual Start AI Stream', {
                callSid: runtimeCallSid
              });
            } else {
              maybeAutoStartAfterAnswer();
            }
            break;
          case 'media':
            if (!streamSid) {
              console.log('[AI BRIDGE] Media before start ignored', { callSid: runtimeCallSid });
            }
            if (message.media?.timestamp != null) {
              latestMediaTimestamp = message.media.timestamp;
            }
            if (message.media?.payload && isInboundCustomerMedia(message.media)) {
              noteCustomerAnswerFromMedia();
              maybeMonitorAudio('customer', message.media.payload);
            }
            if (!openAiReady) return;
            if (
              sessionState.mode === 'paused' ||
              sessionState.mode === 'takeover' ||
              sessionState.mode === 'ended'
            ) {
              return;
            }
            if (!message.media?.payload) return;
            if (!isInboundCustomerMedia(message.media)) return;
            // Standby: do not send customer audio to OpenAI (avoids VAD commits before Start AI Stream)
            if (sessionState.mode !== 'standby') {
              sendJson(openAiWs, {
                type: 'input_audio_buffer.append',
                audio: message.media.payload
              });
            }
            break;
          case 'mark':
            if (markQueue.length > 0) {
              markQueue.shift();
            }
            break;
          case 'stop':
            console.log('[AI BRIDGE] Twilio stream stop', { callSid: runtimeCallSid, streamSid });
            pendingOutboundAudio = [];
            clearOpeningDelayTimer();
            clearReplyHoldFlushTimer();
            replyHoldBuffer = [];
            outboundHoldUntil = 0;
            if (runtimeCallSid) {
              unbindSessionHooks(runtimeCallSid);
              setSessionMode(runtimeCallSid, 'ended');
              notifyMonitorState({
                callSid: runtimeCallSid,
                agentId: runtimeAgentId,
                state: 'ended'
              });
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
      clearCustomerWaitFallback();
      clearPostAnswerGraceTimer();
      clearOpeningDelayTimer();
      clearReplyHoldFlushTimer();
      replyHoldBuffer = [];
      outboundHoldUntil = 0;
      if (runtimeCallSid) {
        unbindSessionHooks(runtimeCallSid);
        clearAiCallAnswered(runtimeCallSid);
        sessionStateByCallSid.delete(runtimeCallSid);
      }
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

function hasActiveAiMediaStream(callSid) {
  return Boolean(callSid && activeSessionHooksByCallSid.has(String(callSid)));
}

function getAiStreamStatus(callSid) {
  if (!callSid) {
    return {
      streamConnected: false,
      aiPipeReady: false,
      aiSpeaking: false,
      mode: null
    };
  }
  const hooks = activeSessionHooksByCallSid.get(String(callSid));
  if (!hooks?.snapshot) {
    return {
      streamConnected: false,
      aiPipeReady: false,
      aiSpeaking: false,
      mode: null
    };
  }
  const snap = hooks.snapshot();
  return {
    streamConnected: true,
    aiPipeReady: Boolean(snap.openAiReady && snap.openAiSessionUpdated),
    aiSpeaking: Boolean(snap.aiConversationEnabled),
    mode: snap.mode || null
  };
}

function requestManualStartWhenStreamReady(callSid) {
  if (callSid) pendingManualStartByCallSid.add(String(callSid));
}

function clearPendingManualStart(callSid) {
  if (callSid) pendingManualStartByCallSid.delete(String(callSid));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAiStreamAndStart(callSid, maxWaitMs = 14000) {
  const sid = String(callSid);
  const deadline = Date.now() + maxWaitMs;
  let lastMessage =
    'AI media stream did not connect in time. Wait until the badge shows AI connected (silent), then try again.';
  let sawLocalStream = false;

  while (Date.now() < deadline) {
    if (hasActiveAiMediaStream(sid)) {
      sawLocalStream = true;
      const result = forceStartAiStreamForCall(sid);
      if (result.ok) return result;
      lastMessage = result.message || lastMessage;
      await sleep(400);
      continue;
    }
    await sleep(350);
  }

  clearPendingManualStart(sid);
  return {
    ok: false,
    message: lastMessage,
    code: sawLocalStream ? 'start_not_ready' : 'no_media_stream'
  };
}

function forceStartAiStreamForCall(callSid) {
  if (!callSid) return { ok: false, message: 'callSid is required' };
  const hooks = activeSessionHooksByCallSid.get(String(callSid));
  if (!hooks?.forceStart) {
    return {
      ok: false,
      message:
        'No active AI media stream for this call. Reconnecting the stream — try again in a few seconds.',
      code: 'no_media_stream'
    };
  }
  return hooks.forceStart();
}

module.exports = {
  initializeAiMediaBridge,
  BRIDGE_PATH,
  hasActiveAiMediaStream,
  getAiStreamStatus,
  requestManualStartWhenStreamReady,
  waitForAiStreamAndStart,
  forceStartAiStreamForCall,
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
    if (normalized === 'start_stream' || normalized === 'start_ai') {
      markAiCallAnsweredNow(callSid, POST_ANSWER_GRACE_MS);
      requestManualStartWhenStreamReady(callSid);
      const startResult = forceStartAiStreamForCall(callSid);
      const state = setSessionMode(callSid, startResult.ok ? 'active' : getSessionState(callSid).mode);
      console.log('[AI BRIDGE] Manual AI stream start', {
        callSid,
        ok: startResult.ok,
        message: startResult.message,
        activeStreams: activeSessionHooksByCallSid.size
      });
      return {
        ok: startResult.ok,
        code: startResult.code,
        state,
        message: startResult.message,
        streamConnected: startResult.streamConnected,
        aiPipeReady: startResult.aiPipeReady,
        aiConversationEnabled: startResult.aiConversationEnabled
      };
    }
    return { ok: false, message: 'Unsupported action' };
  },
  getAiControlState(callSid) {
    return getSessionState(callSid);
  }
};

