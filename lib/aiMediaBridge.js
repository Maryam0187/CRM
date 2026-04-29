const { WebSocketServer, WebSocket } = require('ws');
const { URL } = require('url');

const DEFAULT_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';
const OPENAI_REALTIME_URL = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(DEFAULT_MODEL)}`;
const BRIDGE_PATH = '/ws/ai-media-stream';

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

function initializeAiMediaBridge(server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (twilioWs, request) => {
    const requestUrl = new URL(request.url, 'http://localhost');
    const agentId = requestUrl.searchParams.get('agentId');
    const customerId = requestUrl.searchParams.get('customerId');
    const saleId = requestUrl.searchParams.get('saleId');
    const aiAgentVersion = requestUrl.searchParams.get('aiAgentVersion') || 'v1';

    const openAiKey = process.env.OPENAI_API_KEY;
    if (!openAiKey) {
      twilioWs.close(1011, 'OPENAI_API_KEY is not configured');
      return;
    }

    let streamSid = null;
    const openAiWs = new WebSocket(OPENAI_REALTIME_URL, {
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        'OpenAI-Beta': 'realtime=v1'
      }
    });

    openAiWs.on('open', () => {
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
    });

    openAiWs.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString());
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
      if (twilioWs.readyState === WebSocket.OPEN) twilioWs.close(1011, 'OpenAI websocket error');
    });

    openAiWs.on('close', () => {
      if (twilioWs.readyState === WebSocket.OPEN) {
        twilioWs.close(1000, 'OpenAI stream closed');
      }
    });

    twilioWs.on('message', (rawData) => {
      try {
        const message = JSON.parse(rawData.toString());
        switch (message.event) {
          case 'start':
            streamSid = message.start?.streamSid || null;
            sendJson(openAiWs, {
              type: 'response.create',
              response: {
                modalities: ['text', 'audio'],
                instructions: 'Start with a short greeting and ask if this is a good time to discuss their needs.'
              }
            });
            break;
          case 'media':
            if (!message.media?.payload) return;
            sendJson(openAiWs, {
              type: 'input_audio_buffer.append',
              audio: message.media.payload
            });
            break;
          case 'stop':
            if (openAiWs.readyState === WebSocket.OPEN) openAiWs.close(1000, 'Twilio stream stopped');
            break;
          default:
            break;
        }
      } catch (error) {
        console.error('[AI BRIDGE] Failed to process Twilio media message:', error.message);
      }
    });

    twilioWs.on('close', () => {
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
  BRIDGE_PATH
};

