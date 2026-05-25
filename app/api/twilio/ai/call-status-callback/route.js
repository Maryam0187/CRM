import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { ensureAiCallingEnabled, getAiAgentVersion } from '../../../../../lib/aiCalling';
import {
  markAiCallAnswered,
  clearAiCallAnswered
} from '../../../../../lib/aiCallAnswerGate';

const CALL_END_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];

function normalizeEndStatus(status) {
  if (!status) return 'queued';
  const s = String(status).toLowerCase();
  if (CALL_END_STATUSES.includes(s)) return s;
  if (s === 'initiated') return 'queued';
  return null;
}

/**
 * Twilio can send CallStatus=in-progress before the callee picks up (early media).
 * Use AnswerTime + StatusCallbackEvent like the main call-status-callback.
 */
function deriveAiCallStatus({ callStatusRaw, answerTime, statusCallbackEvent }) {
  const s = String(callStatusRaw || '').toLowerCase();
  const event = String(statusCallbackEvent || '').toLowerCase();

  const endStatus = normalizeEndStatus(s);
  if (endStatus) return endStatus;

  if (event === 'ringing' || s === 'ringing') return 'ringing';
  if (event === 'initiated' || s === 'initiated' || s === 'queued') return 'queued';

  const customerHasAnswered = s === 'answered' || (s === 'in-progress' && answerTime);
  if (customerHasAnswered) return 'in-progress';

  if (s === 'in-progress' && !answerTime) {
    return 'ringing';
  }

  return 'queued';
}

function broadcastAiCallStatus(agentId, callSid, statusData) {
  if (!agentId || !callSid) return;
  try {
    const socketManager = require('../../../../../lib/socket');
    socketManager.sendCallStatusToAgent(agentId, callSid, {
      ...statusData,
      webhookSource: 'ai_call_status',
      callbackType: 'ai_outbound'
    });
  } catch (error) {
    console.warn('[AI CALLBACK] Socket status broadcast failed:', error.message);
  }
}

export async function POST(request) {
  try {
    const aiGateResponse = ensureAiCallingEnabled();
    if (aiGateResponse) return aiGateResponse;

    const url = new URL(request.url);
    const formData = await request.formData();

    const callSid = formData.get('CallSid');
    const from = formData.get('From');
    const to = formData.get('To');
    const durationRaw = formData.get('CallDuration');
    const callStatusRaw = formData.get('CallStatus');
    const answerTime = formData.get('AnswerTime');
    const statusCallbackEvent = formData.get('StatusCallbackEvent');
    const answeredBy = formData.get('AnsweredBy');
    const agentId = parseInt(url.searchParams.get('agentId') || '0', 10) || null;
    const customerId = parseInt(url.searchParams.get('customerId') || '0', 10) || null;
    const saleId = parseInt(url.searchParams.get('saleId') || '0', 10) || null;
    const campaignLabel = url.searchParams.get('campaignLabel');
    const callPurpose = url.searchParams.get('callPurpose') || 'sales';
    const aiAgentVersion = url.searchParams.get('aiAgentVersion') || getAiAgentVersion();
    const supervisedAi = url.searchParams.get('supervisedAi') === 'true';
    const source = url.searchParams.get('source') || (supervisedAi ? 'ai_supervised' : 'ai_unsupervised');

    if (!callSid) {
      return NextResponse.json({ success: false, message: 'Missing CallSid' }, { status: 400 });
    }

    const status = deriveAiCallStatus({ callStatusRaw, answerTime, statusCallbackEvent });
    const uiStatus = status;
    const duration = durationRaw ? parseInt(durationRaw, 10) : null;
    const callEnded = CALL_END_STATUSES.includes(status);

    if (status === 'in-progress') {
      markAiCallAnswered(callSid);
    }
    if (callEnded) {
      clearAiCallAnswered(callSid);
    }

    let callLog = await sequelizeDb.CallLog.findOne({ where: { callSid } });
    if (!callLog) {
      if (!agentId || !from || !to) {
        return NextResponse.json({ success: true, message: 'Callback ignored (no matching log)' });
      }
      callLog = await sequelizeDb.CallLog.create({
        callSid,
        customerCallSid: callSid,
        agentId,
        customerId,
        saleId,
        direction: 'outbound',
        fromNumber: from,
        toNumber: to,
        status,
        duration,
        callPurpose,
        callSource: 'other',
        twilioData: {
          aiCall: true,
          supervisedAi: Boolean(supervisedAi),
          source,
          aiAgentVersion,
          campaignLabel,
          callbackCreatedLog: true
        }
      });
    } else {
      const existingStatus = callLog.status;
      const statusOrder = { queued: 1, ringing: 2, 'in-progress': 3 };
      const nextRank = statusOrder[status] || 0;
      const prevRank = statusOrder[existingStatus] || 0;
      const shouldUpdateStatus =
        callEnded || nextRank >= prevRank || existingStatus === 'queued';

      await callLog.update({
        status: shouldUpdateStatus ? status : existingStatus,
        duration: duration ?? callLog.duration,
        twilioData: {
          ...(callLog.twilioData || {}),
          aiCall: true,
          supervisedAi: Boolean(supervisedAi),
          source,
          aiAgentVersion,
          campaignLabel,
          latestCallbackStatus: status,
          latestTwilioCallStatus: callStatusRaw,
          statusCallbackEvent,
          answerTime: answerTime || callLog.twilioData?.answerTime || null,
          answeredBy: answeredBy || callLog.twilioData?.answeredBy || null,
          endedAt: callEnded ? new Date().toISOString() : (callLog.twilioData?.endedAt || null)
        }
      });
    }

    broadcastAiCallStatus(agentId, callSid, {
      status: callStatusRaw,
      uiStatus,
      direction: 'outbound',
      from,
      to,
      duration,
      agentId,
      customerId,
      saleId,
      callPurpose,
      twilioData: {
        aiCall: true,
        supervisedAi: Boolean(supervisedAi),
        source,
        answerTime: answerTime || null,
        statusCallbackEvent
      }
    });

    if (callEnded && callLog) {
      const existingReview = await sequelizeDb.AiCallReview.findOne({
        where: { callLogId: callLog.id }
      });
      if (!existingReview) {
        await sequelizeDb.AiCallReview.create({
          callLogId: callLog.id,
          reviewStatus: 'pending',
          originalAiOutcome: callLog.callOutcome || null,
          finalOutcome: null,
          provider: 'unknown',
          qualityScore: null,
          complianceIssue: false,
          complianceNotes: null,
          reviewNotes: 'Auto-created on AI call end. Agent labeling pending.',
          reviewedBy: null,
          reviewedAt: null
        });
      }
    }

    return NextResponse.json({
      success: true,
      data: { callSid, status, uiStatus }
    });
  } catch (error) {
    console.error('AI callback processing error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to process AI callback' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const aiGateResponse = ensureAiCallingEnabled();
  if (aiGateResponse) return aiGateResponse;
  return NextResponse.json({
    success: true,
    message: 'AI call status callback endpoint is active'
  });
}
