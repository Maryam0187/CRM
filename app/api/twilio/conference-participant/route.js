import { NextResponse } from 'next/server';
import { getClient } from '../../../../lib/twilio';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { CallLog } from '../../../../models';

function isPhoneLeg(num) {
  if (!num) return false;
  const s = String(num);
  if (s.startsWith('client:')) return false;
  return s.startsWith('+') || /^\+?[1-9]\d{6,14}$/.test(s.replace(/[^\d+]/g, ''));
}

/**
 * Resolve PSTN customer CallSid in conference (for hold when UI has no SID — e.g. invited agent).
 */
async function resolveCustomerParticipantCallSid(client, conferenceSid, callLogCustomerSid) {
  if (callLogCustomerSid && String(callLogCustomerSid).startsWith('CA')) {
    return callLogCustomerSid;
  }
  try {
    const participants = await client.conferences(conferenceSid).participants.list();
    for (const p of participants) {
      if (!p.callSid) continue;
      try {
        const call = await client.calls(p.callSid).fetch();
        const from = String(call.from || '');
        const to = String(call.to || '');
        const isClient = from.startsWith('client:') || to.startsWith('client:');
        if (!isClient && (isPhoneLeg(from) || isPhoneLeg(to))) {
          return p.callSid;
        }
      } catch {
        /* next */
      }
    }
  } catch (e) {
    console.warn('⚠️ resolveCustomerParticipantCallSid:', e.message);
  }
  return null;
}

/**
 * Update Twilio Conference participant (bridge-level): mute and/or hold.
 * Voice SDK mute() alone does not clear <Conference muted="true" /> — muted does.
 * Hold uses the customer leg's Conference waitUrl for music (see voice-response / inbound TwiML).
 * For hold only, participantCallSid may be omitted — server resolves customer leg from CallLog / Twilio.
 */
export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { conferenceName, participantCallSid, muted, hold } = body;

    if (!conferenceName) {
      return NextResponse.json(
        { success: false, message: 'conferenceName is required' },
        { status: 400 }
      );
    }

    const updates = {};
    if (typeof muted === 'boolean') updates.muted = muted;
    if (typeof hold === 'boolean') updates.hold = hold;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, message: 'Provide muted and/or hold as boolean' },
        { status: 400 }
      );
    }

    if (typeof muted === 'boolean' && !participantCallSid) {
      return NextResponse.json(
        { success: false, message: 'participantCallSid is required when updating mute' },
        { status: 400 }
      );
    }

    const client = getClient();

    let callLog = null;
    let conferenceSid = null;
    try {
      callLog = await CallLog.findOne({
        where: { conferenceName },
        order: [['created_at', 'DESC']]
      });
      conferenceSid = callLog?.conferenceSid || null;
    } catch (e) {
      console.warn('⚠️ CallLog lookup for conference:', e.message);
    }

    if (!conferenceSid) {
      try {
        const list = await client.conferences.list({
          friendlyName: conferenceName,
          status: 'in-progress',
          limit: 10
        });
        const match = list.find((c) => c.friendlyName === conferenceName);
        conferenceSid = match?.sid || list[0]?.sid || null;
      } catch (e) {
        console.warn('⚠️ Twilio conferences.list failed:', e.message);
      }
    }

    if (!conferenceSid) {
      return NextResponse.json(
        { success: false, message: 'Could not resolve Twilio Conference SID' },
        { status: 404 }
      );
    }

    let targetSid = participantCallSid;
    if (!targetSid && typeof hold === 'boolean') {
      targetSid = await resolveCustomerParticipantCallSid(
        client,
        conferenceSid,
        callLog?.customerCallSid
      );
    }

    if (!targetSid) {
      return NextResponse.json(
        {
          success: false,
          message:
            'participantCallSid is required, or hold with a resolvable customer leg in this conference'
        },
        { status: 400 }
      );
    }

    await client.conferences(conferenceSid).participants(targetSid).update(updates);

    return NextResponse.json({
      success: true,
      data: { conferenceSid, participantCallSid: targetSid, ...updates }
    });
  } catch (error) {
    console.error('❌ conference-participant update failed:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update conference participant' },
      { status: 500 }
    );
  }
}
