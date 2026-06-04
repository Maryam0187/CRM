/**
 * Live audio monitor for the call initiator only (customer + AI via Socket.IO).
 */

let socketManager = null;

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

/**
 * @param {{ audio?: boolean }} options
 * audio: true → call room only (avoids duplicate playback when listener is in user_* and call_*)
 */
function emitToListeners(callSid, listenerIds, eventName, payload, options = {}) {
  const io = getSocketManager()?.getIO?.();
  if (!io || !callSid) return;
  io.to(`call_${callSid}`).emit(eventName, payload);
  if (options.audio) return;
  for (const userId of listenerIds) {
    io.to(`user_${userId}`).emit(eventName, payload);
  }
}

async function registerMonitorsForCall(callSid, agentId) {
  if (!callSid || !agentId) return [parseInt(agentId, 10)];
  console.log('[AI MONITOR] Registered initiator listener', { callSid, agentId });
  return [parseInt(agentId, 10)];
}

function broadcastMonitorAudio({ callSid, agentId, track, payload }) {
  if (!isEnabled() || !callSid || !agentId || !payload || !track) return;
  const event = {
    type: 'ai_monitor_audio',
    callSid: String(callSid),
    track,
    payload,
    timestamp: Date.now()
  };
  emitToListeners(callSid, getListenerIds(agentId), 'ai_monitor_audio', event, { audio: true });
}

function notifyMonitorState({ callSid, agentId, state }) {
  if (!callSid || !agentId) return;
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
  isEnabled
};
