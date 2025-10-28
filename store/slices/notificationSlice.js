import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  notifications: [],
  unreadCount: 0,
  totalCount: 0,
  toastNotifications: [],
  isLoading: false,
  error: null,
};

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    // Add new notification (from Socket.IO)
    addNotification: (state, action) => {
      const notification = action.payload;
      const exists = state.notifications.some(n => n.id === notification.id);
      
      if (!exists) {
        state.notifications.unshift(notification);
        // Keep only latest 50 notifications
        state.notifications = state.notifications.slice(0, 50);
        
        // Increase unread count if notification is unread
        if (!notification.isRead) {
          state.unreadCount += 1;
        }
        
        // Add to toast notifications for real-time display
        const toastExists = state.toastNotifications.some(n => n.id === notification.id);
        if (!toastExists) {
          state.toastNotifications.unshift(notification);
          // Keep only latest 5 toasts
          state.toastNotifications = state.toastNotifications.slice(0, 5);
        }
      }
    },

    // Mark notification as read
    markNotificationAsRead: (state, action) => {
      const notificationId = action.payload;
      const notification = state.notifications.find(n => n.id === notificationId);
      
      if (notification && !notification.isRead) {
        notification.isRead = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },

    // Mark all notifications as read
    markAllAsRead: (state) => {
      state.notifications.forEach(notification => {
        if (!notification.isRead) {
          notification.isRead = true;
        }
      });
      state.unreadCount = 0;
    },

    // Set notifications from API
    setNotifications: (state, action) => {
      if (typeof action.payload === 'object' && action.payload.notifications) {
        // Handle object with notifications, totalCount, and unreadCount
        state.notifications = action.payload.notifications;
        state.totalCount = action.payload.totalCount || action.payload.notifications.length;
        state.unreadCount = action.payload.unreadCount || action.payload.notifications.filter(n => !n.isRead).length;
      } else {
        // Handle array of notifications (backward compatibility)
        state.notifications = action.payload;
        state.unreadCount = action.payload.filter(n => !n.isRead).length;
        state.totalCount = action.payload.length;
      }
    },

    // Clear all notifications
    clearNotifications: (state) => {
      state.notifications = [];
      state.unreadCount = 0;
    },

    // Remove toast notification
    removeToastNotification: (state, action) => {
      const notificationId = action.payload;
      state.toastNotifications = state.toastNotifications.filter(n => n.id !== notificationId);
    },

    // Clear all toast notifications
    clearToastNotifications: (state) => {
      state.toastNotifications = [];
    },

    // Set loading state
    setLoading: (state, action) => {
      state.isLoading = action.payload;
    },

    // Set error state
    setError: (state, action) => {
      state.error = action.payload;
    },
  },
});

export const {
  addNotification,
  markNotificationAsRead,
  markAllAsRead,
  setNotifications,
  clearNotifications,
  removeToastNotification,
  clearToastNotifications,
  setLoading,
  setError,
} = notificationSlice.actions;

export default notificationSlice.reducer;
