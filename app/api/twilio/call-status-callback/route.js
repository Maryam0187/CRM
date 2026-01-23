import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';

// Constants
const CALL_END_STATUSES = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
const ERROR_STATUSES = ['failed', 'busy', 'no-answer', 'canceled'];

// In-memory store to track customer callSids from call-status callbacks
// Maps conferenceName -> customerCallSid
// This helps us identify customer when they join conference
const customerCallSidMap = new Map();
// Track agent leg CallSid per conference (learned from TwiML-App call-status callbacks)
// Maps conferenceName -> agentCallSid
const agentCallSidMap = new Map();
const agentNameCache = new Map(); // agentId -> "First Last"

async function resolveAgentDisplayName(agentId) {
  if (!agentId) return null;
  if (agentNameCache.has(agentId)) return agentNameCache.get(agentId);
  try {
    const agent = await sequelizeDb.User.findByPk(agentId, {
      attributes: ['id', 'firstName', 'lastName'],
    });
    const name = agent ? `${agent.firstName || ''} ${agent.lastName || ''}`.trim() : null;
    if (name) agentNameCache.set(agentId, name);
    return name || null;
  } catch {
    return null;
  }
}

function normalizeConferenceEventName(eventName) {
  if (!eventName) return { event: 'unknown', eventRaw: eventName };
  const raw = String(eventName);
  let e = raw.toLowerCase();

  // Common Twilio prefixes
  if (e.startsWith('conference-')) e = e.replace(/^conference-/, '');
  if (e.startsWith('participant-')) e = e.replace(/^participant-/, '');

  // Normalize separators
  e = e.replace(/\s+/g, '-');

  // Keep speech start/stop readable
  if (e === 'speech-start') return { event: 'speech_start', eventRaw: raw };
  if (e === 'speech-stop') return { event: 'speech_stop', eventRaw: raw };

  // Common participant events
  const mapped = {
    start: 'start',
    end: 'end',
    join: 'join',
    leave: 'leave',
    mute: 'mute',
    unmute: 'unmute',
    hold: 'hold',
    unhold: 'unhold',
    speaker: 'speaker',
  };

  if (mapped[e]) return { event: mapped[e], eventRaw: raw };
  return { event: e || 'unknown', eventRaw: raw };
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
  // OUTBOUND REFACTOR:
  // For browser-first Dial (<Dial><Number>), Dial callbacks may come from the TwiML App context.
  // We must broadcast Dial callbacks even if webhookSource is not phone-number.
  const shouldBroadcast = webhookSource === 'phone-number' || statusData?.callbackType === 'dial';
  if (!shouldBroadcast) return;
  
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
// Helper: Handle conference callbacks
async function handleConferenceCallback(formData, conferenceSid, conferenceName, conferenceEvent, agentIdFromUrl) {
  const sequenceNumber = formData.get('SequenceNumber');
  const callSid = formData.get('CallSid');
  const participantCallSid = formData.get('ParticipantCallSid');
  const muted = formData.get('Muted');
  const hold = formData.get('Hold');
  const timestamp = formData.get('Timestamp');
  
  // Log all available fields for debugging
  const fromField = formData.get('From') || 'NOT PROVIDED';
  const toField = formData.get('To') || 'NOT PROVIDED';
  const trackedCallSid = conferenceName && customerCallSidMap.has(conferenceName) 
    ? customerCallSidMap.get(conferenceName)?.substring(0, 15) + '...' 
    : 'NONE';
  
  console.log('📞 Conference callback received:', {
    conferenceSid: conferenceSid?.substring(0, 15) + '...',
    conferenceName,
    conferenceEvent,
    sequenceNumber,
    callSid: callSid?.substring(0, 15) + '...',
    participantCallSid: participantCallSid?.substring(0, 15) + '...' || 'NOT PROVIDED',
    from: fromField,
    to: toField,
    muted,
    hold,
    timestamp,
    trackedCustomerCallSid: trackedCallSid
  });
  
  const { event: normalizedEvent, eventRaw } = normalizeConferenceEventName(conferenceEvent);
  const participantId = participantCallSid || callSid; // stable key to avoid duplicates
  
  switch (normalizedEvent) {
    case 'start':
      console.log('🎉 Conference started:', { conferenceName, conferenceSid: conferenceSid?.substring(0, 15) + '...' });
      if (conferenceName) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'start',
          eventRaw,
          conferenceSid,
          conferenceName,
          timestamp
        });
        // Also send conference status
        socketManager.sendConferenceStatus(conferenceName, {
          status: 'in-progress', // Conference is active
          conferenceSid,
          participantsCount: 0, // Will be updated as participants join
          callSid: callSid || null
        });
      }
      break;
      
    case 'end':
      console.log('🏁 Conference ended:', { conferenceName, conferenceSid: conferenceSid?.substring(0, 15) + '...' });
      if (conferenceName) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'end',
          eventRaw,
          conferenceSid,
          conferenceName,
          timestamp
        });
        // Also send conference status
        socketManager.sendConferenceStatus(conferenceName, {
          status: 'completed', // Conference has ended
          conferenceSid,
          participantsCount: 0, // All participants have left
          callSid: callSid || null
        });
      }
      break;
      
    case 'join':
      console.log('👤 Participant joined conference:', {
        conferenceName,
        callSid: callSid?.substring(0, 15) + '...',
        muted,
        hold
      });
      
      // Check if this is a customer (phone call) joining the conference
      // If customer joins conference, that's when call becomes "in-progress"
      if (conferenceName && callSid) {
        // Log all available fields for debugging
        const fromField = formData.get('From') || 'NOT PROVIDED';
        const toField = formData.get('To') || 'NOT PROVIDED';
        const trackedCallSid = customerCallSidMap.has(conferenceName) 
          ? customerCallSidMap.get(conferenceName)?.substring(0, 15) + '...' 
          : 'NONE';
        
        console.log('🔍 Checking participant join - available fields:', {
          callSid: callSid?.substring(0, 15) + '...',
          participantCallSid: participantCallSid?.substring(0, 15) + '...' || 'NOT PROVIDED',
          from: fromField,
          to: toField,
          conferenceName,
          trackedCustomerCallSid: trackedCallSid
        });
        
        const isCustomer = await isCustomerCallSid(callSid, formData, conferenceName);
        
        console.log('🔍 Customer identification result:', {
          callSid: callSid?.substring(0, 15) + '...',
          isCustomer,
          conferenceName,
          matchesTracked: customerCallSidMap.has(conferenceName) && callSid === customerCallSidMap.get(conferenceName)
        });
        
        // Just log participant join - don't derive or modify call status
        // Conference callbacks are sent as conference events only, not as call status updates
        if (isCustomer) {
          console.log('👤 Customer joined conference:', {
            callSid: callSid?.substring(0, 15) + '...',
            conferenceName
          });
        } else {
          console.log('👤 Agent joined conference (not customer):', {
            callSid: callSid?.substring(0, 15) + '...'
          });
        }
      }
      
      // Determine participant role + display name (best effort)
      const rawFrom = formData.get('From') || formData.get('Caller') || '';
      const looksLikeAgent = rawFrom && String(rawFrom).startsWith('client:');
      const trackedCustomer = conferenceName && participantId && customerCallSidMap.get(conferenceName) === participantId;
      const trackedAgent = conferenceName && participantId && agentCallSidMap.get(conferenceName) === participantId;
      const participantRole = trackedAgent ? 'agent' : looksLikeAgent ? 'agent' : trackedCustomer ? 'customer' : 'customer';

      let derivedAgentId = null;
      if (agentIdFromUrl) derivedAgentId = parseInt(agentIdFromUrl, 10);
      if (!derivedAgentId && conferenceName && /^call-\d+$/.test(conferenceName)) {
        derivedAgentId = parseInt(conferenceName.split('-')[1], 10);
      }
      const participantName =
        participantRole === 'agent'
          ? (await resolveAgentDisplayName(derivedAgentId)) || (rawFrom ? String(rawFrom).replace(/^client:/, '') : 'Agent')
          : (rawFrom && isPhoneNumber(String(rawFrom)) ? String(rawFrom) : 'Customer');

      // Broadcast participant joined event
      if (conferenceName && participantId) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'join',
          eventRaw,
          conferenceSid,
          conferenceName,
          callSid: participantId,
          participantCallSid: participantCallSid || null,
          muted: muted === 'true',
          hold: hold === 'true',
          participantRole,
          participantName,
          timestamp
        });
        // Also send updated conference status (participant count increased)
        // Note: We don't have exact count here, but we can indicate a participant joined
        socketManager.sendConferenceStatus(conferenceName, {
          status: 'in-progress',
          conferenceSid,
          participantJoined: true,
          participantCallSid: callSid,
          callSid: callSid,
          timestamp
        });
      }
      break;
      
    case 'leave':
      console.log('👋 Participant left conference:', { conferenceName, callSid: callSid?.substring(0, 15) + '...' });
      if (conferenceName && participantId) {
        const rawFrom = formData.get('From') || formData.get('Caller') || '';
        const looksLikeAgent = rawFrom && String(rawFrom).startsWith('client:');
        const trackedCustomer = conferenceName && participantId && customerCallSidMap.get(conferenceName) === participantId;
        const trackedAgent = conferenceName && participantId && agentCallSidMap.get(conferenceName) === participantId;
        const participantRole = trackedAgent ? 'agent' : looksLikeAgent ? 'agent' : trackedCustomer ? 'customer' : 'customer';
        let derivedAgentId = null;
        if (agentIdFromUrl) derivedAgentId = parseInt(agentIdFromUrl, 10);
        if (!derivedAgentId && conferenceName && /^call-\d+$/.test(conferenceName)) {
          derivedAgentId = parseInt(conferenceName.split('-')[1], 10);
        }
        const participantName =
          participantRole === 'agent'
            ? (await resolveAgentDisplayName(derivedAgentId)) || (rawFrom ? String(rawFrom).replace(/^client:/, '') : 'Agent')
            : (rawFrom && isPhoneNumber(String(rawFrom)) ? String(rawFrom) : 'Customer');

        socketManager.sendConferenceEvent(conferenceName, {
          event: 'leave',
          eventRaw,
          conferenceSid,
          conferenceName,
          callSid: participantId,
          participantCallSid: participantCallSid || null,
          participantRole,
          participantName,
          timestamp
        });
        // Also send updated conference status (participant count decreased)
        socketManager.sendConferenceStatus(conferenceName, {
          status: 'in-progress',
          conferenceSid,
          participantLeft: true,
          participantCallSid: callSid,
          callSid: callSid,
          timestamp
        });
      }
      break;
      
    case 'mute':
      console.log('🔇 Participant mute status changed:', {
        conferenceName,
        callSid: callSid?.substring(0, 15) + '...',
        muted: muted === 'true'
      });
      if (conferenceName && participantId) {
        const rawFrom = formData.get('From') || formData.get('Caller') || '';
        const looksLikeAgent = rawFrom && String(rawFrom).startsWith('client:');
        const trackedCustomer = conferenceName && participantId && customerCallSidMap.get(conferenceName) === participantId;
        const trackedAgent = conferenceName && participantId && agentCallSidMap.get(conferenceName) === participantId;
        const participantRole = trackedAgent ? 'agent' : looksLikeAgent ? 'agent' : trackedCustomer ? 'customer' : 'customer';
        let derivedAgentId = null;
        if (agentIdFromUrl) derivedAgentId = parseInt(agentIdFromUrl, 10);
        if (!derivedAgentId && conferenceName && /^call-\d+$/.test(conferenceName)) {
          derivedAgentId = parseInt(conferenceName.split('-')[1], 10);
        }
        const participantName =
          participantRole === 'agent'
            ? (await resolveAgentDisplayName(derivedAgentId)) || (rawFrom ? String(rawFrom).replace(/^client:/, '') : 'Agent')
            : (rawFrom && isPhoneNumber(String(rawFrom)) ? String(rawFrom) : 'Customer');

        socketManager.sendConferenceEvent(conferenceName, {
          event: 'mute',
          eventRaw,
          conferenceSid,
          conferenceName,
          callSid: participantId,
          participantCallSid: participantCallSid || null,
          muted: muted === 'true',
          participantRole,
          participantName,
          timestamp
        });
      }
      break;
      
    case 'unmute':
      if (conferenceName && callSid) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'unmute',
          eventRaw,
          conferenceSid,
          conferenceName,
          callSid,
          muted: false,
          timestamp,
        });
      }
      break;
      
    case 'hold':
      console.log('⏸️ Participant hold status changed:', {
        conferenceName,
        callSid: callSid?.substring(0, 15) + '...',
        hold: hold === 'true'
      });
      if (conferenceName && participantId) {
        const rawFrom = formData.get('From') || formData.get('Caller') || '';
        const looksLikeAgent = rawFrom && String(rawFrom).startsWith('client:');
        const trackedCustomer = conferenceName && participantId && customerCallSidMap.get(conferenceName) === participantId;
        const trackedAgent = conferenceName && participantId && agentCallSidMap.get(conferenceName) === participantId;
        const participantRole = trackedAgent ? 'agent' : looksLikeAgent ? 'agent' : trackedCustomer ? 'customer' : 'customer';
        let derivedAgentId = null;
        if (agentIdFromUrl) derivedAgentId = parseInt(agentIdFromUrl, 10);
        if (!derivedAgentId && conferenceName && /^call-\d+$/.test(conferenceName)) {
          derivedAgentId = parseInt(conferenceName.split('-')[1], 10);
        }
        const participantName =
          participantRole === 'agent'
            ? (await resolveAgentDisplayName(derivedAgentId)) || (rawFrom ? String(rawFrom).replace(/^client:/, '') : 'Agent')
            : (rawFrom && isPhoneNumber(String(rawFrom)) ? String(rawFrom) : 'Customer');

        socketManager.sendConferenceEvent(conferenceName, {
          event: 'hold',
          eventRaw,
          conferenceSid,
          conferenceName,
          callSid: participantId,
          participantCallSid: participantCallSid || null,
          hold: hold === 'true',
          participantRole,
          participantName,
          timestamp
        });
      }
      break;
      
    case 'unhold':
      if (conferenceName && callSid) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'unhold',
          eventRaw,
          conferenceSid,
          conferenceName,
          callSid,
          hold: false,
          timestamp,
        });
      }
      break;
      
    case 'speech_start':
    case 'speech_stop':
      // Always forward speech events to UI for visibility/debugging
      if (conferenceName) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: normalizedEvent,
          eventRaw,
          conferenceSid,
          conferenceName,
          callSid: callSid || null,
          participantCallSid: participantCallSid || null,
          timestamp,
        });
      }
      break;
      
    case 'speaker':
      console.log('🎤 Speaker changed:', { conferenceName, callSid: callSid?.substring(0, 15) + '...' });
      if (conferenceName && callSid) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'speaker',
          eventRaw,
          conferenceSid,
          conferenceName,
          callSid,
          timestamp
        });
      }
      break;
      
    default:
      // Forward unknown/unhandled events so UI can still display them.
      if (conferenceName) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: normalizedEvent || 'unknown',
          eventRaw,
          conferenceSid,
          conferenceName,
          callSid: callSid || null,
          participantCallSid: participantCallSid || null,
          muted: muted === 'true' ? true : muted === 'false' ? false : null,
          hold: hold === 'true' ? true : hold === 'false' ? false : null,
          timestamp,
        });
      }
  }
  
  // Return empty TwiML response (conference callbacks don't need TwiML)
  return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' }
  });
}

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

