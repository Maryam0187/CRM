import { NextResponse } from 'next/server';
import { User } from '../../../models';
import { requireAdmin } from '../../../lib/serverAuth';

// GET /api/supervisors - Get all supervisors (admin only)
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

    const supervisors = await User.findAll({
      where: { 
        role: 'supervisor',
        isActive: true
      },
      attributes: ['id', 'firstName', 'lastName', 'email'],
      order: [['firstName', 'ASC']]
    });

    // Format supervisor data
    const formattedSupervisors = supervisors.map(supervisor => ({
      id: supervisor.id,
      first_name: supervisor.firstName,
      last_name: supervisor.lastName,
      email: supervisor.email,
      full_name: `${supervisor.firstName} ${supervisor.lastName}`
    }));

    return NextResponse.json({
      success: true,
      data: formattedSupervisors
    });

  } catch (error) {
    console.error('Get supervisors error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
