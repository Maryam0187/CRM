import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';

async function resolveCallLog(callLogId, callSid) {
  if (callLogId) {
    return sequelizeDb.CallLog.findByPk(parseInt(callLogId, 10));
  }
  if (callSid) {
    return sequelizeDb.CallLog.findOne({ where: { callSid: String(callSid) } });
  }
  return null;
}

export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const {
      callLogId,
      callSid,
      reviewStatus = 'pending',
      originalAiOutcome = null,
      finalOutcome = null,
      provider = 'unknown',
      qualityScore = null,
      complianceIssue = false,
      complianceNotes = null,
      reviewNotes = null
    } = body;

    if (!callLogId && !callSid) {
      return NextResponse.json(
        { success: false, message: 'callLogId or callSid is required' },
        { status: 400 }
      );
    }

    const callLog = await resolveCallLog(callLogId, callSid);
    if (!callLog) {
      return NextResponse.json(
        { success: false, message: 'Call log not found' },
        { status: 404 }
      );
    }

    const upsertData = {
      callLogId: callLog.id,
      reviewStatus,
      originalAiOutcome,
      finalOutcome,
      provider,
      qualityScore: qualityScore === null || qualityScore === undefined ? null : parseInt(qualityScore, 10),
      complianceIssue: Boolean(complianceIssue),
      complianceNotes,
      reviewNotes,
      reviewedBy: authResult.user.id,
      reviewedAt: new Date()
    };

    const existing = await sequelizeDb.AiCallReview.findOne({
      where: { callLogId: callLog.id }
    });

    let review;
    if (existing) {
      review = await existing.update(upsertData);
    } else {
      review = await sequelizeDb.AiCallReview.create(upsertData);
    }

    return NextResponse.json({
      success: true,
      message: existing ? 'AI review label updated' : 'AI review label saved',
      data: review
    });
  } catch (error) {
    console.error('Error saving AI review label:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to save AI review label',
        error: error.message
      },
      { status: 500 }
    );
  }
}

