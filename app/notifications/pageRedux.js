'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { 
  setNotifications, 
  markNotificationAsRead, 
  markAllAsRead,
  setLoading,
  setError 
} from '../../store/slices/notificationSlice';
import { authenticatedFetch } from '../../lib/apiClient';

// Format notification time to be more readable
const formatNotificationTime = (date) => {
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) {
    return 'Just now';
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes}m ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours}h ago`;
  } else if (diffInSeconds < 604800) {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days}d ago`;
  } else {
    return date.toLocaleDateString();
  }
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const dispatch = useAppDispatch();
  
  // Redux state
  const { notifications, unreadCount, isLoading, error } = useAppSelector(state => state.notifications);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 20;

  // Fetch notifications from API and update Redux store
  const fetchNotifications = useCallback(async (page = 1) => {
    if (!user) return;
    
    dispatch(setLoading(true));
    try {
      const response = await authenticatedFetch(`/api/notifications?page=${page}&limit=${itemsPerPage}`);
      const data = await response.json();
      
      if (data.success && data.data.notifications) {
        const mappedNotifications = data.data.notifications.map(notification => {
          const timestamp = notification.createdAt || notification.created_at || notification.timestamp;
          
          return {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            isRead: notification.isRead || notification.is_read || false,
            time: timestamp ? formatNotificationTime(new Date(timestamp)) : 'Just now',
            saleId: notification.saleId || notification.sale_id,
            agentName: notification.agentName || notification.agent_name,
            createdAt: timestamp
          };
        });
        
        dispatch(setNotifications(mappedNotifications));
        setTotalPages(Math.ceil(data.data.total / itemsPerPage));
      } else {
        dispatch(setError(data.error || 'Failed to fetch notifications'));
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      dispatch(setError('Failed to fetch notifications'));
    } finally {
      dispatch(setLoading(false));
    }
  }, [user, dispatch, itemsPerPage]);

  // Handle mark as read
  const handleMarkAsRead = async (notificationId) => {
    try {
      await authenticatedFetch('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          notificationId,
          action: 'mark_read'
        })
      });
      
      // Update Redux store
      dispatch(markNotificationAsRead(notificationId));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  // Handle mark all as read
  const handleMarkAllAsRead = async () => {
    try {
      await authenticatedFetch('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          action: 'mark_all_read'
        })
      });
      
      // Update Redux store
      dispatch(markAllAsRead());
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification) => {
    // Mark as read if not already read
    if (!notification.isRead) {
      await handleMarkAsRead(notification.id);
    }
    
    // Navigate based on notification type
    if (notification.saleId) {
      router.push(`/add-sale?id=${notification.saleId}`);
    } else {
      router.push('/');
    }
  };

  // Load notifications on component mount
  useEffect(() => {
    fetchNotifications(currentPage);
  }, [fetchNotifications, currentPage]);

  // Get notification icon
  const getNotificationIcon = (notification) => {
    if (notification.type) {
      switch (notification.type) {
        case 'sale_completed':
        case 'sale_status_updated':
        case 'sale_created':
          return '💰';
        case 'lead':
          return '🎯';
        case 'reminder':
          return '⏰';
        case 'training':
          return '📚';
        case 'system':
          return '⚙️';
        case 'user':
          return '👤';
        case 'report':
          return '📊';
        case 'appointment':
          return '📅';
        case 'payment':
          return '💳';
        case 'followup':
          return '📞';
        default:
          return '🔔';
      }
    }
    return '🔔';
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Please sign in to view notifications</h1>
          <button
            onClick={() => router.push('/signin')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
              <p className="text-gray-600 mt-1">
                {unreadCount > 0 ? `${unreadCount} unread notifications` : 'All notifications read'}
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllAsRead}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200"
              >
                Mark all as read
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-600 mt-2">Loading notifications...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center">
              <p className="text-red-600">{error}</p>
              <button
                onClick={() => fetchNotifications(currentPage)}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Retry
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-6xl mb-4">🔔</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications</h3>
              <p className="text-gray-600">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-6 hover:bg-gray-50 cursor-pointer transition-colors duration-150 ${
                    !notification.isRead ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                  }`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="flex items-start space-x-4">
                    <div className="text-2xl">{getNotificationIcon(notification)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h3 className={`text-lg font-medium ${
                          !notification.isRead ? 'text-gray-900' : 'text-gray-700'
                        }`}>
                          {notification.title}
                        </h3>
                        <div className="flex items-center space-x-2">
                          {!notification.isRead && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                          <span className="text-sm text-gray-500">{notification.time}</span>
                        </div>
                      </div>
                      <p className="text-gray-600 mt-1">{notification.message}</p>
                      {notification.agentName && (
                        <p className="text-sm text-gray-500 mt-2">
                          From: {notification.agentName}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-6 flex items-center justify-center space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="px-3 py-2 text-sm font-medium text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
