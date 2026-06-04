import { getClient } from './twilio';

const TERMINAL_STATUSES = ['completed', 'canceled', 'failed', 'busy', 'no-answer'];

/**
 * Idempotently complete or cancel a single Twilio call leg.
 * @returns {Promise<{ callSid: string, status: string, ended: boolean }|null>}
 */
export async function terminateCallBySid(callSid, client = null) {
  if (!callSid) return null;
  const twilio = client || getClient();
  try {
    let call = await twilio.calls(String(callSid)).fetch();
    if (TERMINAL_STATUSES.includes(call.status)) {
      return { callSid: call.sid, status: call.status, ended: false };
    }
    if (call.status === 'ringing' || call.status === 'queued') {
      call = await twilio.calls(String(callSid)).update({ status: 'canceled' });
    } else {
      call = await twilio.calls(String(callSid)).update({ status: 'completed' });
    }
    return { callSid: call.sid, status: call.status, ended: true };
  } catch (err) {
    console.warn('[TERMINATE CALL] Failed for', callSid, err.message);
    return null;
  }
}

/**
 * End all in-progress participants in a named conference (customer, agent SDK, etc.).
 */
export async function terminateConferenceParticipants(conferenceName, client = null) {
  if (!conferenceName) return [];
  const twilio = client || getClient();
  const results = [];

  try {
    const conferences = await twilio.conferences.list({
      friendlyName: String(conferenceName),
      status: 'in-progress',
      limit: 5
    });

    for (const conference of conferences) {
      const participants = await twilio.conferences(conference.sid).participants.list();
      for (const participant of participants) {
        if (!participant.callSid) continue;
        const result = await terminateCallBySid(participant.callSid, twilio);
        if (result) results.push({ ...result, conferenceSid: conference.sid });
      }
    }
  } catch (err) {
    console.warn('[TERMINATE CONFERENCE] Failed for', conferenceName, err.message);
  }

  return results;
}
