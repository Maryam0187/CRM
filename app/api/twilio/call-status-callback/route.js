import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';
import { getConferenceParticipants, getParticipantStatus } from '../../../../lib/twilio';

// Constants
const CALL_END_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
const ERROR_STATUSES = ['failed', 'busy', 'no-answer', 'canceled'];

// Helper: Derive call status from Twilio status
function deriveCallStatus(callStatus) {
  const statusMap = {
    'ringing': 'ringing',
    'queued': 'ringing',
    'initiated': 'ringing',
    'in-progress': 'in-progress',
    'answered': 'in-progress',
    'completed': 'completed',
    'no-answer': 'no-answer',
    'busy': 'busy',
    'failed': 'failed',
    'canceled': 'canceled'
  };
  return statusMap[callStatus] || 'ringing';
}

// Helper: Check if number is a phone number
function isPhoneNumber(num) {
  if (!num) return false;
  return num.startsWith('+') || /^\+?[1-9]\d{1,14}$/.test(num.replace(/[^\d+]/g, ''));
}

// Helper: Check if callback is for customer leg
function isCustomerLeg(from, to) {
  const isAgentLeg = from?.startsWith('client:');
  return !isAgentLeg && (isPhoneNumber(from) || isPhoneNumber(to));
}

// Helper: Find agentId from related calls
async function findAgentIdFromRelatedCalls(from, to) {
  if (!from || !to || from === 'unknown' || to === 'unknown') return null;
  
  const fromNum = String(from).trim();
  const toNum = String(to).trim();
  if (!fromNum || !toNum) return null;

  try {
    const relatedCall = await sequelizeDb.CallLog.findOne({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { fromNumber: fromNum, toNumber: toNum },
              { fromNumber: toNum, toNumber: fromNum }
            ]
          },
          { agentId: { [Op.ne]: null } }
        ]
      },
      order: [['created_at', 'DESC']],
      limit: 1
    });
    return relatedCall?.agentId || null;
  } catch (error) {
    console.error('Error finding agentId from related calls:', error);
    return null;
  }
}

// Helper: Get agentId from URL or callLog or related calls
async function resolveAgentId(agentIdFromUrl, callLog, from, to) {
  if (agentIdFromUrl) return parseInt(agentIdFromUrl, 10);
  if (callLog?.agentId) return callLog.agentId;
  return await findAgentIdFromRelatedCalls(from, to);
}

// Helper: Broadcast call status to all relevant parties
function broadcastCallStatus(callSid, statusData, agentId) {
  if (agentId) {
    socketManager.sendCallStatusToAgent(agentId, callSid, statusData);
  }
  socketManager.sendCallStatusUpdate(callSid, statusData);
  socketManager.sendCallStatusToSupervisors(callSid, statusData);
  socketManager.sendCallStatusToRoom(`call_${callSid}`, callSid, statusData);
}

// Helper: Update agent status based on call
async function updateAgentStatus(agentId, callStatus, duration, callSid) {
  if (!agentId) return;

  try {
    const agent = await sequelizeDb.User.findByPk(agentId);
    if (!agent) return;

    // Set busy when call starts
    if (callStatus === 'in-progress' && agent.callStatus !== 'busy') {
      await agent.update({ callStatus: 'busy' });
      await agent.reload();
      socketManager.broadcastUserStatusChange(agentId, agent.status, 'busy');
      return;
    }

    // Set available when call ends (if no other active calls)
    if (CALL_END_STATUSES.includes(callStatus)) {
      const activeCalls = await sequelizeDb.CallLog.count({
        where: {
          agentId,
          callSid: { [Op.ne]: callSid },
          status: 'in-progress'
        }
      });

      if (activeCalls === 0) {
        const updateData = { callStatus: 'available' };
        if (callStatus === 'completed' && duration) {
          updateData.totalCallTime = (agent.totalCallTime || 0) + parseInt(duration);
        }
        await agent.update(updateData);
        await agent.reload();
        socketManager.broadcastUserStatusChange(agentId, agent.status, 'available');
      }
    }
  } catch (error) {
    console.error(`Error updating agent ${agentId} status:`, error);
  }
}

