import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';

// Constants
const CALL_END_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];

// Simple deduplication - track last processed status per callSid
const lastProcessedStatus = new Map();

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
        if (callLog.customerCallSid && participantId === callLog.customerCallSid) return 'customer';
        if (callLog.agentCallSid && participantId === callLog.agentCallSid) return 'agent';
        if (callLog.customerCallSid && participantId !== callLog.customerCallSid) return 'agent';
        if (callLog.agentCallSid && participantId !== callLog.agentCallSid) return 'customer';
      }
    } catch (err) {
      console.error('Error querying call log for role resolution:', err.message);
    }
  }
  
  // Fallback: phone number format suggests customer
  if (isPhoneNumber(fromStr)) return 'customer';
  
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
  
  console.log('📞 [CONFERENCE CALLBACK]', { event, conferenceName, participantId: participantId?.substring(0, 15) + '...' });
  
  const role = await resolveParticipantRole({ conferenceName, participantId, rawFrom });
  
  switch (event) {
    case 'start':
      console.log('🎉 Conference started:', conferenceName);
      
      // CRITICAL: Save conference_sid to call log on conference start
      try {
        const callLog = await findCallLog(conferenceName, null);
        if (callLog && !callLog.conferenceSid) {
          await updateCallLog(callLog, { conferenceSid: conferenceSid });
          console.log('💾 [CONFERENCE START] Conference SID saved:', conferenceSid);
        }
      } catch (err) {
        console.error('❌ Failed to save conference SID:', err.message);
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
      console.log('🏁 Conference ended:', conferenceName);
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
      console.log('👤 Participant joined:', { conferenceName, role, participantId: participantId?.substring(0, 15) + '...' });
      socketManager.sendConferenceEvent(conferenceName, {
        event: 'join',
        conferenceSid,
        conferenceName,
        callSid: participantId,
        participantRole: role,
        muted: muted === 'true',
        hold: hold === 'true',
        timestamp
      });
      break;
      
    case 'leave':
      console.log('👋 Participant left:', { conferenceName, role });
      socketManager.sendConferenceEvent(conferenceName, {
        event: 'leave',
        conferenceSid,
        conferenceName,
        callSid: participantId,
        participantRole: role,
        timestamp
      });
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
      
    default:
      // Forward unknown events
      socketManager.sendConferenceEvent(conferenceName, {
        event: event,
        conferenceSid,
        conferenceName,
        callSid: participantId,
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

    const formData = await request.formData();
    
    // Identify callback type
    const conferenceEvent = formData.get('StatusCallbackEvent');
    const conferenceSid = formData.get('ConferenceSid');
    const conferenceName = formData.get('FriendlyName');
    const dialCallStatus = formData.get('DialCallStatus');
    const dialCallSid = formData.get('DialCallSid');
    const callSid = formData.get('CallSid');
    const callStatus = formData.get('CallStatus');
    
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
    const answeredBy = formData.get('AnsweredBy');
    
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
    
    // Derive conference name from agentId
    const agentId = agentIdFromUrl ? parseInt(agentIdFromUrl, 10) : null;
    const derivedConferenceName = agentId ? `call-${agentId}` : null;
    
    // Determine UI status
    // - Show "ringing" until customer answers (has AnswerTime or status is explicitly 'answered')
    // - Show "in-progress" when customer has actually answered
    let uiStatus = effectiveStatus;
    if (effectiveStatus === 'answered' || (effectiveStatus === 'in-progress' && answerTime)) {
      uiStatus = 'in-progress';
    } else if (effectiveStatus === 'in-progress' && !answerTime) {
      // Early media - customer phone ringing but not answered
      uiStatus = 'ringing';
    } else if (effectiveStatus === 'initiated' || effectiveStatus === 'queued') {
      uiStatus = 'queued';
    }
    
    console.log('📞 [CALL STATUS]', {
      callSid: effectiveCallSid?.substring(0, 15) + '...',
      status: effectiveStatus,
      uiStatus,
      direction,
      conferenceName: derivedConferenceName
    });
    
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
      saleId: saleIdFromUrl || null
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
        
        console.log('💾 [CALL END] Call log updated:', { callSid: effectiveCallSid, status: finalStatus });
        
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
          console.log('💾 [CALL END] New call log created:', effectiveCallSid);
        } catch (dbErr) {
          console.error('❌ Failed to create call log:', dbErr.message);
        }
      }
      
      // Update agent status
      await updateAgentStatus(agentId, effectiveStatus, duration, effectiveCallSid);
      
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
      
      // Update agent status for in-progress
      if (effectiveStatus === 'in-progress') {
        await updateAgentStatus(agentId, effectiveStatus, null, effectiveCallSid);
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
