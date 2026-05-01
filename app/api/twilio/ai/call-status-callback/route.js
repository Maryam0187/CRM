import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { ensureAiCallingEnabled, getAiAgentVersion } from '../../../../../lib/aiCalling';

const CALL_END_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];

function normalizeStatus(status) {
  if (!status) return 'queued';
  const s = String(status).toLowerCase();
  if (s === 'in-progress' || s === 'ringing' || s === 'queued') return s;
  if (s === 'completed' || s === 'failed' || s === 'busy' || s === 'no-answer' || s === 'canceled') return s;
  if (s === 'initiated') return 'queued';
  if (s === 'answered') return 'in-progress';
  return 'queued';
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

    const status = normalizeStatus(callStatusRaw);
    const duration = durationRaw ? parseInt(durationRaw, 10) : null;
    const callEnded = CALL_END_STATUSES.includes(status);

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
      await callLog.update({
        status,
        duration: duration ?? callLog.duration,
        twilioData: {
          ...(callLog.twilioData || {}),
          aiCall: true,
          supervisedAi: Boolean(supervisedAi),
          source,
          aiAgentVersion,
          campaignLabel,
          latestCallbackStatus: status,
          endedAt: callEnded ? new Date().toISOString() : (callLog.twilioData?.endedAt || null)
        }
      });
    }

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
      data: { callSid, status }
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

