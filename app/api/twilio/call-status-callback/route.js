import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';

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
      timestamp: new Date().toISOString()
    });
    
    // Additional debugging for ringing status
    if (callStatus === 'ringing') {
      console.log('🔔 RINGING STATUS DETECTED - This should trigger the ringing state!');
    }

    // Find the call log by call SID
    const callLog = await sequelizeDb.CallLog.findOne({
      where: { callSid }
    });

    if (!callLog) {
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

    // Update call log with new status
    const updateData = {
      status: mappedStatus,
      duration: duration ? parseInt(duration) : null,
      twilioData: {
        ...callLog.twilioData,
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
      }
    };

    await callLog.update(updateData);

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
      socketManager.sendCallStatusToAgent(callLog.agentId, callSid, callStatusData);
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
