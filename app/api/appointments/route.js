import { SaleService } from '../../../lib/sequelize-db.js';
import { requireJWTAuth } from '../../../lib/jwtAuth';

export async function GET(request) {
  try {
    // Authenticate user with JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status });
    }
    const user = authResult.user;

    const { searchParams } = new URL(request.url);
    const dateFilter = searchParams.get('dateFilter') || 'today';
    const dateField = searchParams.get('dateField') || 'appointmentDateTime';
    
    let result;
    
    // Role-based data filtering for appointments
    if (user.role === 'admin') {
      // Admin: if agentId provided, scope to that agent; otherwise all appointments
      const agentId = searchParams.get('agentId');
      if (agentId) {
        result = dateFilter
          ? await SaleService.findByAgentDate(parseInt(agentId), dateFilter, dateField)
          : await SaleService.findByAgent(parseInt(agentId));
      } else {
        result = dateFilter
          ? await SaleService.findByDate(dateFilter, dateField)
          : await SaleService.findAll();
      }
    } else if (user.role === 'supervisor') {
      // Supervisor can see their own appointments or their agents' appointments
      const agentId = searchParams.get('agentId');
      
      if (agentId) {
        // Show specific agent's appointments (verify agent is supervised by this supervisor)
        const { SupervisorAgentService } = await import('../../../lib/sequelize-db.js');
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(user.id);
        const agentIds = supervisedAgents.map(agent => agent.id);
        const requestedId = parseInt(agentId);
        
        // Allow supervisor to request their OWN appointments
        if (requestedId !== user.id && !agentIds.includes(requestedId)) {
          return Response.json({ error: 'Unauthorized - Agent not supervised by you' }, { status: 403 });
        }
        
        // Get appointments for specific agent
        if (dateFilter) {
          result = await SaleService.findByAgentDate(requestedId, dateFilter, dateField);
        } else {
          result = await SaleService.findByAgent(requestedId);
        }
      } else {
        // When no agentId is provided, return ALL supervised agents' appointments
        const { SupervisorAgentService } = await import('../../../lib/sequelize-db.js');
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(user.id);
        const agentIds = [...new Set([user.id, ...supervisedAgents.map(agent => agent.id)])];
        
        if (agentIds.length === 0) {
          // No supervised agents: return empty list (explicit behavior for appointments)
          result = [];
        } else {
          // Fetch appointments for all supervised agents and merge
          const lists = await Promise.all(
            agentIds.map(id => dateFilter
              ? SaleService.findByAgentDate(id, dateFilter, dateField)
              : SaleService.findByAgent(id)
            )
          );
          result = lists.flat();
        }
      }
    } else if (user.role === 'agent') {
      // SECURITY: Agent can only see their own appointments
      // Always require dateFilter for agents to prevent fetching all appointments
      const effectiveDateFilter = dateFilter || 'today';
      const effectiveDateField = dateField || 'appointmentDateTime';
      
      // Use agent-specific methods that directly query only this agent's appointments
      if (effectiveDateFilter) {
        result = await SaleService.findByAgentDate(user.id, effectiveDateFilter, effectiveDateField);
      } else {
        result = await SaleService.findByAgent(user.id);
      }
    } else {
      // Default behavior for other roles
      if (dateFilter) {
        result = await SaleService.findByDate(dateFilter, dateField);
      } else {
        result = await SaleService.findAll();
      }
    }
    
    // Filter to only appointments that have appointmentDateTime
    const appointments = result.filter(sale => sale.appointmentDateTime);
    
    // Sort by appointment date (ascending - earliest first)
    const sortedAppointments = appointments.sort((a, b) => 
      new Date(a.appointmentDateTime) - new Date(b.appointmentDateTime)
    );
    
    return Response.json({
      success: true,
      data: sortedAppointments
    });
  } catch (error) {
    console.error('Get appointments error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch appointments', error: error.message },
      { status: 500 }
    );
  }
}
