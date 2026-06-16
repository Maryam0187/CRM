/**
 * Binary WebSocket stream for supervisor monitor audio (customer + Rebecca).
 * Same class of transport as Twilio media streams — not Socket.IO JSON events.
 */

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { getAiBridgeGlobalState } = require('./aiBridgeGlobalState');

const MONITOR_PATH = '/ws/ai-monitor';
const TRACK_CUSTOMER = 0;
const TRACK_AI = 1;

const listenersByCallSid = new Map();

function publishMonitorFrame({ callSid, track, mulawBytes }) {
  if (!callSid || !mulawBytes?.length) return;
  const listeners = listenersByCallSid.get(String(callSid));
  if (!listeners?.size) return;

  const trackByte = track === 'ai' ? TRACK_AI : TRACK_CUSTOMER;
  const frame = Buffer.allocUnsafe(1 + mulawBytes.length);
  frame[0] = trackByte;
  mulawBytes.copy(frame, 1);

  for (const ws of listeners) {
    if (ws.readyState === 1) {
      ws.send(frame, { binary: true });
    }
  }
}

function addListener(callSid, ws) {
  const key = String(callSid);
  let set = listenersByCallSid.get(key);
  if (!set) {
    set = new Set();
    listenersByCallSid.set(key, set);
  }
  set.add(ws);
}

function removeListener(callSid, ws) {
  const key = String(callSid);
  const set = listenersByCallSid.get(key);
  if (!set) return;
  set.delete(ws);
  if (!set.size) listenersByCallSid.delete(key);
}

function initializeAiMonitorStream(server) {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws, request) => {
    const url = new URL(request.url, 'http://localhost');
    const callSid = url.searchParams.get('callSid');
    const token = url.searchParams.get('token');

    if (!callSid) {
      ws.close(4002, 'callSid required');
      return;
    }

    let userId;
    try {
      const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.type !== 'access') throw new Error('Invalid token type');
      userId = decoded.userId;
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const { sessionStateByCallSid } = getAiBridgeGlobalState();
    const owner = sessionStateByCallSid.get(String(callSid))?.ownerAgentId;
    if (owner && parseInt(owner, 10) !== parseInt(userId, 10)) {
      ws.close(4003, 'Forbidden');
      return;
    }

    ws.monitorCallSid = String(callSid);
    addListener(ws.monitorCallSid, ws);
    console.log('[AI MONITOR WS] Client connected', { callSid: ws.monitorCallSid, userId });

    ws.on('close', () => {
      removeListener(ws.monitorCallSid, ws);
      console.log('[AI MONITOR WS] Client disconnected', { callSid: ws.monitorCallSid, userId });
    });

    ws.on('error', () => {
      removeListener(ws.monitorCallSid, ws);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const { pathname } = new URL(request.url, 'http://localhost');
      if (pathname !== MONITOR_PATH) return;
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } catch (error) {
      console.error('[AI MONITOR WS] Upgrade failure:', error.message);
      socket.destroy();
    }
  });

  console.log(`[AI MONITOR WS] Listening on ${MONITOR_PATH}`);
}

module.exports = {
  MONITOR_PATH,
  TRACK_CUSTOMER,
  TRACK_AI,
  initializeAiMonitorStream,
  publishMonitorFrame
};
