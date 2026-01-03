import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Track call status in memory (since we don't save until call ends)
const callStatusCache = new Map(); // callSid -> lastStatus

// Track conference participants to determine when conference is active (both agent + customer present)
// conferenceName -> { agentPresent: boolean, customerPresent: boolean, customerCallSid: string, agentCallSid: string }
const conferenceParticipants = new Map();

/**
 * Derive correct call status from Twilio data
 * Since we're only processing customer leg callbacks, we can trust Twilio's status
 * For 'in-progress', we check if it's a valid transition from 'ringing' state
 */
function deriveCallStatus(callStatus, callDuration, answerTime, callSid) {
  // Get previous status from cache
  const previousStatus = callStatusCache.get(callSid) || null;
  
  switch (callStatus) {
    case 'ringing':
      callStatusCache.set(callSid, 'ringing');
      return 'ringing';
      
    case 'answered':
    case 'in-progress':
      // For customer leg: if we were in 'ringing' state and now get 'in-progress', customer answered
      // OR if we have answerTime/duration, customer definitely answered
      const hasAnswerIndicator = callDuration > 0 || (answerTime && answerTime.trim() !== '');
      const wasRinging = previousStatus === 'ringing' || previousStatus === 'queued' || previousStatus === null;
      
      if (hasAnswerIndicator || wasRinging) {
        // Customer answered - valid transition
        callStatusCache.set(callSid, 'in-progress');
        return 'in-progress';
      } else {
        // Premature status - still ringing
        callStatusCache.set(callSid, 'ringing');
        return 'ringing';
      }
      
    case 'no-answer':
      callStatusCache.delete(callSid);
      return 'no-answer';
      
    case 'completed':
      callStatusCache.delete(callSid);
      // If duration > 0, call was answered; otherwise no-answer
      return callDuration > 0 ? 'completed' : 'no-answer';
      
    case 'busy':
      callStatusCache.delete(callSid);
      return 'busy';
      
    case 'failed':
      callStatusCache.delete(callSid);
      return 'failed';
      
    case 'canceled':
      callStatusCache.delete(callSid);
      return 'canceled';
      
    case 'initiated':
    case 'queued':
      callStatusCache.set(callSid, 'queued');
      return 'queued';
      
    default:
      callStatusCache.set(callSid, 'queued');
      return 'queued';
  }
}

/**
 * Find agentId from related call logs by matching phone numbers
 */
async function findAgentIdFromRelatedCalls(fromNumber, toNumber) {
  // Validate inputs - check for undefined, null, empty string, or 'unknown'
  // Handle both null and undefined explicitly
  if (fromNumber == null || toNumber == null || 
      fromNumber === 'unknown' || toNumber === 'unknown' ||
      fromNumber === '' || toNumber === '') {
    return null;
  }
  
  // Ensure values are strings and not empty after trimming
  const from = String(fromNumber).trim();
  const to = String(toNumber).trim();
  
  if (!from || !to || from === 'unknown' || to === 'unknown' || from === 'null' || to === 'null') {
    return null;
  }
  
  try {
    // Try to find a recent call log with matching phone numbers
    const relatedCall = await sequelizeDb.CallLog.findOne({
      where: {
        [Op.and]: [
          {
            [Op.or]: [
              { fromNumber: from, toNumber: to },
              { fromNumber: to, toNumber: from }
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

/**
 * Handle voicemail detection and auto-hangup
 */
async function handleVoicemail(callSid) {
  const { getClient } = require('../../../../lib/twilio');
  const client = getClient();
  
  setTimeout(async () => {
    try {
      await client.calls(callSid).update({ status: 'completed' });
    } catch (err) {
      console.error('Error hanging up voicemail:', err);
    }
  }, 30000);
}

/**
 * Handle no-answer: disconnect immediately
 */
async function handleNoAnswer(callSid) {
  const { getClient } = require('../../../../lib/twilio');
  const client = getClient();
  
  try {
    await client.calls(callSid).update({ status: 'completed' });
  } catch (err) {
    console.error('Error disconnecting no-answer:', err);
  }
}

/**
 * Update agent status based on call status
 */
async function updateAgentStatus(callLog, callStatus, duration) {
  if (!callLog.agentId) {
    return;
  }
  
  const agent = await sequelizeDb.User.findByPk(callLog.agentId);
  if (!agent) {
    return;
  }
  
  // Error statuses that should set agent back to available
  const errorStatuses = ['failed', 'busy', 'no-answer', 'canceled'];
  const endStatuses = ['completed', ...errorStatuses];
  
  let statusChanged = false;
  let newCallStatus = agent.callStatus;
  
  if (callStatus === 'in-progress' && agent.callStatus !== 'busy') {
    await agent.update({ callStatus: 'busy' });
    newCallStatus = 'busy';
    statusChanged = true;
  } else if (endStatuses.includes(callStatus)) {
    // Check for other active calls
    const activeCalls = await sequelizeDb.CallLog.count({
      where: {
        agentId: callLog.agentId,
        callSid: { [Op.ne]: callLog.callSid },
        status: 'in-progress'
      }
    });
    
    // If no other active calls, set agent back to available
    if (activeCalls === 0) {
      const updateData = { callStatus: 'available' };
      
      // Only update call time for completed calls with duration
      if (callStatus === 'completed' && duration) {
        updateData.totalCallTime = (agent.totalCallTime || 0) + parseInt(duration);
      }
      
      await agent.update(updateData);
      newCallStatus = 'available';
      statusChanged = true;
      console.log(`✅ Agent ${callLog.agentId} set back to available (call status: ${callStatus})`);
    } else {
      console.log(`⚠️ Agent ${callLog.agentId} still has ${activeCalls} active call(s), keeping busy status`);
    }
  }
  
  // Broadcast status change if it changed
  if (statusChanged) {
    await agent.reload();
    socketManager.broadcastUserStatusChange(callLog.agentId, agent.status, newCallStatus);
    console.log(`📡 Broadcasted agent ${callLog.agentId} status change: ${newCallStatus}`);
  }
}

/**
 * Set agent back to available when call fails (used in error handling)
 */
async function setAgentAvailableOnError(agentId) {
  if (!agentId) {
    return;
  }
  
  try {
    const agent = await sequelizeDb.User.findByPk(agentId);
    if (!agent) {
      return;
    }
    
    // Check for active calls
    const activeCalls = await sequelizeDb.CallLog.count({
      where: {
        agentId: agentId,
        status: 'in-progress'
      }
    });
    
    // If no active calls, set agent to available
    if (activeCalls === 0) {
      await agent.update({ callStatus: 'available' });
      await agent.reload();
      console.log(`✅ Agent ${agentId} set back to available due to call error`);
      
      // Broadcast status change
      socketManager.broadcastUserStatusChange(agentId, agent.status, 'available');
      console.log(`📡 Broadcasted agent ${agentId} status change to available (error recovery)`);
    }
  } catch (error) {
    console.error(`Error setting agent ${agentId} to available:`, error);
  }
}

/**
 * Update related records (customer, sale)
 */
async function updateRelatedRecords(callLog, duration) {
  if (!duration || duration <= 0) {
    return;
  }
  
  if (callLog.customerId) {
    await sequelizeDb.Customer.update(
      { updatedAt: new Date() },
      { where: { id: callLog.customerId } }
    );
  }
  
  if (callLog.saleId) {
    await sequelizeDb.Sale.update(
      { updatedAt: new Date() },
      { where: { id: callLog.saleId } }
    );
  }
}

/**
 * Broadcast status update via Socket.IO
 */
function broadcastStatusUpdate(callSid, callStatusData, callLog) {
  if (callLog.agentId) {
    socketManager.sendCallStatusToAgent(callLog.agentId, callSid, callStatusData);
  }
  socketManager.sendCallStatusToSupervisors(callSid, callStatusData);
  socketManager.sendCallStatusToRoom(`call_${callSid}`, callSid, callStatusData);
  socketManager.sendCallStatusUpdate(callSid, callStatusData);
}

// ============================================================================
// MAIN ROUTE HANDLERS
// ============================================================================

export async function GET(request) {
  return NextResponse.json({
    success: true,
    message: 'Call status callback endpoint is active',
    timestamp: new Date().toISOString()
  }, { status: 200 });
}

export async function POST(request) {
  try {
    // Extract call metadata from URL query parameters (passed when call is initiated)
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
    const direction = formData.get('Direction');
    const from = formData.get('From');
    const to = formData.get('To');
    const duration = formData.get('CallDuration');
    const startTime = formData.get('StartTime');
    const endTime = formData.get('EndTime');
    const answerTime = formData.get('AnswerTime');
    const hangupCause = formData.get('HangupCause');
    const answeredBy = formData.get('AnsweredBy');
    const parentCallSid = formData.get('ParentCallSid');
    
    console.log('📞 Call status callback received:', {
      callSid,
      callStatus,
      from,
      to,
      agentIdFromUrl,
      parentCallSid,
      direction,
      answerTime,
      answeredBy,
      duration
    });
    
    if (!callSid) {
      return NextResponse.json({
        success: false,
        message: 'Call SID is required'
      }, { status: 400 });
    }
    
    // Extract ONLY customer leg callbacks - filter out agent leg and conference leg
    // Customer leg identification:
    // - Outbound: from = Twilio phone number (starts with +), to = customer phone number
    // - Inbound: from = customer phone number (starts with +), to = Twilio phone number
    // - Agent leg: from = client:agent-{id} (starts with 'client:')
    // - Conference leg: from/to might be conference name or SIP endpoint
    
    const isAgentLeg = from && from.startsWith('client:');
    const isPhoneNumber = (num) => num && (num.startsWith('+') || /^\+?[1-9]\d{1,14}$/.test(num.replace(/[^\d+]/g, '')));
    const isCustomerLeg = !isAgentLeg && (isPhoneNumber(from) || isPhoneNumber(to));
    
    // Extract conference name from agent leg (to field contains conference name like "call-1")
    let conferenceName = null;
    if (isAgentLeg) {
      // Agent leg: from = "client:agent-1", to = "call-1" (conference name)
      if (to && to.startsWith('call-')) {
        conferenceName = to;
      } else if (from && from.startsWith('client:agent-')) {
        // Extract agentId from "client:agent-1" and construct conference name
        const agentIdMatch = from.match(/client:agent-(\d+)/);
        if (agentIdMatch) {
          conferenceName = `call-${agentIdMatch[1]}`;
        }
      }
    } else if (isCustomerLeg) {
      // Customer leg: conference name comes from agentId in URL or from callLog
      const agentId = agentIdFromUrl ? parseInt(agentIdFromUrl, 10) : null;
      if (agentId) {
        conferenceName = `call-${agentId}`;
      } else {
        // Try to find from existing callLog
        const existingCallLog = await sequelizeDb.CallLog.findOne({ where: { callSid } });
        if (existingCallLog?.agentId) {
          conferenceName = `call-${existingCallLog.agentId}`;
        }
      }
    }
    
    // Track agent leg callbacks to detect when agent joins conference
    if (isAgentLeg && conferenceName) {
      // Extract agentId from "client:agent-{id}" format
      let agentIdFromAgentLeg = null;
      if (from && from.startsWith('client:agent-')) {
        const agentIdMatch = from.match(/client:agent-(\d+)/);
        if (agentIdMatch) {
          agentIdFromAgentLeg = parseInt(agentIdMatch[1], 10);
        }
      }
      
      console.log('👤 Agent leg callback received:', {
        callSid,
        from,
        to,
        callStatus,
        conferenceName,
        agentId: agentIdFromAgentLeg || agentIdFromUrl
      });
      
      // Update conference participants tracking
      if (!conferenceParticipants.has(conferenceName)) {
        conferenceParticipants.set(conferenceName, {
          agentPresent: false,
          customerPresent: false,
          customerCallSid: null,
          agentCallSid: callSid,
          agentId: agentIdFromAgentLeg || (agentIdFromUrl ? parseInt(agentIdFromUrl, 10) : null)
        });
      }
      
      const participants = conferenceParticipants.get(conferenceName);
      participants.agentCallSid = callSid;
      if (agentIdFromAgentLeg) {
        participants.agentId = agentIdFromAgentLeg;
      } else if (agentIdFromUrl) {
        participants.agentId = parseInt(agentIdFromUrl, 10);
      }
      
      // When agent leg becomes "in-progress" or "answered", agent has joined
      if (callStatus === 'in-progress' || callStatus === 'answered') {
        participants.agentPresent = true;
        console.log('✅ Agent joined conference:', conferenceName);
        
        // Check if customer is also present - if so, conference is active
        if (participants.customerPresent && participants.customerCallSid) {
          console.log('🎉 Conference is ACTIVE (both participants present):', conferenceName);
          // Broadcast "in-progress" status for customer call
          const agentIdForBroadcast = participants.agentId || (agentIdFromUrl ? parseInt(agentIdFromUrl, 10) : null);
          
          const customerStatusData = {
            callSid: participants.customerCallSid,
            status: 'in-progress',
            duration: duration ? parseInt(duration) : null,
            direction: direction || directionFromUrl || 'outbound',
            from: null, // Will be filled from customer leg
            to: null,
            startTime,
            endTime,
            answerTime,
            hangupCause,
            agentId: agentIdForBroadcast,
            customerId: customerIdFromUrl || null,
            saleId: saleIdFromUrl || null,
            callPurpose: callPurposeFromUrl || null,
            conferenceActive: true,
            twilioData: {
              callStatus: 'in-progress',
              conferenceName,
              bothParticipantsPresent: true
            }
          };
          
          // Broadcast to agent
          if (agentIdForBroadcast) {
            socketManager.sendCallStatusToAgent(agentIdForBroadcast, participants.customerCallSid, customerStatusData);
          }
          socketManager.sendCallStatusUpdate(participants.customerCallSid, customerStatusData);
        }
      } else if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled') {
        // Agent disconnected
        participants.agentPresent = false;
        console.log('👤 Agent left conference:', conferenceName);
      }
      
      // Return success for agent leg (don't process further)
      const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'text/xml' }
      });
    }
    
    // Skip all other non-customer leg callbacks
    if (!isCustomerLeg) {
      console.log('⏭️ Skipping non-customer leg callback:', {
        callSid,
        from,
        to,
        callStatus,
        isAgentLeg,
        isCustomerLeg: false
      });
      const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'text/xml' }
      });
    }
    
    console.log('✅ Processing customer leg callback:', {
      callSid,
      from,
      to,
      callStatus,
      direction
    });
    
    // For customer calls, check if call log already exists (might exist from inbound calls)
    // We'll only create/update it when the call ends
    let callLog = await sequelizeDb.CallLog.findOne({
      where: { callSid }
    });
    
    // Derive correct status - function tracks previous status in memory cache
    const callDuration = duration ? parseInt(duration) : 0;
    const derivedStatus = deriveCallStatus(callStatus, callDuration, answerTime, callSid);
    
    console.log('📞 Status derivation:', {
      twilioStatus: callStatus,
      derivedStatus,
      duration: callDuration
    });
    
    // Get agentId from URL or from callLog if available
    let agentIdForBroadcast = agentIdFromUrl ? parseInt(agentIdFromUrl, 10) : null;
    if (!agentIdForBroadcast && callLog && callLog.agentId) {
      agentIdForBroadcast = callLog.agentId;
    }
    
    // Track customer leg in conference participants
    if (conferenceName) {
      if (!conferenceParticipants.has(conferenceName)) {
        conferenceParticipants.set(conferenceName, {
          agentPresent: false,
          customerPresent: false,
          customerCallSid: callSid,
          agentCallSid: null,
          agentId: agentIdForBroadcast
        });
      }
      
      const participants = conferenceParticipants.get(conferenceName);
      participants.customerCallSid = callSid;
      
      // Use agentId from conference participants if available (more accurate, from agent leg)
      if (participants.agentId) {
        agentIdForBroadcast = participants.agentId;
      } else if (agentIdForBroadcast) {
        participants.agentId = agentIdForBroadcast;
      }
      
      // When customer answers (in-progress), mark customer as present
      if (derivedStatus === 'in-progress') {
        participants.customerPresent = true;
        console.log('✅ Customer answered:', conferenceName);
        
        // Check if agent is also present - if so, conference is active
        if (participants.agentPresent) {
          console.log('🎉 Conference is ACTIVE (both participants present):', conferenceName);
          // Both are present - broadcast "in-progress" for the conference
        } else {
          console.log('⏳ Customer answered but agent not yet in conference:', conferenceName);
          // Customer answered but agent not yet connected - broadcast "ringing" or "hold" status
          // Don't broadcast "in-progress" yet - wait for agent to join
        }
      } else if (callStatus === 'ringing' || derivedStatus === 'ringing') {
        participants.customerPresent = false;
      } else if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled') {
        // Customer disconnected
        participants.customerPresent = false;
        console.log('📞 Customer left conference:', conferenceName);
      }
    }
    
    // Determine final status to broadcast:
    // - If customer answered AND agent is present → "in-progress" (conference active)
    // - If customer answered but agent NOT present → "ringing" (waiting for agent)
    // - Otherwise → use derivedStatus
    let statusToBroadcast = derivedStatus;
    if (conferenceName && derivedStatus === 'in-progress') {
      const participants = conferenceParticipants.get(conferenceName);
      if (participants && participants.agentPresent && participants.customerPresent) {
        // Both are present - conference is active
        statusToBroadcast = 'in-progress';
        console.log('🎉 Broadcasting "in-progress" - Conference ACTIVE (both participants present)');
      } else {
        // Customer answered but agent not yet connected - show "ringing" or "hold"
        statusToBroadcast = 'ringing';
        console.log('⏳ Broadcasting "ringing" - Customer answered but waiting for agent');
      }
    }
    
    // Broadcast immediately with available data - don't wait for database
    // This ensures frontend gets status updates as fast as possible
    const immediateStatusData = {
      callSid,
      status: statusToBroadcast,
      duration: duration ? parseInt(duration) : null,
      direction,
      from,
      to,
      startTime,
      endTime,
      answerTime,
      hangupCause,
      agentId: agentIdForBroadcast,
      customerId: callLog?.customerId || customerIdFromUrl || null,
      saleId: callLog?.saleId || saleIdFromUrl || null,
      callPurpose: callLog?.callPurpose || callPurposeFromUrl || null,
      conferenceActive: conferenceName && conferenceParticipants.has(conferenceName) && 
                        conferenceParticipants.get(conferenceName).agentPresent && 
                        conferenceParticipants.get(conferenceName).customerPresent,
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
        conferenceName: conferenceName || null
      }
    };
    
    // Broadcast ALL status updates immediately - this happens BEFORE database updates
    // This ensures frontend receives real-time updates for ALL callback statuses
    if (agentIdForBroadcast) {
      socketManager.sendCallStatusToAgent(agentIdForBroadcast, callSid, immediateStatusData);
    }
    socketManager.sendCallStatusUpdate(callSid, immediateStatusData);
    
    // Also broadcast via broadcastStatusUpdate for supervisors/admins (if we have callLog)
    if (callLog && callLog.agentId) {
      broadcastStatusUpdate(callSid, immediateStatusData, callLog);
    } else if (agentIdForBroadcast) {
      // Even if callLog doesn't exist yet, broadcast to supervisors/admins
      socketManager.sendCallStatusToSupervisors(callSid, immediateStatusData);
      socketManager.sendCallStatusToRoom(`call_${callSid}`, callSid, immediateStatusData);
    }
    
    console.log('⚡ Status broadcasted IMMEDIATELY:', {
      callSid,
      status: statusToBroadcast,
      derivedStatus,
      agentId: agentIdForBroadcast,
      twilioStatus: callStatus,
      conferenceActive: immediateStatusData.conferenceActive
    });
    
    // Clean up conference participants when call ends
    if (conferenceName) {
      const callEndStatuses = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
      if (callEndStatuses.includes(derivedStatus) || callEndStatuses.includes(callStatus)) {
        const participants = conferenceParticipants.get(conferenceName);
        if (participants && participants.customerCallSid === callSid) {
          // Customer call ended - clean up
          console.log('🧹 Cleaning up conference participants (customer call ended):', conferenceName);
          conferenceParticipants.delete(conferenceName);
        }
      }
    }
    
    // Only save call log when call ends (completed, failed, busy, no-answer, canceled)
    const callEndStatuses = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
    const isCallEnded = callEndStatuses.includes(derivedStatus) || callEndStatuses.includes(callStatus);
    
    if (isCallEnded) {
      // Call has ended - save to database (status already broadcasted above for all statuses)
      // Now do database operations (after broadcasting for real-time notifications)
      if (!callLog) {
        // Create new call log with all data
        console.log('💾 Creating call log (call ended):', {
          callSid,
          status: derivedStatus,
          agentId: agentIdFromUrl
        });
        
        // Get agentId - prioritize from URL, then try to find from related calls
        let agentId = agentIdFromUrl ? parseInt(agentIdFromUrl, 10) : null;
        if (!agentId) {
          // Try to find from related calls by phone numbers
          agentId = await findAgentIdFromRelatedCalls(from, to);
        }
        
        if (!agentId) {
          console.error(`❌ Cannot create call log for ${callSid}: agentId is required but not found`);
          // Status already broadcasted above, so we're good
        } else {
          const twilioDataUpdate = {
            callSid,
            callStatus,
            direction: direction || directionFromUrl || 'outbound',
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
          
          const newCallLog = await sequelizeDb.CallLog.create({
            callSid,
            customerId: customerIdFromUrl ? parseInt(customerIdFromUrl, 10) : null,
            saleId: saleIdFromUrl ? parseInt(saleIdFromUrl, 10) : null,
            agentId: agentId,
            direction: directionFromUrl || direction || 'outbound',
            fromNumber: from || 'unknown',
            toNumber: to || 'unknown',
            status: derivedStatus,
            duration: duration ? parseInt(duration) : null,
            callPurpose: callPurposeFromUrl || 'follow_up',
            twilioData: twilioDataUpdate
          });
          
          callLog = newCallLog;
        }
      } else {
        // Update existing call log with final status
        console.log('💾 Updating call log (call ended):', {
          callSid,
          oldStatus: callLog.status,
          newStatus: derivedStatus,
          twilioStatus: callStatus
        });
        
        const existingTwilioData = callLog.twilioData || {};
        const twilioDataUpdate = {
          ...existingTwilioData,
          callStatus,
          direction: direction || existingTwilioData.direction,
          from: from || existingTwilioData.from,
          to: to || existingTwilioData.to,
          duration: duration || existingTwilioData.duration,
          startTime: startTime || existingTwilioData.startTime,
          endTime: endTime || existingTwilioData.endTime,
          answerTime: answerTime || existingTwilioData.answerTime,
          hangupCause: hangupCause || existingTwilioData.hangupCause,
          answeredBy: answeredBy || existingTwilioData.answeredBy,
          parentCallSid: parentCallSid || existingTwilioData.parentCallSid,
          lastUpdated: new Date().toISOString()
        };
        
        const updateData = {
          status: derivedStatus,
          duration: duration ? parseInt(duration) : (callLog.duration || null),
          twilioData: twilioDataUpdate,
          updatedAt: new Date()
        };
        
        // Update call log
        await callLog.update(updateData);
        await callLog.reload();
      }
    } else {
      // Call is still in progress - don't save to database, just broadcast
      console.log('⏭️ Skipping database save (call in progress):', {
        callSid,
        status: derivedStatus,
        twilioStatus: callStatus
      });
    }
    
    // Handle special cases (only if call ended and we saved the log)
    if (isCallEnded && callLog) {
      if (answeredBy === 'machine' && callLog) {
        await callLog.update({
          status: 'voicemail',
          twilioData: {
            ...(callLog.twilioData || {}),
            answeredBy: 'machine',
            isVoicemail: true,
            voicemailDetectedAt: new Date().toISOString()
          }
        });
        await handleVoicemail(callSid);
      }
      
      if (callStatus === 'no-answer' && callLog) {
        await handleNoAnswer(callSid);
      }
    }
    
    // Update agent status (only for customer calls with agentId)
    if (callLog && callLog.agentId) {
      try {
        const agent = await sequelizeDb.User.findByPk(callLog.agentId);
        if (agent) {
          await updateAgentStatus(callLog, callStatus, duration);
          
          // Reload agent to get updated status
          await agent.reload();
          
          // Broadcast status change to frontend immediately
          socketManager.broadcastUserStatusChange(callLog.agentId, agent.status, agent.callStatus);
          console.log(`📡 Broadcasted agent ${callLog.agentId} status change: ${agent.callStatus}`);
        }
      } catch (error) {
        console.error('Error updating agent status:', error);
        // On error, try to set agent back to available
        await setAgentAvailableOnError(callLog.agentId);
      }
    }
    
    // For error statuses and completed calls, ensure agent is set to available
    // This is a safety net to ensure agent status is reset even if updateAgentStatus fails
    const endStatuses = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
    if (endStatuses.includes(derivedStatus) && callLog && callLog.agentId) {
      try {
        // Double-check: if call ended, ensure agent is available
        const activeCalls = await sequelizeDb.CallLog.count({
          where: {
            agentId: callLog.agentId,
            callSid: { [Op.ne]: callLog.callSid },
            status: 'in-progress'
          }
        });
        
        if (activeCalls === 0) {
          const agent = await sequelizeDb.User.findByPk(callLog.agentId);
          if (agent && agent.callStatus !== 'available') {
            await agent.update({ callStatus: 'available' });
            await agent.reload();
            console.log(`✅ Safety net: Agent ${callLog.agentId} set to available after call ended (status: ${derivedStatus})`);
            
            // Broadcast status change immediately
            socketManager.broadcastUserStatusChange(callLog.agentId, agent.status, 'available');
          }
        }
      } catch (error) {
        console.error('Error in safety net agent status reset:', error);
        // Fallback to setAgentAvailableOnError
        await setAgentAvailableOnError(callLog.agentId);
      }
    }
    
    // Update related records (only for completed calls with duration)
    if (callStatus === 'completed' && duration && duration > 0 && callLog) {
      await updateRelatedRecords(callLog, parseInt(duration));
    }
    
    // Note: Status was already broadcasted above (before database updates) to avoid delays
    
    return NextResponse.json({
      success: true,
      message: 'Call status updated successfully'
    });
    
  } catch (error) {
    console.error('Error processing call status callback:', error);
    
    // Try to set agent back to available if we have agentId from URL
    try {
      const url = new URL(request.url);
      const agentIdFromUrl = url.searchParams.get('agentId');
      if (agentIdFromUrl) {
        await setAgentAvailableOnError(parseInt(agentIdFromUrl, 10));
      }
    } catch (agentError) {
      console.error('Error setting agent to available in error handler:', agentError);
    }
    
    return NextResponse.json({
      success: false,
      message: 'Failed to process call status callback',
      error: error.message
    }, { status: 500 });
  }
}
