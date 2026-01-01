import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Derive correct call status from Twilio data
 */
function deriveCallStatus(callStatus, callDuration, answerTime, answeredBy, existingCallLog) {
  let derivedStatus = 'queued';
  
  switch (callStatus) {
    case 'ringing':
      derivedStatus = 'ringing';
      break;
      
    case 'in-progress':
      const existingTwilioData = existingCallLog?.twilioData || {};
      const existingAnswerTime = existingTwilioData.answerTime || null;
      const existingDuration = existingCallLog?.duration ? parseInt(existingCallLog.duration) : 0;
      const hasDuration = callDuration > 0 || existingDuration > 0;
      const hasAnswerTime = answerTime || existingAnswerTime;
      
      if (hasAnswerTime || answeredBy === 'human' || hasDuration) {
        derivedStatus = 'in-progress';
      } else {
        derivedStatus = 'ringing';
      }
      break;
      
    case 'no-answer':
      derivedStatus = 'no-answer';
      break;
      
    case 'completed':
      derivedStatus = callDuration > 0 ? 'completed' : 'no-answer';
      break;
      
    case 'busy':
      derivedStatus = 'busy';
      break;
      
    case 'failed':
      derivedStatus = 'failed';
      break;
      
    case 'canceled':
      derivedStatus = 'canceled';
      break;
      
    case 'initiated':
    case 'queued':
      derivedStatus = 'queued';
      break;
      
    default:
      derivedStatus = 'queued';
  }
  
  return derivedStatus;
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
    
    // Try to find agentId from multiple sources
    let agentId = parentCallLog?.agentId || callData.agentId;
    
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
    if (!twilioData.parentCallSid && parentCallLog) {
      await callLog.update({
        twilioData: {
          ...twilioData,
          parentCallSid: parentCallLog.callSid,
          isChildCall: true
        }
      });
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
  
  if (callStatus === 'in-progress' && agent.callStatus !== 'busy') {
    await agent.update({ callStatus: 'busy' });
  } else if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus)) {
    const activeCalls = await sequelizeDb.CallLog.count({
      where: {
        agentId: callLog.agentId,
        callSid: { [Op.ne]: callLog.callSid },
        status: 'in-progress'
      }
    });
    
    if (activeCalls === 0) {
      const updateData = { callStatus: 'available' };
      if (callStatus === 'completed' && duration) {
        updateData.totalCallTime = (agent.totalCallTime || 0) + parseInt(duration);
      }
      await agent.update(updateData);
    }
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
    const callLog = await findOrCreateCallLog(callSid, parentCallLog, {
      from,
      to,
      direction,
      customerId: null,
      saleId: null,
      agentId: agentIdFromUrl || null
    });
    
    // Derive correct status
    const callDuration = duration ? parseInt(duration) : 0;
    const derivedStatus = deriveCallStatus(
      callStatus,
      callDuration,
      answerTime,
      answeredBy,
      callLog
    );
    
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
    
    const updateData = {
      status: derivedStatus,
      duration: duration ? parseInt(duration) : null,
      twilioData: twilioDataUpdate,
      updatedAt: new Date()
    };
    
    // Update call log
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
    const isClientCall = from && from.startsWith('client:');
    if (!isClientCall && callLog.agentId) {
      await updateAgentStatus(callLog, callStatus, duration);
    }
    
    // Update related records (only for completed calls with duration)
    if (callStatus === 'completed' && duration && duration > 0 && !isClientCall) {
      await updateRelatedRecords(callLog, parseInt(duration));
    }
    
    // Prepare Socket.IO data (only broadcast for non-client calls and non-child calls)
    // Only broadcast status updates for the main customer call, not client calls or child calls
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
      
      // Broadcast status update
      broadcastStatusUpdate(callSid, callStatusData, callLog);
    }
    
    return NextResponse.json({
      success: true,
      message: 'Call status updated successfully'
    });
    
  } catch (error) {
    console.error('Error processing call status callback:', error);
    
    return NextResponse.json({
      success: false,
      message: 'Failed to process call status callback',
      error: error.message
    }, { status: 500 });
  }
}
