import { NextResponse } from 'next/server';
import { getClient, getWebhookUrl } from '../../../../lib/twilio';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import sequelizeDb from '../../../../lib/sequelize-db';

/**
 * Start or stop recording of an active conference call.
 * Uses Twilio's Conference Recordings API.
 */
export async function POST(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    const { action, conferenceName, recordingSid } = body;

    if (!action || !['start', 'stop'].includes(action)) {
      return NextResponse.json(
        { success: false, message: 'Action must be "start" or "stop"' },
        { status: 400 }
      );
    }

    if (!conferenceName) {
      return NextResponse.json(
        { success: false, message: 'Conference name is required' },
        { status: 400 }
      );
    }

    if (action === 'stop' && !recordingSid) {
      return NextResponse.json(
        { success: false, message: 'Recording SID is required to stop recording' },
        { status: 400 }
      );
    }

    const client = getClient();

    // Get call log and customer call SID (the customer's leg in the conference)
    const callLog = await sequelizeDb.CallLog.findOne({
      where: { conferenceName },
      order: [['created_at', 'DESC']]
    });

    const callSid = callLog?.customerCallSid || callLog?.callSid;
    if (!callSid) {
      return NextResponse.json(
        { success: false, message: 'Call not found or customer leg not yet established' },
        { status: 404 }
      );
    }

    const recordingCallbackUrl = getWebhookUrl('/api/twilio/recording-callback');

    // Use Call Recordings API (conference recordings.create not in Twilio Node SDK)
    // Recording the customer's call leg captures the full conference audio (both parties)
    if (action === 'start') {
      const recording = await client
        .calls(callSid)
        .recordings.create({
          recordingStatusCallback: recordingCallbackUrl,
          recordingStatusCallbackEvent: ['in-progress', 'completed', 'absent'],
          playBeep: true
        });

      console.log('🎙️ Recording started:', { callSid, recordingSid: recording.sid });

      return NextResponse.json({
        success: true,
        data: {
          recordingSid: recording.sid,
          status: recording.status
        },
        message: 'Recording started'
      });
    }

    // action === 'stop'
    await client
      .calls(callSid)
      .recordings(recordingSid)
      .update({ status: 'stopped' });

    console.log('🎙️ Recording stopped:', { callSid, recordingSid });

    return NextResponse.json({
      success: true,
      data: { recordingSid, status: 'stopped' },
      message: 'Recording stopped'
    });
  } catch (error) {
    console.error('❌ Recording control error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to control recording',
        error: error.message
      },
      { status: 500 }
    );
  }
}
