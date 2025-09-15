import { NextResponse } from 'next/server';
import { User } from '../../../models';
import { requireAdmin } from '../../../lib/serverAuth';
import { getRoleDisplayName } from '../../../lib/roleUtils';

// GET /api/users - Get all users (admin only)
export async function GET(request) {
  try {
    // Check authentication and admin access
    const authResult = await requireAdmin(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const users = await User.findAll({
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive', 'created_at', 'updated_at'],
      order: [['created_at', 'DESC']]
    });

    // Format user data
    const formattedUsers = users.map(user => ({
      id: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
      role_display: getRoleDisplayName(user.role),
      is_active: user.isActive,
      created_at: user.created_at,
      updated_at: user.updated_at
    }));

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
    const authResult = await requireAdmin(request);
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

    // Validate role
    const validRoles = ['admin', 'supervisor', 'agent', 'processor', 'verification'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
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
      password: password, // In production, hash this password
      role: role,
      isActive: true
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