// Helper: Check if callSid belongs to customer (phone call) vs agent (browser)
// We identify customer calls by:
// 1. Checking if call log exists and has phone numbers (not client:)
// 2. Checking active calls - if callSid matches an outbound call from status callbacks, it's customer
// 3. Agent calls have callSids that start with different patterns or are from client: connections
async function isCustomerCallSid(callSid, formData = null, conferenceName = null) {
  if (!callSid) return false;
  
  // Check if this is from a client: connection (definitely agent)
  const from = formData?.get('From') || '';
  if (from && from.startsWith('client:')) {
    console.log('❌ Identified as agent via client: prefix:', {
      callSid: callSid.substring(0, 15) + '...',
      from
    });
    return false; // This is definitely an agent
  }
  
  try {
    // FIRST CHECK (MOST RELIABLE): See if we've tracked this callSid as the customer from call-status callbacks
    if (conferenceName && customerCallSidMap.has(conferenceName)) {
      const trackedCustomerCallSid = customerCallSidMap.get(conferenceName);
      if (callSid === trackedCustomerCallSid) {
        console.log('✅ Identified as customer via tracked callSid from call-status callback:', {
          callSid: callSid.substring(0, 15) + '...',
          conferenceName
        });
        return true;
      } else {
        console.log('🔍 CallSid does NOT match tracked customer callSid:', {
          incomingCallSid: callSid.substring(0, 15) + '...',
          trackedCustomerCallSid: trackedCustomerCallSid?.substring(0, 15) + '...',
          conferenceName
        });
      }
    }
    
    // SECOND CHECK: Try to find call log
    const callLog = await sequelizeDb.CallLog.findOne({ 
      where: { callSid },
      order: [['created_at', 'DESC']]
    });
    
    // If call log exists and has phone numbers (not client:), it's the customer leg
    if (callLog && callLog.fromNumber && callLog.toNumber) {
      const isPhoneNumber = (num) => num && (num.startsWith('+') || /^\+?[1-9]\d{1,14}$/.test(num.replace(/[^\d+]/g, '')));
      const hasPhoneNumbers = isPhoneNumber(callLog.fromNumber) || isPhoneNumber(callLog.toNumber);
      if (hasPhoneNumbers) {
        console.log('✅ Identified as customer via call log:', {
          callSid: callSid.substring(0, 15) + '...',
          fromNumber: callLog.fromNumber?.substring(0, 10) + '...',
          toNumber: callLog.toNumber?.substring(0, 10) + '...'
        });
        // Store it for future reference
        if (conferenceName) {
          customerCallSidMap.set(conferenceName, callSid);
        }
        return true;
      }
    }
    
    // THIRD CHECK: If we have formData, check the From field
    if (formData) {
      const fromField = formData.get('From');
      // Customer calls have phone numbers, agent calls have client: prefix
      if (fromField && !fromField.startsWith('client:')) {
        // Check if it looks like a phone number
        const looksLikePhone = fromField && (fromField.startsWith('+') || /^\+?[1-9]\d{1,14}$/.test(fromField.replace(/[^\d+]/g, '')));
        if (looksLikePhone) {
          console.log('✅ Identified as customer via From field (phone number):', {
            callSid: callSid.substring(0, 15) + '...',
            from: fromField
          });
          // Store it for future reference
          if (conferenceName) {
            customerCallSidMap.set(conferenceName, callSid);
          }
          return true;
        }
      }
    }
    
    // FOURTH CHECK (FALLBACK): If From is empty but we have a tracked customer callSid for this conference,
    // and the callSid matches what we tracked, assume it's the customer
    // This handles cases where Twilio doesn't send From in conference callbacks
    if (conferenceName && customerCallSidMap.has(conferenceName)) {
      const trackedCustomerCallSid = customerCallSidMap.get(conferenceName);
      // If callSid matches and From is empty or not client:, it's likely the customer
      if (callSid === trackedCustomerCallSid && (!from || !from.startsWith('client:') || from === 'NOT PROVIDED')) {
        console.log('✅ Identified as customer via fallback (tracked callSid match, From empty/not client):', {
          callSid: callSid.substring(0, 15) + '...',
          conferenceName,
          from: from || 'EMPTY'
        });
        return true;
      }
    }
    
    // Default: not identified as customer
    console.log('❌ Could not identify as customer:', {
      callSid: callSid.substring(0, 15) + '...',
      hasCallLog: !!callLog,
      hasFormData: !!formData,
      from: formData?.get('From') || 'EMPTY',
      conferenceName: conferenceName || 'N/A',
      trackedCallSid: conferenceName ? (customerCallSidMap.get(conferenceName)?.substring(0, 15) + '...' || 'NONE') : 'N/A',
      participantCallSid: formData?.get('ParticipantCallSid')?.substring(0, 15) + '...' || 'N/A'
    });
    return false;
  } catch (error) {
    console.error('Error checking if customer callSid:', error);
    return false;
  }
}

