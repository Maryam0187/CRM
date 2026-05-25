/**
 * Tracks when an outbound AI call is truly answered (not early-media "in-progress").
 * Used by ai/call-status-callback and aiMediaBridge.
 */

const answeredAtByCallSid = new Map();

function markAiCallAnswered(callSid) {
  if (!callSid) return;
  if (!answeredAtByCallSid.has(callSid)) {
    answeredAtByCallSid.set(callSid, Date.now());
  }
}

function isAiCallAnswered(callSid) {
  return callSid ? answeredAtByCallSid.has(callSid) : false;
}

function getAiCallAnsweredAt(callSid) {
  return callSid ? answeredAtByCallSid.get(callSid) ?? null : null;
}

function clearAiCallAnswered(callSid) {
  if (callSid) answeredAtByCallSid.delete(callSid);
}

module.exports = {
  markAiCallAnswered,
  isAiCallAnswered,
  getAiCallAnsweredAt,
  clearAiCallAnswered
};
