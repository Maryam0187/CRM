import { NextResponse } from 'next/server';
import { User, UserSession } from '../../../../../../models/index';
import { requireJWTAdmin } from '../../../../../../lib/jwtAuth';
const socketManager = require('../../../../../../lib/socket');

export async function POST(request, { params }) {
  try {
    // Verify admin authentication
    const authResult = await requireJWTAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { userId } = params;
    const { reason } = await request.json().catch(() => ({}));

    // Find user
    const targetUser = await User.findByPk(userId);
    if (!targetUser) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Find all active sessions for this user
    const activeSessions = await UserSession.findAll({
      where: {
        userId: targetUser.id,
        isActive: true
      }
    });

    let loggedOutCount = 0;

    // Invalidate all active sessions and notify via Socket.IO
    for (const session of activeSessions) {
      // Mark session as inactive
      await session.update({ isActive: false });
      
      // Notify user via Socket.IO
      const notified = socketManager.forceLogoutUser(session.sessionId, 'admin_action', {
        message: 'You have been logged out by an administrator.',
        timestamp: new Date().toISOString()
      });

      if (notified) {
        loggedOutCount++;
      }
    }

    console.log(`🔐 Admin ${authResult.user.id} force logged out user ${userId}, ${loggedOutCount} session(s) terminated`);

    return NextResponse.json({
      success: true,
      message: `User has been logged out successfully. ${loggedOutCount} active session(s) terminated.`,
      userId: parseInt(userId),
      sessionsTerminated: loggedOutCount
    });

  } catch (error) {
    console.error('Admin force logout error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

