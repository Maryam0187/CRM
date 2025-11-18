import { NextResponse } from 'next/server';
import { User, UserSession } from '../../../../models';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
const UserActivityLogger = require('../../../../lib/userActivityLogger');
const UserTimeTracker = require('../../../../lib/userTimeTracker');

export async function POST(request) {
  try {
    // Get location and permission from request body if provided
    const { location, locationPermission } = await request.json().catch(() => ({}));
    
    console.log('🔍 Logout API - Received location data:', {
      hasLocation: !!location,
      locationPermission: locationPermission || 'not provided',
      latitude: location?.latitude,
      longitude: location?.longitude
    });
    
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    let decoded;
    
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      // If token is invalid or expired, still allow logout (graceful handling)
      console.log('Token verification failed during logout:', error.message);
      return NextResponse.json({
        success: true,
        message: 'Logged out successfully'
      });
    }

    // Update user status to offline and record logout time
    if (decoded.userId) {
      try {
        const user = await User.findByPk(decoded.userId);
        if (user) {
          const logoutTime = new Date();
          const oldStatus = user.status || 'online';
          
          // Check if there are any other active sessions for this user
          // If yes, don't set status to offline (user is still logged in elsewhere)
          const activeSessions = await UserSession.findAll({
            where: {
              userId: user.id,
              isActive: true,
              ...(decoded.sessionId ? {
                sessionId: {
                  [Op.ne]: decoded.sessionId // Exclude current session
                }
              } : {})
            }
          });
          
          // Prepare update data
          // Always update lastLogoutTime on logout (just like lastLoginTime is always updated on login)
          const updateData = {
            lastLogoutTime: logoutTime
          };
          
          // Only set status to offline if there are no other active sessions
          if (activeSessions.length === 0) {
            updateData.status = 'offline';
          } else {
            // User has other active sessions, keep status as is (should be 'online')
            console.log(`⚠️ User ${user.id} has ${activeSessions.length} other active session(s), not setting status to offline`);
          }
          
          console.log(`🕐 Updating logout time for user ${user.id}:`, {
            logoutTime: logoutTime.toISOString(),
            previousLastLogoutTime: user.lastLogoutTime ? new Date(user.lastLogoutTime).toISOString() : null
          });

          // Add location data if provided
          if (location && location.latitude && location.longitude) {
            updateData.latitude = location.latitude;
            updateData.longitude = location.longitude;
            updateData.locationAccuracy = location.accuracy || null;
            updateData.locationTimestamp = logoutTime;
            console.log('📍 Updating user location on logout:', {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy
            });
          }
          
          // Update location permission status if provided
          if (locationPermission && ['granted', 'denied', 'prompt', 'not_set'].includes(locationPermission)) {
            updateData.locationPermission = locationPermission;
            console.log('📍 Updating location permission on logout:', locationPermission);
          }
          
          await user.update(updateData);
          
          // Reload user to get updated values
          await user.reload();
          
          // Verify the update was successful
          console.log(`✅ Logout time updated successfully for user ${user.id}:`, {
            savedLastLogoutTime: user.lastLogoutTime ? new Date(user.lastLogoutTime).toISOString() : null,
            expectedLogoutTime: logoutTime.toISOString(),
            match: user.lastLogoutTime && new Date(user.lastLogoutTime).getTime() === logoutTime.getTime()
          });

          // Broadcast location change via socket if location was updated
          if (location && location.latitude && location.longitude) {
            const socketManager = require('../../../../lib/socket');
            const io = socketManager.getIO();
            if (io) {
              io.emit('user_location_changed', {
                userId: user.id,
                latitude: user.latitude,
                longitude: user.longitude,
                accuracy: user.locationAccuracy,
                locationTimestamp: user.locationTimestamp,
                timestamp: new Date().toISOString()
              });
              console.log('📍 Location change broadcasted via socket for user', user.id);
            }
          }
          
          console.log(`User ${decoded.userId} logged out at ${logoutTime}`);
          
          // Log logout activity
          const ipAddress = UserActivityLogger.getIpAddress(request);
          const userAgent = UserActivityLogger.getUserAgent(request);
          const logoutMetadata = location ? {
            location: {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy
            }
          } : null;
          await UserActivityLogger.logActivity({
            userId: user.id,
            activityType: 'logout',
            description: 'User logged out',
            ipAddress,
            userAgent,
            metadata: logoutMetadata
          });
          
          // Log status change if status actually changed to offline
          if (updateData.status === 'offline' && oldStatus !== 'offline') {
            await UserActivityLogger.logStatusChange(user.id, oldStatus, 'offline', ipAddress, userAgent);
          }

          // End active session and start inactive session
          await UserTimeTracker.endOngoingSessions(user.id, logoutTime);
          await UserTimeTracker.startSession(user.id, 'offline', logoutTime);

          // Invalidate user session
          if (decoded.sessionId) {
            try {
              const session = await UserSession.findOne({
                where: {
                  sessionId: decoded.sessionId,
                  userId: user.id,
                  isActive: true
                }
              });

              if (session) {
                await session.update({ isActive: false });
                console.log(`✅ Session ${decoded.sessionId} invalidated for user ${user.id}`);
              }
            } catch (sessionError) {
              console.error('Error invalidating session:', sessionError);
              // Don't fail logout if session invalidation fails
            }
          }
        }
      } catch (dbError) {
        // Log error but don't fail the logout request
        console.error('Error updating user logout status:', dbError);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });

  } catch (error) {
    console.error('Logout error:', error);
    // Even if there's an error, we should still allow logout
    return NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });
  }
}

