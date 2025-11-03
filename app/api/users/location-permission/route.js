import { NextResponse } from 'next/server';
import { User } from '../../../../models';
import { requireJWTAuth } from '../../../../lib/jwtAuth';
const socketManager = require('../../../../lib/socket');

/**
 * Update user's location permission status
 * PUT /api/users/location-permission
 */
export async function PUT(request) {
  try {
    // Authenticate user
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const userId = authResult.user.id;
    const { permission } = await request.json();

    // Validate permission value
    const validPermissions = ['granted', 'denied', 'prompt', 'not_set'];
    if (!validPermissions.includes(permission)) {
      return NextResponse.json(
        { error: 'Invalid permission status' },
        { status: 400 }
      );
    }

    // Get old permission for comparison
    const oldUser = await User.findByPk(userId, {
      attributes: ['id', 'locationPermission']
    });
    const oldPermission = oldUser?.locationPermission;

    // Update user's location permission
    await User.update(
      { locationPermission: permission },
      { where: { id: userId } }
    );

    // Broadcast permission change via socket if it actually changed
    if (oldPermission !== permission) {
      const io = socketManager.getIO();
      if (io) {
        io.emit('user_location_permission_changed', {
          userId,
          permission,
          timestamp: new Date().toISOString()
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Location permission updated successfully',
      permission
    });

  } catch (error) {
    console.error('Error updating location permission:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Get user's location permission status
 * GET /api/users/location-permission
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

    const userId = authResult.user.id;

    // Get user's location permission
    const user = await User.findByPk(userId, {
      attributes: ['id', 'locationPermission']
    });

    return NextResponse.json({
      success: true,
      permission: user?.locationPermission || 'not_set'
    });

  } catch (error) {
    console.error('Error getting location permission:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

