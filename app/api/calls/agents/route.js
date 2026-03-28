import { NextResponse } from 'next/server';
import { User } from '../../../../models';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { Op } from 'sequelize';

// GET /api/calls/agents - Get active users (all roles) for warm transfer / add participant
export async function GET(request) {
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    // Get all active users for transfer target (excluding the current user)
    const currentUserId = authResult.user.id;
    const agents = await User.findAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'role', 'status'],
      where: {
        id: {
          [Op.ne]: currentUserId // Exclude current user
        },
        isActive: true
      },
      order: [['firstName', 'ASC'], ['lastName', 'ASC']]
    });

    // Format agent data
    const formattedAgents = agents.map(agent => ({
      id: agent.id,
      name: `${agent.firstName} ${agent.lastName}`,
      firstName: agent.firstName,
      lastName: agent.lastName,
      email: agent.email,
      phone: agent.phone,
      role: agent.role,
      status: agent.status || 'offline'
    }));

    return NextResponse.json({
      success: true,
      data: formattedAgents
    });

  } catch (error) {
    console.error('Error fetching agents:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to fetch agents',
        error: error.message
      },
      { status: 500 }
    );
  }
}

