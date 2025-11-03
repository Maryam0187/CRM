import { NextResponse } from 'next/server';
import { User } from '../../../../models';
import jwt from 'jsonwebtoken';
const UserActivityLogger = require('../../../../lib/userActivityLogger');
const UserTimeTracker = require('../../../../lib/userTimeTracker');
const socketManager = require('../../../../lib/socket');

/**
 * Update user status
 * PUT /api/users/status
 * Body: { status: 'online' | 'offline' | 'away' }
 */
export async function PUT(request) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { status } = await request.json();

    // Validate status
    if (!status || !['online', 'offline', 'away'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be online, offline, or away' },
        { status: 400 }
      );
    }

    // Verify JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    let decoded;
    
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Find user
    const user = await User.findByPk(decoded.userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get old status for logging
    const oldStatus = user.status || 'offline';

    // Update status if it changed
    if (oldStatus !== status) {
      await user.update({ status });
      
      // Log status change activity
      const ipAddress = UserActivityLogger.getIpAddress(request);
      const userAgent = UserActivityLogger.getUserAgent(request);
      await UserActivityLogger.logStatusChange(user.id, oldStatus, status, ipAddress, userAgent);

      // Track time session changes
      const statusChangeTime = new Date();
      await UserTimeTracker.endOngoingSessions(user.id, statusChangeTime);
      await UserTimeTracker.startSession(user.id, status, statusChangeTime);

      // Broadcast status change via socket
      socketManager.broadcastUserStatusChange(user.id, status);

      return NextResponse.json({
        success: true,
        message: `Status updated to ${status}`,
        status: status,
        oldStatus: oldStatus
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Status unchanged',
      status: status
    });

  } catch (error) {
    console.error('Update status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get user status
 * GET /api/users/status
 */
export async function GET(request) {
  try {
    // Get authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Authorization token required' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // Verify JWT token
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    let decoded;
    
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    // Find user
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'status', 'lastLoginTime', 'lastLogoutTime']
    });
    
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      status: user.status,
      lastLoginTime: user.lastLoginTime,
      lastLogoutTime: user.lastLogoutTime
    });

  } catch (error) {
    console.error('Get status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

