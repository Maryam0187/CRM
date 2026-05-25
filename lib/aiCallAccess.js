/** Only the user who started the AI call may monitor or control it (any role: agent, supervisor, admin). */

function canAccessAiCall(user, callLog) {
  if (!user || !callLog) return false;
  return parseInt(callLog.agentId, 10) === parseInt(user.id, 10);
}

module.exports = {
  canAccessAiCall,
  canControlAiCall: canAccessAiCall,
  canMonitorAiCall: canAccessAiCall
};
