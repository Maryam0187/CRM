import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import {
  setAiControlAction,
  getAiControlState,
  forceStartAiStreamForCall,
  hasActiveAiMediaStream,
  getAiStreamStatus,
  requestManualStartWhenStreamReady,
  waitForAiStreamAndStart
} from '../../../../../lib/aiMediaBridge';
import { markAiCallAnsweredNow } from '../../../../../lib/aiCallAnswerGate';
import { reconnectCallToAiVoice } from '../../../../../lib/aiReconnectVoice';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { canControlAiCall } from '../../../../../lib/aiCallAccess';

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
      let startResult = forceStartAiStreamForCall(String(callSid));
      let reconnected = false;

      if (!startResult.ok) {
        const streamStatus = getAiStreamStatus(String(callSid));

        if (startResult.code === 'no_media_stream' && !streamStatus.streamConnected) {
          const reconnect = await reconnectCallToAiVoice(callLog);
          if (!reconnect.ok) {
            return NextResponse.json(
              { success: false, message: reconnect.message || 'Could not reconnect AI stream' },
              { status: 409 }
            );
          }
          reconnected = true;
        }

        if (!startResult.ok) {
          startResult = await waitForAiStreamAndStart(String(callSid), 14000);
        }
      }

      if (!startResult.ok) {
        const hint = process.env.AI_MEDIA_STREAM_WS_URL
          ? ''
          : ' Configure AI_MEDIA_STREAM_WS_URL=wss://YOUR-HOST/ws/ai-media-stream (must support WebSockets).';
        return NextResponse.json(
          {
            success: false,
            message: (startResult.message || 'Could not start AI stream') + hint,
            reconnected
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
