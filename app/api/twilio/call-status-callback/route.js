import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Derive correct call status from Twilio data
 * Simplified: Trust Twilio's status directly - no complex checks to avoid delays
 */
function deriveCallStatus(callStatus, callDuration) {
  // Direct mapping - trust Twilio's status immediately
  switch (callStatus) {
    case 'ringing':
      return 'ringing';
      
    case 'answered':
    case 'in-progress':
      // Twilio sends 'answered' when customer picks up, which means call is in-progress
      // Trust Twilio immediately - if they say answered/in-progress, customer answered
      return 'in-progress';
      
    case 'no-answer':
      return 'no-answer';
      
    case 'completed':
      // If duration > 0, call was answered; otherwise no-answer
      return callDuration > 0 ? 'completed' : 'no-answer';
      
    case 'busy':
      return 'busy';
      
    case 'failed':
      return 'failed';
      
    case 'canceled':
      return 'canceled';
      
    case 'initiated':
    case 'queued':
      return 'queued';
      
    default:
      return 'queued';
  }
}

/**
 * Extract agentId from client call identifier (e.g., 'client:agent-1' -> 1)
 */
function extractAgentIdFromClientCall(clientIdentifier) {
  if (!clientIdentifier || typeof clientIdentifier !== 'string') {
    return null;
  }
  
  // Handle format: 'client:agent-1' or 'client:agent-123'
  const match = clientIdentifier.match(/client:agent-(\d+)/i);
  if (match && match[1]) {
    const agentId = parseInt(match[1], 10);
    return isNaN(agentId) ? null : agentId;
  }
  
  return null;
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
 * Find or create parent call log
 */
async function findOrCreateParentCall(parentCallSid, callData) {
  if (!parentCallSid) {
    return null;
  }
  
  let parentCallLog = await sequelizeDb.CallLog.findOne({
    where: { callSid: parentCallSid }
  });
  
  if (!parentCallLog) {
    // Try to find agentId from related calls if not provided
    let agentId = callData.agentId;
    if (!agentId) {
      agentId = await findAgentIdFromRelatedCalls(callData.from, callData.to);
    }
    
    // If still no agentId, we cannot create the call log (agentId is required)
    // In this case, we'll skip creating the parent call log and return null
    if (!agentId) {
      console.warn(`⚠️ Cannot create parent call log for ${parentCallSid}: agentId is required but not found`);
      return null;
    }
    
    parentCallLog = await sequelizeDb.CallLog.create({
      callSid: parentCallSid,
      customerId: callData.customerId || null,
      saleId: callData.saleId || null,
      agentId: agentId,
      direction: callData.direction || 'outbound',
      fromNumber: callData.from || 'unknown',
      toNumber: callData.to || 'unknown',
      status: 'queued',
      callPurpose: callData.callPurpose || 'follow_up',
      twilioData: {
        callSid: parentCallSid,
        isParentCall: true,
        createdAt: new Date().toISOString()
      }
    });
  }
  
  return parentCallLog;
}

/**
 * Find or create call log (handles both parent and child calls)
 */
async function findOrCreateCallLog(callSid, parentCallLog, callData) {
  let callLog = await sequelizeDb.CallLog.findOne({
    where: { callSid }
  });
  
  if (!callLog) {
    // Determine if this is a client call
    const isClientCall = callData.from && callData.from.startsWith('client:');
    
    // Try to find agentId from multiple sources (prioritize callData.agentId which comes from URL)
    let agentId = callData.agentId || parentCallLog?.agentId;
    
    console.log('🔍 Finding agentId for call:', {
      callSid,
      isClientCall,
      agentIdFromCallData: callData.agentId,
      agentIdFromParent: parentCallLog?.agentId,
      currentAgentId: agentId
    });
    
    // For client calls, try to extract agentId from the client identifier
    if (!agentId && isClientCall) {
      const extractedAgentId = extractAgentIdFromClientCall(callData.from);
      if (extractedAgentId) {
        // Verify the agent exists in the database
        try {
          const agent = await sequelizeDb.User.findByPk(extractedAgentId);
          if (agent) {
            agentId = extractedAgentId;
            console.log(`✅ Extracted agentId ${agentId} from client call identifier: ${callData.from}`);
          } else {
            console.warn(`⚠️ Extracted agentId ${extractedAgentId} from client call but agent not found in database`);
          }
        } catch (error) {
          console.error('Error verifying extracted agentId:', error);
        }
      }
      
      // If extraction didn't work, look for very recent calls (within last 5 minutes)
      // Client calls happen shortly after parent calls
      if (!agentId) {
        try {
          const recentCall = await sequelizeDb.CallLog.findOne({
            where: {
              agentId: { [Op.ne]: null },
              createdAt: {
                [Op.gte]: new Date(Date.now() - 300000) // Last 5 minutes
              },
              status: {
                [Op.in]: ['queued', 'ringing', 'in-progress']
              }
            },
            order: [['created_at', 'DESC']],
            limit: 1
          });
          
          if (recentCall) {
            agentId = recentCall.agentId;
            console.log(`✅ Found agentId ${agentId} from recent active call for client call ${callSid}`);
          }
        } catch (error) {
          console.error('Error finding recent call for client call agentId:', error);
        }
      }
    }
    
    // If still no agentId, try to find from related calls by phone numbers
    if (!agentId) {
      agentId = await findAgentIdFromRelatedCalls(
        callData.from || parentCallLog?.fromNumber,
        callData.to || parentCallLog?.toNumber
      );
    }
    
    // If still no agentId, try one more thing: look for any call log with matching numbers
    if (!agentId) {
      const fromNum = callData.from || parentCallLog?.fromNumber;
      const toNum = callData.to || parentCallLog?.toNumber;
      
      // Only search if we have valid phone numbers (not client calls)
      if (fromNum && toNum && 
          !fromNum.startsWith('client:') && 
          fromNum !== 'unknown' && toNum !== 'unknown') {
        try {
          const recentCall = await sequelizeDb.CallLog.findOne({
            where: {
              [Op.and]: [
                {
                  [Op.or]: [
                    { fromNumber: fromNum },
                    { toNumber: toNum }
                  ]
                },
                { agentId: { [Op.ne]: null } },
                {
                  createdAt: {
                    [Op.gte]: new Date(Date.now() - 60000) // Last minute
                  }
                }
              ]
            },
            order: [['created_at', 'DESC']],
            limit: 1
          });
          
          agentId = recentCall?.agentId || null;
        } catch (error) {
          console.error('Error finding recent call for agentId:', error);
          agentId = null;
        }
      }
    }
    
    // If we still don't have an agentId, we cannot proceed
    // This should not happen for normal calls, but we need to handle it gracefully
    if (!agentId) {
      console.error(`❌ Cannot create call log for ${callSid}: agentId is required but not found`, {
        from: callData.from || parentCallLog?.fromNumber,
        to: callData.to || parentCallLog?.toNumber,
        parentCallSid: parentCallLog?.callSid
      });
      throw new Error(`Cannot create call log: agentId is required for call ${callSid}`);
    }
    
    callLog = await sequelizeDb.CallLog.create({
      callSid,
      customerId: parentCallLog?.customerId || callData.customerId || null,
      saleId: parentCallLog?.saleId || callData.saleId || null,
      agentId: agentId,
      direction: callData.direction || parentCallLog?.direction || 'outbound',
      fromNumber: callData.from || parentCallLog?.fromNumber || 'unknown',
      toNumber: callData.to || parentCallLog?.toNumber || 'unknown',
      status: 'queued',
      callPurpose: parentCallLog?.callPurpose || callData.callPurpose || 'follow_up',
      twilioData: {
        callSid,
        parentCallSid: parentCallLog?.callSid || null,
        isChildCall: !!parentCallLog,
        isClientCall: isClientCall,
        isParentCall: !parentCallLog && !isClientCall,
        createdAt: new Date().toISOString()
      }
    });
  } else {
    // Update parentCallSid in twilioData if not set
    const twilioData = callLog.twilioData || {};
    const updates = {};
    
    if (!twilioData.parentCallSid && parentCallLog) {
      updates.twilioData = {
        ...twilioData,
        parentCallSid: parentCallLog.callSid,
        isChildCall: true
      };
    }
    
    // If call log exists but doesn't have agentId, try to set it from callData or parent
    if (!callLog.agentId && (callData.agentId || parentCallLog?.agentId)) {
      updates.agentId = callData.agentId || parentCallLog.agentId;
      console.log(`✅ Updating existing call log ${callSid} with agentId: ${updates.agentId}`);
    }
    
    if (Object.keys(updates).length > 0) {
      await callLog.update(updates);
    }
  }
  
  return callLog;
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
    // Extract agentId from URL query parameters (passed when call is initiated)
    const url = new URL(request.url);
    const agentIdFromUrl = url.searchParams.get('agentId');
    
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
    
    // Find or create parent call log if parentCallSid exists
    let parentCallLog = null;
    if (parentCallSid && parentCallSid !== callSid) {
      parentCallLog = await findOrCreateParentCall(parentCallSid, {
        from,
        to,
        direction,
        customerId: null,
        saleId: null,
        agentId: agentIdFromUrl || null
      });
    }
    
    // Find or create call log (saves ALL calls including client calls and child calls)
    // Use agentId from URL if available (for parent calls), otherwise extract from client identifier
    let callLog;
    try {
      callLog = await findOrCreateCallLog(callSid, parentCallLog, {
        from,
        to,
        direction,
        customerId: null,
        saleId: null,
        agentId: agentIdFromUrl || null
      });
    } catch (error) {
      // If call log creation fails, try to set agent back to available
      if (agentIdFromUrl) {
        await setAgentAvailableOnError(agentIdFromUrl);
      }
      throw error;
    }
    
    // Derive correct status - simplified to trust Twilio immediately
    const callDuration = duration ? parseInt(duration) : 0;
    const derivedStatus = deriveCallStatus(callStatus, callDuration);
    
    console.log('📞 Status derivation:', {
      twilioStatus: callStatus,
      derivedStatus,
      duration: callDuration
    });
    
    // BROADCAST STATUS IMMEDIATELY - before ANY database operations to minimize delay
    // This ensures frontend gets status updates as fast as possible
    const isClientCall = from && from.startsWith('client:');
    
    // Get agentId from URL or from callLog if available
    let agentIdForBroadcast = agentIdFromUrl ? parseInt(agentIdFromUrl, 10) : null;
    if (!agentIdForBroadcast && callLog && callLog.agentId) {
      agentIdForBroadcast = callLog.agentId;
    }
    
    if (!isClientCall) {
      // Broadcast immediately with available data - don't wait for database
      const immediateStatusData = {
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
        agentId: agentIdForBroadcast,
        customerId: callLog?.customerId || null,
        saleId: callLog?.saleId || null,
        callPurpose: callLog?.callPurpose || null,
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
          answeredBy
        }
      };
      
      // Broadcast immediately - this happens BEFORE database updates
      if (agentIdForBroadcast) {
        socketManager.sendCallStatusToAgent(agentIdForBroadcast, callSid, immediateStatusData);
      }
      socketManager.sendCallStatusUpdate(callSid, immediateStatusData);
      console.log('⚡ Status broadcasted IMMEDIATELY:', {
        callSid,
        status: derivedStatus,
        agentId: agentIdForBroadcast,
        twilioStatus: callStatus
      });
    }
    
    // Prepare update data
    const existingTwilioData = callLog.twilioData || {};
    const twilioDataUpdate = {
      ...existingTwilioData,
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
      parentCallSid: parentCallSid || existingTwilioData.parentCallSid,
      lastUpdated: new Date().toISOString()
    };
    
    // Broadcast full status update after getting callLog (for complete data)
    const isChildCall = existingTwilioData.isChildCall || twilioDataUpdate.isChildCall;
    
    if (!isClientCall && !isChildCall) {
      const callStatusData = {
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
        customerId: callLog.customerId,
        saleId: callLog.saleId,
        agentId: callLog.agentId,
        callPurpose: callLog.callPurpose,
        parentCallSid: parentCallSid || existingTwilioData.parentCallSid,
        twilioData: twilioDataUpdate
      };
      
      // Broadcast full status update (with complete data from database)
      broadcastStatusUpdate(callSid, callStatusData, callLog);
    }
    
    const updateData = {
      status: derivedStatus,
      duration: duration ? parseInt(duration) : null,
      twilioData: twilioDataUpdate,
      updatedAt: new Date()
    };
    
    // Update call log (after broadcasting to avoid delays)
    await callLog.update(updateData);
    await callLog.reload();
    
    if (callLog.status !== derivedStatus) {
      await callLog.update({ status: derivedStatus });
      await callLog.reload();
    }
    
    // Handle special cases
    if (answeredBy === 'machine' && callLog) {
      await callLog.update({
        status: 'voicemail',
        twilioData: {
          ...twilioDataUpdate,
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
    
    // Update agent status (only for non-client calls with agentId)
    // Note: isClientCall already declared above
    if (!isClientCall && callLog.agentId) {
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
    if (endStatuses.includes(derivedStatus) && callLog.agentId && !isClientCall) {
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
    if (callStatus === 'completed' && duration && duration > 0 && !isClientCall) {
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
