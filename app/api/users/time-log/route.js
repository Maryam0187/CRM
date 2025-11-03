import { NextResponse } from 'next/server';
import { User } from '../../../../models';
import { requireJWTAdmin } from '../../../../lib/jwtAuth';
const UserTimeTracker = require('../../../../lib/userTimeTracker');

/**
 * Get daily time log for a user (Admin only)
 * GET /api/users/time-log?userId=123&date=YYYY-MM-DD
 * - userId: optional, defaults to current user (but admin can view any user)
 * - date: optional, defaults to today
 */
export async function GET(request) {
  try {
    // Check authentication and admin access
    const authResult = await requireJWTAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const userIdParam = searchParams.get('userId');
    const dateParam = searchParams.get('date');

    // Get target user ID (admin can view any user, default to their own)
    const targetUserId = userIdParam ? parseInt(userIdParam) : authResult.user.id;

    // Validate user exists if viewing another user
    if (targetUserId !== authResult.user.id) {
      const targetUser = await User.findByPk(targetUserId);
      if (!targetUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
    }

    // Get date (default to today)
    const date = dateParam ? new Date(dateParam) : new Date();
    const timeLog = await UserTimeTracker.getDailyTimeLog(targetUserId, date);

    if (!timeLog) {
      return NextResponse.json(
        { error: 'Failed to retrieve time log' },
        { status: 500 }
      );
    }

    // Format times for response
    return NextResponse.json({
      success: true,
      userId: targetUserId,
      date: timeLog.date,
      activeTimeSeconds: timeLog.activeTimeSeconds || 0,
      inactiveTimeSeconds: timeLog.inactiveTimeSeconds || 0,
      activeTimeFormatted: UserTimeTracker.formatTime(timeLog.activeTimeSeconds || 0),
      inactiveTimeFormatted: UserTimeTracker.formatTime(timeLog.inactiveTimeSeconds || 0),
      firstActiveTime: timeLog.firstActiveTime,
      lastActiveTime: timeLog.lastActiveTime,
      loginCount: timeLog.loginCount || 0
    });

  } catch (error) {
    console.error('Get time log error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get time logs for a date range (Admin only)
 * POST /api/users/time-log
 * Body: { userId?: number, startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
 * - userId: optional, defaults to current user (but admin can view any user)
 */
export async function POST(request) {
  try {
    // Check authentication and admin access
    const authResult = await requireJWTAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { userId, startDate, endDate } = await request.json();

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Get target user ID (admin can view any user, default to their own)
    const targetUserId = userId ? parseInt(userId) : authResult.user.id;

    // Validate user exists if viewing another user
    if (targetUserId !== authResult.user.id) {
      const targetUser = await User.findByPk(targetUserId);
      if (!targetUser) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }
    }

    const timeLogs = await UserTimeTracker.getTimeLogsRange(targetUserId, startDate, endDate);

    // Format times for response
    const formattedLogs = timeLogs.map(log => ({
      date: log.date,
      activeTimeSeconds: log.activeTimeSeconds || 0,
      inactiveTimeSeconds: log.inactiveTimeSeconds || 0,
      activeTimeFormatted: UserTimeTracker.formatTime(log.activeTimeSeconds || 0),
      inactiveTimeFormatted: UserTimeTracker.formatTime(log.inactiveTimeSeconds || 0),
      firstActiveTime: log.firstActiveTime,
      lastActiveTime: log.lastActiveTime,
      loginCount: log.loginCount || 0
    }));

    return NextResponse.json({
      success: true,
      userId: targetUserId,
      logs: formattedLogs
    });

  } catch (error) {
    console.error('Get time logs range error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

