/**
 * Live audio monitor for the call initiator (customer + Rebecca via Socket.IO).
 */

let socketManager = null;

const AI_BATCH_MS = 40;
const AI_BATCH_MAX_BYTES = 2880; // ~360ms of 8 kHz μ-law
const aiBatchByCallSid = new Map();

function getSocketManager() {
  if (!socketManager) {
    try {
      socketManager = require('./socket');
    } catch (e) {
      console.warn('[AI MONITOR]', e.message);
    }
  }
  return socketManager;
}

function isEnabled() {
  return process.env.AI_SUPERVISOR_BROWSER_LISTEN !== 'false';
}

function emitMonitorAudio({ callSid, agentId, track, payload }) {
  const io = getSocketManager()?.getIO?.();
  if (!io) return;
  const event = {
    callSid: String(callSid),
    track,
    payload
  };
  let target = io.to(`call_${callSid}`);
  if (agentId) {
    target = target.to(`user_${parseInt(agentId, 10)}`);
  }
  target.emit('ai_monitor_audio', event);
}

function aiBatchByteLength(chunks) {
  let bytes = 0;
  for (const chunk of chunks) {
    bytes += Buffer.from(chunk, 'base64').length;
  }
  return bytes;
}

function mergeBase64Mulaw(chunks) {
  if (!chunks.length) return '';
  if (chunks.length === 1) return chunks[0];
  return Buffer.concat(chunks.map((c) => Buffer.from(c, 'base64'))).toString('base64');
}

function flushAiMonitorBatch(callSid) {
  const state = aiBatchByCallSid.get(callSid);
  if (!state) return;
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  const chunks = state.chunks;
  state.chunks = [];
  if (!chunks.length) return;

  const payload = mergeBase64Mulaw(chunks);
  const agentId = state.agentId;
  setImmediate(() => {
    emitMonitorAudio({ callSid, agentId, track: 'ai', payload });
  });
}

function queueAiMonitorAudio({ callSid, agentId, payload }) {
  let state = aiBatchByCallSid.get(callSid);
  if (!state) {
    state = { chunks: [], agentId: agentId || null, timer: null };
    aiBatchByCallSid.set(callSid, state);
  }
  if (agentId) state.agentId = agentId;
  state.chunks.push(payload);

  if (aiBatchByteLength(state.chunks) >= AI_BATCH_MAX_BYTES) {
    flushAiMonitorBatch(callSid);
    return;
  }
  if (!state.timer) {
    state.timer = setTimeout(() => flushAiMonitorBatch(callSid), AI_BATCH_MS);
  }
}

function clearAiMonitorBatch(callSid) {
  flushAiMonitorBatch(callSid);
  aiBatchByCallSid.delete(callSid);
}

function broadcastMonitorAudio({ callSid, agentId, track, payload }) {
  if (!isEnabled() || !callSid || !payload || !track) return;
  if (track === 'ai') {
    queueAiMonitorAudio({ callSid, agentId, payload });
    return;
  }
  setImmediate(() => {
    emitMonitorAudio({ callSid, agentId, track, payload });
  });
}

function notifyMonitorState({ callSid, agentId, state }) {
  if (!callSid || !agentId) return;
  if (state === 'ended') {
    clearAiMonitorBatch(callSid);
  }
  const io = getSocketManager()?.getIO?.();
  if (!io) return;
  const payload = {
    callSid: String(callSid),
    state,
    agentId: parseInt(agentId, 10)
  };
  io.to(`call_${callSid}`).emit('ai_monitor_state', payload);
  io.to(`user_${parseInt(agentId, 10)}`).emit('ai_monitor_state', payload);
}

async function registerMonitorsForCall(callSid, agentId) {
  if (!callSid || !agentId) return [parseInt(agentId, 10)];
  return [parseInt(agentId, 10)];
}

module.exports = {
  broadcastMonitorAudio,
  notifyMonitorState,
  registerMonitorsForCall,
  clearAiMonitorBatch,
  flushAiMonitorBatch,
  isEnabled
};
