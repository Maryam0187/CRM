import { NotificationService, SupervisorAgentService } from './sequelize-db.js';

/**
 * NotificationManager - Handles notification creation and management
 */
export const NotificationManager = {
  /**
   * Notify when a sale status is updated
   * @param {Object} data - Sale update data
   * @param {number} data.agentId - Agent ID
   * @param {number} data.customerId - Customer ID
   * @param {number} data.saleId - Sale ID
   * @param {string} data.oldStatus - Previous status
   * @param {string} data.newStatus - New status
   * @param {string} data.customerName - Customer name
   * @param {number} [data.excludeUserId] - User ID to exclude (e.g. the updater — they don't need a notification for their own action)
   */
  async notifySaleStatusUpdated(data) {
    try {
      const { agentId, agentName, customerId, saleId, oldStatus, newStatus, customerName, excludeUserId } = data;
      
      // Create notification for supervisors
      const notification = {
        userId: null, // Will be set for each supervisor
        type: 'sale_status_updated',
        title: `${agentName || 'Unknown Agent'} - Sale Status Updated`,
        message: `Sale status changed from ${oldStatus} to ${newStatus} for ${customerName}`,
        isRead: false,
        relatedId: saleId,
        relatedType: 'sale'
      };

      // Get only supervisors of this agent (not all supervisors); exclude the updater
      const supervisors = agentId
        ? (await SupervisorAgentService.getSupervisors(agentId)).filter(s => s.id !== excludeUserId)
        : [];
      
      for (const supervisor of supervisors) {
        await NotificationService.create({
          ...notification,
          userId: supervisor.id
        });
      }

      console.log(`📨 Sale status update notification sent to ${supervisors.length} supervisor(s) of agent ${agentId}`);
      return { success: true, supervisorsCount: supervisors.length };
      
    } catch (error) {
      console.error('Error sending sale status update notification:', error);
      throw error;
    }
  },

  /**
   * Notify when a sale is completed
   * @param {Object} data - Sale completion data
   * @param {number} data.agentId - Agent ID
   * @param {number} data.customerId - Customer ID
   * @param {number} data.saleId - Sale ID
   * @param {string} data.status - Sale status
   * @param {string} data.customerName - Customer name
   */
  async notifySaleCompleted(data) {
    try {
      const { agentId, customerId, saleId, status, customerName } = data;
      
      // Create notification for supervisors
      const notification = {
        userId: null, // Will be set for each supervisor
        type: 'sale_completed',
        title: 'Sale Completed',
        message: `Sale completed for ${customerName} (Status: ${status})`,
        isRead: false,
        relatedId: saleId,
        relatedType: 'sale'
      };

      // Get only supervisors of this agent (not all supervisors)
      const supervisors = agentId
        ? await SupervisorAgentService.getSupervisors(agentId)
        : [];
      
      for (const supervisor of supervisors) {
        await NotificationService.create({
          ...notification,
          userId: supervisor.id
        });
      }

      console.log(`📨 Sale completion notification sent to ${supervisors.length} supervisor(s) of agent ${agentId}`);
      return { success: true, supervisorsCount: supervisors.length };
      
    } catch (error) {
      console.error('Error sending sale completion notification:', error);
      throw error;
    }
  },

  /**
   * Notify when a new sale is created
   * @param {Object} data - Sale creation data
   * @param {number} data.agentId - Agent ID
   * @param {number} data.customerId - Customer ID
   * @param {number} data.saleId - Sale ID
   * @param {string} data.status - Sale status
   * @param {string} data.customerName - Customer name
   */
  async notifySaleCreated(data) {
    try {
      const { agentId, agentName, customerId, saleId, status, customerName } = data;
      
      // Create notification for supervisors
      const notification = {
        userId: null, // Will be set for each supervisor
        type: 'sale_created',
        title: `${agentName || 'Unknown Agent'} - New Sale Created`,
        message: `New sale created for ${customerName} (Status: ${status})`,
        isRead: false,
        relatedId: saleId,
        relatedType: 'sale'
      };

      // Get only supervisors of this agent (not all supervisors)
      const supervisors = agentId
        ? await SupervisorAgentService.getSupervisors(agentId)
        : [];
      
      for (const supervisor of supervisors) {
        await NotificationService.create({
          ...notification,
          userId: supervisor.id
        });
      }

      console.log(`📨 Sale creation notification sent to ${supervisors.length} supervisor(s) of agent ${agentId}`);
      return { success: true, supervisorsCount: supervisors.length };
      
    } catch (error) {
      console.error('Error sending sale creation notification:', error);
      throw error;
    }
  },

  /**
   * Send custom notification to specific users
   * @param {Object} data - Notification data
   * @param {Array<number>} data.userIds - Array of user IDs
   * @param {string} data.type - Notification type
   * @param {string} data.title - Notification title
   * @param {string} data.message - Notification message
   * @param {number} data.relatedId - Related entity ID
   * @param {string} data.relatedType - Related entity type
   */
  async sendCustomNotification(data) {
    try {
      const { userIds, type, title, message, relatedId, relatedType } = data;
      
      const notifications = [];
      
      for (const userId of userIds) {
        const notification = await NotificationService.create({
          userId,
          type,
          title,
          message,
          isRead: false,
          relatedId,
          relatedType
        });
        
        notifications.push(notification);
      }

      console.log(`📨 Custom notification sent to ${notifications.length} users`);
      return { success: true, notifications };
      
    } catch (error) {
      console.error('Error sending custom notification:', error);
      throw error;
    }
  },

  /**
   * Get all supervisors
   * @returns {Promise<Array>} Array of supervisor users
   */
  async getSupervisors() {
    try {
      const { UserService } = await import('./sequelize-db.js');
      const users = await UserService.findAll();
      return users.filter(user => user.role === 'supervisor');
    } catch (error) {
      console.error('Error getting supervisors:', error);
      return [];
    }
  },

  /**
   * Get all admins
   * @returns {Promise<Array>} Array of admin users
   */
  async getAdmins() {
    try {
      const { UserService } = await import('./sequelize-db.js');
      const users = await UserService.findAll();
      return users.filter(user => user.role === 'admin');
    } catch (error) {
      console.error('Error getting admins:', error);
      return [];
    }
  },

  /**
   * Get all agents
   * @returns {Promise<Array>} Array of agent users
   */
  async getAgents() {
    try {
      const { UserService } = await import('./sequelize-db.js');
      const users = await UserService.findAll();
      return users.filter(user => user.role === 'agent');
    } catch (error) {
      console.error('Error getting agents:', error);
      return [];
    }
  },

  /**
   * Get users by role
   * @param {string} role - User role
   * @returns {Promise<Array>} Array of users with specified role
   */
  async getUsersByRole(role) {
    try {
      const { UserService } = await import('./sequelize-db.js');
      const users = await UserService.findAll();
      return users.filter(user => user.role === role);
    } catch (error) {
      console.error(`Error getting users with role ${role}:`, error);
      return [];
    }
  },

  /**
   * Send notification to all users with specific role
   * @param {string} role - User role
   * @param {Object} notificationData - Notification data
   */
  async notifyRole(role, notificationData) {
    try {
      const users = await this.getUsersByRole(role);
      
      if (users.length === 0) {
        console.log(`No users found with role: ${role}`);
        return { success: true, usersCount: 0 };
      }

      const notifications = [];
      
      for (const user of users) {
        const notification = await NotificationService.create({
          userId: user.id,
          ...notificationData
        });
        
        notifications.push(notification);
      }

      console.log(`📨 Notification sent to ${notifications.length} users with role: ${role}`);
      return { success: true, usersCount: notifications.length };
      
    } catch (error) {
      console.error(`Error sending notification to role ${role}:`, error);
      throw error;
    }
  },

  /**
   * Send notification to specific user
   * @param {number} userId - User ID
   * @param {Object} notificationData - Notification data
   */
  async notifyUser(userId, notificationData) {
    try {
      const notification = await NotificationService.create({
        userId,
        ...notificationData
      });

      console.log(`📨 Notification sent to user ${userId}`);
      return { success: true, notification };
      
    } catch (error) {
      console.error(`Error sending notification to user ${userId}:`, error);
      throw error;
    }
  }
};

export default NotificationManager;