// Helper: Handle special call endings (voicemail, no-answer)
async function handleSpecialEndings(callSid, answeredBy, callStatus) {
  const { getClient } = require('../../../../lib/twilio');
  const client = getClient();

  if (answeredBy === 'machine') {
    setTimeout(async () => {
      try {
        await client.calls(callSid).update({ status: 'completed' });
      } catch (err) {
        console.error('Error hanging up voicemail:', err);
      }
    }, 30000);
  }

  if (callStatus === 'no-answer') {
    try {
      await client.calls(callSid).update({ status: 'completed' });
    } catch (err) {
      console.error('Error disconnecting no-answer:', err);
    }
  }
}

// Helper: Create or update call log
async function saveCallLog(callSid, data, callLog) {
  const {
    agentId,
    customerId,
    saleId,
    direction,
    from,
    to,
    status,
    duration,
    callPurpose,
    twilioData
  } = data;

  if (!agentId) {
    console.error(`❌ Cannot save call log for ${callSid}: agentId is required`);
    return null;
  }

  const logData = {
    callSid,
    agentId,
    customerId: customerId ? parseInt(customerId, 10) : null,
    saleId: saleId ? parseInt(saleId, 10) : null,
    direction: direction || 'outbound',
    fromNumber: from || 'unknown',
    toNumber: to || 'unknown',
    status,
    duration: duration ? parseInt(duration) : null,
    callPurpose: callPurpose || 'follow_up',
    twilioData,
    updatedAt: new Date()
  };

  if (callLog) {
    await callLog.update(logData);
    await callLog.reload();
    return callLog;
  } else {
    return await sequelizeDb.CallLog.create(logData);
  }
}

// Helper: Update related records (customer, sale)
async function updateRelatedRecords(callLog, duration) {
  if (!duration || duration <= 0 || !callLog) return;

  const updates = [];
  if (callLog.customerId) {
    updates.push(sequelizeDb.Customer.update({ updatedAt: new Date() }, { where: { id: callLog.customerId } }));
  }
  if (callLog.saleId) {
    updates.push(sequelizeDb.Sale.update({ updatedAt: new Date() }, { where: { id: callLog.saleId } }));
  }
  await Promise.all(updates);
}

