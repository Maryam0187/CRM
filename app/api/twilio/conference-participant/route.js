import { NextResponse } from 'next/server';
import { getClient } from '../../../../lib/twilio';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { CallLog } from '../../../../models';

/**
 * Update Twilio Conference participant mute (bridge-level).
 * Voice SDK mute() alone does not clear <Conference muted="true" /> — this does.
 */
export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { conferenceName, participantCallSid, muted } = body;

    if (!conferenceName || !participantCallSid) {
      return NextResponse.json(
        { success: false, message: 'conferenceName and participantCallSid are required' },
        { status: 400 }
      );
    }

    if (typeof muted !== 'boolean') {
      return NextResponse.json(
        { success: false, message: 'muted must be a boolean' },
        { status: 400 }
      );
    }

    const client = getClient();

    let conferenceSid = null;
    try {
      const callLog = await CallLog.findOne({
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

    await client.conferences(conferenceSid).participants(participantCallSid).update({ muted });

    return NextResponse.json({
      success: true,
      data: { conferenceSid, participantCallSid, muted }
    });
  } catch (error) {
    console.error('❌ conference-participant update failed:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'Failed to update conference participant' },
      { status: 500 }
    );
  }
}
