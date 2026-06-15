/**
 * Live audio monitor for the call initiator only (customer + AI via Socket.IO).
 */

let socketManager = null;

/** @type {Map<string, { customer: string[], ai: string[], agentId: string|null, timer: NodeJS.Timeout|null }>} */
const batchByCallSid = new Map();

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

function getListenerIds(agentId) {
  return agentId ? [parseInt(agentId, 10)] : [];
}

function emitToListeners(callSid, listenerIds, eventName, payload, options = {}) {
  const io = getSocketManager()?.getIO?.();
  if (!io || !callSid) return;
  io.to(`call_${callSid}`).emit(eventName, payload);
  if (options.audio) return;
  for (const userId of listenerIds) {
    io.to(`user_${userId}`).emit(eventName, payload);
  }
}

function mergeMulawChunks(chunks) {
  if (chunks.length === 1) return chunks[0];
  return Buffer.concat(chunks.map((c) => Buffer.from(c, 'base64'))).toString('base64');
}

function flushMonitorBatch(callSid) {
  const state = batchByCallSid.get(callSid);
  if (!state) return;
  state.timer = null;
  const io = getSocketManager()?.getIO?.();
  if (!io || !state.agentId) return;

  const userRoom = `user_${parseInt(state.agentId, 10)}`;
  for (const track of ['customer', 'ai']) {
    const chunks = state[track];
    if (chunks.length === 0) continue;
    state[track] = [];
    const payload = mergeMulawChunks(chunks);
    if (!payload) continue;
    io.to(userRoom).emit('ai_monitor_audio', {
      type: 'ai_monitor_audio',
      callSid: String(callSid),
      track,
      payload,
      timestamp: Date.now()
    });
  }
}

function clearMonitorBatch(callSid) {
  if (!callSid) return;
  const state = batchByCallSid.get(String(callSid));
  if (state?.timer) {
    clearTimeout(state.timer);
  }
  batchByCallSid.delete(String(callSid));
}

async function registerMonitorsForCall(callSid, agentId) {
  if (!callSid || !agentId) return [parseInt(agentId, 10)];
  console.log('[AI MONITOR] Registered initiator listener', { callSid, agentId });
  return [parseInt(agentId, 10)];
}

function broadcastMonitorAudio({ callSid, agentId, track, payload }) {
  if (!isEnabled() || !callSid || !agentId || !payload || !track) return;
  if (track !== 'customer' && track !== 'ai') return;

  const key = String(callSid);
  let state = batchByCallSid.get(key);
  if (!state) {
    state = { customer: [], ai: [], agentId: null, timer: null };
    batchByCallSid.set(key, state);
  }
  state.agentId = String(agentId);
  state[track].push(payload);
  if (state[track].length > 40) {
    state[track].shift();
  }

  if (!state.timer) {
    state.timer = setTimeout(() => flushMonitorBatch(key), 20);
  }
}

function notifyMonitorState({ callSid, agentId, state }) {
  if (!callSid || !agentId) return;
  if (state === 'ended') {
    clearMonitorBatch(callSid);
  }
  const payload = {
    type: 'ai_monitor_state',
    callSid: String(callSid),
    state,
    agentId: parseInt(agentId, 10),
    timestamp: new Date().toISOString()
  };
  emitToListeners(callSid, getListenerIds(agentId), 'ai_monitor_state', payload);
}

module.exports = {
  broadcastMonitorAudio,
  notifyMonitorState,
  registerMonitorsForCall,
  clearMonitorBatch,
  isEnabled
};
