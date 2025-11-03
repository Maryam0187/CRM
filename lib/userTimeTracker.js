const { UserTimeSession, UserDailyTimeLog, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Service for tracking and calculating user active/inactive time
 * 
 * IMPORTANT: This service uses a single recalculation approach to avoid double-counting time.
 * All daily time logs are calculated from session records, not incremented incrementally.
 */
class UserTimeTracker {
  /**
   * Start a new time session (when user becomes active or inactive)
   * @param {number} userId - User ID
   * @param {string} status - Current status (online, offline, away)
   * @param {Date} startTime - Session start time (defaults to now)
   */
  static async startSession(userId, status, startTime = new Date()) {
    try {
      // IMPORTANT: End any ongoing sessions FIRST to accumulate their time
      // This ensures time is properly added to daily log before starting new session
      const endedCount = await this.endOngoingSessions(userId, startTime);
      if (endedCount > 0) {
        console.log(`✅ Ended ${endedCount} ongoing session(s) for user ${userId} before starting new session`);
      }

      // Determine session type
      const sessionType = status === 'online' ? 'active' : 'inactive';
      const date = new Date(startTime);
      date.setHours(0, 0, 0, 0); // Get date only

      // Create new session
      const session = await UserTimeSession.create({
        userId,
        status,
        sessionType,
        startTime,
        date: date.toISOString().split('T')[0], // YYYY-MM-DD format
        endTime: null,
        durationSeconds: null
      });

      console.log(`⏱️ Started ${sessionType} session for user ${userId} at ${startTime.toISOString()}`);
      return session;
    } catch (error) {
      console.error('UserTimeTracker: Failed to start session:', error);
      return null;
    }
  }

  /**
   * End ongoing sessions for a user
   * @param {number} userId - User ID
   * @param {Date} endTime - End time (defaults to now)
   */
  static async endOngoingSessions(userId, endTime = new Date()) {
    try {
      // Find all ongoing sessions (where end_time is null)
      const ongoingSessions = await UserTimeSession.findAll({
        where: {
          userId,
          endTime: null
        }
      });

      // Track dates that need recalculation
      const datesToRecalculate = new Set();

      // End each ongoing session
      for (const session of ongoingSessions) {
        // Handle Sequelize model instances
        const sessionData = session.dataValues || session;
        const sessionStart = sessionData.startTime || sessionData.start_time;
        const date = sessionData.date;
        const duration = Math.floor((new Date(endTime) - new Date(sessionStart)) / 1000); // Duration in seconds
        
        if (duration > 0) {
          await session.update({
            endTime,
            durationSeconds: duration
          });

          // Reload session to get updated values
          await session.reload();
          
          // Track this date for recalculation
          if (date) {
            datesToRecalculate.add(date);
          }
        }
      }

      // Recalculate daily logs for all affected dates to avoid double-counting
      for (const dateStr of datesToRecalculate) {
        await this.recalculateDailyLog(userId, dateStr);
      }

      return ongoingSessions.length;
    } catch (error) {
      console.error('UserTimeTracker: Failed to end sessions:', error);
      return 0;
    }
  }

  /**
   * Get daily time log for a user on a specific date
   * @param {number} userId - User ID
   * @param {Date|string} date - Date (Date object or YYYY-MM-DD string)
   */
  static async getDailyTimeLog(userId, date) {
    try {
      let dateStr;
      if (date instanceof Date) {
        dateStr = date.toISOString().split('T')[0];
      } else {
        dateStr = date;
      }

      let dailyLog = await UserDailyTimeLog.findOne({
        where: {
          userId,
          date: dateStr
        }
      });

      // Check for ongoing sessions that might need calculation
      const ongoingSessions = await UserTimeSession.findAll({
        where: {
          userId,
          date: dateStr,
          endTime: null
        }
      });

      // Only recalculate if there are ongoing sessions that haven't been counted
      if (ongoingSessions.length > 0) {
        if (!dailyLog) {
          // Create empty log first
          dailyLog = await UserDailyTimeLog.create({
            userId,
            date: dateStr,
            activeTimeSeconds: 0,
            inactiveTimeSeconds: 0,
            loginCount: 0
          });
        }
        // Recalculate to include ongoing sessions
        await this.recalculateDailyLog(userId, dateStr);
        dailyLog = await UserDailyTimeLog.findOne({
          where: { userId, date: dateStr }
        });
      }

      return dailyLog || {
        userId,
        date: dateStr,
        activeTimeSeconds: 0,
        inactiveTimeSeconds: 0,
        firstActiveTime: null,
        lastActiveTime: null,
        loginCount: 0
      };
    } catch (error) {
      console.error('UserTimeTracker: Failed to get daily time log:', error);
      return null;
    }
  }

  /**
   * Recalculate daily log from all sessions for a specific date
   * @param {number} userId - User ID
   * @param {string} dateStr - Date string (YYYY-MM-DD)
   */
  static async recalculateDailyLog(userId, dateStr) {
    try {
      const now = new Date();

      // Get all sessions for this date
      const sessions = await UserTimeSession.findAll({
        where: {
          userId,
          date: dateStr
        },
        order: [['startTime', 'ASC']]
      });

      // If no sessions exist, don't overwrite existing daily log
      if (!sessions || sessions.length === 0) {
        console.log(`No sessions found for user ${userId} on ${dateStr}, skipping recalculation`);
        return null;
      }

      let activeTime = 0;
      let inactiveTime = 0;
      let firstActiveTime = null;
      let lastActiveTime = null;

      // Get date boundaries for this date
      const dateStart = new Date(dateStr);
      dateStart.setHours(0, 0, 0, 0);
      const dateEnd = new Date(dateStr);
      dateEnd.setHours(23, 59, 59, 999);

      for (const session of sessions) {
        // Get session data (handle Sequelize model instances)
        const sessionData = session.dataValues || session;
        const sessionEnd = sessionData.endTime || sessionData.end_time || now;
        const sessionStart = sessionData.startTime || sessionData.start_time;
        const sessionType = sessionData.sessionType || sessionData.session_type;
        
        if (!sessionStart) {
          console.warn(`Session ${sessionData.id || 'unknown'} has no startTime, skipping`);
          continue;
        }
        
        // Calculate duration within this date only (cap at midnight if session crosses dates)
        const sessionStartDate = new Date(sessionStart);
        const sessionEndDate = new Date(sessionEnd);
        
        // Clamp session start and end to this date's boundaries
        const clampedStart = sessionStartDate < dateStart ? dateStart : sessionStartDate;
        const clampedEnd = sessionEndDate > dateEnd ? dateEnd : sessionEndDate;
        
        // Calculate duration in seconds
        const duration = Math.floor((clampedEnd - clampedStart) / 1000);
        
        // Only add positive durations (safety check)
        if (duration > 0) {
          if (sessionType === 'active') {
            activeTime += duration;
            const startTimeDate = new Date(sessionStart);
            if (!firstActiveTime || startTimeDate < new Date(firstActiveTime)) {
              firstActiveTime = sessionStart;
            }
            if (!lastActiveTime || startTimeDate > new Date(lastActiveTime)) {
              lastActiveTime = sessionStart;
            }
          } else if (sessionType === 'inactive') {
            inactiveTime += duration;
          } else {
            console.warn(`Session ${sessionData.id || 'unknown'} has unknown sessionType: ${sessionType}`);
          }
        } else {
          console.warn(`Session ${sessionData.id || 'unknown'} has invalid duration: ${duration}s (start: ${sessionStart}, end: ${sessionEnd})`);
        }
      }

      // Get existing daily log to preserve login count
      const existingLog = await UserDailyTimeLog.findOne({
        where: {
          userId,
          date: dateStr
        }
      });

      // Update or create daily log
      // Preserve login count if it exists
      const loginCountToPreserve = existingLog ? (existingLog.loginCount || existingLog.login_count || 0) : 0;
      
      const [dailyLog] = await UserDailyTimeLog.upsert({
        userId,
        date: dateStr,
        activeTimeSeconds: activeTime,
        inactiveTimeSeconds: inactiveTime,
        firstActiveTime,
        lastActiveTime,
        loginCount: loginCountToPreserve
      }, {
        returning: true
      });

      console.log(`✅ Recalculated daily log for user ${userId} on ${dateStr}: Active=${activeTime}s (${Math.floor(activeTime/60)}m), Inactive=${inactiveTime}s (${Math.floor(inactiveTime/60)}m), Sessions=${sessions.length}`);
      return dailyLog;
    } catch (error) {
      console.error('UserTimeTracker: Failed to recalculate daily log:', error);
      return null;
    }
  }

  /**
   * Get time logs for a date range
   * @param {number} userId - User ID
   * @param {Date|string} startDate - Start date
   * @param {Date|string} endDate - End date
   */
  static async getTimeLogsRange(userId, startDate, endDate) {
    try {
      let startStr, endStr;
      
      if (startDate instanceof Date) {
        startStr = startDate.toISOString().split('T')[0];
      } else {
        startStr = startDate;
      }

      if (endDate instanceof Date) {
        endStr = endDate.toISOString().split('T')[0];
      } else {
        endStr = endDate;
      }

      const logs = await UserDailyTimeLog.findAll({
        where: {
          userId,
          date: {
            [Op.between]: [startStr, endStr]
          }
        },
        order: [['date', 'DESC']]
      });

      return logs;
    } catch (error) {
      console.error('UserTimeTracker: Failed to get time logs range:', error);
      return [];
    }
  }

  /**
   * Format seconds to human-readable time string (e.g., "2h 30m")
   * @param {number} seconds - Total seconds
   */
  static formatTime(seconds) {
    if (!seconds || seconds === 0) return '0m';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const parts = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (secs > 0 && hours === 0) parts.push(`${secs}s`);

    return parts.join(' ') || '0m';
  }

  /**
   * Increment login count for a day
   * @param {number} userId - User ID
   * @param {Date|string} date - Date
   */
  static async incrementLoginCount(userId, date) {
    try {
      let dateStr;
      if (date instanceof Date) {
        dateStr = date.toISOString().split('T')[0];
      } else {
        dateStr = date;
      }

      // Find existing daily log
      let dailyLog = await UserDailyTimeLog.findOne({
        where: {
          userId,
          date: dateStr
        }
      });

      if (dailyLog) {
        // Increment login count on existing log (preserves active/inactive time)
        await dailyLog.increment('loginCount', { by: 1 });
        await dailyLog.reload();
      } else {
        // Create new daily log if it doesn't exist
        dailyLog = await UserDailyTimeLog.create({
          userId,
          date: dateStr,
          activeTimeSeconds: 0,
          inactiveTimeSeconds: 0,
          loginCount: 1
        });
      }

      return dailyLog;
    } catch (error) {
      console.error('UserTimeTracker: Failed to increment login count:', error);
      return null;
    }
  }
}

module.exports = UserTimeTracker;

