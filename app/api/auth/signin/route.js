import { NextResponse } from 'next/server';
import { User, SupervisorAgent } from '../../../../models';
import jwt from 'jsonwebtoken';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

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
      created_at: userDataValues.created_at,
      supervisor: supervisorInfo,
      supervisedAgents: supervisedAgents
    };

    // Generate JWT tokens
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key-change-in-production';
    
    // Access token (short-lived - 15 minutes)
    const accessToken = jwt.sign(
      {
        userId: userData.id,
        email: userData.email,
        role: userData.role,
        name: `${userData.first_name} ${userData.last_name}`.trim(),
        type: 'access'
      },
      JWT_SECRET,
      { expiresIn: '15m' } // 15 minutes
    );

    // Refresh token (long-lived - 1 day)
    const refreshToken = jwt.sign(
      {
        userId: userData.id,
        email: userData.email,
        type: 'refresh'
      },
      JWT_REFRESH_SECRET,
      { expiresIn: '1d' } // 1 day
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
      expiresIn: 15 * 60, // 15 minutes in seconds
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
