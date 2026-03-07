import { SaleService, CustomerService, SupervisorAgentService, getCustomerIdsWithPayments } from '../../../../lib/sequelize-db.js';
import { NotificationManager } from '../../../../lib/notificationService';
import socketManager from '../../../../lib/socket';
import { requireJWTAuth } from '../../../../lib/jwtAuth';

export async function GET(request, { params }) {
  try {
    // Authenticate user with JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status });
    }
    const user = authResult.user;

    const { id } = await params;
    const sale = await SaleService.findById(id);
    
    
    if (!sale) {
      return Response.json(
        { success: false, message: 'Sale not found' },
        { status: 404 }
      );
    }

    const saleData = sale.get ? sale.get({ plain: true }) : (sale.toJSON ? sale.toJSON() : sale);
    const customerId = saleData.customerId;
    const customerIdsWithPayments = customerId ? await getCustomerIdsWithPayments([customerId]) : new Set();
    const dataWithPaymentFlag = { ...saleData, customerHasPayments: customerIdsWithPayments.has(customerId) };
    
    return Response.json({
      success: true,
      data: dataWithPaymentFlag
    });
  } catch (error) {
    console.error('Get sale error:', error);
    return Response.json(
      { success: false, message: 'Failed to fetch sale', error: error.message },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  try {
    // Authenticate user with JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status });
    }
    const user = authResult.user;

    const { id } = await params;
    const updateData = await request.json();
    
    // Get the original sale data to compare status changes
    const originalSale = await SaleService.findById(id);
    if (!originalSale) {
      return Response.json(
        { success: false, message: 'Sale not found' },
        { status: 404 }
      );
    }
    
    // Sanitize enum fields - convert empty strings to null
    const sanitizeEnumField = (value) => {
      return (value === '' || value === null || value === undefined) ? null : value;
    };

    // Only include fields that are actually in the request, so we don't overwrite e.g. status with null when only usedOldPaymentRefs is sent
    const sanitizedData = { ...updateData };
    if (updateData.pinCodeStatus !== undefined) {
      sanitizedData.pinCodeStatus = sanitizeEnumField(updateData.pinCodeStatus);
    }
    if (updateData.ssnNumberStatus !== undefined) {
      sanitizedData.ssnNumberStatus = sanitizeEnumField(updateData.ssnNumberStatus);
    }
    if (updateData.basicPackageStatus !== undefined) {
      sanitizedData.basicPackageStatus = sanitizeEnumField(updateData.basicPackageStatus);
    }
    if (updateData.bundle !== undefined) {
      sanitizedData.bundle = sanitizeEnumField(updateData.bundle);
    }
    if (updateData.status !== undefined) {
      sanitizedData.status = sanitizeEnumField(updateData.status);
    }
    if (updateData.tags !== undefined) {
      sanitizedData.tags = Array.isArray(updateData.tags) ? updateData.tags : (updateData.tags ? [updateData.tags] : []);
    }
    if (updateData.usedOldPaymentRefs !== undefined) {
      sanitizedData.usedOldPaymentRefs = Array.isArray(updateData.usedOldPaymentRefs)
        ? updateData.usedOldPaymentRefs
        : [];
    }
    if (updateData.appointment_datetime !== undefined) {
      sanitizedData.appointmentDateTime = updateData.appointment_datetime;
      delete sanitizedData.appointment_datetime;
    }
    
    const sale = await SaleService.update(id, sanitizedData);
    
    if (!sale) {
      return Response.json(
        { success: false, message: 'Sale not found' },
        { status: 404 }
      );
    }
    
    // Send notification if status changed
    try {
      if (originalSale.status !== sale.status) {
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
          const { UserService } = await import('../../../../lib/sequelize-db.js');
          const agent = await UserService.findById(sale.agentId);
          if (agent) {
            agentName = `${agent.firstName || ''} ${agent.lastName || ''}`.trim() || 'Unknown Agent';
          }
        }

        // Send notification to supervisors via Socket.IO
        const notification = {
          id: `sale-update-${sale.id}-${Date.now()}`,
          title: `${agentName} - Sale Status Updated`,
          message: `Sale status changed from ${originalSale.status} to ${sale.status} for ${customerName}`,
          time: new Date().toISOString(),
          isRead: false,
          type: 'sale_status_updated',
          saleId: sale.id,
          customerId: sale.customerId,
          agentId: sale.agentId,
          agentName,
          customerName,
          oldStatus: originalSale.status,
          newStatus: sale.status
        };
        // Send to only this agent's supervisor(s) via Socket.IO — exclude the updater (they don't need a notification for their own action)
        if (socketManager.isReady() && sale.agentId) {
          const supervisorsOfAgent = await SupervisorAgentService.getSupervisors(sale.agentId);
          for (const sup of supervisorsOfAgent) {
            if (sup.id !== user.id) {
              socketManager.sendNotificationToUser(sup.id, notification);
            }
          }
        } else if (!socketManager.isReady()) {
          console.warn('⚠️ Socket.IO server not ready, skipping real-time notification');
        }
        
        // Also send to database for persistence (exclude updater so they don't get a notification for their own action)
        await NotificationManager.notifySaleStatusUpdated({
          agentId: sale.agentId,
          agentName,
          customerId: sale.customerId,
          saleId: sale.id,
          oldStatus: originalSale.status,
          newStatus: sale.status,
          customerName,
          excludeUserId: user.id
        });

        // When admin or supervisor updates the sale, notify the agent (not the updater)
        if ((user.role === 'admin' || user.role === 'supervisor') && sale.agentId && sale.agentId !== user.id) {
          const agentNotification = {
            id: `sale-update-agent-${sale.id}-${Date.now()}`,
            title: 'Your sale was updated',
            message: `Sale status changed from ${originalSale.status} to ${sale.status} for ${customerName}`,
            time: new Date().toISOString(),
            isRead: false,
            type: 'sale_status_updated',
            saleId: sale.id,
            customerId: sale.customerId,
            agentId: sale.agentId,
            customerName,
            oldStatus: originalSale.status,
            newStatus: sale.status
          };
          if (socketManager.isReady()) {
            socketManager.sendNotificationToUser(sale.agentId, agentNotification);
          }
          await NotificationManager.notifyUser(sale.agentId, {
            type: 'sale_status_updated',
            title: agentNotification.title,
            message: agentNotification.message,
            isRead: false,
            relatedId: sale.id,
            relatedType: 'sale'
          });
        }
      }
    } catch (notificationError) {
      console.error('Error sending sale update notification:', notificationError);
      // Don't fail the sale update if notification fails
    }

    // Emit sale_updated so agent and supervisors can refresh sales table in real time (no loader)
    try {
      if (socketManager.isReady() && sale.agentId) {
        const supervisorsOfAgent = await SupervisorAgentService.getSupervisors(sale.agentId);
        const supervisorIds = supervisorsOfAgent.map(s => s.id);
        socketManager.emitSaleUpdated(sale.id, sale.agentId, supervisorIds);
      }
    } catch (emitError) {
      console.error('Error emitting sale_updated:', emitError);
    }

    return Response.json({
      success: true,
      message: 'Sale updated successfully',
      data: sale
    });
  } catch (error) {
    console.error('Update sale error:', error);
    return Response.json(
      { success: false, message: 'Failed to update sale', error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    // Authenticate user with JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json({ error: authResult.error }, { status: authResult.status });
    }
    const user = authResult.user;

    const { id } = await params;
    const result = await SaleService.delete(id);
    
    if (!result) {
      return Response.json(
        { success: false, message: 'Sale not found' },
        { status: 404 }
      );
    }
    
    return Response.json({
      success: true,
      message: 'Sale deleted successfully'
    });
  } catch (error) {
    console.error('Delete sale error:', error);
    return Response.json(
      { success: false, message: 'Failed to delete sale', error: error.message },
      { status: 500 }
    );
  }
}
