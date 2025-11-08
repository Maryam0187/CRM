import { NextResponse } from 'next/server';
import { User } from '../../../../models';
import { requireJWTAuth } from '../../../../lib/jwtAuth';
const socketManager = require('../../../../lib/socket');

/**
 * Update user's location
 * PUT /api/users/location
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
    const { latitude, longitude, accuracy } = await request.json();

    // Validate location data
    if (!latitude || !longitude || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return NextResponse.json(
        { error: 'Valid latitude and longitude are required' },
        { status: 400 }
      );
    }

    // Validate latitude and longitude ranges
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return NextResponse.json(
        { error: 'Invalid latitude or longitude values' },
        { status: 400 }
      );
    }

    const updateTime = new Date();

    // Update user's location
    await User.update(
      {
        latitude,
        longitude,
        locationAccuracy: accuracy || null,
        locationTimestamp: updateTime
      },
      { where: { id: userId } }
    );

    // Get updated user data
    const user = await User.findByPk(userId, {
      attributes: ['id', 'latitude', 'longitude', 'locationAccuracy', 'locationTimestamp']
    });

    // Broadcast location change via socket
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

    return NextResponse.json({
      success: true,
      message: 'Location updated successfully',
      location: {
        latitude: user.latitude,
        longitude: user.longitude,
        accuracy: user.locationAccuracy,
        timestamp: user.locationTimestamp
      }
    });

  } catch (error) {
    console.error('Error updating location:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

