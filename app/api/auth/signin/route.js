import { NextResponse } from 'next/server';
import { User, SupervisorAgent } from '../../../../models';
import jwt from 'jsonwebtoken';
const UserActivityLogger = require('../../../../lib/userActivityLogger');
const UserTimeTracker = require('../../../../lib/userTimeTracker');

export async function POST(request) {
  try {
    const { email, password, location, locationPermission } = await request.json();
    
    console.log('🔍 SignIn API - Received location data:', {
      hasLocation: !!location,
      locationPermission: locationPermission || 'not provided',
      latitude: location?.latitude,
      longitude: location?.longitude
    });

    // Validate input
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Find user by email with supervisor/agent information based on role
    const user = await User.findOne({
      where: { email: email.toLowerCase() },
      include: [
        {
          model: SupervisorAgent,
          as: 'supervisorRelationships',
          include: [
            {
              model: User,
              as: 'supervisor',
              attributes: ['id', 'firstName', 'lastName', 'email']
            }
          ]
        },
        {
          model: SupervisorAgent,
          as: 'supervisedAgents',
          include: [
            {
              model: User,
              as: 'agent',
              attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'isActive']
            }
          ]
        }
      ]
    });

    const userDataValues = user?.dataValues ? user.dataValues : user;
  
    if (!userDataValues) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Check if user is active
    if (!userDataValues.isActive) {
      return NextResponse.json(
        { error: 'Account is deactivated. Please contact your manager.' },
        { status: 401 }
      );
    }

    // Compare password using bcrypt
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Update user status to online and record login time
    const loginTime = new Date();
    const oldStatus = user.status || 'offline';
    
    // Prepare update data
    // Always update lastLoginTime on login
    const updateData = {
      status: 'online',
      lastLoginTime: loginTime
    };
    
    console.log(`🕐 Updating login time for user ${user.id}:`, {
      loginTime: loginTime.toISOString(),
      previousLastLoginTime: user.lastLoginTime ? new Date(user.lastLoginTime).toISOString() : null
    });

    // Add location data if provided
    if (location && location.latitude && location.longitude) {
      updateData.latitude = location.latitude;
      updateData.longitude = location.longitude;
      updateData.locationAccuracy = location.accuracy || null;
      updateData.locationTimestamp = loginTime;
      console.log('📍 Updating user location:', {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy
      });
    }
    
    // Update location permission status if provided
    if (locationPermission && ['granted', 'denied', 'prompt', 'not_set'].includes(locationPermission)) {
      updateData.locationPermission = locationPermission;
      console.log('📍 Updating location permission:', locationPermission);
    }

    // Always update lastLoginTime on login - this is a new login event
    await user.update(updateData);

    // Refresh user data to get updated values
    await user.reload();
    
    // Verify the update was successful
    console.log(`✅ Login time updated successfully for user ${user.id}:`, {
      savedLastLoginTime: user.lastLoginTime ? new Date(user.lastLoginTime).toISOString() : null,
      expectedLoginTime: loginTime.toISOString(),
      match: user.lastLoginTime && new Date(user.lastLoginTime).getTime() === loginTime.getTime()
    });

    // Log login activity
    const ipAddress = UserActivityLogger.getIpAddress(request);
    const userAgent = UserActivityLogger.getUserAgent(request);
    const loginMetadata = location ? {
      location: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy
      }
    } : null;
    await UserActivityLogger.logActivity({
      userId: user.id,
      activityType: 'login',
      description: 'User logged in',
      ipAddress,
      userAgent,
      metadata: loginMetadata
    });
    
    // Log status change if status changed
    if (oldStatus !== 'online') {
      await UserActivityLogger.logStatusChange(user.id, oldStatus, 'online', ipAddress, userAgent);
    }

    // Start active time session and increment login count
    await UserTimeTracker.startSession(user.id, 'online', loginTime);
    await UserTimeTracker.incrementLoginCount(user.id, loginTime);

    // Get supervisor information if user is an agent
    let supervisorInfo = null;
    if (userDataValues.role === 'agent' && userDataValues.supervisorRelationships && userDataValues.supervisorRelationships.length > 0) {
      const supervisorRelation = userDataValues.supervisorRelationships[0];
      if (supervisorRelation && supervisorRelation.supervisor) {
        supervisorInfo = {
          id: supervisorRelation.supervisor.id,
          firstName: supervisorRelation.supervisor.firstName,
          lastName: supervisorRelation.supervisor.lastName,
          email: supervisorRelation.supervisor.email
        };
      }
    }

    // Get supervised agents if user is a supervisor
    let supervisedAgents = null;
    if (userDataValues.role === 'supervisor' && userDataValues.supervisedAgents && userDataValues.supervisedAgents.length > 0) {
      supervisedAgents = userDataValues.supervisedAgents.map(relation => ({
        id: relation.agent.id,
        firstName: relation.agent.firstName,
        lastName: relation.agent.lastName,
        email: relation.agent.email,
        role: relation.agent.role,
        isActive: relation.agent.isActive
      }));
    }

    // Return user data (excluding password)
    const userData = {
      id: userDataValues.id,
      email: userDataValues.email,
      first_name: userDataValues.firstName,
      last_name: userDataValues.lastName,
      role: userDataValues.role,
      is_active: userDataValues.isActive,
      status: user.status || 'online',
      last_login_time: user.lastLoginTime || loginTime,
      last_logout_time: user.lastLogoutTime,
      created_at: userDataValues.created_at,
      latitude: user.latitude,
      longitude: user.longitude,
      location_accuracy: user.locationAccuracy,
      location_timestamp: user.locationTimestamp,
      location_permission: user.locationPermission,
      supervisor: supervisorInfo,
      supervisedAgents: supervisedAgents
    };

    // Generate JWT tokens
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production';
    const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m'; // Default to 15 minutes if not set
    const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '1d'; // Default to 1 day if not set
    
    // Access token (configurable via JWT_EXPIRES_IN)
    const accessToken = jwt.sign(
      {
        userId: userData.id,
        email: userData.email,
        role: userData.role,
        name: `${userData.first_name} ${userData.last_name}`.trim(),
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    // Refresh token (configurable via JWT_REFRESH_EXPIRES_IN)
    const refreshToken = jwt.sign(
      {
        userId: userData.id,
        email: userData.email,
        type: 'refresh'
      },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES_IN }
    );

    console.log('🔍 SignIn API - Returning tokens:', {
      accessToken: accessToken ? 'exists' : 'missing',
      refreshToken: refreshToken ? 'exists' : 'missing',
      accessTokenLength: accessToken ? accessToken.length : 0,
      refreshTokenLength: refreshToken ? refreshToken.length : 0
    });

    return NextResponse.json({
      success: true,
      user: userData,
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresIn: JWT_EXPIRES_IN, // Token expiration from environment variable
      message: 'Sign in successful'
    });

  } catch (error) {
    console.error('Sign in error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
