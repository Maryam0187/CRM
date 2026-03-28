import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../../lib/sequelize-db';
import socketManager from '../../../../../lib/socket';
import { Op } from 'sequelize';
import { endCustomerLegsIfNoAgentsRemain } from '../../../../../lib/conferenceEndCustomerIfNoAgents';

// Inbound-only callback handler (kept separate from outbound to avoid regressions)
const CALL_END_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];

function isPhoneNumber(num) {
  if (!num) return false;
  return num.startsWith('+') || /^\+?[1-9]\d{1,14}$/.test(num.replace(/[^\d+]/g, ''));
}

function identifyCallbackSource(from, to) {
  if (from?.startsWith('client:') || to?.startsWith('client:')) return 'twiml-app';
  if (isPhoneNumber(from) || isPhoneNumber(to)) return 'phone-number';
  return 'unknown';
}

function isCustomerLeg(from, to) {
  const isAgentLeg = from?.startsWith('client:') || to?.startsWith('client:');
  return !isAgentLeg && (isPhoneNumber(from) || isPhoneNumber(to));
}

async function resolveAgentId(agentIdFromUrl, from, to) {
  if (agentIdFromUrl) return parseInt(agentIdFromUrl, 10);
  if (!from || !to) return null;
  try {
    const relatedCall = await sequelizeDb.CallLog.findOne({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { fromNumber: String(from).trim(), toNumber: String(to).trim() },
              { fromNumber: String(to).trim(), toNumber: String(from).trim() }
            ]
          },
          { agentId: { [Op.ne]: null } }
        ]
      },
      order: [['created_at', 'DESC']],
      limit: 1
    });
    return relatedCall?.agentId || null;
  } catch {
    return null;
  }
}

function broadcastCallStatus(callSid, statusData, agentId, webhookSource) {
  if (webhookSource !== 'phone-number') return;
  if (agentId) socketManager.sendCallStatusToAgent(agentId, callSid, statusData);
  socketManager.sendCallStatusUpdate(callSid, statusData);
  socketManager.sendCallStatusToSupervisors(callSid, statusData);
  socketManager.sendCallStatusToRoom(`call_${callSid}`, callSid, statusData);
}

