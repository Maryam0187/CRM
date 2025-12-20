'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useCall } from '../../contexts/CallContext';
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
  const { startCall } = useCall();
  const dispatch = useAppDispatch();
  
  // Redux state
  const { unreadCount, isLoading, error } = useAppSelector(state => state.notifications);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [activeTab, setActiveTab] = useState('unread'); // 'unread' or 'all'
  const [allNotifications, setAllNotifications] = useState([]);
  const [allTotalCount, setAllTotalCount] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState([]);
  const [unreadTotalCount, setUnreadTotalCount] = useState(0);
  const itemsPerPage = 20;

  // Fetch notifications from API and update Redux store
  const fetchNotifications = useCallback(async (page = 1, tab = 'unread') => {
    if (!user) return;
    
    dispatch(setLoading(true));
    try {
      const unreadOnly = tab === 'unread';
      const response = await authenticatedFetch(`/api/notifications?limit=${itemsPerPage}&offset=${(page - 1) * itemsPerPage}&unreadOnly=${unreadOnly}`);
      const data = await response.json();
      
      if (data.success && data.data.notifications) {
        const mappedNotifications = data.data.notifications.map(notification => {
          const timestamp = notification.createdAt || notification.created_at || notification.timestamp;
          
          // Determine route based on relatedType
          let route = notification.route;
          if (!route && notification.relatedType === 'receiver') {
            route = '/admin/receivers';
          }
          
          return {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            isRead: notification.isRead || notification.is_read || false,
            time: timestamp ? formatNotificationTime(new Date(timestamp)) : 'Just now',
            saleId: notification.saleId || notification.sale_id,
            lastSaleId: notification.lastSaleId || notification.last_sale_id,
            agentName: notification.agentName || notification.agent_name,
            relatedType: notification.relatedType || notification.related_type,
            route: route,
            createdAt: timestamp,
            // Inbound call specific fields
            conferenceName: notification.conferenceName || notification.conference_name,
            callSid: notification.callSid || notification.call_sid,
            callerNumber: notification.callerNumber || notification.caller_number,
            customerId: notification.customerId || notification.customer_id,
            customerName: notification.customerName || notification.customer_name
          };
        });
        
        // Store data separately for each tab
        if (tab === 'all') {
          setAllNotifications(mappedNotifications);
          setAllTotalCount(data.data.total);
          setTotalPages(Math.ceil(data.data.total / itemsPerPage));
        } else {
          setUnreadNotifications(mappedNotifications);
          setUnreadTotalCount(data.data.total);
          setTotalPages(Math.ceil(data.data.total / itemsPerPage));
        }
        
        // Update Redux store for dropdown (always use all notifications)
        if (tab === 'all') {
          dispatch(setNotifications({
            notifications: mappedNotifications,
            totalCount: data.data.total,
            unreadCount: data.data.unreadCount
          }));
        }
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
    // For inbound call notifications, open GlobalWebCallInterface and sale
    if (notification.conferenceName) {
      // Mark as read if not already read
      if (!notification.isRead) {
        await handleMarkAsRead(notification.id);
      }

      // Open GlobalWebCallInterface by starting the call
      startCall({
        callSid: notification.callSid,
        conferenceName: notification.conferenceName,
        customerId: notification.customerId,
        saleId: notification.lastSaleId,
        phoneNumber: notification.callerNumber,
        customerName: notification.customerName
      });

      // Open the sale in a new tab if saleId exists
      if (notification.lastSaleId || notification.saleId) {
        window.open(`/add-sale?id=${notification.lastSaleId || notification.saleId}`, '_blank');
      }

      return;
    }

    // Mark as read if not already read
    if (!notification.isRead) {
      await handleMarkAsRead(notification.id);
    }
    
    // Navigate based on notification type
    if (notification.route) {
      router.push(notification.route);
    } else if (notification.relatedType === 'receiver') {
      router.push('/admin/receivers');
    } else if (notification.saleId || notification.lastSaleId) {
      router.push(`/add-sale?id=${notification.saleId || notification.lastSaleId}`);
    } else {
      router.push('/');
    }
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setCurrentPage(1); // Reset to first page when changing tabs
    fetchNotifications(1, tab);
  };

  // Fetch counts for both tabs on component mount
  const fetchTabCounts = useCallback(async () => {
    if (!user) return;
    
    try {
      // Fetch "All" notifications count
      const allResponse = await authenticatedFetch(`/api/notifications?limit=1&offset=0`);
      const allData = await allResponse.json();
      if (allData.success) {
        setAllTotalCount(allData.data.total);
      }

      // Fetch "Unread" notifications count  
      const unreadResponse = await authenticatedFetch(`/api/notifications?limit=1&offset=0&unreadOnly=true`);
      const unreadData = await unreadResponse.json();
      if (unreadData.success) {
        setUnreadTotalCount(unreadData.data.total);
      }
    } catch (error) {
      console.error('Error fetching tab counts:', error);
    }
  }, [user]);

  // Load notifications on component mount
  useEffect(() => {
    fetchTabCounts(); // Fetch counts for both tabs
    fetchNotifications(currentPage, activeTab); // Fetch data for active tab
  }, [fetchTabCounts, fetchNotifications, currentPage, activeTab]);

  // Listen for new notifications from Socket.IO
  useEffect(() => {
    const handleNewNotification = (event) => {
      const { notification } = event.detail;
      
      // Determine route based on relatedType
      let route = notification.route;
      if (!route && notification.relatedType === 'receiver') {
        route = '/admin/receivers';
      }
      
      const formattedNotification = {
        ...notification,
        route: route,
        relatedType: notification.relatedType || notification.related_type
      };
      
      // Increment total count for "All" tab
      setAllTotalCount(prev => prev + 1);
      
      // If the notification is unread, increment unread count for "Unread" tab
      if (!notification.isRead) {
        setUnreadTotalCount(prev => prev + 1);
      }
      
      // If we're on the "Unread" tab and notification is unread, add it
      if (activeTab === 'unread' && !notification.isRead) {
        setUnreadNotifications(prev => [formattedNotification, ...prev]);
      }
      // If we're on the "All" tab, add the notification to the current page
      else if (activeTab === 'all') {
        setAllNotifications(prev => [formattedNotification, ...prev]);
      }
    };

    window.addEventListener('newNotificationArrived', handleNewNotification);
    
    return () => {
      window.removeEventListener('newNotificationArrived', handleNewNotification);
    };
  }, [activeTab]);

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
                {activeTab === 'unread' 
                  ? `${unreadTotalCount} unread notifications` 
                  : `${allTotalCount} total notifications`
                }
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
          
          {/* Tabs */}
          <div className="mt-6">
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => handleTabChange('unread')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'unread'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Unread Only
                  <span className="ml-2 bg-red-100 text-red-600 py-0.5 px-2 rounded-full text-xs">
                    {unreadTotalCount}
                  </span>
                </button>
                <button
                  onClick={() => handleTabChange('all')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'all'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  All Notifications
                  <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs">
                    {allTotalCount}
                  </span>
                </button>
              </nav>
            </div>
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
          ) : (activeTab === 'unread' ? unreadNotifications : allNotifications).length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-6xl mb-4">🔔</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No notifications</h3>
              <p className="text-gray-600">You're all caught up!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {(activeTab === 'unread' ? unreadNotifications : allNotifications).map((notification) => (
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
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-700">
                Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, activeTab === 'unread' ? unreadTotalCount : allTotalCount)} of {activeTab === 'unread' ? unreadTotalCount : allTotalCount} {activeTab === 'unread' ? 'unread notifications' : 'notifications'}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                
                {/* Page Numbers */}
                <div className="flex space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pageNum = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    if (pageNum > totalPages) return null;
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-2 text-sm font-medium rounded-md ${
                          currentPage === pageNum
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Last
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
