import { SaleService, SupervisorAgentService, CustomerService } from '../../../lib/sequelize-db.js';
import { NotificationManager } from '../../../lib/notificationService';
import socketManager from '../../../lib/socket';
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
    const status = searchParams.get('status');
    const dateFilter = searchParams.get('dateFilter');
    const dateField = searchParams.get('dateField') || 'created_at'; // New parameter: 'created_at' or 'updated_at'
    const agentId = searchParams.get('agentId'); // For supervisors to view specific agent's sales
    
    // Pagination parameters
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 10;
    
    let result;
    
    // Role-based data filtering with pagination
    if (user.role === 'admin') {
      // Admin can see all sales or filter by specific agent
      if (agentId) {
        // Show specific agent's sales
        if (status && dateFilter) {
          result = await SaleService.findByAgentStatusAndDatePaginated(parseInt(agentId), status, dateFilter, page, limit, dateField);
        } else if (status) {
          result = await SaleService.findByAgentStatusPaginated(parseInt(agentId), status, page, limit);
        } else if (dateFilter) {
          result = await SaleService.findByAgentDatePaginated(parseInt(agentId), dateFilter, page, limit, dateField);
        } else {
          result = await SaleService.findByAgentPaginated(parseInt(agentId), page, limit);
        }
      } else {
        // Show all sales when no agentId provided
        if (status && dateFilter) {
          result = await SaleService.findByStatusAndDatePaginated(status, dateFilter, page, limit, dateField);
        } else if (status) {
          result = await SaleService.findByStatusPaginated(status, page, limit);
        } else if (dateFilter) {
          result = await SaleService.findByDatePaginated(dateFilter, page, limit, dateField);
        } else {
          result = await SaleService.findAllPaginated(page, limit);
        }
      }
    } else if (user.role === 'supervisor') {
      // Supervisor can see their agents' sales or specific agent's sales
      if (agentId) {
        // Show specific agent's sales (verify agent is supervised by this supervisor)
        const supervisedAgents = await SupervisorAgentService.getSupervisedAgents(user.id);
        const agentIds = supervisedAgents.map(agent => agent.id);
        
        if (!agentIds.includes(parseInt(agentId))) {
          return Response.json({ error: 'Unauthorized - Agent not supervised by you' }, { status: 403 });
        }
        
        // Get sales for specific agent
        if (status && dateFilter) {
          result = await SaleService.findByAgentStatusAndDatePaginated(parseInt(agentId), status, dateFilter, page, limit, dateField);
        } else if (status) {
          result = await SaleService.findByAgentStatusPaginated(parseInt(agentId), status, page, limit);
        } else if (dateFilter) {
          result = await SaleService.findByAgentDatePaginated(parseInt(agentId), dateFilter, page, limit, dateField);
        } else {
          result = await SaleService.findByAgentPaginated(parseInt(agentId), page, limit);
        }
      } else {
        // Show only supervisor's own sales when no agentId is provided
        console.log('🔍 Supervisor API - Showing supervisor\'s own sales only. Supervisor ID:', user.id);
        
        // Get supervisor's own sales
        if (status && dateFilter) {
          result = await SaleService.findByAgentStatusAndDatePaginated(user.id, status, dateFilter, page, limit, dateField);
        } else if (status) {
          result = await SaleService.findByAgentStatusPaginated(user.id, status, page, limit);
        } else if (dateFilter) {
          result = await SaleService.findByAgentDatePaginated(user.id, dateFilter, page, limit, dateField);
        } else {
          result = await SaleService.findByAgentPaginated(user.id, page, limit);
        }
      }
    } else if (user.role === 'agent') {
      // SECURITY: Agent can only see their own sales
      // Always require dateFilter for agents to prevent fetching all sales
      // If no dateFilter provided, default to 'today' for security
      const effectiveDateFilter = dateFilter || 'today';
      const effectiveDateField = dateField || 'created_at';
      
      // Use agent-specific methods that directly query only this agent's sales
      // This is more secure and efficient than fetching all sales and filtering
      // These methods ensure the agent can NEVER access other agents' sales
      if (status && effectiveDateFilter) {
        result = await SaleService.findByAgentStatusAndDatePaginated(user.id, status, effectiveDateFilter, page, limit, effectiveDateField);
      } else if (status) {
        result = await SaleService.findByAgentStatusPaginated(user.id, status, page, limit);
      } else if (effectiveDateFilter) {
        result = await SaleService.findByAgentDatePaginated(user.id, effectiveDateFilter, page, limit, effectiveDateField);
      } else {
        // Fallback: use agent-specific method without date filter (should not happen with effectiveDateFilter default)
        result = await SaleService.findByAgentPaginated(user.id, page, limit);
      }
    } else {
      // Default behavior for other roles or no role specified
      if (status && dateFilter) {
        result = await SaleService.findByStatusAndDatePaginated(status, dateFilter, page, limit, dateField);
      } else if (status) {
        result = await SaleService.findByStatusPaginated(status, page, limit);
      } else if (dateFilter) {
        result = await SaleService.findByDatePaginated(dateFilter, page, limit, dateField);
      } else {
        result = await SaleService.findAllPaginated(page, limit);
      }
    }
    
    return Response.json({
      success: true,
      data: result.data,
      pagination: result.pagination
    });
  } catch (error) {
    console.error('Get sales error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch sales', error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    // Authenticate user with JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status });
    }
    const user = authResult.user;

    const saleData = await request.json();
    
    // Sanitize enum fields - convert empty strings to null
    const sanitizeEnumField = (value) => {
      return (value === '' || value === null || value === undefined) ? null : value;
    };
    
    // Sanitize the sale data and set agentId from authenticated user
    const sanitizedData = {
      ...saleData,
      agentId: user.id, // Set agentId from authenticated user
      pinCodeStatus: sanitizeEnumField(saleData.pinCodeStatus),
      ssnNumberStatus: sanitizeEnumField(saleData.ssnNumberStatus),
      basicPackageStatus: sanitizeEnumField(saleData.basicPackageStatus),
      bundle: sanitizeEnumField(saleData.bundle),
      status: sanitizeEnumField(saleData.status)
    };
    
    // Map appointment_datetime to appointmentDateTime for the model
    if (saleData.appointment_datetime !== undefined) {
      sanitizedData.appointmentDateTime = saleData.appointment_datetime;
      delete sanitizedData.appointment_datetime;
    }
    
    const sale = await SaleService.create(sanitizedData);
    
    // Send notification if sale is created with lead-call or sale-done status
    try {
      const notificationStatuses = ['lead-call', 'sale-done'];
      if (notificationStatuses.includes(sale.status)) {
        // Get customer and agent information for the notification
        let customerName = 'Unknown Customer';
        let agentName = 'Unknown Agent';
        
        if (sale.customerId) {
          const customer = await CustomerService.findById(sale.customerId);
          if (customer) {
            customerName = `${customer.firstName} ${customer.lastName}`.trim() || 'Unknown Customer';
          }
        }
        
        if (sale.agentId) {
          const { UserService } = await import('../../../lib/sequelize-db.js');
          const agent = await UserService.findById(sale.agentId);
          if (agent) {
            agentName = `${agent.firstName} ${agent.lastName}`.trim() || 'Unknown Agent';
          }
        }

        // Send notification to supervisors via Socket.IO
        const notification = {
          id: `sale-${sale.id}-${Date.now()}`,
          title: `${agentName} - New Sale Created`,
          message: `Agent created a new sale for ${customerName} (Status: ${sale.status})`,
          time: new Date().toISOString(),
          isRead: false,
          type: 'sale_created',
          saleId: sale.id,
          customerId: sale.customerId,
          agentId: sale.agentId,
          agentName,
          customerName,
          status: sale.status
        };

        // Send to supervisors via Socket.IO (only if server is ready)
        if (socketManager.isReady()) {
          socketManager.sendNotificationToSupervisors(notification);
        } else {
          console.warn('⚠️ Socket.IO server not ready, skipping real-time notification');
        }
        
        // Also send to database for persistence
        await NotificationManager.notifySaleCreated({
          agentId: sale.agentId,
          agentName,
          customerId: sale.customerId,
          saleId: sale.id,
          status: sale.status,
          customerName
        });
      }
    } catch (notificationError) {
      console.error('Error sending sale creation notification:', notificationError);
      // Don't fail the sale creation if notification fails
    }
    
    return Response.json({
      success: true,
      message: 'Sale created successfully',
      data: sale
    }, { status: 201 });
  } catch (error) {
    console.error('Create sale error:', error);
    return Response.json(
      { success: false, message: 'Failed to create sale', error: error.message },
      { status: 500 }
    );
  }
}