// Main POST handler - Handles both Call Status Callbacks and Conference Callbacks
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
    
    // ===== IDENTIFY CALLBACK TYPE =====
    // Conference callbacks have StatusCallbackEvent and ConferenceSid
    const conferenceEvent = formData.get('StatusCallbackEvent');
    const conferenceSid = formData.get('ConferenceSid');
    const conferenceName = formData.get('FriendlyName');
    
    // Dial callbacks have DialCallSid and DialCallStatus
    const dialCallStatus = formData.get('DialCallStatus');
    const dialCallSid = formData.get('DialCallSid');
    
    // Regular call status callbacks have CallStatus and CallSid
    const callSid = formData.get('CallSid');
    const callStatus = formData.get('CallStatus');
    
    // Determine callback type
    const isConferenceCallback = !!conferenceEvent && !!conferenceSid;
    const isDialCallback = !!dialCallStatus && !!dialCallSid;
    // Some Dial status callbacks do NOT include CallStatus, so accept Dial callbacks too.
    const isCallStatusCallback = !!callSid && (!!callStatus || isDialCallback);
    
    // ===== HANDLE CONFERENCE CALLBACKS =====
    if (isConferenceCallback) {
      return handleConferenceCallback(formData, conferenceSid, conferenceName, conferenceEvent, agentIdFromUrl);
    }
    
    // ===== HANDLE CALL STATUS + DIAL CALLBACKS =====
    if (!isCallStatusCallback) {
      return NextResponse.json({ success: false, message: 'Invalid callback - missing required fields' }, { status: 400 });
    }
    
    // Clear conferenceName from conference callback scope to avoid conflicts
    // (We'll get it from callLog for call status callbacks)
    
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
    
    const callbackSource = isDialCallback ? 'dial-conference' : 'voice-api';
    
    // Identify if this is from TwiML App (agent browser) or Phone Number (customer call)
    const webhookSource = identifyCallbackSource(from, to);

    // Handle Dial verb callbacks (from <Dial> wrapping Conference)
    // Note: Both Voice API callbacks and Dial callbacks use the same endpoint
    // - Voice API: Direct call status updates (CallSid = customer leg)
    // - Dial: Dial operation status (CallSid = parent, DialCallSid = dialed call)
    // For conference calls, we care about the customer leg status, so we use CallSid
    // (Dial callback fields are still included in the broadcast payload; we just don't spam logs here.)

    // IMPORTANT:
    // For Dial callbacks, Twilio sends CallSid (parent leg executing <Dial>) and DialCallSid (dialed leg).
    // For UI we usually track the dialed leg (customer) so we must broadcast using DialCallSid, otherwise
    // the frontend may ignore updates because it is tracking the customer's CallSid.
    const effectiveCallSid = isDialCallback ? dialCallSid : callSid;

    // Skip non-customer leg callbacks (agent browser connections from TwiML App)
    // NOTE: For browser-first Dial, the "real customer status" arrives as Dial callbacks.
    // Those can come from a TwiML App context, so we always accept Dial callbacks.
    const isCustomer = isDialCallback || isCustomerLeg(from, to);
    if (!isCustomer) {
      // IMPORTANT: even though we don't broadcast agent leg call-status callbacks,
      // we still want to learn the agent CallSid so we can correctly identify the agent
      // in later conference callbacks (where `From` may be missing).
      try {
        const conf = String(to || '').trim();
        if (webhookSource === 'twiml-app' && conf && (conf.startsWith('call-') || conf.startsWith('inbound-')) && effectiveCallSid) {
          agentCallSidMap.set(conf, effectiveCallSid);
        }
      } catch (e) {
        // ignore
      }

      console.log(`⏭️ Skipping ${webhookSource} callback (agent browser connection):`, { 
        callSid: effectiveCallSid, 
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
    
    // NOTE: We don't fetch call log here because call logs are only saved when call ends.
    
    // Resolve agentId - callLog is null for active calls, so we only use it as a fallback
    const agentId = await resolveAgentId(agentIdFromUrl, null, from, to);

    // OUTBOUND ONLY:
    // Inbound callbacks are handled by `/api/twilio/inbound/call-status-callback`
    // so inbound changes do not affect outbound.
    let callStatusConferenceName = null;
    if (agentId) callStatusConferenceName = `call-${agentId}`;
    
    // Track customer callSid for this conference (from phone-number callbacks)
    // This helps us identify customer when they join conference
    if (callStatusConferenceName && webhookSource === 'phone-number' && effectiveCallSid) {
      customerCallSidMap.set(callStatusConferenceName, effectiveCallSid);
    }

    // UI STATUS (minimal derivation for UX):
    // Goal: show "ringing" until the customer answers, then "in-progress".
    // We keep `status` as the raw Twilio CallStatus, and provide `uiStatus` for frontend display/timer logic.
    let uiStatus = callStatus;

    if (isDialCallback && dialCallStatus) {
      // DialCallStatus is the most reliable "answered" signal when using <Dial>.
      if (dialCallStatus === 'answered') uiStatus = 'in-progress';
      else if (['initiated', 'ringing', 'queued'].includes(dialCallStatus)) uiStatus = 'ringing';
      else uiStatus = dialCallStatus; // busy/no-answer/failed/canceled/completed
    } else {
      if (callStatus === 'answered') uiStatus = 'in-progress';

      // Outbound: Twilio can send callStatus=in-progress early; keep ringing until answer evidence exists.
      if (direction !== 'inbound' && callStatus === 'in-progress') {
        const hasAnswerTime = !!(answerTime && String(answerTime).trim() !== '');
        const hasAnsweredBy = !!(answeredBy && String(answeredBy).trim() !== '');
        const hasDuration = !!(duration && parseInt(duration, 10) > 0);
        if (!hasAnswerTime && !hasAnsweredBy && !hasDuration) {
          uiStatus = 'ringing';
        }
      }

      // (Inbound UI status logic is handled by the inbound callback route)
    }

    const rawStatusToSend = callStatus || (isDialCallback ? dialCallStatus : null);

    const statusData = {
      callSid: effectiveCallSid,
      status: rawStatusToSend, // CallStatus if present, otherwise DialCallStatus
      uiStatus,
      duration: duration ? parseInt(duration) : null,
      direction,
      from,
      to,
      startTime,
      endTime,
      answerTime,
      hangupCause,
      agentId,
      customerId: customerIdFromUrl || null,
      saleId: saleIdFromUrl || null,
      callPurpose: callPurposeFromUrl || null,
      conferenceName: callStatusConferenceName,
      webhookSource, // Include source for debugging
      callbackType: isDialCallback ? 'dial' : 'call-status',
      dialCallSid: dialCallSid || null,
      dialCallStatus: dialCallStatus || null,
      twilioData: {
        callStatus: callStatus || null,
        dialCallSid: dialCallSid || null,
        dialCallStatus: dialCallStatus || null,
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
        parentCallSid: parentCallSid || (isDialCallback ? callSid : null)
      }
    };

    // Minimal server log: only callback statuses
    console.log('📞 [TWILIO CALLBACK]', {
      callbackType: isDialCallback ? 'dial' : 'call-status',
      webhookSource,
      callSid: effectiveCallSid,
      status: rawStatusToSend,
      dialCallStatus: dialCallStatus || null,
      uiStatus,
      direction
    });
    
    broadcastCallStatus(effectiveCallSid, statusData, agentId, webhookSource);


    // Save to database ONLY when call ends (successfully or failed)
    // For Dial callbacks, we don't persist (we persist on the real call-status stream).
    const endStatusForLifecycle = callStatus || (isDialCallback ? dialCallStatus : null);
    const isCallEnded = !!endStatusForLifecycle && CALL_END_STATUSES.includes(endStatusForLifecycle);
    
    // Clean up tracked customer callSid when call ends
    if (isCallEnded && callStatusConferenceName && customerCallSidMap.has(callStatusConferenceName)) {
      customerCallSidMap.delete(callStatusConferenceName);
      console.log('🧹 Cleaned up tracked customer callSid for conference:', callStatusConferenceName);
    }
    if (isCallEnded && callStatusConferenceName && agentCallSidMap.has(callStatusConferenceName)) {
      agentCallSidMap.delete(callStatusConferenceName);
      console.log('🧹 Cleaned up tracked agent callSid for conference:', callStatusConferenceName);
    }
    
    // Only fetch call log when call ends (to check if it exists for update vs create)
    let finalCallLog = null;
    
    // Only persist on real call-status callbacks (not Dial callbacks) to avoid saving parent-leg noise.
    if (isCallEnded && !isDialCallback) {
      // Fetch existing call log if it exists (might exist if call was saved earlier)
      finalCallLog = await sequelizeDb.CallLog.findOne({ where: { callSid: effectiveCallSid } });
      console.log('💾 Saving call log to database (call ended)', {
        callSid: effectiveCallSid.substring(0, 15) + '...',
        callStatus,
        hasExistingLog: !!finalCallLog
      });
      const twilioData = {
        callSid: effectiveCallSid,
        callStatus, // Original Twilio status
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
        parentCallSid: parentCallSid || (isDialCallback ? callSid : null),
        conferenceName: callStatusConferenceName,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      };

      // Handle voicemail status
      let finalStatus = callStatus;
      if (answeredBy === 'machine') {
        finalStatus = 'voicemail';
        twilioData.isVoicemail = true;
        twilioData.voicemailDetectedAt = new Date().toISOString();
      }

      finalCallLog = await saveCallLog(effectiveCallSid, {
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
      }, finalCallLog);

      // Handle special endings (voicemail, no-answer)
      await handleSpecialEndings(effectiveCallSid, answeredBy, callStatus);
    }

    // Update agent status (during call and on call end)
    if (agentId) {
      await updateAgentStatus(agentId, callStatus, duration, effectiveCallSid);
    }

    // Update related records for completed calls
    if (callStatus === 'completed' && duration && finalCallLog) {
      await updateRelatedRecords(finalCallLog, parseInt(duration));
    }

    // Cleanup call room after call ends (with 2 minute delay)
    if (isCallEnded) {
      setTimeout(() => {
        socketManager.cleanupCallRoom(effectiveCallSid);
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