function sendConferenceEvent(conferenceName, eventData) {
  if (!conferenceName) return;
  socketManager.sendConferenceEvent(conferenceName, eventData);
  if (eventData.event === 'start') {
    socketManager.sendConferenceStatus(conferenceName, { status: 'in-progress', conferenceSid: eventData.conferenceSid, callSid: eventData.callSid || null });
  }
  if (eventData.event === 'end') {
    socketManager.sendConferenceStatus(conferenceName, { status: 'completed', conferenceSid: eventData.conferenceSid, callSid: eventData.callSid || null });
  }
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const agentIdFromUrl = url.searchParams.get('agentId');
    const customerIdFromUrl = url.searchParams.get('customerId');
    const saleIdFromUrl = url.searchParams.get('saleId');
    const callPurposeFromUrl = url.searchParams.get('callPurpose');

    const formData = await request.formData();

    // Conference callbacks
    const conferenceEvent = formData.get('StatusCallbackEvent');
    const conferenceSid = formData.get('ConferenceSid');
    const conferenceName = formData.get('FriendlyName');
    if (conferenceEvent && conferenceSid) {
      let normalizedEvent = conferenceEvent;
      if (conferenceEvent === 'conference-start') normalizedEvent = 'start';
      if (conferenceEvent === 'conference-end') normalizedEvent = 'end';
      if (conferenceEvent === 'participant-join') normalizedEvent = 'join';
      if (conferenceEvent === 'participant-leave') normalizedEvent = 'leave';
      if (conferenceEvent === 'participant-hold') normalizedEvent = 'hold';
      if (conferenceEvent === 'participant-unhold') normalizedEvent = 'unhold';
      if (conferenceEvent === 'participant-mute') normalizedEvent = 'mute';
      if (conferenceEvent === 'participant-unmute') normalizedEvent = 'unmute';

      const participantCallSid =
        formData.get('ParticipantCallSid') || formData.get('CallSid');
      const mutedForm = formData.get('Muted');
      const holdForm = formData.get('Hold');
      const rawFrom = formData.get('From') || formData.get('Caller') || '';
      const inferredParticipantRole = String(rawFrom).startsWith('client:') ? 'agent' : 'customer';
      const participantLevelEvents = ['join', 'leave', 'hold', 'unhold', 'mute', 'unmute'];

      sendConferenceEvent(conferenceName, {
        event: normalizedEvent,
        conferenceSid,
        conferenceName,
        callSid: participantCallSid || null,
        ...(participantLevelEvents.includes(normalizedEvent)
          ? { participantRole: inferredParticipantRole }
          : {}),
        ...(normalizedEvent === 'mute' || normalizedEvent === 'unmute'
          ? { muted: mutedForm === 'true' }
          : {}),
        ...(normalizedEvent === 'hold' || normalizedEvent === 'unhold'
          ? { hold: holdForm === 'true' }
          : {})
      });

      if (normalizedEvent === 'leave') {
        void endCustomerLegsIfNoAgentsRemain(conferenceSid, conferenceName, participantCallSid || null);
      }

      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Call/Dial callbacks
    const callSid = formData.get('CallSid');
    const callStatus = formData.get('CallStatus');
    const dialCallSid = formData.get('DialCallSid');
    const dialCallStatus = formData.get('DialCallStatus');

    const isDialCallback = !!dialCallSid && !!dialCallStatus;
    if (!callSid || (!callStatus && !isDialCallback)) {
      return NextResponse.json({ success: false, message: 'Invalid inbound callback - missing required fields' }, { status: 400 });
    }

    const from = formData.get('From');
    const to = formData.get('To');
    const webhookSource = identifyCallbackSource(from, to);

    // Only process customer leg
    if (!isCustomerLeg(from, to)) {
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    const effectiveCallSid = isDialCallback ? dialCallSid : callSid;
    const rawStatusToSend = callStatus || (isDialCallback ? dialCallStatus : null);

    // Inbound UI status: ringing until agent answers/joins; in-progress once Twilio says answered/in-progress.
    let uiStatus = rawStatusToSend;
    if (isDialCallback) {
      if (dialCallStatus === 'answered') uiStatus = 'in-progress';
      else if (['initiated', 'ringing', 'queued'].includes(dialCallStatus)) uiStatus = 'ringing';
    } else {
      if (['initiated', 'queued', 'ringing'].includes(callStatus)) uiStatus = 'ringing';
      if (['answered', 'in-progress'].includes(callStatus)) uiStatus = 'in-progress';
    }

    const agentId = await resolveAgentId(agentIdFromUrl, from, to);
    const inboundConferenceName = effectiveCallSid ? `inbound-${effectiveCallSid.substring(0, 20)}` : null;

    const duration = formData.get('CallDuration');
    const answerTime = formData.get('AnswerTime');
    const answeredBy = formData.get('AnsweredBy');

    const statusData = {
      callSid: effectiveCallSid,
      status: rawStatusToSend,
      uiStatus,
      direction: 'inbound',
      from,
      to,
      duration: duration ? parseInt(duration, 10) : null,
      answerTime: answerTime || null,
      agentId,
      customerId: customerIdFromUrl || null,
      saleId: saleIdFromUrl || null,
      callPurpose: callPurposeFromUrl || null,
      conferenceName: inboundConferenceName,
      webhookSource,
      callbackType: isDialCallback ? 'dial' : 'call-status',
      dialCallSid: dialCallSid || null,
      dialCallStatus: dialCallStatus || null,
      twilioData: {
        callStatus: callStatus || null,
        dialCallSid: dialCallSid || null,
        dialCallStatus: dialCallStatus || null,
        answeredBy: answeredBy || null
      }
    };

    console.log('📞 [TWILIO CALLBACK][INBOUND]', {
      callbackType: isDialCallback ? 'dial' : 'call-status',
      webhookSource,
      callSid: effectiveCallSid,
      status: rawStatusToSend,
      dialCallStatus: dialCallStatus || null,
      uiStatus
    });

    broadcastCallStatus(effectiveCallSid, statusData, agentId, webhookSource);

    // Persist only when real call ends (call-status stream)
    const isCallEnded = !!rawStatusToSend && CALL_END_STATUSES.includes(rawStatusToSend);
    if (isCallEnded && !isDialCallback) {
      const existing = await sequelizeDb.CallLog.findOne({ where: { callSid: effectiveCallSid } });
      const payload = {
        agentId,
        customerId: customerIdFromUrl,
        saleId: saleIdFromUrl,
        direction: 'inbound',
        fromNumber: from,
        toNumber: to,
        status: rawStatusToSend,
        duration: duration ? parseInt(duration, 10) : null,
        callPurpose: callPurposeFromUrl,
        twilioData: statusData.twilioData
      };
      if (existing) await existing.update(payload);
      else await sequelizeDb.CallLog.create({ callSid: effectiveCallSid, ...payload });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error processing inbound callback:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ success: true, message: 'Inbound call status callback endpoint is active' });
}


