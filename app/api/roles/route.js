import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/serverAuth';
import { getRoleDisplayName, getRoleDescription } from '../../../lib/roleUtils';

// GET /api/roles - Get available roles (admin only)
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

    const roles = [
      {
        id: 'admin',
        name: 'admin',
        display_name: getRoleDisplayName('admin'),
        description: getRoleDescription('admin')
      },
      {
        id: 'supervisor',
        name: 'supervisor',
        display_name: getRoleDisplayName('supervisor'),
        description: getRoleDescription('supervisor')
      },
      {
        id: 'agent',
        name: 'agent',
        display_name: getRoleDisplayName('agent'),
        description: getRoleDescription('agent')
      },
      {
        id: 'processor',
        name: 'processor',
        display_name: getRoleDisplayName('processor'),
        description: getRoleDescription('processor')
      },
      {
        id: 'verification',
        name: 'verification',
        display_name: getRoleDisplayName('verification'),
        description: getRoleDescription('verification')
      }
    ];

    return NextResponse.json({
      success: true,
      data: roles
    });

  } catch (error) {
    console.error('Get roles error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
