import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../../lib/jwtAuth';
import sequelizeDb from '../../../../../lib/sequelize-db';
import jwt from 'jsonwebtoken';
import { isAdmin, isSupervisor } from '../../../../../lib/roleUtils';
import { SupervisorAgentService } from '../../../../../lib/sequelize-db';

const STREAM_TOKEN_EXPIRY_SEC = 5 * 60; // 5 minutes

/**
 * GET /api/calls/recording/stream-url?callLogId=1&index=0
 * Returns a short-lived URL that can be used in <audio src> to stream the recording.
 * Requires JWT. Agent can only get URL for their own calls; admin for any.
 */
export async function GET(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }
    const user = authResult.user;
    const userId = user.id;

    const { searchParams } = new URL(request.url);
    const callLogId = parseInt(searchParams.get('callLogId'), 10);
    const index = parseInt(searchParams.get('index'), 10);

    if (!callLogId || isNaN(callLogId) || isNaN(index) || index < 0) {
      return NextResponse.json(
        { error: 'callLogId and index (non-negative) are required' },
        { status: 400 }
      );
    }

    const callLog = await sequelizeDb.CallLog.findByPk(callLogId);
    if (!callLog) {
      return NextResponse.json(
        { error: 'Call log not found' },
        { status: 404 }
      );
    }

    const agentId = callLog.agentId;
    if (!isAdmin(user) && agentId !== userId) {
      if (isSupervisor(user)) {
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(userId);
        const supervisedAgentIds = supervisedAgents.map((a) => a.id);
        if (!supervisedAgentIds.includes(agentId)) {
          return NextResponse.json(
            { error: 'You can only access recordings for your own or your supervised agents\' calls' },
            { status: 403 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'You can only access recordings for your own calls' },
          { status: 403 }
        );
      }
    }

    const recordings = Array.isArray(callLog.recordings) ? callLog.recordings : [];
    const hasSingle = !!callLog.recordingUrl && recordings.length === 0;
    const recordingUrl = index < recordings.length
      ? recordings[index].recordingUrl
      : (hasSingle && index === 0 ? callLog.recordingUrl : null);

    if (!recordingUrl) {
      return NextResponse.json(
        { error: 'Recording not found for this call' },
        { status: 404 }
      );
    }

    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const token = jwt.sign(
      {
        callLogId,
        index,
        exp: Math.floor(Date.now() / 1000) + STREAM_TOKEN_EXPIRY_SEC
      },
      secret
    );

    const streamPath = `/api/calls/recording/stream?token=${encodeURIComponent(token)}`;
    return NextResponse.json({
      success: true,
      url: streamPath
    });
  } catch (error) {
    console.error('Recording stream-url error:', error);
    return NextResponse.json(
      { error: 'Failed to get recording stream URL' },
      { status: 500 }
    );
  }
}
