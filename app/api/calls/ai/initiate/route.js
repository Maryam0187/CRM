import { NextResponse } from 'next/server';
import { getClient, getWebhookUrl, validatePhoneNumber } from '../../../../../lib/twilio';
import sequelizeDb from '../../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import { ensureAiCallingEnabled, getAiAgentVersion } from '../../../../../lib/aiCalling';

export async function POST(request) {
  try {
    const aiGateResponse = ensureAiCallingEnabled();
    if (aiGateResponse) return aiGateResponse;

    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const user = authResult.user;
    const body = await request.json();

    const {
      customerId = null,
      saleId = null,
      phoneNumber,
      callPurpose = 'sales',
      campaignLabel = null,
      supervisedAi = true
    } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, message: 'phoneNumber is required' },
        { status: 400 }
      );
    }

    const formattedNumber = validatePhoneNumber(phoneNumber);
    if (!formattedNumber) {
      return NextResponse.json(
        { success: false, message: `Invalid phone number format: ${phoneNumber}` },
        { status: 400 }
      );
    }

    const fromNumber = validatePhoneNumber(process.env.TWILIO_PHONE_NUMBER);
    if (!fromNumber) {
      return NextResponse.json(
        { success: false, message: 'TWILIO_PHONE_NUMBER is not set or invalid' },
        { status: 500 }
      );
    }

    const client = getClient();
    const aiAgentVersion = getAiAgentVersion();
    const source = supervisedAi ? 'ai_supervised' : 'ai_unsupervised';

    const voiceUrl = new URL(getWebhookUrl('/api/twilio/ai/voice'));
    voiceUrl.searchParams.set('direction', 'outbound-api');
    voiceUrl.searchParams.set('agentId', String(user.id));
    voiceUrl.searchParams.set('callPurpose', String(callPurpose));
    voiceUrl.searchParams.set('aiAgentVersion', aiAgentVersion);
    voiceUrl.searchParams.set('supervisedAi', supervisedAi ? 'true' : 'false');
    voiceUrl.searchParams.set('source', source);
    if (customerId) voiceUrl.searchParams.set('customerId', String(customerId));
    if (saleId) voiceUrl.searchParams.set('saleId', String(saleId));
    if (campaignLabel) voiceUrl.searchParams.set('campaignLabel', String(campaignLabel));

    const statusCallbackUrl = new URL(getWebhookUrl('/api/twilio/ai/call-status-callback'));
    statusCallbackUrl.searchParams.set('direction', 'outbound-api');
    statusCallbackUrl.searchParams.set('agentId', String(user.id));
    statusCallbackUrl.searchParams.set('customerPhone', formattedNumber);
    statusCallbackUrl.searchParams.set('callPurpose', String(callPurpose));
    statusCallbackUrl.searchParams.set('aiAgentVersion', aiAgentVersion);
    statusCallbackUrl.searchParams.set('supervisedAi', supervisedAi ? 'true' : 'false');
    statusCallbackUrl.searchParams.set('source', source);
    if (customerId) statusCallbackUrl.searchParams.set('customerId', String(customerId));
    if (saleId) statusCallbackUrl.searchParams.set('saleId', String(saleId));
    if (campaignLabel) statusCallbackUrl.searchParams.set('campaignLabel', String(campaignLabel));

    const timeout = parseInt(process.env.TWILIO_OUTBOUND_RING_TIMEOUT || '30', 10);
    const call = await client.calls.create({
      to: formattedNumber,
      from: fromNumber,
      url: voiceUrl.toString(),
      method: 'POST',
      timeout,
      statusCallback: statusCallbackUrl.toString(),
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    const useConferenceBridge = process.env.AI_SUPERVISED_CONFERENCE_MODE === 'true';
    const aiConferenceName =
      supervisedAi && useConferenceBridge ? `ai-supervised-${call.sid}` : null;

    await sequelizeDb.CallLog.create({
      callSid: call.sid,
      customerCallSid: call.sid,
      agentId: user.id,
      customerId: customerId ? parseInt(customerId, 10) : null,
      saleId: saleId ? parseInt(saleId, 10) : null,
      direction: 'outbound',
      fromNumber,
      toNumber: formattedNumber,
      status: 'queued',
      callPurpose,
      callSource: 'other',
      conferenceName: aiConferenceName || undefined,
      twilioData: {
        aiCall: true,
        supervisedAi: Boolean(supervisedAi),
        supervisedConferenceMode: Boolean(supervisedAi && useConferenceBridge),
        source,
        aiAgentVersion,
        campaignLabel,
        initiatedAt: new Date().toISOString(),
        ...(aiConferenceName ? { aiConferenceName } : {})
      }
    });

    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        to: formattedNumber,
        mode: 'ai',
        supervisedAi: Boolean(supervisedAi),
        source,
        aiAgentVersion,
        conferenceName: aiConferenceName,
        supervisedConferenceMode: Boolean(supervisedAi && useConferenceBridge)
      },
      message: 'Outbound AI call initiated — dialing customer now'
    });
  } catch (error) {
    console.error('Error initiating AI call:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'Failed to initiate AI call'
      },
      { status: 500 }
    );
  }
}

