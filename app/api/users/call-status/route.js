import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../lib/jwtAuth';
import sequelizeDb from '../../../../lib/sequelize-db';
import socketManager from '../../../../lib/socket';

/**
 * Update agent call status
 * PUT /api/users/call-status
 * Body: { callStatus: 'available' | 'busy' }
 */
export async function PUT(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { callStatus } = await request.json();

    // Validate callStatus
    if (!callStatus || !['available', 'busy'].includes(callStatus)) {
      return NextResponse.json(
        { error: 'Invalid callStatus. Must be "available" or "busy"' },
        { status: 400 }
      );
    }

    const userId = authResult.user.id;

    // Find user
    const user = await sequelizeDb.User.findByPk(userId);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get old status for logging
    const oldCallStatus = user.callStatus || 'available';

    // Update call status
    await user.update({ callStatus });

    console.log(`✅ Agent ${userId} call status updated: ${oldCallStatus} → ${callStatus}`);

    // Broadcast status change via socket (including callStatus)
    socketManager.broadcastUserStatusChange(userId, user.status, callStatus);

    return NextResponse.json({
      success: true,
      message: `Call status updated to ${callStatus}`,
      callStatus: callStatus,
      oldCallStatus: oldCallStatus
    });

  } catch (error) {
    console.error('Update call status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Get agent call status
 * GET /api/users/call-status
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

    const userId = authResult.user.id;

    // Find user
    const user = await sequelizeDb.User.findByPk(userId, {
      attributes: ['id', 'callStatus']
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      callStatus: user.callStatus || 'available'
    });

  } catch (error) {
    console.error('Get call status error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

