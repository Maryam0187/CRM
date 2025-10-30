import { SaleService, SupervisorAgentService } from '../../../../lib/sequelize-db.js';
import { requireJWTAuth } from '../../../../lib/jwtAuth';

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
    
    let appointments;
    
    // Role-based data filtering for dashboard appointments (lightweight)
    if (user.role === 'admin') {
      // Admin can see all appointments
      if (dateFilter) {
        appointments = await SaleService.findByDate(dateFilter, dateField);
      } else {
        appointments = await SaleService.findAll();
      }
    } else if (user.role === 'supervisor') {
      // Supervisor can see their own appointments or their agents' appointments
      const agentId = searchParams.get('agentId');
      
      if (agentId) {
        // Show specific agent's appointments (verify agent is supervised by this supervisor)
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(user.id);
        const agentIds = supervisedAgents.map(agent => agent.id);
        
        if (!agentIds.includes(parseInt(agentId))) {
          return Response.json({ error: 'Unauthorized - Agent not supervised by you' }, { status: 403 });
        }
        
        // Get appointments for specific agent
        appointments = await SaleService.findAppointmentsForDashboard(parseInt(agentId), dateFilter, dateField);
      } else {
        // Show only supervisor's own appointments when no agentId is provided
        appointments = await SaleService.findAppointmentsForDashboard(user.id, dateFilter, dateField);
      }
    } else if (user.role === 'agent') {
      // SECURITY: Agent can only see their own appointments
      // Always require dateFilter for agents to prevent fetching all appointments
      const effectiveDateFilter = dateFilter || 'today';
      const effectiveDateField = dateField || 'appointmentDateTime';
      
      // Use lightweight method for dashboard
      appointments = await SaleService.findAppointmentsForDashboard(user.id, effectiveDateFilter, effectiveDateField);
    } else {
      // Default behavior for other roles
      if (dateFilter) {
        appointments = await SaleService.findByDate(dateFilter, dateField);
      } else {
        appointments = await SaleService.findAll();
      }
    }
    
    // Filter to only appointments that have appointmentDateTime
    const appointmentsWithDates = appointments.filter(sale => sale.appointmentDateTime);
    
    // Sort by appointment date (ascending - earliest first)
    const sortedAppointments = appointmentsWithDates.sort((a, b) => 
      new Date(a.appointmentDateTime) - new Date(b.appointmentDateTime)
    );
    
    // Calculate counts for dashboard
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    
    // Filter to only future appointments (after now)
    const futureAppointments = sortedAppointments.filter(appointment => 
      new Date(appointment.appointmentDateTime) > now
    );
    
    // Calculate today's appointments (appointments that are today)
    const todayAppointments = futureAppointments.filter(appointment => {
      const appointmentDate = new Date(appointment.appointmentDateTime);
      return appointmentDate >= today && appointmentDate < todayEnd;
    });
    
    // Get next appointment (first future appointment) with customer info
    let nextAppointment = null;
    if (futureAppointments.length > 0) {
      const nextAppointmentId = futureAppointments[0].id;
      // Get full appointment details with customer info for display
      const fullAppointment = await SaleService.findById(nextAppointmentId);
      if (fullAppointment) {
        nextAppointment = {
          id: fullAppointment.id,
          appointmentDateTime: fullAppointment.appointmentDateTime,
          customer: fullAppointment.customer
        };
      }
    }
    
    return Response.json({
      success: true,
      data: {
        todayCount: todayAppointments.length,
        upcomingCount: futureAppointments.length,
        nextAppointment,
        totalAppointments: sortedAppointments.length
      }
    });
  } catch (error) {
    console.error('Get dashboard appointments error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch dashboard appointments', error: error.message },
      { status: 500 }
    );
  }
}
