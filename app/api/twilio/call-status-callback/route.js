import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';

export async function POST(request) {
  try {
    const formData = await request.formData();
    
    // Extract call data from Twilio webhook
    const callSid = formData.get('CallSid');
    const parentCallSid = formData.get('ParentCallSid'); // Child call leg from <Dial>
    const callStatus = formData.get('CallStatus');
    const direction = formData.get('Direction');
    const from = formData.get('From');
    const to = formData.get('To');
    const duration = formData.get('CallDuration');
    const startTime = formData.get('StartTime');
    const endTime = formData.get('EndTime');
    const answerTime = formData.get('AnswerTime');
    const hangupCause = formData.get('HangupCause');
    const answeredBy = formData.get('AnsweredBy'); // AMD result: 'human', 'machine', or 'unknown'

    console.log('📞 Call status callback received:', {
      callSid,
      parentCallSid,
      callStatus,
      direction,
      from,
      to,
      duration,
      startTime,
      endTime,
      answerTime,
      hangupCause,
      answeredBy, // AMD result
      timestamp: new Date().toISOString()
    });
    
    // Additional debugging for ringing status
    if (callStatus === 'ringing') {
      console.log('🔔 RINGING STATUS DETECTED - This should trigger the ringing state!');
    }

    // Find the call log by call SID (try parent first if this is a child call)
    let callLog = await sequelizeDb.CallLog.findOne({
      where: { callSid }
    });

    // If not found and this is a child call (has ParentCallSid), find by parent
    if (!callLog && parentCallSid) {
      console.log(`📞 Child call leg detected (CallSid: ${callSid}, ParentCallSid: ${parentCallSid})`);
      callLog = await sequelizeDb.CallLog.findOne({
        where: { callSid: parentCallSid }
      });
      
      if (callLog) {
        console.log(`✅ Found parent call log for child leg: ${parentCallSid}`);
        // Update twilioData to include child call info
        const twilioData = callLog.twilioData || {};
        if (!twilioData.childCalls) {
          twilioData.childCalls = [];
        }
        // Store child call info for reference
        twilioData.childCalls.push({
          callSid,
          status: callStatus,
          from,
          to,
          duration,
          timestamp: new Date().toISOString()
        });
      }
    }

    // If still not found, this might be a child call leg we should ignore
    // (agent leg) - we only track the parent customer call
    if (!callLog) {
      // Check if this is a child leg - if so, ignore it
      if (to && to.startsWith('sip:') || from && from.startsWith('sip:')) {
        console.log(`ℹ️ Ignoring child leg callback (CallSid: ${callSid}) - only tracking parent call`);
        return NextResponse.json({
          success: true,
          message: 'Child call leg ignored - only tracking parent call'
        });
      }
      
      console.error('Call log not found for SID:', callSid);
      return NextResponse.json(
        { success: false, message: 'Call log not found' },
        { status: 404 }
      );
    }

    // Map Twilio status to database status
    const statusMap = {
      'initiated': 'queued',
      'queued': 'queued',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'busy',
      'failed': 'failed',
      'no-answer': 'no-answer',
      'canceled': 'canceled'
    };
    
    const mappedStatus = statusMap[callStatus] || 'queued';

    // Prepare twilioData update - preserve existing data including child calls
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
      lastUpdated: new Date().toISOString()
    };

    // If this is a child call, preserve child calls array
    if (parentCallSid && existingTwilioData.childCalls) {
      twilioDataUpdate.childCalls = existingTwilioData.childCalls;
    }

    // Update call log with new status
    // Note: For child calls (agent leg), we update the parent call log
    // but only update status if this is the parent call itself
    const updateData = {
      status: mappedStatus,
      duration: duration ? parseInt(duration) : null,
      twilioData: twilioDataUpdate
    };

    // Only update status if this is the parent call (customer leg)
    // Child calls (agent leg) don't change the main call status
    if (parentCallSid) {
      // This is a child call - don't update the main status, just log the child call info
      delete updateData.status;
      console.log(`ℹ️ Child call leg status update (not changing parent call status): ${callStatus}`);
    }

    await callLog.update(updateData);

    // Handle voicemail detection (AMD result) - after callLog is found and updated
    if (answeredBy === 'machine' && callLog && !parentCallSid) {
      console.log('📞 Voicemail detected via AMD - will auto-hangup after 30 seconds');
      
      // Update call log to mark as voicemail
      const existingTwilioData = callLog.twilioData || {};
      const twilioDataUpdate = {
        ...existingTwilioData,
        answeredBy: 'machine',
        isVoicemail: true,
        voicemailDetectedAt: new Date().toISOString()
      };
      
      await callLog.update({
        status: 'voicemail',
        twilioData: twilioDataUpdate
      });
      
      // Schedule auto-hangup after 30 seconds for voicemail
      // Use Twilio API to update the call and hang it up after 30 seconds
      if (callStatus === 'in-progress' || callStatus === 'answered') {
        const { getClient } = require('../../../../lib/twilio');
        const client = getClient();
        
        // Schedule hangup after 30 seconds
        setTimeout(async () => {
          try {
            await client.calls(callSid).update({
              status: 'completed'
            });
            console.log(`✅ Voicemail call ${callSid} auto-hung up after 30 seconds`);
          } catch (err) {
            console.error(`❌ Error auto-hanging up voicemail call ${callSid}:`, err);
          }
        }, 30000); // 30 seconds
      }
    }

    // Update agent status based on call status
    // IMPORTANT: Only update agent status for parent calls (customer leg), not child calls (agent leg)
    if (callLog.agentId && !parentCallSid) {
      const agent = await sequelizeDb.User.findByPk(callLog.agentId);
      if (agent) {
        // Reset agent status to available when call ends
        const endStatuses = ['completed', 'failed', 'busy', 'no-answer', 'canceled'];
        if (endStatuses.includes(callStatus)) {
          // Check if agent has other active calls
          const activeCalls = await sequelizeDb.CallLog.count({
            where: {
              agentId: callLog.agentId,
              callSid: { [Op.ne]: callSid }, // Exclude current call
              status: {
                [Op.in]: ['queued', 'ringing', 'in-progress']
              }
            }
          });

          // Only set to available if no other active calls
          if (activeCalls === 0) {
            await agent.update({ 
              callStatus: 'available',
              // Update total call time if call was completed
              ...(callStatus === 'completed' && duration ? {
                totalCallTime: (agent.totalCallTime || 0) + parseInt(duration)
              } : {})
            });
            console.log(`✅ Agent ${callLog.agentId} status reset to 'available' - call ended (no other active calls)`);
          } else {
            console.log(`⚠️ Agent ${callLog.agentId} still has ${activeCalls} active call(s), keeping status as 'busy'`);
          }
        } else if (callStatus === 'in-progress') {
          // Ensure agent is marked as busy when call is in progress
          if (agent.callStatus !== 'busy') {
            await agent.update({ callStatus: 'busy' });
            console.log(`📞 Agent ${callLog.agentId} status set to 'busy' - call in progress`);
          }
        } else if (callStatus === 'ringing') {
          // Mark agent as busy when call is ringing
          if (agent.callStatus !== 'busy') {
            await agent.update({ callStatus: 'busy' });
            console.log(`📞 Agent ${callLog.agentId} status set to 'busy' - call ringing`);
          }
        }
      }
    } else if (parentCallSid) {
      console.log(`ℹ️ Skipping agent status update - this is a child call leg, only parent call updates agent status`);
    }

    // If call is completed and has duration, update any related records
    if (callStatus === 'completed' && duration && duration > 0) {
      // You can add logic here to update customer or sale records
      // For example, mark a follow-up as completed, update last contact date, etc.
      
      if (callLog.customerId) {
        // Update customer last contact date
        await sequelizeDb.Customer.update(
          { updatedAt: new Date() },
          { where: { id: callLog.customerId } }
        );
      }

      if (callLog.saleId) {
        // Update sale record with call information
        await sequelizeDb.Sale.update(
          { 
            updatedAt: new Date(),
            // You could add a field like lastCallDate or callCount
          },
          { where: { id: callLog.saleId } }
        );
      }
    }

    // Log the status update
    console.log(`Call ${callSid} status updated to: ${callStatus}`);

    // Send Socket.IO notification for real-time updates
    const callStatusData = {
      callSid,
      status: mappedStatus,
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
      twilioData: updateData.twilioData
    };

    // Send to the specific agent who made the call
    if (callLog.agentId) {
      console.log('📞 Sending call status to agent:', {
        agentId: callLog.agentId,
        callSid,
        status: mappedStatus,
        customerId: callLog.customerId,
        saleId: callLog.saleId
      });
      socketManager.sendCallStatusToAgent(callLog.agentId, callSid, callStatusData);
    } else {
      console.log('❌ No agentId found in call log, cannot send status to agent');
    }

    // Send to supervisors for monitoring
    socketManager.sendCallStatusToSupervisors(callSid, callStatusData);

    // Send to call-specific room for real-time monitoring
    socketManager.sendCallStatusToRoom(`call_${callSid}`, callSid, callStatusData);

    // Broadcast to all connected users for general call monitoring
    socketManager.sendCallStatusUpdate(callSid, callStatusData);

    return NextResponse.json({
      success: true,
      message: 'Call status updated successfully'
    });

  } catch (error) {
    console.error('Error processing call status callback:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to process call status callback',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
