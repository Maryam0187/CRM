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
      promptVersionId = null,
      provider = 'unknown',
      tvOn = 'unknown',
      receiverId = null,
      receiverModel = null,
      tvCount = null,
      accountHolderConfirmed = 'unknown',
      verificationMethod = 'none',
      callbackWindow = null,
      riskFlags = null,
      aiConfidence = null,
      rawExtractionJson = null
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

    const extraction = await sequelizeDb.AiCallExtraction.create({
      callLogId: callLog.id,
      promptVersionId: promptVersionId ? parseInt(promptVersionId, 10) : null,
      provider,
      tvOn,
      receiverId,
      receiverModel,
      tvCount: tvCount === null || tvCount === undefined ? null : parseInt(tvCount, 10),
      accountHolderConfirmed,
      verificationMethod,
      callbackWindow,
      riskFlags,
      aiConfidence: aiConfidence === null || aiConfidence === undefined ? null : Number(aiConfidence),
      rawExtractionJson
    });

    return NextResponse.json({
      success: true,
      message: 'AI extraction saved',
      data: extraction
    });
  } catch (error) {
    console.error('Error saving AI extraction:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to save AI extraction',
        error: error.message
      },
      { status: 500 }
    );
  }
}