// Main POST handler
export async function POST(request) {
  try {
    // Extract URL parameters
    const url = new URL(request.url);
    const agentIdFromUrl = url.searchParams.get('agentId');
    const customerIdFromUrl = url.searchParams.get('customerId');
    const saleIdFromUrl = url.searchParams.get('saleId');
    const callPurposeFromUrl = url.searchParams.get('callPurpose');
    const directionFromUrl = url.searchParams.get('direction');

    // Extract form data
    const formData = await request.formData();
    const callSid = formData.get('CallSid');
    const callStatus = formData.get('CallStatus');
    const direction = formData.get('Direction') || directionFromUrl || 'outbound';
    const from = formData.get('From');
    const to = formData.get('To');
    const duration = formData.get('CallDuration');
    const startTime = formData.get('StartTime');
    const endTime = formData.get('EndTime');
    const answerTime = formData.get('AnswerTime');
    const hangupCause = formData.get('HangupCause');
    const answeredBy = formData.get('AnsweredBy');
    const parentCallSid = formData.get('ParentCallSid');

    if (!callSid) {
      return NextResponse.json({ success: false, message: 'Call SID is required' }, { status: 400 });
    }

    // Skip non-customer leg callbacks
    if (!isCustomerLeg(from, to)) {
      console.log('⏭️ Skipping non-customer leg callback:', { callSid, from, to, callStatus });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }

    // Get existing call log and derive status
    const callLog = await sequelizeDb.CallLog.findOne({ where: { callSid } });
    const derivedStatus = deriveCallStatus(callStatus);
    const agentId = await resolveAgentId(agentIdFromUrl, callLog, from, to);

    // Get conference name from call log or construct it
    const conferenceName = callLog?.twilioData?.conferenceName || 
                          (agentId ? `call-${agentId}` : null);

    // Fetch participant statuses if conference exists and call is active
    let participantStatuses = null;
    if (conferenceName && !CALL_END_STATUSES.includes(derivedStatus)) {
      try {
        const participants = await getConferenceParticipants(conferenceName);
        participantStatuses = participants.map(p => ({
          callSid: p.callSid,
          status: p.status, // queued, connecting, ringing, connected, complete, failed
          muted: p.muted,
          hold: p.hold
        }));
        
        console.log('📊 Conference participants status:', {
          conferenceName,
          participantsCount: participantStatuses.length,
          statuses: participantStatuses.map(p => `${p.callSid.substring(0, 10)}...: ${p.status}`)
        });
      } catch (participantError) {
        console.warn('⚠️ Could not fetch participant statuses:', participantError.message);
        // Don't fail the callback if participant fetch fails
      }
    }

    // Prepare status data for broadcasting
    const statusData = {
      callSid,
      status: derivedStatus,
      duration: duration ? parseInt(duration) : null,
      direction,
      from,
      to,
      startTime,
      endTime,
      answerTime,
      hangupCause,
      agentId,
      customerId: callLog?.customerId || customerIdFromUrl || null,
      saleId: callLog?.saleId || saleIdFromUrl || null,
      callPurpose: callLog?.callPurpose || callPurposeFromUrl || null,
      conferenceName,
      participants: participantStatuses, // Include participant statuses
      twilioData: {
        callStatus,
        direction,
        from,
        to,
        duration,
        startTime,
        endTime,
        answerTime,
        hangupCause,
        answeredBy,
        parentCallSid
      }
    };

    // Broadcast status immediately (before database operations)
    broadcastCallStatus(callSid, statusData, agentId);

    // Save to database only when call ends
    const isCallEnded = CALL_END_STATUSES.includes(derivedStatus) || CALL_END_STATUSES.includes(callStatus);
    let finalCallLog = callLog;

    if (isCallEnded) {
      const twilioData = {
        callSid,
        callStatus,
        direction,
        from,
        to,
        duration,
        startTime,
        endTime,
        answerTime,
        hangupCause,
        answeredBy,
        parentCallSid,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      // Handle voicemail status
      let finalStatus = derivedStatus;
      if (answeredBy === 'machine') {
        finalStatus = 'voicemail';
        twilioData.isVoicemail = true;
        twilioData.voicemailDetectedAt = new Date().toISOString();
      }

      finalCallLog = await saveCallLog(callSid, {
        agentId,
        customerId: customerIdFromUrl,
        saleId: saleIdFromUrl,
        direction,
        from,
        to,
        status: finalStatus,
        duration,
        callPurpose: callPurposeFromUrl,
        twilioData
      }, callLog);

      // Handle special endings (voicemail, no-answer)
      await handleSpecialEndings(callSid, answeredBy, callStatus);
    }

    // Update agent status
    if (agentId) {
      await updateAgentStatus(agentId, derivedStatus, duration, callSid);
    }

    // Update related records for completed calls
    if (callStatus === 'completed' && duration && finalCallLog) {
      await updateRelatedRecords(finalCallLog, parseInt(duration));
    }

    // Cleanup call room after call ends (with 2 minute delay)
    if (CALL_END_STATUSES.includes(derivedStatus)) {
      setTimeout(() => {
        socketManager.cleanupCallRoom(callSid);
      }, 2 * 60 * 1000); // 2 minutes
    }

    return NextResponse.json({ success: true, message: 'Call status updated successfully' });

  } catch (error) {
    console.error('Error processing call status callback:', error);
    
    // Try to reset agent status on error
    try {
      const url = new URL(request.url);
      const agentIdFromUrl = url.searchParams.get('agentId');
      if (agentIdFromUrl) {
        await updateAgentStatus(parseInt(agentIdFromUrl, 10), 'failed', null, null);
      }
    } catch (agentError) {
      console.error('Error resetting agent status:', agentError);
    }

    return NextResponse.json({
      success: false,
      message: 'Failed to process call status callback',
      error: error.message
    }, { status: 500 });
  }
}

// GET handler
export async function GET(request) {
  return NextResponse.json({
    success: true,
    message: 'Call status callback endpoint is active',
    timestamp: new Date().toISOString()
  }, { status: 200 });
}
