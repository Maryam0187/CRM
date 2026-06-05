import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import {
  setAiControlAction,
  getAiControlState,
  hasActiveAiMediaStream,
  getAiStreamStatus,
  requestManualStartWhenStreamReady,
  waitForAiStreamAndStart
} from '../../../../../lib/aiMediaBridge';
import { markAiCallAnsweredNow } from '../../../../../lib/aiCallAnswerGate';
import { reconnectCallToAiVoice } from '../../../../../lib/aiReconnectVoice';
import { getAiMediaStreamWsUrl } from '../../../../../lib/aiRealtimeConfig';
import { getClient, getWebhookUrl } from '../../../../../lib/twilio';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { canControlAiCall } from '../../../../../lib/aiCallAccess';

function buildStartStreamFailureHint(callSid) {
  const hints = [];
  const hasLocalStream = hasActiveAiMediaStream(String(callSid));

  if (!hasLocalStream) {
    hints.push(
      'The Twilio media stream is not active on this server process. On Railway, use exactly 1 replica — active streams are stored in memory and a Start request can land on a different instance than the WebSocket.'
    );
  } else {
    hints.push(
      'The stream is connected on this server but Rebecca could not start yet. Wait for the AI connected (silent) badge, then try again.'
    );
  }

  const hasDerivedWsUrl =
    Boolean(process.env.AI_MEDIA_STREAM_WS_URL) ||
    Boolean(process.env.RAILWAY_PUBLIC_DOMAIN) ||
    Boolean(process.env.RAILWAY_STATIC_URL) ||
    Boolean(process.env.TWILIO_WEBHOOK_BASE_URL);

  if (!hasDerivedWsUrl) {
    hints.push(
      `Set AI_MEDIA_STREAM_WS_URL=${getAiMediaStreamWsUrl(getWebhookUrl)} (must support WebSockets).`
    );
  }

  return hints.length ? ` ${hints.join(' ')}` : '';
}

export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { callSid, action } = body;
    if (!callSid || !action) {
      return NextResponse.json(
        { success: false, message: 'callSid and action are required' },
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
        { success: false, message: 'Only the user who started this call can monitor or control it' },
        { status: 403 }
      );
    }

    let state = getAiControlState(String(callSid));

    const normalizedAction = String(action).toLowerCase();
    let takeoverConferenceName = null;

    if (normalizedAction === 'takeover') {
      takeoverConferenceName =
        callLog.twilioData?.aiTakeoverConferenceName ||
        callLog.conferenceName ||
        `ai-supervised-${String(callSid)}`;

      const alreadyInSupervisedConference =
        callLog.twilioData?.supervisedConferenceMode === true &&
        callLog.conferenceName &&
        String(callLog.conferenceName) === String(takeoverConferenceName);

      if (!alreadyInSupervisedConference) {
        const twimlUrl = new URL(getWebhookUrl('/api/twilio/voice-response'));
        twimlUrl.searchParams.set('agentId', String(authResult.user.id));
        twimlUrl.searchParams.set('conferenceName', takeoverConferenceName);
        twimlUrl.searchParams.set('source', 'ai_takeover');

        const twilioClient = getClient();
        await twilioClient.calls(String(callSid)).update({
          url: twimlUrl.toString(),
          method: 'POST'
        });
      }

      await callLog.update({
        conferenceName: takeoverConferenceName,
        twilioData: {
          ...(callLog.twilioData || {}),
          aiCall: true,
          supervisedAi: true,
          aiTakeoverConferenceName: takeoverConferenceName,
          aiTakeoverAt: new Date().toISOString(),
          aiTakeoverBy: parseInt(authResult.user.id, 10)
        }
      });
    }

    if (normalizedAction === 'start_stream' || normalizedAction === 'start_ai') {
      markAiCallAnsweredNow(String(callSid));
      requestManualStartWhenStreamReady(String(callSid));

      let startResult = setAiControlAction(String(callSid), normalizedAction, authResult.user.id);
      let reconnected = false;

      if (!startResult.ok) {
        startResult = await waitForAiStreamAndStart(String(callSid), 12000);
      }

      if (!startResult.ok && !hasActiveAiMediaStream(String(callSid))) {
        const reconnect = await reconnectCallToAiVoice(callLog);
        if (!reconnect.ok) {
          return NextResponse.json(
            { success: false, message: reconnect.message || 'Could not reconnect AI stream' },
            { status: 409 }
          );
        }
        reconnected = true;
        requestManualStartWhenStreamReady(String(callSid));
        startResult = await waitForAiStreamAndStart(String(callSid), 16000);
      }

      if (!startResult.ok) {
        console.warn('[AI CONTROL] start_stream failed', {
          callSid: String(callSid),
          hasLocalStream: hasActiveAiMediaStream(String(callSid)),
          streamStatus: getAiStreamStatus(String(callSid)),
          reconnected,
          code: startResult.code,
          message: startResult.message
        });
        return NextResponse.json(
          {
            success: false,
            message: (startResult.message || 'Could not start AI stream') + buildStartStreamFailureHint(callSid),
            reconnected,
            hasLocalStream: hasActiveAiMediaStream(String(callSid))
          },
          { status: 409 }
        );
      }

      return NextResponse.json({
        success: true,
        data: {
          callSid: String(callSid),
          state: getAiControlState(String(callSid)),
          streamConnected: startResult.streamConnected ?? hasActiveAiMediaStream(String(callSid)),
          aiPipeReady: startResult.aiPipeReady ?? getAiStreamStatus(String(callSid)).aiPipeReady,
          aiConversationEnabled: startResult.aiConversationEnabled,
          reconnected
        },
        message: reconnected
          ? 'AI media stream reconnected and Rebecca started.'
          : startResult.message || 'AI stream started'
      });
    }

    const result = setAiControlAction(String(callSid), normalizedAction, authResult.user.id);
    if (!result.ok) {
      const forbidden = String(result.message || '').toLowerCase().includes('only call initiator');
      return NextResponse.json(
        { success: false, message: result.message || 'Invalid control action' },
        { status: forbidden ? 403 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        callSid: String(callSid),
        state: result.state,
        conferenceName: takeoverConferenceName
      }
    });
  } catch (error) {
    console.error('AI control error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to apply AI control action', error: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { searchParams } = new URL(request.url);
    const callSid = searchParams.get('callSid');
    if (!callSid) {
      return NextResponse.json({ success: false, message: 'callSid is required' }, { status: 400 });
    }

    const callLog = await sequelizeDb.CallLog.findOne({
      where: { callSid: String(callSid) }
    });
    if (!callLog?.twilioData?.aiCall) {
      return NextResponse.json({ success: false, message: 'AI call not found' }, { status: 404 });
    }

    const state = getAiControlState(callSid);
    const canAccess = canControlAiCall(authResult.user, callLog);
    const streamStatus = getAiStreamStatus(String(callSid));

    return NextResponse.json({
      success: true,
      data: {
        callSid,
        state,
        canControl: canAccess,
        canMonitor: canAccess,
        isInitiator: canAccess,
        streamConnected: streamStatus.streamConnected,
        aiPipeReady: streamStatus.aiPipeReady,
        aiSpeaking: streamStatus.aiSpeaking,
        mode: streamStatus.mode
      }
    });
  } catch (error) {
    console.error('AI control state error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get AI control state', error: error.message },
      { status: 500 }
    );
  }
}
