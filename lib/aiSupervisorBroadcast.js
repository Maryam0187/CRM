/**
 * Live audio monitor for the call initiator (customer + Rebecca via Socket.IO).
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

function broadcastMonitorAudio({ callSid, agentId, track, payload }) {
  if (!isEnabled() || !callSid || !agentId || !payload || !track) return;
  const io = getSocketManager()?.getIO?.();
  if (!io) return;
  io.to(`user_${parseInt(agentId, 10)}`).emit('ai_monitor_audio', {
    callSid: String(callSid),
    track,
    payload
  });
}

function notifyMonitorState({ callSid, agentId, state }) {
  if (!callSid || !agentId) return;
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
  isEnabled
};
