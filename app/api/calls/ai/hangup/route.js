import { NextResponse } from 'next/server';
import { getClient } from '../../../../../lib/twilio';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { canControlAiCall } from '../../../../../lib/aiCallAccess';
import { setAiControlAction } from '../../../../../lib/aiMediaBridge';
import { clearAiCallAnswered } from '../../../../../lib/aiCallAnswerGate';
import {
  terminateCallBySid,
  terminateConferenceParticipants
} from '../../../../../lib/terminateTwilioCall';

/**
 * Fully terminate an outbound AI call (Twilio legs in progress, conference, media bridge).
 */
export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { callSid } = body;

    if (!callSid) {
      return NextResponse.json(
        { success: false, message: 'callSid is required' },
        { status: 400 }
      );
    }

    const callLog = await sequelizeDb.CallLog.findOne({
      where: { callSid: String(callSid) }
    });
    if (!callLog?.twilioData?.aiCall) {
      return NextResponse.json({ success: false, message: 'AI call not found' }, { status: 404 });
    }

    if (!canControlAiCall(authResult.user, callLog)) {
      return NextResponse.json(
        { success: false, message: 'Only the user who started this call can end it' },
        { status: 403 }
      );
    }

    setAiControlAction(String(callSid), 'end_ai', authResult.user.id);
    clearAiCallAnswered(String(callSid));

    const client = getClient();
    const conferenceName =
      callLog.conferenceName ||
      callLog.twilioData?.aiConferenceName ||
      callLog.twilioData?.aiTakeoverConferenceName ||
      `ai-supervised-${String(callSid)}`;

    const legsToEnd = new Set(
      [
        callSid,
        callLog.customerCallSid,
        callLog.agentCallSid,
        callLog.twilioData?.customerCallSid,
        callLog.twilioData?.agentCallSid
      ]
        .filter(Boolean)
        .map(String)
    );

    const terminatedLegs = [];
    for (const legSid of legsToEnd) {
      const result = await terminateCallBySid(legSid, client);
      if (result) terminatedLegs.push(result);
    }

    const conferenceTerminated = await terminateConferenceParticipants(conferenceName, client);

    const primary = terminatedLegs.find((l) => l.callSid === String(callSid)) || terminatedLegs[0];

    console.log('[AI HANGUP] Call terminated:', {
      callSid,
      conferenceName,
      terminatedLegs: terminatedLegs.length,
      conferenceParticipantsEnded: conferenceTerminated.length
    });

    return NextResponse.json({
      success: true,
      data: {
        callSid: primary?.callSid || String(callSid),
        status: primary?.status || 'completed',
        conferenceName,
        terminatedLegs,
        conferenceParticipantsEnded: conferenceTerminated.length
      },
      message: 'AI call ended'
    });
  } catch (error) {
    console.error('[AI HANGUP] Error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to end AI call', error: error.message },
      { status: 500 }
    );
  }
}
