import { SupervisorAgentService } from '../../../lib/sequelize-db.js';


import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
export async function GET(request) {
  try {
    
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

const { searchParams } = new URL(request.url);
    const supervisorId = searchParams.get('supervisorId');
    
    if (!supervisorId) {
      return Response.json(
        { success: false, message: 'Supervisor ID is required' },
        { status: 400 }
      );
    }
    
    const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(parseInt(supervisorId));
    
    return Response.json({
      success: true,
      data: supervisedAgents
    });
  } catch (error) {
    console.error('Get supervised agents error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch supervised agents', error: error.message },
      { status: 500 }
    );
  }
}