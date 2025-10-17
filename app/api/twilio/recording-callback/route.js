import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';

export async function POST(request) {
  try {
    const formData = await request.formData();
    
    // Extract recording data from Twilio webhook
    const callSid = formData.get('CallSid');
    const recordingUrl = formData.get('RecordingUrl');
    const recordingSid = formData.get('RecordingSid');
    const recordingDuration = formData.get('RecordingDuration');
    const recordingStatus = formData.get('RecordingStatus');
    const recordingChannels = formData.get('RecordingChannels');
    const recordingSource = formData.get('RecordingSource');
    
    // Extract transcription data
    const transcriptionText = formData.get('TranscriptionText');
    const transcriptionSid = formData.get('TranscriptionSid');
    const transcriptionStatus = formData.get('TranscriptionStatus');

    console.log('Recording callback received:', {
      callSid,
      recordingUrl,
      recordingSid,
      recordingDuration,
      recordingStatus,
      recordingChannels,
      recordingSource,
      transcriptionText,
      transcriptionSid,
      transcriptionStatus
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

    // Update call log with recording and transcription information
    const updateData = {
      recordingUrl,
      recordingSid,
      recordingDuration: recordingDuration ? parseInt(recordingDuration) : null,
      transcriptionText,
      transcriptionSid,
      twilioData: {
        ...callLog.twilioData,
        recording: {
          url: recordingUrl,
          sid: recordingSid,
          duration: recordingDuration,
          status: recordingStatus,
          channels: recordingChannels,
          source: recordingSource,
          createdAt: new Date().toISOString()
        },
        transcription: {
          text: transcriptionText,
          sid: transcriptionSid,
          status: transcriptionStatus,
          createdAt: new Date().toISOString()
        }
      }
    };

    await callLog.update(updateData);

    // Log the recording update
    console.log(`Recording updated for call ${callSid}: ${recordingUrl}`);

    // Return TwiML response for Twilio
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for your time. Have a great day!</Say>
</Response>`;

    return new NextResponse(twiml, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });

  } catch (error) {
    console.error('Error processing recording callback:', error);
    
    // Return empty TwiML response to avoid Twilio errors
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for your time. Have a great day!</Say>
</Response>`;

    return new NextResponse(twiml, {
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  }
}
