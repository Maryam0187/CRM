/**
 * Live audio monitor — binary WebSocket stream to the browser (not Socket.IO).
 */

const { publishMonitorFrame } = require('./aiMonitorStream');

function isEnabled() {
  return process.env.AI_SUPERVISOR_BROWSER_LISTEN !== 'false';
}

function broadcastMonitorAudio({ callSid, track, payload }) {
  if (!isEnabled() || !callSid || !payload || !track) return;
  try {
    const mulawBytes = Buffer.from(payload, 'base64');
    if (!mulawBytes.length) return;
    publishMonitorFrame({ callSid, track, mulawBytes });
  } catch (error) {
    console.warn('[AI MONITOR] Frame publish failed:', error.message);
  }
}

function notifyMonitorState({ callSid, agentId, state }) {
  if (!callSid || !agentId) return;
  let socketManager;
  try {
    socketManager = require('./socket');
  } catch (e) {
    console.warn('[AI MONITOR]', e.message);
    return;
  }
  const io = socketManager?.getIO?.();
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

/** @deprecated batching no longer used — kept for aiMediaBridge import compatibility */
function flushAiMonitorBatch() {}

module.exports = {
  broadcastMonitorAudio,
  notifyMonitorState,
  registerMonitorsForCall,
  flushAiMonitorBatch,
  isEnabled
};
