import { SupervisorAgentService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
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