import { SaleService, SupervisorAgentService, CustomerService, getCustomerIdsWithPayments } from '../../../lib/sequelize-db.js';
import { CallLog } from '../../../models';
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
    const numberSearch = searchParams.get('numberSearch') || null; // Search by phone/landline number (last 4 digits or full number)
    const searchLastFour = searchParams.get('searchLastFour') === 'true'; // Toggle for searching last 4 digits only
    
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
          result = await SaleService.findByAgentStatusAndDatePaginated(parseInt(agentId), status, dateFilter, page, limit, dateField, numberSearch, searchLastFour);
        } else if (status) {
          result = await SaleService.findByAgentStatusPaginated(parseInt(agentId), status, page, limit, numberSearch, searchLastFour);
        } else if (dateFilter) {
          result = await SaleService.findByAgentDatePaginated(parseInt(agentId), dateFilter, page, limit, dateField, numberSearch, searchLastFour);
        } else {
          result = await SaleService.findByAgentPaginated(parseInt(agentId), page, limit, numberSearch, searchLastFour);
        }
      } else {
        // Show all sales when no agentId provided
        if (status && dateFilter) {
          result = await SaleService.findByStatusAndDatePaginated(status, dateFilter, page, limit, dateField, numberSearch, searchLastFour);
        } else if (status) {
          result = await SaleService.findByStatusPaginated(status, page, limit, numberSearch, searchLastFour);
        } else if (dateFilter) {
          result = await SaleService.findByDatePaginated(dateFilter, page, limit, dateField, numberSearch, searchLastFour);
        } else {
          result = await SaleService.findAllPaginated(page, limit, numberSearch, searchLastFour);
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
          result = await SaleService.findByAgentStatusAndDatePaginated(parseInt(agentId), status, dateFilter, page, limit, dateField, numberSearch, searchLastFour);
        } else if (status) {
          result = await SaleService.findByAgentStatusPaginated(parseInt(agentId), status, page, limit, numberSearch, searchLastFour);
        } else if (dateFilter) {
          result = await SaleService.findByAgentDatePaginated(parseInt(agentId), dateFilter, page, limit, dateField, numberSearch, searchLastFour);
        } else {
          result = await SaleService.findByAgentPaginated(parseInt(agentId), page, limit, numberSearch, searchLastFour);
        }
      } else {
        // Show only supervisor's own sales when no agentId is provided
        // Get supervisor's own sales
        if (status && dateFilter) {
          result = await SaleService.findByAgentStatusAndDatePaginated(user.id, status, dateFilter, page, limit, dateField, numberSearch, searchLastFour);
        } else if (status) {
          result = await SaleService.findByAgentStatusPaginated(user.id, status, page, limit, numberSearch, searchLastFour);
        } else if (dateFilter) {
          result = await SaleService.findByAgentDatePaginated(user.id, dateFilter, page, limit, dateField, numberSearch, searchLastFour);
        } else {
          result = await SaleService.findByAgentPaginated(user.id, page, limit, numberSearch, searchLastFour);
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
        result = await SaleService.findByAgentStatusAndDatePaginated(user.id, status, effectiveDateFilter, page, limit, effectiveDateField, numberSearch, searchLastFour);
      } else if (status) {
        result = await SaleService.findByAgentStatusPaginated(user.id, status, page, limit, numberSearch, searchLastFour);
      } else if (effectiveDateFilter) {
        result = await SaleService.findByAgentDatePaginated(user.id, effectiveDateFilter, page, limit, effectiveDateField, numberSearch, searchLastFour);
      } else {
        // Fallback: use agent-specific method without date filter (should not happen with effectiveDateFilter default)
        result = await SaleService.findByAgentPaginated(user.id, page, limit, numberSearch, searchLastFour);
      }
    } else {
      // Default behavior for other roles or no role specified
      if (status && dateFilter) {
        result = await SaleService.findByStatusAndDatePaginated(status, dateFilter, page, limit, dateField, numberSearch, searchLastFour);
      } else if (status) {
        result = await SaleService.findByStatusPaginated(status, page, limit, numberSearch, searchLastFour);
      } else if (dateFilter) {
        result = await SaleService.findByDatePaginated(dateFilter, page, limit, dateField, numberSearch, searchLastFour);
      } else {
        result = await SaleService.findAllPaginated(page, limit, numberSearch, searchLastFour);
      }
    }
    
    // Customer-based payment-info: which customers (in this page) have any payment
    const customerIdsInPage = [...new Set(result.data.map((s) => (s.get ? s.get({ plain: true }) : s).customerId).filter(Boolean))];
    const customerIdsWithPaymentsSet = await getCustomerIdsWithPayments(customerIdsInPage);

    // Ensure associations are properly serialized
    const serializedData = result.data.map(sale => {
      // Use get({ plain: true }) to get plain object with all associations
      const saleData = sale.get ? sale.get({ plain: true }) : (sale.toJSON ? sale.toJSON() : sale);
      
      // Ensure payment arrays exist - check both instance and serialized data
      const cards = saleData.cards || (sale.cards ? (Array.isArray(sale.cards) ? sale.cards.map(c => c.get ? c.get({ plain: true }) : (c.toJSON ? c.toJSON() : c)) : []) : []);
      const banks = saleData.banks || (sale.banks ? (Array.isArray(sale.banks) ? sale.banks.map(b => b.get ? b.get({ plain: true }) : (b.toJSON ? b.toJSON() : b)) : []) : []);
      const chequesElectronic = saleData.chequesElectronic || (sale.chequesElectronic ? (Array.isArray(sale.chequesElectronic) ? sale.chequesElectronic.map(c => c.get ? c.get({ plain: true }) : (c.toJSON ? c.toJSON() : c)) : []) : []);
      const chequesMail = saleData.chequesMail || (sale.chequesMail ? (Array.isArray(sale.chequesMail) ? sale.chequesMail.map(c => c.get ? c.get({ plain: true }) : (c.toJSON ? c.toJSON() : c)) : []) : []);
      const paymentEmails = saleData.paymentEmails || (sale.paymentEmails ? (Array.isArray(sale.paymentEmails) ? sale.paymentEmails.map(e => e.get ? e.get({ plain: true }) : (e.toJSON ? e.toJSON() : e)) : []) : []);
      
      return {
        ...saleData,
        cards,
        banks,
        chequesElectronic,
        chequesMail,
        paymentEmails,
        customerHasPayments: customerIdsWithPaymentsSet.has(saleData.customerId)
      };
    });
    
    return Response.json({
      success: true,
      data: serializedData,
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
      status: sanitizeEnumField(saleData.status),
      // Handle tags - ensure it's an array
      tags: Array.isArray(saleData.tags) ? saleData.tags : (saleData.tags ? [saleData.tags] : [])
    };
    
    // Map appointment_datetime to appointmentDateTime for the model
    if (saleData.appointment_datetime !== undefined) {
      sanitizedData.appointmentDateTime = saleData.appointment_datetime;
      delete sanitizedData.appointment_datetime;
    }
    
    const sale = await SaleService.create(sanitizedData);
    
    // After creating a new sale, attach the most recent call log (for this agent + customer)
    // that does not yet have a saleId. This ensures the latest call made before the sale
    // is linked to the sale for call history and recordings.
    try {
      if (sale.customerId && sale.agentId) {
        const lastCallLog = await CallLog.findOne({
          where: {
            customerId: sale.customerId,
            agentId: sale.agentId,
            saleId: null
          },
          order: [['created_at', 'DESC']]
        });

        if (lastCallLog) {
          await lastCallLog.update({ saleId: sale.id });
        }
      }
    } catch (linkError) {
      console.error('Error linking latest call log to new sale:', linkError);
      // Do not fail sale creation if linking the call log fails
    }
    
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
            customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown Customer';
          }
        }
        
        if (sale.agentId) {
          const { UserService } = await import('../../../lib/sequelize-db.js');
          const agent = await UserService.findById(sale.agentId);
          if (agent) {
            agentName = `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || 'Unknown Agent';
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

        // Send to only this agent's supervisor(s) via Socket.IO (only if server is ready)
        if (socketManager.isReady() && sale.agentId) {
          const supervisorsOfAgent = await SupervisorAgentService.getSupervisors(sale.agentId);
          for (const sup of supervisorsOfAgent) {
            socketManager.sendNotificationToUser(sup.id, notification);
          }
        } else if (!socketManager.isReady()) {
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
