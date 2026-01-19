import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';
import { getConferenceParticipants, getParticipantStatus } from '../../../../lib/twilio';

// Constants
const CALL_END_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
const ERROR_STATUSES = ['failed', 'busy', 'no-answer', 'canceled'];

// Helper: Derive call status from Twilio status
// Helper: Derive call status with validation to ensure customer actually answered
function deriveCallStatus(callStatus, callDuration, answerTime, answeredBy, previousStatus) {
  const statusMap = {
    'ringing': 'ringing',
    'queued': 'ringing',
    'initiated': 'ringing',
    'completed': 'completed',
    'no-answer': 'no-answer',
    'busy': 'busy',
    'failed': 'failed',
    'canceled': 'canceled'
  };
  
  // Handle 'answered' status - always means customer answered
  if (callStatus === 'answered') {
    return 'in-progress';
  }
  
  // Handle 'in-progress' status - need to validate customer actually answered
  // Twilio can send 'in-progress' when agent joins conference, even if customer hasn't answered
  if (callStatus === 'in-progress') {
    // Validate that customer actually answered by checking:
    // 1. answerTime is present (customer picked up) - STRONGEST indicator
    // 2. answeredBy is 'human' (not voicemail)
    // 3. duration exists (even if 0, it means call is active)
    // 4. Previous status was 'ringing' (valid transition from ringing to in-progress)
    const hasAnswerTime = answerTime && answerTime.trim() !== '';
    const isHumanAnswer = answeredBy === 'human';
    const hasDuration = callDuration !== null && callDuration !== undefined; // Duration field exists (even if 0)
    const wasRinging = previousStatus === 'ringing' || previousStatus === 'queued' || previousStatus === 'initiated' || previousStatus === null;
    
    // Customer answered if ANY of these are true:
    // - answerTime is present (strongest indicator)
    // - answeredBy is 'human' (even without duration, if it's human, they answered)
    // - Previous status was ringing/null AND duration exists (valid transition - Twilio sends this when customer answers)
    // - duration > 0 (call has been active)
    if (hasAnswerTime) {
      // answerTime is the strongest indicator - if present, customer definitely answered
      console.log('✅ Customer answered - answerTime present');
      return 'in-progress';
    }
    
    if (isHumanAnswer) {
      // If answeredBy is 'human', customer answered (even if duration is 0)
      console.log('✅ Customer answered - answeredBy is human');
      return 'in-progress';
    }
    
    // If previous status was ringing/null and we have duration (even 0), customer likely answered
    // This is the most common case - Twilio sends 'in-progress' with duration=0 when customer first answers
    if (wasRinging && hasDuration) {
      console.log('✅ Customer answered - valid transition from ringing with duration field');
      return 'in-progress';
    }
    
    if (hasDuration && parseInt(callDuration) > 0) {
      // Duration > 0 means call has been active
      console.log('✅ Customer answered - duration > 0');
      return 'in-progress';
    }
    
    // If no clear evidence, keep as 'ringing' (customer hasn't answered yet)
    // This happens when agent joins conference before customer answers
    console.log('⚠️ Received "in-progress" but customer may not have answered:', {
      callStatus,
      answerTime: answerTime || null,
      answeredBy: answeredBy || null,
      duration: callDuration || null,
      previousStatus: previousStatus || null,
      validation: {
        hasAnswerTime,
        isHumanAnswer,
        hasDuration,
        wasRinging
      },
      decision: 'keeping as ringing - no evidence customer answered'
    });
    return 'ringing';
  }
  
  // For all other statuses, use the map
  return statusMap[callStatus] || 'ringing';
}

// Helper: Normalize Twilio direction to database enum values
function normalizeDirection(twilioDirection) {
  if (!twilioDirection) return 'outbound';
  
  const direction = String(twilioDirection).toLowerCase();
  
  // Twilio sends various direction values, normalize to 'inbound' or 'outbound'
  if (direction === 'inbound' || direction === 'inbound-api') {
    return 'inbound';
  }
  
  // All outbound variations map to 'outbound'
  // 'outbound-api', 'outbound-dial', 'outbound', etc.
  if (direction.startsWith('outbound')) {
    return 'outbound';
  }
  
  // Default to outbound if unknown
  return 'outbound';
}

