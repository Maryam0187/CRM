import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { endCustomerLegsIfNoAgentsRemain } from '../../../../lib/conferenceEndCustomerIfNoAgents';
import { Op } from 'sequelize';

// Constants
const CALL_END_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];

// Simple deduplication - track last processed status per callSid
const lastProcessedStatus = new Map();

// Track which participants have joined conferences (to filter speech events)
// Format: Map<conferenceName, Set<participantCallSid>>
const joinedParticipants = new Map();

// Track if first speech-start event has been processed for conference (to ignore initial connection noise)
// Format: Map<conferenceName, boolean>
const firstSpeechStartProcessed = new Map();

// Helper: Normalize Twilio direction to database enum values
function normalizeDirection(twilioDirection) {
  if (!twilioDirection) return 'outbound';
  const direction = String(twilioDirection).toLowerCase();
  if (direction === 'inbound' || direction === 'inbound-api') return 'inbound';
  return 'outbound';
}

// Helper: Check if number is a phone number
function isPhoneNumber(num) {
  if (!num) return false;
  return num.startsWith('+') || /^\+?[1-9]\d{1,14}$/.test(num.replace(/[^\d+]/g, ''));
}

// Helper: Identify if this is a customer leg (phone call) vs agent leg (browser)
function isCustomerLeg(from, to) {
  const isAgentLeg = from?.startsWith('client:') || to?.startsWith('client:');
  return !isAgentLeg && (isPhoneNumber(from) || isPhoneNumber(to));
}

// Helper: Resolve participant role for conference events (queries DB)
async function resolveParticipantRole({ conferenceName, participantId, rawFrom }) {
  const fromStr = rawFrom ? String(rawFrom) : '';
  
  // Agent: Voice SDK identity (client:)
  if (fromStr.startsWith('client:')) return 'agent';
  
  // Query database for tracked SIDs
  if (conferenceName) {
    try {
      const callLog = await sequelizeDb.CallLog.findOne({
        where: { conferenceName },
        attributes: ['customerCallSid', 'agentCallSid'],
        order: [['created_at', 'DESC']]
      });
      
      if (callLog) {
        const { customerCallSid, agentCallSid } = callLog;
        
        // Direct match on participantId
        if (customerCallSid && participantId === customerCallSid) return 'customer';
        if (agentCallSid && participantId === agentCallSid) return 'agent';
        
        // If we know both SIDs and participant doesn't match either, use From to decide
        if (customerCallSid && agentCallSid) {
          if (isPhoneNumber(fromStr)) return 'customer';
          return 'agent'; // Assume agent for non-phone From
        }
        
        // If we only know customer SID and this participant is different, it's agent
        if (customerCallSid && participantId !== customerCallSid) return 'agent';
        // If we only know agent SID and this participant is different, it's customer
        if (agentCallSid && participantId !== agentCallSid) return 'customer';
      }
    } catch (err) {
      console.error('Error querying call log for role resolution:', err.message);
    }
  }
  
  // Fallback: phone number format suggests customer
  if (isPhoneNumber(fromStr)) return 'customer';
  
  // For speech events without good data, try to infer from participantId format
  // Twilio CallSids start with CA - if we have one and no other info, default to customer
  // since customers are typically the PSTN leg
  if (participantId && participantId.startsWith('CA') && !fromStr) {
    // Could be either, but customer is more likely for speech events
    return 'unknown'; // Keep unknown if we really can't tell
  }
  
  return 'unknown';
}

// Helper: Find call log by conference name or customer call sid
async function findCallLog(conferenceName, customerCallSid) {
  const conditions = [];
  if (conferenceName) conditions.push({ conferenceName });
  if (customerCallSid) conditions.push({ customerCallSid });
  if (customerCallSid) conditions.push({ callSid: customerCallSid });
  
  if (conditions.length === 0) return null;
  
  return await sequelizeDb.CallLog.findOne({
    where: { [Op.or]: conditions },
    order: [['created_at', 'DESC']]
  });
}

