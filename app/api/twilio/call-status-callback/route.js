import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';

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