// Helper: Check if number is a phone number
function isPhoneNumber(num) {
  if (!num) return false;
  return num.startsWith('+') || /^\+?[1-9]\d{1,14}$/.test(num.replace(/[^\d+]/g, ''));
}

// Helper: Check if callback is for customer leg (phone call) vs agent leg (browser)
function isCustomerLeg(from, to) {
  // Agent browser connections (TwiML App) have 'client:' prefix
  const isAgentLeg = from?.startsWith('client:') || to?.startsWith('client:');
  
  // Customer leg: phone numbers (not client: connections)
  const isCustomerLeg = !isAgentLeg && (isPhoneNumber(from) || isPhoneNumber(to));
  
  return isCustomerLeg;
}

// Helper: Identify callback source (TwiML App vs Phone Number)
function identifyCallbackSource(from, to) {
  if (from?.startsWith('client:') || to?.startsWith('client:')) {
    return 'twiml-app'; // Agent browser connection via TwiML App
  }
  if (isPhoneNumber(from) || isPhoneNumber(to)) {
    return 'phone-number'; // Customer phone call via Phone Number config
  }
  return 'unknown';
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
// Broadcast call status to frontend - ONLY for phone call callbacks (not TwiML App)
function broadcastCallStatus(callSid, statusData, agentId, webhookSource) {
  // Only broadcast phone number callbacks (customer calls), not TwiML App callbacks (agent browser)
  if (webhookSource !== 'phone-number') {
    console.log(`⏭️ Skipping broadcast for ${webhookSource} callback - only broadcasting phone call status`);
    return;
  }
  
  console.log(`📡 Broadcasting phone call status to frontend:`, {
    callSid,
    status: statusData.status,
    webhookSource
  });
  
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
    direction: normalizeDirection(direction) || 'outbound', // Ensure direction is normalized
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
    const twilioDirection = formData.get('Direction') || directionFromUrl || 'outbound';
    const direction = normalizeDirection(twilioDirection); // Normalize to 'inbound' or 'outbound'
    const from = formData.get('From');
    const to = formData.get('To');
    const duration = formData.get('CallDuration');
    const startTime = formData.get('StartTime');
    const endTime = formData.get('EndTime');
    const answerTime = formData.get('AnswerTime');
    const hangupCause = formData.get('HangupCause');
    const answeredBy = formData.get('AnsweredBy');
    const parentCallSid = formData.get('ParentCallSid');
    
    // Identify callback source: Dial verb callbacks have DialCallStatus parameter
    const dialCallStatus = formData.get('DialCallStatus');
    const dialCallSid = formData.get('DialCallSid');
    const callbackSource = dialCallStatus ? 'dial-conference' : 'voice-api';
    
    // Identify if this is from TwiML App (agent browser) or Phone Number (customer call)
    const webhookSource = identifyCallbackSource(from, to);

    if (!callSid) {
      return NextResponse.json({ success: false, message: 'Call SID is required' }, { status: 400 });
    }

    // Log callback source for debugging
    console.log(`📞 Call status callback received [${callbackSource}] from [${webhookSource}]:`, {
      callSid,
      dialCallSid: dialCallSid || null,
      callStatus,
      dialCallStatus: dialCallStatus || null,
      from,
      to,
      direction: twilioDirection,
      webhookSource
    });

    // Handle Dial verb callbacks (from <Dial> wrapping Conference)
    // Note: Both Voice API callbacks and Dial callbacks use the same endpoint
    // - Voice API: Direct call status updates (CallSid = customer leg)
    // - Dial: Dial operation status (CallSid = parent, DialCallSid = dialed call)
    // For conference calls, we care about the customer leg status, so we use CallSid
    if (dialCallStatus && dialCallSid) {
      console.log('📞 Dial callback received (Dial operation status):', {
        callSid, // Parent call (the one executing Dial)
        dialCallSid, // The call that was dialed (customer leg in conference)
        dialCallStatus,
        from,
        to
      });
      
      // For Dial callbacks, the CallSid is the parent call executing the Dial
      // The DialCallSid is the actual customer call leg we care about
      // But we'll continue with CallSid since that's what we track in CallLog
      // The Dial callback provides additional context but doesn't change the main tracking
    }

    // Skip non-customer leg callbacks (agent browser connections from TwiML App)
    if (!isCustomerLeg(from, to)) {
      console.log(`⏭️ Skipping ${webhookSource} callback (agent browser connection):`, { 
        callSid, 
        from, 
        to, 
        callStatus, 
        callbackSource,
        webhookSource,
        reason: 'This is an agent browser connection, not a customer phone call'
      });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }
    
    // Log that we're processing a customer leg callback
    console.log(`✅ Processing ${webhookSource} callback (customer phone call):`, {
      callSid,
      callStatus, // Original Twilio status
      from,
      to,
      answerTime: answerTime || null,
      answeredBy: answeredBy || null,
      duration: duration || 0
    });

    // Get existing call log and derive status
    const callLog = await sequelizeDb.CallLog.findOne({ where: { callSid } });
    const previousStatus = callLog?.status || null;
    const derivedStatus = deriveCallStatus(callStatus, duration, answerTime, answeredBy, previousStatus);
    
    // Log status derivation result (always log for debugging)
    console.log(`📊 Status derivation: "${callStatus}" → "${derivedStatus}"`, {
      reason: derivedStatus === 'ringing' ? 'Customer has not answered yet' : 'Customer answered',
      answerTime: answerTime || null,
      answeredBy: answeredBy || null,
      duration: duration || 0,
      previousStatus: previousStatus || null,
      validation: {
        hasAnswerTime: answerTime && answerTime.trim() !== '',
        isHumanAnswer: answeredBy === 'human',
        hasDuration: duration && parseInt(duration) >= 0,
        wasRinging: previousStatus === 'ringing' || previousStatus === 'queued' || previousStatus === 'initiated'
      }
    });
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

    // Prepare status data for broadcasting (ONLY for phone call callbacks)
    // Note: This is already filtered to only phone-number callbacks (customer calls)
    const statusData = {
      callSid,
      status: derivedStatus, // Use derived status (validated)
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
      participants: participantStatuses, // Include participant statuses (for reference only)
      webhookSource, // Include source for debugging
      twilioData: {
        callStatus, // Original Twilio status (may be 'in-progress' even if customer hasn't answered)
        derivedStatus, // Our validated status
        direction: twilioDirection, // Keep original Twilio direction in twilioData
        normalizedDirection: direction, // Store normalized direction
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
    // Only broadcasts phone-number callbacks (customer calls), not TwiML App callbacks
    console.log(`📡 About to broadcast status:`, {
      callSid,
      derivedStatus,
      originalStatus: callStatus,
      agentId,
      webhookSource,
      willBroadcast: webhookSource === 'phone-number'
    });
    broadcastCallStatus(callSid, statusData, agentId, webhookSource);

    // Send dedicated participant update if participants are available
    // Note: Participant status is separate from call status - it shows conference participant state
    // Call status (derivedStatus) is the source of truth for overall call state
    if (participantStatuses && participantStatuses.length > 0) {
      console.log('📊 Sending participant update (conference state, not call status):', {
        callSid,
        callStatus: derivedStatus, // Main call status (source of truth)
        participants: participantStatuses.map(p => ({
          callSid: p.callSid?.substring(0, 10) + '...',
          status: p.status // Conference participant status (may differ from call status)
        }))
      });
      socketManager.sendParticipantUpdate(callSid, conferenceName, participantStatuses, agentId);
    }

    // Register/Unregister call for automatic participant monitoring
    if (conferenceName && agentId) {
      if (!CALL_END_STATUSES.includes(derivedStatus)) {
        // Register for monitoring (active call)
        socketManager.registerActiveCall(callSid, conferenceName, agentId);
      } else {
        // Unregister when call ends
        socketManager.unregisterActiveCall(callSid);
      }
    }

    // Save to database only when call ends
    const isCallEnded = CALL_END_STATUSES.includes(derivedStatus) || CALL_END_STATUSES.includes(callStatus);
    let finalCallLog = callLog;

    if (isCallEnded) {
      const twilioData = {
        callSid,
        callStatus,
        direction: twilioDirection, // Keep original Twilio direction
        normalizedDirection: direction, // Store normalized direction
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
