import { getClient } from './twilio';

function isPhoneNumber(num) {
  if (!num) return false;
  return num.startsWith('+') || /^\+?[1-9]\d{1,14}$/.test(String(num).replace(/[^\d+]/g, ''));
}

/**
 * Agent legs use endConferenceOnExit=false so one agent can leave without killing the call.
 * When the last agent leaves, only the customer may remain — end PSTN legs so the call does not hang open.
 *
 * @param {string} conferenceSid
 * @param {string} conferenceName
 * @param {string|null} leftCallSid - Participant that just left (Twilio may still list them briefly)
 */
export async function endCustomerLegsIfNoAgentsRemain(conferenceSid, conferenceName, leftCallSid = null) {
  if (!conferenceSid || !conferenceName) return;
  if (conferenceName.startsWith('ivr-call-')) return;

  try {
    const client = getClient();
    const participants = await client.conferences(conferenceSid).participants.list();
    if (!participants || participants.length === 0) return;

    const remaining = leftCallSid
      ? participants.filter((p) => p.callSid !== leftCallSid)
      : participants;
    if (remaining.length === 0) return;

    let hasAgentLeg = false;
    const pstnCallSids = [];

    for (const p of remaining) {
      if (!p.callSid) continue;
      try {
        const call = await client.calls(p.callSid).fetch();
        const from = String(call.from || '');
        const to = String(call.to || '');
        if (from.startsWith('client:') || to.startsWith('client:')) {
          hasAgentLeg = true;
          break;
        }
        if (isPhoneNumber(from) || isPhoneNumber(to)) {
          pstnCallSids.push(p.callSid);
        }
      } catch (e) {
        console.warn('⚠️ [CONFERENCE LEAVE] Could not fetch participant call:', p.callSid, e.message);
      }
    }

    if (hasAgentLeg || pstnCallSids.length === 0) return;

    for (const caSid of pstnCallSids) {
      try {
        const c = await client.calls(caSid).fetch();
        if (c.status === 'completed' || c.status === 'canceled' || c.status === 'failed') continue;
        await client.calls(caSid).update({ status: 'completed' });
        console.log('📞 [CONFERENCE LEAVE] Ended customer PSTN leg (no agents left):', caSid?.substring(0, 14));
      } catch (e) {
        console.warn('⚠️ [CONFERENCE LEAVE] Failed to complete customer call:', caSid, e.message);
      }
    }
  } catch (e) {
    console.warn('⚠️ [CONFERENCE LEAVE] endCustomerLegsIfNoAgentsRemain:', e.message);
  }
}
