import { SaleService, CustomerService } from '../../../../lib/sequelize-db.js';
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
    
    return Response.json({
      success: true,
      data: sale
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
    
    // Sanitize the update data
    const sanitizedData = {
      ...updateData,
      pinCodeStatus: sanitizeEnumField(updateData.pinCodeStatus),
      ssnNumberStatus: sanitizeEnumField(updateData.ssnNumberStatus),
      basicPackageStatus: sanitizeEnumField(updateData.basicPackageStatus),
      bundle: sanitizeEnumField(updateData.bundle),
      status: sanitizeEnumField(updateData.status)
    };
    
    // Map appointment_datetime to appointmentDateTime for the model
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
            customerName = `${customer.firstName}`.trim() || 'Unknown Customer';
          }
        }
        
        if (sale.agentId) {
          const { UserService } = await import('../../../../lib/sequelize-db.js');
          const agent = await UserService.findById(sale.agentId);
          if (agent) {
            agentName = `${agent.firstName} ${agent.lastName}`.trim() || 'Unknown Agent';
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
        // Send to supervisors via Socket.IO (only if server is ready)
        if (socketManager.isReady()) {
          socketManager.sendNotificationToSupervisors(notification);
        } else {
          console.warn('⚠️ Socket.IO server not ready, skipping real-time notification');
        }
        
        // Also send to database for persistence
        await NotificationManager.notifySaleStatusUpdated({
          agentId: sale.agentId,
          agentName,
          customerId: sale.customerId,
          saleId: sale.id,
          oldStatus: originalSale.status,
          newStatus: sale.status,
          customerName
        });
      }
    } catch (notificationError) {
      console.error('Error sending sale update notification:', notificationError);
      // Don't fail the sale update if notification fails
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