// Helper: Update call log
async function updateCallLog(callLog, updates) {
  if (!callLog) return null;
  await callLog.update(updates);
  await callLog.reload();
  return callLog;
}

// Helper: Broadcast call status to frontend via WebSocket
function broadcastCallStatus(conferenceName, statusData, agentId) {
  // Send to agent
  if (agentId) {
    socketManager.sendCallStatusToAgent(agentId, statusData.callSid, statusData);
  }
  // Send to call room and supervisors
  socketManager.sendCallStatusUpdate(statusData.callSid, statusData);
  socketManager.sendCallStatusToSupervisors(statusData.callSid, statusData);
  if (statusData.callSid) {
    socketManager.sendCallStatusToRoom(`call_${statusData.callSid}`, statusData.callSid, statusData);
  }
}

// Helper: Update agent status based on call
async function updateAgentStatus(agentId, callStatus, duration, callSid) {
  if (!agentId) return;

  try {
    const agent = await sequelizeDb.User.findByPk(agentId);
    if (!agent) return;

    if (callStatus === 'in-progress' && agent.callStatus !== 'busy') {
      await agent.update({ callStatus: 'busy' });
      await agent.reload();
      socketManager.broadcastUserStatusChange(agentId, agent.status, 'busy');
      return;
    }

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

// Handle conference callbacks
async function handleConferenceCallback(formData, conferenceSid, conferenceName, conferenceEvent) {
  const callSid = formData.get('CallSid');
  const participantCallSid = formData.get('ParticipantCallSid');
  const participantId = participantCallSid || callSid;
  const rawFrom = formData.get('From') || formData.get('Caller') || '';
  const muted = formData.get('Muted');
  const hold = formData.get('Hold');
  const timestamp = formData.get('Timestamp');
  
  // Normalize event name
  const event = conferenceEvent?.toLowerCase()
    ?.replace(/^(conference-|participant-)/, '')
    ?.replace(/\s+/g, '-') || 'unknown';
  
  const role = await resolveParticipantRole({ conferenceName, participantId, rawFrom });
  
  switch (event) {
    case 'start':
      // Save conference_sid to call log on conference start
      try {
        const callLog = await findCallLog(conferenceName, null);
        if (callLog && !callLog.conferenceSid) {
          await updateCallLog(callLog, { conferenceSid: conferenceSid });
        }
      } catch (err) {
        // Ignore
      }
      
      socketManager.sendConferenceEvent(conferenceName, {
        event: 'start',
        conferenceSid,
        conferenceName,
        timestamp
      });
      socketManager.sendConferenceStatus(conferenceName, {
        status: 'in-progress',
        conferenceSid,
        participantsCount: 0
      });
      break;
      
    case 'end':
      // Clean up tracking for this conference
      joinedParticipants.delete(conferenceName);
      firstSpeechStartProcessed.delete(conferenceName);
      
      socketManager.sendConferenceEvent(conferenceName, {
        event: 'end',
        conferenceSid,
        conferenceName,
        timestamp
      });
      socketManager.sendConferenceStatus(conferenceName, {
        status: 'completed',
        conferenceSid,
        participantsCount: 0
      });
      break;
      
    case 'join':
      // Get known SIDs from database for role matching
      let customerSidForJoin = null;
      let agentSidForJoin = null;
      try {
        const callLogForJoin = await findCallLog(conferenceName, null);
        if (callLogForJoin) {
          customerSidForJoin = callLogForJoin.customerCallSid;
          agentSidForJoin = callLogForJoin.agentCallSid;
        }
      } catch (err) { /* ignore */ }
      
      // Track that this participant has joined
      if (!joinedParticipants.has(conferenceName)) {
        joinedParticipants.set(conferenceName, new Set());
      }
      joinedParticipants.get(conferenceName).add(participantId);
      
      socketManager.sendConferenceEvent(conferenceName, {
        event: 'join',
        conferenceSid,
        conferenceName,
        callSid: participantId,
        participantRole: role,
        customerCallSid: customerSidForJoin,
        agentCallSid: agentSidForJoin,
        muted: muted === 'true',
        hold: hold === 'true',
        timestamp
      });
      break;
      
    case 'leave':
      // Remove participant from joined set
      if (joinedParticipants.has(conferenceName)) {
        joinedParticipants.get(conferenceName).delete(participantId);
        // Clean up empty sets
        if (joinedParticipants.get(conferenceName).size === 0) {
          joinedParticipants.delete(conferenceName);
        }
      }
      
      socketManager.sendConferenceEvent(conferenceName, {
        event: 'leave',
        conferenceSid,
        conferenceName,
        callSid: participantId,
        participantRole: role,
        timestamp
      });

      void endCustomerLegsIfNoAgentsRemain(conferenceSid, conferenceName, participantId);
      break;
      
    case 'mute':
    case 'unmute':
      socketManager.sendConferenceEvent(conferenceName, {
        event: event,
        conferenceSid,
        conferenceName,
        callSid: participantId,
        participantRole: role,
        muted: muted === 'true',
        timestamp
      });
      break;
      
    case 'hold':
    case 'unhold':
      socketManager.sendConferenceEvent(conferenceName, {
        event: event,
        conferenceSid,
        conferenceName,
        callSid: participantId,
        participantRole: role,
        hold: hold === 'true',
        timestamp
      });
      break;
    
    case 'speech-start':
    case 'speech-stop':
      // Speech detection events - only send if participant has actually joined the conference
      // This prevents speech events during ringing phase (before customer answers)
      const hasJoined = joinedParticipants.has(conferenceName) && 
                        joinedParticipants.get(conferenceName).has(participantId);
      
      if (!hasJoined) {
        console.log('⏭️ [SPEECH EVENT FILTERED] Participant not in conference yet:', {
          event,
          participantId: participantId?.substring(0, 20),
          role,
          conferenceName
        });
        // Don't send speech event if participant hasn't joined
        break;
      }
      
      // Ignore first speech-start event from ANY participant when conference starts (initial connection noise)
      if (event === 'speech-start') {
        if (!firstSpeechStartProcessed.has(conferenceName) || !firstSpeechStartProcessed.get(conferenceName)) {
          // First speech-start event for this conference (from any participant) - ignore it
          firstSpeechStartProcessed.set(conferenceName, true);
          console.log('⏭️ [SPEECH-START IGNORED] Ignoring first speech-start event of conference (connection noise):', {
            participantId: participantId?.substring(0, 20),
            role,
            conferenceName
          });
          break; // Don't send this event
        }
      }
      
      // Speech detection events - include participant role
      socketManager.sendConferenceEvent(conferenceName, {
        event: event,
        conferenceSid,
        conferenceName,
        callSid: participantId,
        participantRole: role,
        timestamp
      });
      break;
      
    default:
      // Forward unknown events with role if available
      socketManager.sendConferenceEvent(conferenceName, {
        event: event,
        conferenceSid,
        conferenceName,
        callSid: participantId,
        participantRole: role,
        timestamp
      });
  }
  
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' }
  });
}

