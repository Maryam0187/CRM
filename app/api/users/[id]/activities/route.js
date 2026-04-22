import { NextResponse } from 'next/server';
import { requireJWTAdmin } from '../../../../../lib/jwtAuth';
import { UserActivityLog, Sequelize } from '../../../../../models';
import { getUtcBoundsForLocalDateRange, getUserLocalTodayDateString, parseTimezoneOffsetMinutes } from '../../../../../lib/dateFilterTimezone';
const UserTimeTracker = require('../../../../../lib/userTimeTracker');

const { Op } = Sequelize;

/**
 * Get user activities and time logs (Admin only)
 * GET /api/users/[id]/activities?limit=50&offset=0&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
export async function GET(request, { params }) {
  try {
    // Check authentication and admin access
    const authResult = await requireJWTAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const userId = parseInt(params.id);
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit')) || 50;
    const offset = parseInt(searchParams.get('offset')) || 0;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const tzOffsetMinutes = parseTimezoneOffsetMinutes(searchParams.get('tzOffset'));

    // Build where clause for activities (optionally filter by date range)
    const activitiesWhere = { userId };
    if (startDate && endDate) {
      const bounds = getUtcBoundsForLocalDateRange(startDate, endDate, tzOffsetMinutes);
      activitiesWhere.created_at = {
        [Op.between]: [bounds.startDate, bounds.endDate]
      };
    }

    // Get total count of activity logs
    const totalActivities = await UserActivityLog.count({
      where: activitiesWhere
    });

    // Get activity logs with pagination
    const activityLogs = await UserActivityLog.findAll({
      where: activitiesWhere,
      order: [['created_at', 'DESC']],
      limit,
      offset,
      include: [{
        association: 'user',
        attributes: ['id', 'firstName', 'lastName', 'email']
      }]
    });

    // Get time logs if date range provided
    // Apply pagination to time logs as well
    const timeLogLimit = parseInt(searchParams.get('timeLogLimit')) || 30;
    const timeLogOffset = parseInt(searchParams.get('timeLogOffset')) || 0;
    
    let timeLogs = [];
    let totalTimeLogs = 0;
    
    if (startDate && endDate) {
      // Generate all dates in the range
      const start = new Date(startDate);
      const end = new Date(endDate);
      const dates = [];
      
      // Create array of all dates in range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0]);
      }
      
      // Recalculate logs for each date that has sessions
      // Only recalculate if sessions exist to avoid overwriting with 0
      for (const dateStr of dates) {
        // Check if sessions exist for this date before recalculating
        const { UserTimeSession } = require('../../../../../models');
        const sessionCount = await UserTimeSession.count({
          where: {
            userId,
            date: dateStr
          }
        });
        
        if (sessionCount > 0) {
          await UserTimeTracker.recalculateDailyLog(userId, dateStr);
        }
      }
      
      // Fetch updated logs
      const updatedLogs = await UserTimeTracker.getTimeLogsRange(userId, startDate, endDate);
      totalTimeLogs = updatedLogs.length;
      
      // Apply pagination
      timeLogs = updatedLogs.slice(timeLogOffset, timeLogOffset + timeLogLimit);
    } else {
      // Get today's time log (recalculated to include ongoing sessions)
      const todayStr = getUserLocalTodayDateString(tzOffsetMinutes);
      const today = new Date(`${todayStr}T00:00:00.000Z`);
      
      // Check if sessions exist before recalculating
      const { UserTimeSession } = require('../../../../../models');
      const sessionCount = await UserTimeSession.count({
        where: {
          userId,
          date: todayStr
        }
      });
      
      if (sessionCount > 0) {
        // Recalculate today's log to include ongoing sessions
        await UserTimeTracker.recalculateDailyLog(userId, todayStr);
      }
      
      // Fetch the log - getDailyTimeLog will handle recalculation if needed
      const todayLog = await UserTimeTracker.getDailyTimeLog(userId, today);
      
      // Ensure we have a log entry (even if empty)
      timeLogs = todayLog ? [todayLog] : [];
      totalTimeLogs = timeLogs.length;
    }

    // Format activity logs
    const formattedActivities = activityLogs.map(log => ({
      id: log.id,
      activityType: log.activityType,
      activityDescription: log.activityDescription,
      ipAddress: log.ipAddress,
      metadata: log.metadata,
      createdAt: log.created_at
    }));

    // Format time logs - ensure we access dataValues if Sequelize model instance
    const formattedTimeLogs = timeLogs.map(log => {
      // Handle Sequelize model instances (they have dataValues property)
      const logData = log.dataValues || log;
      
      // Get values from both camelCase and snake_case (database column names)
      const activeTimeSeconds = logData.activeTimeSeconds ?? logData.active_time_seconds ?? 0;
      const inactiveTimeSeconds = logData.inactiveTimeSeconds ?? logData.inactive_time_seconds ?? 0;
      const date = logData.date || (logData.date ? logData.date : null);
      const firstActiveTime = logData.firstActiveTime ?? logData.first_active_time ?? null;
      const lastActiveTime = logData.lastActiveTime ?? logData.last_active_time ?? null;
      const loginCount = logData.loginCount ?? logData.login_count ?? 0;
      
      return {
        date: date,
        activeTimeSeconds: Number(activeTimeSeconds),
        inactiveTimeSeconds: Number(inactiveTimeSeconds),
        activeTimeFormatted: UserTimeTracker.formatTime(Number(activeTimeSeconds)),
        inactiveTimeFormatted: UserTimeTracker.formatTime(Number(inactiveTimeSeconds)),
        firstActiveTime: firstActiveTime,
        lastActiveTime: lastActiveTime,
        loginCount: Number(loginCount)
      };
    });

    return NextResponse.json({
      success: true,
      userId,
      activities: formattedActivities,
      timeLogs: formattedTimeLogs,
      pagination: {
        activities: {
          total: totalActivities,
          limit,
          offset,
          hasMore: offset + limit < totalActivities
        },
        timeLogs: {
          total: totalTimeLogs,
          limit: timeLogLimit,
          offset: timeLogOffset,
          hasMore: timeLogOffset + timeLogLimit < totalTimeLogs
        }
      }
    });

  } catch (error) {
    console.error('Get user activities error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

