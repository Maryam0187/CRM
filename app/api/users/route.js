import { NextResponse } from 'next/server';
import { User } from '../../../models';
import { requireJWTAdmin } from '../../../lib/jwtAuth';
import { getRoleDisplayName } from '../../../lib/roleUtils';
import { Op } from 'sequelize';

// GET /api/users - Get all users (admin only)
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

    const users = await User.findAll({
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'status', 'lastLoginTime', 'lastLogoutTime', 'cnic', 'phone', 'address', 'latitude', 'longitude', 'locationAccuracy', 'locationTimestamp', 'locationPermission', 'callStatus', 'twilioEnabled', 'created_at', 'updated_at'],
      include: [
        {
          model: require('../../../models').SupervisorAgent,
          as: 'supervisorRelationships',
          include: [
            {
              model: User,
              as: 'supervisor',
              attributes: ['id', 'firstName', 'lastName']
            }
          ],
          required: false
        }
      ],
      order: [['created_at', 'DESC']]
    });

    // Format user data
    const formattedUsers = users.map(user => {
      const supervisorRelationship = user.supervisorRelationships && user.supervisorRelationships.length > 0 
        ? user.supervisorRelationships[0] 
        : null;
      
      return {
        id: user.id,
        email: user.email,
        first_name: user.firstName,
        last_name: user.lastName,
        role: user.role,
        role_display: getRoleDisplayName(user.role),
        is_active: user.isActive,
        status: user.status || 'offline',
        last_login_time: user.lastLoginTime,
        last_logout_time: user.lastLogoutTime,
        cnic: user.cnic,
        phone: user.phone,
        address: user.address,
        latitude: user.latitude,
        longitude: user.longitude,
        location_accuracy: user.locationAccuracy,
        location_timestamp: user.locationTimestamp,
        location_permission: user.locationPermission,
        call_status: user.callStatus || 'offline',
        twilio_enabled: user.twilioEnabled !== undefined ? user.twilioEnabled : true,
        superiorId: supervisorRelationship ? supervisorRelationship.supervisor.id : null,
        supervisor_name: supervisorRelationship ? `${supervisorRelationship.supervisor.firstName} ${supervisorRelationship.supervisor.lastName}` : null,
        created_at: user.created_at,
        updated_at: user.updated_at
      };
    });

    return NextResponse.json({
      success: true,
      data: formattedUsers
    });

  } catch (error) {
    console.error('Get users error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/users - Create new user (admin only)
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

    const {
      first_name,
      last_name,
      email,
      password,
      role,
      phone,
      cnic,
      address,
      superiorId
    } = await request.json();

    // Validate required fields
    if (!first_name || !last_name || !email || !password || !role) {
      return NextResponse.json(
        { error: 'First name, last name, email, password, and role are required' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate role - admin role cannot be created through this endpoint
    const validRoles = ['supervisor', 'agent', 'processor', 'verification'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Admin role cannot be created.' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const existingUser = await User.findOne({
      where: { email: email.toLowerCase() }
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already exists' },
        { status: 400 }
      );
    }


    // Create new user
    const newUser = await User.create({
      firstName: first_name,
      lastName: last_name,
      email: email.toLowerCase(),
      password: password, // Will be automatically hashed by User model hooks
      role: role,
      isActive: true,
      cnic: cnic || null,
      phone: phone || null,
      address: address || null,
      callStatus: 'offline'
    });

    // If it's a lead agent and superiorId is provided, create supervisor relationship
    if (role === 'agent' && superiorId) {
      const { SupervisorAgent } = require('../../../models');
      await SupervisorAgent.create({
        supervisorId: superiorId,
        agentId: newUser.id
      });
    }

    // Return user data (excluding password)
    const userData = {
      id: newUser.id,
      email: newUser.email,
      first_name: newUser.firstName,
      last_name: newUser.lastName,
      role: newUser.role,
      role_display: getRoleDisplayName(newUser.role),
      is_active: newUser.isActive,
      cnic: newUser.cnic,
      phone: newUser.phone,
      address: newUser.address,
      call_status: newUser.callStatus || 'offline',
      created_at: newUser.created_at
    };

    return NextResponse.json({
      success: true,
      data: userData,
      message: 'User created successfully'
    });

  } catch (error) {
    console.error('Create user error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
