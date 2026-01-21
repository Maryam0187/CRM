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
// Helper: Handle conference callbacks
async function handleConferenceCallback(formData, conferenceSid, conferenceName, conferenceEvent, agentIdFromUrl) {
  const sequenceNumber = formData.get('SequenceNumber');
  const callSid = formData.get('CallSid');
  const participantCallSid = formData.get('ParticipantCallSid');
  const muted = formData.get('Muted');
  const hold = formData.get('Hold');
  const timestamp = formData.get('Timestamp');
  
  console.log('📞 Conference callback received:', {
    conferenceSid: conferenceSid?.substring(0, 15) + '...',
    conferenceName,
    conferenceEvent,
    sequenceNumber,
    callSid: callSid?.substring(0, 15) + '...',
    muted,
    hold,
    timestamp
  });
  
  // Normalize Twilio event names to our internal event names
  let normalizedEvent = conferenceEvent;
  if (conferenceEvent === 'conference-start') normalizedEvent = 'start';
  if (conferenceEvent === 'conference-end') normalizedEvent = 'end';
  if (conferenceEvent === 'participant-join') normalizedEvent = 'join';
  if (conferenceEvent === 'participant-leave') normalizedEvent = 'leave';
  
  switch (normalizedEvent) {
    case 'start':
      console.log('🎉 Conference started:', { conferenceName, conferenceSid: conferenceSid?.substring(0, 15) + '...' });
      if (conferenceName) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'start',
          conferenceSid,
          conferenceName,
          timestamp
        });
      }
      break;
      
    case 'end':
      console.log('🏁 Conference ended:', { conferenceName, conferenceSid: conferenceSid?.substring(0, 15) + '...' });
      if (conferenceName) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'end',
          conferenceSid,
          conferenceName,
          timestamp
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
        console.log('🔍 Checking participant join - available fields:', {
          callSid: callSid?.substring(0, 15) + '...',
          participantCallSid: participantCallSid?.substring(0, 15) + '...',
          from: formData.get('From') || 'NOT PROVIDED',
          to: formData.get('To') || 'NOT PROVIDED',
          conferenceName
        });
        
        const isCustomer = await isCustomerCallSid(callSid, formData, conferenceName);
        
        console.log('🔍 Customer identification result:', {
          callSid: callSid?.substring(0, 15) + '...',
          isCustomer,
          conferenceName
        });
        
        if (isCustomer) {
          try {
            // Try to find call log - if it doesn't exist yet (active call), get agentId from conference name
            let callLog = await sequelizeDb.CallLog.findOne({ 
              where: { callSid },
              order: [['created_at', 'DESC']]
            });
            
            // If no call log, try to get agentId from conference name (e.g., "call-1" -> agentId 1)
            let agentId = null;
            if (!callLog && conferenceName) {
              const match = conferenceName.match(/^call-(\d+)$/);
              if (match) {
                agentId = parseInt(match[1], 10);
                console.log('📞 No call log found, extracted agentId from conference name:', agentId);
              }
            } else if (callLog) {
              agentId = callLog.agentId;
            }
            
            // Also try agentIdFromUrl if available
            if (!agentId && agentIdFromUrl) {
              agentId = parseInt(agentIdFromUrl, 10);
            }
            
            if (agentId || callLog) {
              console.log('✅ Customer joined conference - updating status to in-progress:', {
                callSid: callSid.substring(0, 15) + '...',
                conferenceName,
                agentId: agentId || callLog?.agentId,
                hasCallLog: !!callLog
              });
              
              // Broadcast "in-progress" status when customer joins conference
              const statusData = {
                callSid,
                status: 'in-progress',
                conferenceName,
                agentId: agentId || callLog?.agentId || null,
                customerId: callLog?.customerId || null,
                saleId: callLog?.saleId || null,
                callPurpose: callLog?.callPurpose || null,
                duration: null,
                twilioData: {
                  callStatus: 'in-progress',
                  source: 'conference-join',
                  conferenceEvent: 'participant-join'
                }
              };
              
              if (agentId || callLog?.agentId) {
                socketManager.sendCallStatusToAgent(agentId || callLog.agentId, callSid, statusData);
              }
              socketManager.sendCallStatusUpdate(callSid, statusData);
              socketManager.sendCallStatusToSupervisors(callSid, statusData);
              socketManager.sendCallStatusToRoom(`call_${callSid}`, callSid, statusData);
            } else {
              console.warn('⚠️ Customer joined but cannot determine agentId:', {
                callSid: callSid.substring(0, 15) + '...',
                conferenceName,
                hasCallLog: !!callLog
              });
            }
          } catch (error) {
            console.error('Error checking call log for customer join:', error);
          }
        } else {
          console.log('👤 Agent joined conference (not customer):', {
            callSid: callSid?.substring(0, 15) + '...'
          });
        }
      }
      
      // Broadcast participant joined event
      if (conferenceName && callSid) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'join',
          conferenceSid,
          conferenceName,
          callSid,
          muted: muted === 'true',
          hold: hold === 'true',
          timestamp
        });
      }
      break;
      
    case 'leave':
      console.log('👋 Participant left conference:', { conferenceName, callSid: callSid?.substring(0, 15) + '...' });
      if (conferenceName && callSid) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'leave',
          conferenceSid,
          conferenceName,
          callSid,
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
      if (conferenceName && callSid) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'mute',
          conferenceSid,
          conferenceName,
          callSid,
          muted: muted === 'true',
          timestamp
        });
      }
      break;
      
    case 'hold':
      console.log('⏸️ Participant hold status changed:', {
        conferenceName,
        callSid: callSid?.substring(0, 15) + '...',
        hold: hold === 'true'
      });
      if (conferenceName && callSid) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'hold',
          conferenceSid,
          conferenceName,
          callSid,
          hold: hold === 'true',
          timestamp
        });
      }
      break;
      
    case 'speaker':
      console.log('🎤 Speaker changed:', { conferenceName, callSid: callSid?.substring(0, 15) + '...' });
      if (conferenceName && callSid) {
        socketManager.sendConferenceEvent(conferenceName, {
          event: 'speaker',
          conferenceSid,
          conferenceName,
          callSid,
          timestamp
        });
      }
      break;
      
    default:
      console.log('ℹ️ Unknown conference event (not normalized):', conferenceEvent);
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
async function isCustomerCallSid(callSid, formData = null) {
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
    // First, try to find call log
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
        return true;
      }
    }
    
    // If no call log, check if it's from an outbound call status callback
    // For outbound calls, the customer's callSid will be the main call leg
    // Agent joins later via browser, so if we see this callSid in a conference join,
    // and it's not a client: connection, it's likely the customer
    
    // Conference callbacks might not have From field, so check if callSid matches known customer patterns
    // Customer callSids come from phone calls (outbound-api direction)
    // Agent callSids come from browser (client: connections)
    
    // If we have formData, check the From field
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
          return true;
        }
      }
      
      // If From field is not provided or empty, and this is NOT a client: connection,
      // and we're in a conference, it's likely the customer (agent would have client: prefix)
      if (!fromField || fromField.trim() === '') {
        // No From field in conference callback - this happens sometimes
        // If callSid doesn't match agent patterns and we know the agent already joined,
        // this is likely the customer
        // But we can't be 100% sure, so we'll say it's NOT a customer for safety
        // Actually, let's check - if there's NO From field, it might be customer
        // because agent always has client: in their calls
        console.log('⚠️ No From field in conference callback - cannot definitively identify:', {
          callSid: callSid.substring(0, 15) + '...'
        });
        // For safety, assume NOT customer if we can't tell
        return false;
      }
    }
    
    // Default: not identified as customer
    console.log('❌ Could not identify as customer:', {
      callSid: callSid.substring(0, 15) + '...',
      hasCallLog: !!callLog,
      hasFormData: !!formData,
      from: formData?.get('From') || 'N/A'
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
    const isCallStatusCallback = !!callStatus && !!callSid;
    
    // ===== HANDLE CONFERENCE CALLBACKS =====
    if (isConferenceCallback) {
      return handleConferenceCallback(formData, conferenceSid, conferenceName, conferenceEvent, agentIdFromUrl);
    }
    
    // ===== HANDLE CALL STATUS CALLBACKS =====
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
    
    // Explicitly log original callback status for phone-number webhooks
    if (webhookSource === 'phone-number') {
      console.log(`📞 [PHONE-NUMBER] Original callback status: "${callStatus}"`, {
        callSid: callSid.substring(0, 15) + '...',
        originalTwilioStatus: callStatus,
        dialCallStatus: dialCallStatus || null,
        from,
        to,
        callbackSource,
        timestamp: new Date().toISOString()
      });
    }

    // Get existing call log (for reference, but won't save until call ends)
    const callLog = await sequelizeDb.CallLog.findOne({ where: { callSid } });
    
    // Log original callback status (for debugging)
    // NOTE: This is a separate webhook callback from Twilio for each status change
    console.log(`📊 [WEBHOOK CALLBACK] Received status: "${callStatus}"`, {
      callSid: callSid.substring(0, 15) + '...',
      webhookSource,
      callbackSource,
      answerTime: answerTime || null,
      answeredBy: answeredBy || null,
      duration: duration || 0
    });
    const agentId = await resolveAgentId(agentIdFromUrl, callLog, from, to);

    // Get conference name from call log or construct it
    // Note: conferenceName was already extracted for conference callbacks above,
    // but we need it from callLog for call status callbacks
    const callStatusConferenceName = callLog?.twilioData?.conferenceName || 
                                     (agentId ? `call-${agentId}` : null);
    
    // Track customer callSid for this conference (from phone-number callbacks)
    // This helps us identify customer when they join conference
    if (callStatusConferenceName && webhookSource === 'phone-number' && callSid) {
      customerCallSidMap.set(callStatusConferenceName, callSid);
      console.log('📌 Tracked customer callSid for conference:', {
        conferenceName: callStatusConferenceName,
        callSid: callSid.substring(0, 15) + '...'
      });
    }

    // Prepare status data for broadcasting (ONLY for phone call callbacks)
    // Note: We use conference callback to detect when customer joins conference
    // Keep "in-progress" from call-status-callback as "ringing" until customer actually joins conference
    let statusToSend = callStatus;
    
    // Filter "in-progress" - we'll get the real "in-progress" from conference callback when customer joins
    // Twilio sends "in-progress" when agent joins conference, even if customer hasn't answered
    if (callStatus === 'in-progress') {
      const hasAnswerTime = answerTime && answerTime.trim() !== '';
      const hasAnsweredBy = answeredBy && answeredBy.trim() !== '';
      const hasDuration = duration && parseInt(duration) > 0;
      
      // Only accept "in-progress" if we have strong evidence customer answered
      // Otherwise, keep as "ringing" - conference callback will send "in-progress" when customer joins
      if (!hasAnswerTime && !hasAnsweredBy && !hasDuration) {
        console.log('⚠️ Filtering "in-progress" - treating as "ringing" (will get in-progress from conference callback when customer joins)', {
          callSid: callSid.substring(0, 15) + '...',
          answerTime,
          answeredBy,
          duration,
          reason: 'Conference callback will signal when customer actually joins conference'
        });
        statusToSend = 'ringing';
      }
    }
    
    const statusData = {
      callSid,
      status: statusToSend, // Send validated status
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
      conferenceName: callStatusConferenceName,
      webhookSource, // Include source for debugging
      twilioData: {
        callStatus, // Original Twilio status
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

    // Log status before broadcasting
    console.log(`📡 About to broadcast status:`, {
      callSid,
      status: callStatus, // Original Twilio status being sent
      agentId,
      webhookSource,
      willBroadcast: webhookSource === 'phone-number'
    });
    
    broadcastCallStatus(callSid, statusData, agentId, webhookSource);


    // Save to database ONLY when call ends (successfully or failed)
    const isCallEnded = CALL_END_STATUSES.includes(callStatus);
    
    // Clean up tracked customer callSid when call ends
    if (isCallEnded && callStatusConferenceName && customerCallSidMap.has(callStatusConferenceName)) {
      customerCallSidMap.delete(callStatusConferenceName);
      console.log('🧹 Cleaned up tracked customer callSid for conference:', callStatusConferenceName);
    }
    
    let finalCallLog = callLog;

    if (isCallEnded) {
      console.log('💾 Saving call log to database (call ended)');
      const twilioData = {
        callSid,
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
        parentCallSid,
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

    // Update agent status (during call and on call end)
    if (agentId) {
      await updateAgentStatus(agentId, callStatus, duration, callSid);
    }

    // Update related records for completed calls
    if (callStatus === 'completed' && duration && finalCallLog) {
      await updateRelatedRecords(finalCallLog, parseInt(duration));
    }

    // Cleanup call room after call ends (with 2 minute delay)
    if (isCallEnded) {
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
