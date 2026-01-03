import { NextResponse } from 'next/server';
import { getClient } from '../../../../lib/twilio';
import { requireJWTAuth } from '../../../../lib/jwtAuth';

/**
 * Get conference participants and their status
 * GET /api/twilio/conference-participants?conferenceName=call-1
 * 
 * Participant status values:
 * - queued: Participant is queued to join
 * - connecting: Participant is connecting
 * - ringing: Participant's phone is ringing
 * - connected: Participant is connected to conference
 * - complete: Participant has left the conference
 * - failed: Participant connection failed
 */
export async function GET(request) {
  try {
    // Authenticate user
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    // Get conference name from query params
    const url = new URL(request.url);
    const conferenceName = url.searchParams.get('conferenceName');
    const conferenceSid = url.searchParams.get('conferenceSid');

    if (!conferenceName && !conferenceSid) {
      return NextResponse.json(
        { error: 'conferenceName or conferenceSid is required' },
        { status: 400 }
      );
    }

    const client = getClient();
    let conference;

    // Find conference by name or SID
    if (conferenceSid) {
      // Fetch by SID directly
      conference = await client.conferences(conferenceSid).fetch();
    } else {
      // Find conference by friendly name
      const conferences = await client.conferences.list({
        friendlyName: conferenceName,
        status: 'in-progress',
        limit: 1
      });
      
      if (conferences.length === 0) {
        return NextResponse.json({
          success: true,
          conferenceName,
          participants: [],
          message: 'Conference not found or not active'
        });
      }
      
      conference = conferences[0];
    }

    // Fetch all participants in the conference
    const participants = await client.conferences(conference.sid)
      .participants
      .list();

    // Format participant data
    const participantData = participants.map(participant => ({
      callSid: participant.callSid,
      callSidToCoach: participant.callSidToCoach,
      coaching: participant.coaching,
      conferenceSid: participant.conferenceSid,
      dateCreated: participant.dateCreated,
      dateUpdated: participant.dateUpdated,
      endConferenceOnExit: participant.endConferenceOnExit,
      hold: participant.hold,
      muted: participant.muted,
      startConferenceOnEnter: participant.startConferenceOnEnter,
      status: participant.status, // queued, connecting, ringing, connected, complete, failed
      uri: participant.uri,
      // Additional info from call
      callSidDetails: participant.callSid ? {
        // You can fetch call details if needed
        callSid: participant.callSid
      } : null
    }));

    return NextResponse.json({
      success: true,
      conference: {
        sid: conference.sid,
        friendlyName: conference.friendlyName,
        status: conference.status,
        dateCreated: conference.dateCreated,
        dateUpdated: conference.dateUpdated,
        accountSid: conference.accountSid,
        participantsCount: participantData.length
      },
      participants: participantData,
      count: participantData.length
    });

  } catch (error) {
    console.error('Error fetching conference participants:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch conference participants',
        message: error.message
      },
      { status: 500 }
    );
  }
}

/**
 * Get participant status by call SID
 * GET /api/twilio/conference-participants?callSid=CAxxxxx
 */
export async function POST(request) {
  try {
    // Authenticate user
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    const { callSid, conferenceSid } = body;

    if (!callSid && !conferenceSid) {
      return NextResponse.json(
        { error: 'callSid or conferenceSid is required' },
        { status: 400 }
      );
    }

    const client = getClient();

    if (callSid) {
      // Find participant by call SID
      // We need to search through conferences
      const conferences = await client.conferences.list({
        status: 'in-progress',
        limit: 20
      });

      for (const conference of conferences) {
        try {
          const participants = await client.conferences(conference.sid)
            .participants
            .list({ callSid });

          if (participants.length > 0) {
            const participant = participants[0];
            return NextResponse.json({
              success: true,
              participant: {
                callSid: participant.callSid,
                status: participant.status,
                muted: participant.muted,
                hold: participant.hold,
                conferenceSid: participant.conferenceSid,
                dateCreated: participant.dateCreated,
                dateUpdated: participant.dateUpdated
              },
              conference: {
                sid: conference.sid,
                friendlyName: conference.friendlyName,
                status: conference.status
              }
            });
          }
        } catch (err) {
          // Continue searching
          continue;
        }
      }

      return NextResponse.json({
        success: false,
        message: 'Participant not found in any active conference'
      }, { status: 404 });
    }

    // If conferenceSid provided, return all participants
    const participants = await client.conferences(conferenceSid)
      .participants
      .list();

    return NextResponse.json({
      success: true,
      participants: participants.map(p => ({
        callSid: p.callSid,
        status: p.status,
        muted: p.muted,
        hold: p.hold
      }))
    });

  } catch (error) {
    console.error('Error fetching participant status:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch participant status',
        message: error.message
      },
      { status: 500 }
    );
  }
}

