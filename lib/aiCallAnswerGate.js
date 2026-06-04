/**
 * Tracks when an outbound AI call is truly answered (not early-media "in-progress").
 * Used by ai/call-status-callback and aiMediaBridge.
 */

const answeredAtByCallSid = new Map();

function markAiCallAnswered(callSid, answeredAtMs = null) {
  if (!callSid) return;
  if (!answeredAtByCallSid.has(callSid)) {
    answeredAtByCallSid.set(callSid, answeredAtMs ?? Date.now());
  }
}

/** Treat call as answered immediately (manual start — skips post-answer grace wait). */
function markAiCallAnsweredNow(callSid, graceMs = 2000) {
  if (!callSid) return;
  const at = Date.now() - Math.max(0, graceMs) - 50;
  answeredAtByCallSid.set(callSid, at);
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
  markAiCallAnsweredNow,
  isAiCallAnswered,
  getAiCallAnsweredAt,
  clearAiCallAnswered
};
