import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';

// Handle GET requests (for Twilio webhook validation/health checks)
export async function GET(request) {
  return NextResponse.json(
    { 
      success: true, 
      message: 'Call status callback endpoint is active',
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    
    // Extract call data from Twilio webhook
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
    const answeredBy = formData.get('AnsweredBy'); // AMD result: 'human', 'machine', or 'unknown'

    console.log('📞 Call status callback received:', {
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
      timestamp: new Date().toISOString()
    });
    
    // Additional debugging for ringing status
    if (callStatus === 'ringing') {
      console.log('🔔 RINGING STATUS DETECTED - This should trigger the ringing state!');
    }
    
    // Additional debugging for completed status (when customer ends call)
    if (callStatus === 'completed') {
      console.log('✅ CALL COMPLETED STATUS DETECTED - Customer ended the call!');
      console.log('📞 Call completion details:', {
        callSid,
        duration,
        hangupCause,
        direction,
        endTime,
        timestamp: new Date().toISOString()
      });
    }

    // Find the call log by call SID
    const callLog = await sequelizeDb.CallLog.findOne({
      where: { callSid }
    });

    if (!callLog) {
      // This can happen for several reasons:
      // 1. Dial calls - Twilio creates child calls for <Dial> verbs, these have different SIDs
      // 2. Calls initiated outside the system (Twilio console, other systems)
      // 3. Race condition - callback arrived before call log was created (rare)
      // 4. Failed call log creation (should have been logged earlier)
      
      console.warn('⚠️ Call log not found for SID:', {
        callSid,
        callStatus,
        direction,
        from,
        to,
        hangupCause,
        message: 'This may be a Dial call, external call, or call log creation failed. Continuing without updating call log.'
      });
      
      // Return 200 OK to acknowledge receipt of webhook (Twilio requires successful response)
      // Log the warning but don't fail the webhook callback - this is expected for some cases
      return NextResponse.json(
        { 
          success: false, 
          message: 'Call log not found - webhook received but call not in system',
          note: 'This may be a Dial call or call initiated outside the system'
        },
        { status: 200 }
      );
    }

    // IMPORTANT: For outbound calls, only process status updates for the customer call
    // The direction should be 'outbound-api' for the customer call we created
    // Ignore callbacks from conference/Dial legs which might have different directions
    if (callLog.direction === 'outbound' && direction && !direction.includes('outbound')) {
      console.log('⚠️ Ignoring status callback - not from customer call leg:', {
        callSid,
        callStatus,
        direction,
        callLogDirection: callLog.direction,
        message: 'This callback is likely from a conference/Dial leg, not the customer call'
      });
      // Return 200 OK but don't process this callback
      return NextResponse.json({
        success: false,
        message: 'Callback ignored - not from customer call leg',
        note: 'This is likely a conference/Dial callback, not the customer call status'
      }, { status: 200 });
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
    
    let mappedStatus = statusMap[callStatus] || 'queued';

    // Prepare twilioData update - preserve existing data
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

    // Update call log with new status
    const updateData = {
      status: mappedStatus,
      duration: duration ? parseInt(duration) : null,
      twilioData: twilioDataUpdate,
      updatedAt: new Date()
    };

    // IMPORTANT: Update the call log BEFORE checking for active calls
    // This ensures the current call's status is updated before we count active calls
    try {
      await callLog.update(updateData);
      
      // Reload to verify the update succeeded
      await callLog.reload();
      
      console.log(`✅ Call log ${callLog.id} (CallSid: ${callSid}) updated: status = ${callLog.status}, direction = ${direction}`);
      
      // Verify the status was actually updated
      if (callLog.status !== mappedStatus) {
        console.error(`❌ WARNING: Call log status update may have failed! Expected: ${mappedStatus}, Got: ${callLog.status}`);
        // Force update the status
        await callLog.update({ status: mappedStatus });
        await callLog.reload();
        console.log(`✅ Force-updated call log ${callLog.id} status to: ${callLog.status}`);
      }
    } catch (updateError) {
      console.error(`❌ Error updating call log ${callLog.id}:`, updateError);
      throw updateError;
    }

    // Handle voicemail detection (AMD result) - after callLog is found and updated
    if (answeredBy === 'machine' && callLog) {
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
      
      // Update mappedStatus for socket events
      mappedStatus = 'voicemail';
      
      // Schedule auto-hangup after 30 seconds for voicemail
      // Use Twilio API to update the call and hang it up after 30 seconds
      const { getClient } = require('../../../../lib/twilio');
      const client = getClient();
      
      // Schedule hangup after 30 seconds (regardless of current call status)
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

    // Handle no-answer: disconnect call immediately
    if (callStatus === 'no-answer' && callLog) {
      console.log('📞 No-answer detected - disconnecting call immediately');
      
      const { getClient } = require('../../../../lib/twilio');
      const client = getClient();
      
      // Disconnect the call immediately
      try {
        await client.calls(callSid).update({
          status: 'completed'
        });
        console.log(`✅ No-answer call ${callSid} disconnected immediately`);
      } catch (err) {
        console.error(`❌ Error disconnecting no-answer call ${callSid}:`, err);
      }
    }

    // Update agent status based on call status
    if (callLog.agentId) {
      const agent = await sequelizeDb.User.findByPk(callLog.agentId);
      if (agent) {
        // Set agent to busy ONLY when they join the call (in-progress)
        if (callStatus === 'in-progress') {
          if (agent.callStatus !== 'busy') {
            await agent.update({ callStatus: 'busy' });
            console.log(`📞 Agent ${callLog.agentId} status set to 'busy' - call in progress (agent joined)`);
          }
        }
        // Reset agent status to available when call ends (if no other active calls)
        else if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(callStatus)) {
          // Verify that the call log was actually updated with the new status
          await callLog.reload();
          console.log(`✅ Verified call log ${callLog.id} status updated to: ${callLog.status}`);
          
          // Check if agent has other ACTIVE calls (only in-progress, not ringing)
          // Agent can handle multiple ringing calls, but only one in-progress call
          const activeInProgressCalls = await sequelizeDb.CallLog.count({
            where: {
              agentId: callLog.agentId,
              callSid: { [Op.ne]: callSid }, // Exclude current call that just ended
              status: 'in-progress' // Only count calls where agent is actually talking
            }
          });

          // Log for debugging if there are active calls
          if (activeInProgressCalls > 0) {
            console.log(`⚠️ Agent ${callLog.agentId} still has ${activeInProgressCalls} active in-progress call(s), keeping status as 'busy'`);
          }

          // Only set to available if no other in-progress calls
          if (activeInProgressCalls === 0) {
            await agent.update({ 
              callStatus: 'available',
              // Update total call time if call was completed
              ...(callStatus === 'completed' && duration ? {
                totalCallTime: (agent.totalCallTime || 0) + parseInt(duration)
              } : {})
            });
            console.log(`✅ Agent ${callLog.agentId} status reset to 'available' - call ended (no other in-progress calls)`);
          }
        }
        // Note: We don't change agent status for 'ringing' - agent stays available until they join
      }
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
    console.log(`📞 Call ${callSid} status updated to: ${callStatus} (mapped: ${mappedStatus})`);
    console.log(`📞 Call direction: ${direction}`);

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

    console.log('📞 Preparing to send call status update via socket:', {
      callSid,
      status: mappedStatus,
      direction,
      agentId: callLog.agentId,
      customerId: callLog.customerId
    });

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
      console.log('⚠️ No agentId found in call log, skipping agent-specific status update');
    }

    // Send to supervisors for monitoring
    socketManager.sendCallStatusToSupervisors(callSid, callStatusData);

    // Send to call-specific room for real-time monitoring
    socketManager.sendCallStatusToRoom(`call_${callSid}`, callSid, callStatusData);

    // Broadcast to all connected users for general call monitoring (IMPORTANT: This includes all users notified about inbound calls)
    console.log('📞 Broadcasting call status update to all connected users');
    const broadcastSuccess = socketManager.sendCallStatusUpdate(callSid, callStatusData);
    if (!broadcastSuccess) {
      console.error('❌ Failed to broadcast call status update - Socket.IO may not be initialized');
    } else {
      console.log('✅ Call status update broadcast successfully');
    }

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
