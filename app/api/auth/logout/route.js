import { NextResponse } from 'next/server';
import { User } from '../../../../models';
import jwt from 'jsonwebtoken';
const UserActivityLogger = require('../../../../lib/userActivityLogger');
const UserTimeTracker = require('../../../../lib/userTimeTracker');

export async function POST(request) {
  try {
    // Get location from request body if provided
    const { location } = await request.json().catch(() => ({}));
    
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
          
          // Prepare update data
          const shouldUpdateLogout = !user.lastLoginTime || logoutTime >= new Date(user.lastLoginTime);
          const updateData = {
            status: 'offline',
            lastLogoutTime: shouldUpdateLogout ? logoutTime : user.lastLogoutTime
          };

          // Add location data if provided
          if (location && location.latitude && location.longitude) {
            updateData.latitude = location.latitude;
            updateData.longitude = location.longitude;
            updateData.locationAccuracy = location.accuracy || null;
            updateData.locationTimestamp = logoutTime;
          }
          
          await user.update(updateData);
          
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
          
          // Log status change if status changed
          if (oldStatus !== 'offline') {
            await UserActivityLogger.logStatusChange(user.id, oldStatus, 'offline', ipAddress, userAgent);
          }

          // End active session and start inactive session
          await UserTimeTracker.endOngoingSessions(user.id, logoutTime);
          await UserTimeTracker.startSession(user.id, 'offline', logoutTime);
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

