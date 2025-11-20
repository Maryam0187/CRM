import { NotificationManager } from '../../../../lib/notificationService.js';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { UserService, NotificationService } from '../../../../lib/sequelize-db.js';

export async function POST(request) {
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return Response.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { receiverName, carrierName, createdBy } = await request.json();

    if (!receiverName || !carrierName) {
      return Response.json(
        { success: false, message: 'Receiver name and carrier name are required' },
        { status: 400 }
      );
    }

    // Get all admin users directly
    const allUsers = await UserService.findAll();
    
    // Filter for admin users - handle both dataValues and plain objects
    const admins = allUsers.filter(user => {
      const userRole = user.dataValues ? user.dataValues.role : user.role;
      const isActive = user.dataValues ? user.dataValues.isActive : user.isActive;
      return userRole === 'admin' && isActive !== false;
    });
    
    if (admins.length === 0) {
      return Response.json({
        success: false,
        message: 'No admin users found to notify'
      });
    }

    // Create notification for each admin
    const notificationData = {
      type: 'custom',
      title: 'New Receiver Added',
      message: `${createdBy || 'A user'} added a new receiver "${receiverName}" for carrier "${carrierName}". Please review and approve if needed.`,
      isRead: false,
      relatedType: 'receiver',
      relatedId: null // No specific receiver ID, just navigate to management page
    };

    const notifications = [];
    for (const admin of admins) {
      const adminId = admin.dataValues ? admin.dataValues.id : admin.id;
      try {
        const notification = await NotificationService.create({
          userId: adminId,
          ...notificationData
        });
        notifications.push(notification);
        
        // Broadcast notification via socket for real-time updates
        try {
          const socketManager = require('../../../../lib/socket');
          const notificationForSocket = {
            id: notification.id || notification.dataValues?.id,
            userId: adminId,
            type: notificationData.type,
            title: notificationData.title,
            message: notificationData.message,
            isRead: false,
            relatedType: notificationData.relatedType,
            relatedId: notificationData.relatedId,
            route: '/admin/receivers', // Add route for navigation
            createdAt: notification.createdAt || notification.dataValues?.createdAt || new Date(),
            time: new Date()
          };
          
          // Send to specific admin user via socket
          socketManager.sendNotificationToUser(adminId, notificationForSocket);
        } catch (socketError) {
          // Don't fail the whole operation if socket fails
        }
      } catch (notifyError) {
        console.error('Failed to create notification:', notifyError);
      }
    }

    // Also broadcast to all admins room for real-time updates
    try {
      const socketManager = require('../../../../lib/socket');
      if (notifications.length > 0) {
        const firstNotification = notifications[0];
        const socketNotification = {
          id: firstNotification.id || firstNotification.dataValues?.id,
          type: notificationData.type,
          title: notificationData.title,
          message: notificationData.message,
          isRead: false,
          relatedType: notificationData.relatedType,
          relatedId: notificationData.relatedId,
          route: '/admin/receivers', // Add route for navigation
          createdAt: firstNotification.createdAt || firstNotification.dataValues?.createdAt || new Date(),
          time: new Date()
        };
        socketManager.sendNotificationToAdmins(socketNotification);
      }
    } catch (socketError) {
      // Don't fail the whole operation if socket fails
    }

    return Response.json({
      success: true,
      message: `Admins notified successfully (${notifications.length} notifications sent)`,
      notificationsCount: notifications.length
    });
  } catch (error) {
    console.error('Notify admin error:', error);
    return Response.json(
      { success: false, message: 'Failed to notify admins', error: error.message },
      { status: 500 }
    );
  }
}