// Main POST handler
export async function POST(request) {
  try {
    const url = new URL(request.url);
    const agentIdFromUrl = url.searchParams.get('agentId');
    const customerIdFromUrl = url.searchParams.get('customerId');
    const saleIdFromUrl = url.searchParams.get('saleId');
    const callPurposeFromUrl = url.searchParams.get('callPurpose');
    const directionFromUrl = url.searchParams.get('direction');
    const isIvrCallFromUrl = url.searchParams.get('isIvrCall') === 'true';
    const conferenceNameFromUrl = url.searchParams.get('conferenceName');

    const formData = await request.formData();
    
    // Identify callback type
    const conferenceEvent = formData.get('StatusCallbackEvent');
    const conferenceSid = formData.get('ConferenceSid');
    const conferenceName = formData.get('FriendlyName');
    const dialCallStatus = formData.get('DialCallStatus');
    const dialCallSid = formData.get('DialCallSid');
    const callSid = formData.get('CallSid');
    const callStatus = formData.get('CallStatus');
    const answeredBy = formData.get('AnsweredBy');
    
    
    // Handle voicemail detection
    if (answeredBy?.startsWith('machine')) {
      const agentId = agentIdFromUrl ? parseInt(agentIdFromUrl, 10) : null;
      const derivedConferenceName = agentId ? `call-${agentId}` : null;
      
      const callLog = await findCallLog(derivedConferenceName, callSid);
      if (callLog) {
        await updateCallLog(callLog, { status: 'voicemail' });
      }
      
      const statusData = {
        callSid,
        status: 'voicemail',
        uiStatus: 'voicemail',
        conferenceName: derivedConferenceName,
        agentId
      };
      broadcastCallStatus(derivedConferenceName, statusData, agentId);
      return NextResponse.json({ success: true, message: 'Voicemail detected' });
    }
    
    const isConferenceCallback = !!conferenceEvent && !!conferenceSid;
    const isDialCallback = !!dialCallStatus && !!dialCallSid;
    const isCallStatusCallback = !!callSid && (!!callStatus || isDialCallback);
    
    // Handle Conference Callbacks
    if (isConferenceCallback) {
      return handleConferenceCallback(formData, conferenceSid, conferenceName, conferenceEvent);
    }
    
    // Handle Call Status Callbacks
    if (!isCallStatusCallback) {
      return NextResponse.json({ success: false, message: 'Invalid callback' }, { status: 400 });
    }
    
    const twilioDirection = formData.get('Direction') || directionFromUrl || 'outbound';
    const direction = normalizeDirection(twilioDirection);
    const from = formData.get('From');
    const to = formData.get('To');
    const duration = formData.get('CallDuration');
    const answerTime = formData.get('AnswerTime');
    // Note: answeredBy is already declared above for AMD callback handling
    
    // Get effective CallSid (for Dial callbacks, use DialCallSid)
    const effectiveCallSid = isDialCallback ? dialCallSid : callSid;
    const effectiveStatus = isDialCallback ? dialCallStatus : callStatus;
    
    // Skip agent leg callbacks
    if (!isDialCallback && !isCustomerLeg(from, to)) {
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
        headers: { 'Content-Type': 'text/xml' }
      });
    }
    
    // Deduplication: Skip if we've already processed this exact status
    const statusKey = `${effectiveCallSid}-${effectiveStatus}`;
    if (lastProcessedStatus.get(effectiveCallSid) === statusKey) {
      return NextResponse.json({ success: true, message: 'Duplicate callback ignored' });
    }
    lastProcessedStatus.set(effectiveCallSid, statusKey);
    
    // Detect IVR calls - check multiple indicators
    const isIvrCall = isIvrCallFromUrl || 
                     callPurposeFromUrl === 'ivr_dialer' ||
                     directionFromUrl === 'outbound-ivr' ||
                     (conferenceNameFromUrl && conferenceNameFromUrl.startsWith('ivr-call-')) ||
                     (conferenceName && conferenceName.startsWith('ivr-call-'));
    
    // Derive conference name from agentId or use provided conference name for IVR
    const agentId = agentIdFromUrl ? parseInt(agentIdFromUrl, 10) : null;
    const derivedConferenceName = isIvrCall && conferenceNameFromUrl 
      ? conferenceNameFromUrl 
      : (agentId ? `call-${agentId}` : null);
    
    // Determine UI status
    // Customer has answered if: status is 'answered' OR status is 'in-progress' WITH AnswerTime
    const customerHasAnswered = effectiveStatus === 'answered' || (effectiveStatus === 'in-progress' && answerTime);
    
    let uiStatus = effectiveStatus;
    if (customerHasAnswered) {
      uiStatus = 'in-progress';
    } else if (effectiveStatus === 'in-progress' && !answerTime) {
      // Early media - customer phone ringing but not answered yet
      uiStatus = 'ringing';
    } else if (effectiveStatus === 'initiated' || effectiveStatus === 'queued') {
      uiStatus = 'queued';
    }
    
    // Build status data for frontend
    const statusData = {
      callSid: effectiveCallSid,
      status: effectiveStatus,
      uiStatus,
      direction,
      from,
      to,
      duration: duration ? parseInt(duration) : null,
      conferenceName: derivedConferenceName,
      agentId,
      customerId: customerIdFromUrl || null,
      saleId: saleIdFromUrl || null,
      callPurpose: callPurposeFromUrl || null,
      twilioData: {
        isIvrCall: isIvrCall,
        callPurpose: callPurposeFromUrl || null
      }
    };
    
    // Broadcast to frontend via WebSocket
    broadcastCallStatus(derivedConferenceName, statusData, agentId);
    
    // Update call log when call ends
    const isCallEnded = CALL_END_STATUSES.includes(effectiveStatus);
    
    if (isCallEnded) {
      // Cleanup deduplication map
      lastProcessedStatus.delete(effectiveCallSid);
      
      // Find and update call log
      const callLog = await findCallLog(derivedConferenceName, effectiveCallSid);
      
      if (callLog) {
        // Determine final status
        let finalStatus = effectiveStatus;
        if (answeredBy === 'machine') {
          finalStatus = 'voicemail';
        }
        
        await updateCallLog(callLog, {
          status: finalStatus,
          duration: duration ? parseInt(duration) : callLog.duration,
          twilioData: {
            ...callLog.twilioData,
            callStatus: effectiveStatus,
            endedAt: new Date().toISOString(),
            duration,
            answeredBy
          }
        });
        
        // Update related records
        if (duration && parseInt(duration) > 0) {
          if (callLog.customerId) {
            await sequelizeDb.Customer.update({ updatedAt: new Date() }, { where: { id: callLog.customerId } });
          }
          if (callLog.saleId) {
            await sequelizeDb.Sale.update({ updatedAt: new Date() }, { where: { id: callLog.saleId } });
          }
        }
      } else if (agentId) {
        // Create call log if it doesn't exist
        try {
          await sequelizeDb.CallLog.create({
            callSid: effectiveCallSid,
            customerCallSid: effectiveCallSid,
            conferenceName: derivedConferenceName,
            agentId,
            customerId: customerIdFromUrl ? parseInt(customerIdFromUrl, 10) : null,
            saleId: saleIdFromUrl ? parseInt(saleIdFromUrl, 10) : null,
            direction,
            fromNumber: from || 'unknown',
            toNumber: to || 'unknown',
            status: answeredBy === 'machine' ? 'voicemail' : effectiveStatus,
            duration: duration ? parseInt(duration) : null,
            callPurpose: callPurposeFromUrl || 'follow_up',
            twilioData: {
              callStatus: effectiveStatus,
              endedAt: new Date().toISOString(),
              answeredBy
            }
          });
        } catch (dbErr) {
          // Ignore DB errors
        }
      }
      
      // Update agent status - SKIP for IVR calls (they shouldn't affect agent's CRM call status)
      if (!isIvrCall) {
        await updateAgentStatus(agentId, effectiveStatus, duration, effectiveCallSid);
      } else {
        console.log('📞 [IVR CALLBACK] Skipping agent status update for IVR call:', effectiveCallSid);
      }
      
      // Cleanup call room after delay
      setTimeout(() => {
        socketManager.cleanupCallRoom(effectiveCallSid);
      }, 2 * 60 * 1000);
    } else {
      // Update call status during the call (not ended)
      const callLog = await findCallLog(derivedConferenceName, effectiveCallSid);
      if (callLog && callLog.status !== effectiveStatus) {
        await updateCallLog(callLog, { status: effectiveStatus });
      }
      
      // Update agent status for in-progress - SKIP for IVR calls
      if (effectiveStatus === 'in-progress' && !isIvrCall) {
        await updateAgentStatus(agentId, effectiveStatus, null, effectiveCallSid);
      } else if (isIvrCall && effectiveStatus === 'in-progress') {
        console.log('📞 [IVR CALLBACK] Skipping agent status update for IVR call in-progress:', effectiveCallSid);
      }
    }

    return NextResponse.json({ success: true, message: 'Call status processed' });

  } catch (error) {
    console.error('Error processing call status callback:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to process callback',
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
