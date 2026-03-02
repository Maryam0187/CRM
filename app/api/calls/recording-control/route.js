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

    // Get conference SID - from CallLog first, then from Twilio API
    let conferenceSid = null;
    const callLog = await sequelizeDb.CallLog.findOne({
      where: { conferenceName },
      order: [['createdAt', 'DESC']]
    });
    if (callLog?.conferenceSid) {
      conferenceSid = callLog.conferenceSid;
    }

    if (!conferenceSid) {
      // Fallback: list in-progress conferences by friendly name
      const conferences = await client.conferences.list({
        friendlyName: conferenceName,
        status: 'in-progress',
        limit: 1
      });
      if (conferences.length > 0) {
        conferenceSid = conferences[0].sid;
        // Save to call log for future use
        if (callLog) {
          await callLog.update({ conferenceSid });
        }
      }
    }

    if (!conferenceSid) {
      return NextResponse.json(
        { success: false, message: 'Conference not found or not in progress' },
        { status: 404 }
      );
    }

    const recordingCallbackUrl = getWebhookUrl('/api/twilio/recording-callback');

    if (action === 'start') {
      const recording = await client
        .conferences(conferenceSid)
        .recordings.create({
          recordingStatusCallback: recordingCallbackUrl,
          recordingStatusCallbackEvent: ['in-progress', 'completed', 'absent'],
          playBeep: true
        });

      console.log('🎙️ Recording started:', { conferenceSid, recordingSid: recording.sid });

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
      .conferences(conferenceSid)
      .recordings(recordingSid)
      .update({ status: 'stopped' });

    console.log('🎙️ Recording stopped:', { conferenceSid, recordingSid });

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
