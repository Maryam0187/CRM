import { RoleAssignmentService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const assignedRole = searchParams.get('assignedRole');
    
    let assignments;
    if (userId) {
      assignments = await RoleAssignmentService.findByUser(userId);
    } else if (assignedRole) {
      assignments = await RoleAssignmentService.findByRole(assignedRole);
    } else {
      return Response.json(
        { success: false, message: 'userId or assignedRole parameter is required' },
        { status: 400 }
      );
    }
    
    return Response.json({
      success: true,
      data: assignments
    });
  } catch (error) {
    console.error('Get role assignments error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch role assignments', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { userId, assignedRole, assignedBy, expiresAt } = await request.json();
    
    if (!userId || !assignedRole) {
      return Response.json(
        { success: false, message: 'userId and assignedRole are required' },
        { status: 400 }
      );
    }
    
    // Validate assigned role
    if (!['processor', 'verification'].includes(assignedRole)) {
      return Response.json(
        { success: false, message: 'assignedRole must be either "processor" or "verification"' },
        { status: 400 }
      );
    }
    
    const assignment = await RoleAssignmentService.create(userId, assignedRole, assignedBy, expiresAt);
    
    return Response.json({
      success: true,
      message: 'Role assignment created successfully',
      data: assignment
    }, { status: 201 });
  } catch (error) {
    console.error('Create role assignment error:', error);
    return Response.json(
      { success: false, message: 'Failed to create role assignment', error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const { userId, assignedRole } = await request.json();
    
    if (!userId || !assignedRole) {
      return Response.json(
        { success: false, message: 'userId and assignedRole are required' },
        { status: 400 }
      );
    }
    
    const result = await RoleAssignmentService.deactivate(userId, assignedRole);
    
    if (result[0] === 0) {
      return Response.json(
        { success: false, message: 'Role assignment not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Role assignment deactivated successfully'
    });
  } catch (error) {
    console.error('Deactivate role assignment error:', error);
    return Response.json(
      { success: false, message: 'Failed to deactivate role assignment', error: error.message },
      { status: 500 }
    );
  }
}
