/** Only the user who started the AI call may monitor or control it. */

function canMonitorAiCall(user, callLog) {
  if (!user || !callLog) return false;
  return parseInt(callLog.agentId, 10) === parseInt(user.id, 10);
}

function canControlAiCall(user, callLog) {
  return canMonitorAiCall(user, callLog);
}

module.exports = {
  canMonitorAiCall,
  canControlAiCall
};
