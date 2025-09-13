import { SupervisorAgentService } from '../../../lib/sequelize-db.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const supervisorId = searchParams.get('supervisorId');
    const agentId = searchParams.get('agentId');
    
    let relationships;
    if (supervisorId) {
      relationships = await SupervisorAgentService.findBySupervisor(supervisorId);
    } else if (agentId) {
      relationships = await SupervisorAgentService.findByAgent(agentId);
    } else {
      return Response.json(
        { success: false, message: 'supervisorId or agentId parameter is required' },
        { status: 400 }
      );
    }
    
    return Response.json({
      success: true,
      data: relationships
    });
  } catch (error) {
    console.error('Get supervisor-agent relationships error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch relationships', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const { supervisorId, agentId } = await request.json();
    
    if (!supervisorId || !agentId) {
      return Response.json(
        { success: false, message: 'supervisorId and agentId are required' },
        { status: 400 }
      );
    }
    
    const relationship = await SupervisorAgentService.create(supervisorId, agentId);
    
    return Response.json({
      success: true,
      message: 'Supervisor-agent relationship created successfully',
      data: relationship
    }, { status: 201 });
  } catch (error) {
    console.error('Create supervisor-agent relationship error:', error);
    return Response.json(
      { success: false, message: 'Failed to create relationship', error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const supervisorId = searchParams.get('supervisorId');
    const agentId = searchParams.get('agentId');
    
    if (!supervisorId || !agentId) {
      return Response.json(
        { success: false, message: 'supervisorId and agentId are required' },
        { status: 400 }
      );
    }
    
    const result = await SupervisorAgentService.remove(supervisorId, agentId);
    
    if (result === 0) {
      return Response.json(
        { success: false, message: 'Relationship not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Supervisor-agent relationship removed successfully'
    });
  } catch (error) {
    console.error('Delete supervisor-agent relationship error:', error);
    return Response.json(
      { success: false, message: 'Failed to remove relationship', error: error.message },
      { status: 500 }
    );
  }
}
