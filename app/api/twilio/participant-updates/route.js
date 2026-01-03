import { NextResponse } from 'next/server';
import { getClient } from '../../../../lib/twilio';
import { requireJWTAuth } from '../../../../lib/jwtAuth';
import socketManager from '../../../../lib/socket';
import { getConferenceParticipants } from '../../../../lib/twilio';

/**
 * Poll participant status and send real-time updates via Socket.IO
 * GET /api/twilio/participant-updates?conferenceName=call-1&callSid=CAxxxxx&agentId=1
 * 
 * This endpoint can be polled periodically to get latest participant status
 * and automatically broadcasts updates via Socket.IO
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

    // Get parameters
    const url = new URL(request.url);
    const conferenceName = url.searchParams.get('conferenceName');
    const callSid = url.searchParams.get('callSid');
    const agentId = url.searchParams.get('agentId');

    if (!conferenceName && !callSid) {
      return NextResponse.json(
        { error: 'conferenceName or callSid is required' },
        { status: 400 }
      );
    }

    // Get conference name from callSid if needed
    let finalConferenceName = conferenceName;
    if (!finalConferenceName && callSid && agentId) {
      finalConferenceName = `call-${agentId}`;
    }

    if (!finalConferenceName) {
      return NextResponse.json(
        { error: 'Could not determine conference name' },
        { status: 400 }
      );
    }

    // Fetch current participant status
    const participants = await getConferenceParticipants(finalConferenceName);
    
    const participantData = participants.map(p => ({
      callSid: p.callSid,
      status: p.status, // queued, connecting, ringing, connected, complete, failed
      muted: p.muted,
      hold: p.hold
    }));

    // Send real-time update via Socket.IO
    if (callSid) {
      socketManager.sendParticipantUpdate(
        callSid,
        finalConferenceName,
        participantData,
        agentId ? parseInt(agentId, 10) : null
      );
    }

    return NextResponse.json({
      success: true,
      conferenceName: finalConferenceName,
      callSid,
      participants: participantData,
      count: participantData.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error fetching participant updates:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch participant updates',
        message: error.message
      },
      { status: 500 }
    );
  }
}

