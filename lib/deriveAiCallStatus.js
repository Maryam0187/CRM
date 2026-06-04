const CALL_END_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];

function normalizeEndStatus(status) {
  if (!status) return null;
  const s = String(status).toLowerCase();
  if (CALL_END_STATUSES.includes(s)) return s;
  if (s === 'initiated') return 'queued';
  return null;
}

/**
 * Derive UI/call-log status for outbound AI calls.
 * Twilio often sends CallStatus=in-progress on the "answered" callback without AnswerTime.
 */
function deriveAiCallStatus({
  callStatusRaw,
  answerTime,
  statusCallbackEvent,
  previousStatus = null,
  callDuration = null
}) {
  const s = String(callStatusRaw || '').toLowerCase();
  const event = String(statusCallbackEvent || '').toLowerCase();
  const prev = String(previousStatus || '').toLowerCase();
  const duration = callDuration != null ? parseInt(callDuration, 10) : 0;

  const endStatus = normalizeEndStatus(s);
  if (endStatus) return endStatus;

  if (event === 'ringing' || s === 'ringing') return 'ringing';
  if (event === 'initiated' || s === 'initiated' || s === 'queued') return 'queued';

  if (event === 'answered' || s === 'answered') {
    return 'in-progress';
  }

  if (s === 'in-progress') {
    if (answerTime) return 'in-progress';
    if (duration > 0) return 'in-progress';
    if (prev === 'ringing' || prev === 'queued' || prev === '') {
      return 'in-progress';
    }
    return 'ringing';
  }

  return 'queued';
}

module.exports = {
  deriveAiCallStatus,
  CALL_END_STATUSES
};
