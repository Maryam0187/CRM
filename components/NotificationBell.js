'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useSocket } from '../contexts/SocketContext';
import { useCall } from '../contexts/CallContext';
import { authenticatedFetch } from '../lib/apiClient';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { 
  setNotifications, 
  markNotificationAsRead, 
  markAllAsRead,
  setLoading,
  setError 
} from '../store/slices/notificationSlice';

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

export default function NotificationBell() {
  const { user } = useAuth();
  const { showSuccess, showError, showInfo } = useToast();
  const { 
    isConnected, 
    connectionStatus, 
    reconnect
  } = useSocket();
  const { startCall } = useCall();
  const router = useRouter();
  const dispatch = useAppDispatch();
  
  // Redux state
  const { notifications, unreadCount, totalCount, isLoading, error } = useAppSelector(state => state.notifications);
  
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch notifications from API and update Redux store
  const fetchNotifications = async () => {
    if (!user) return;
    
    dispatch(setLoading(true));
    try {
      // Fetch latest 20 notifications for dropdown display
      const response = await authenticatedFetch(`/api/notifications?limit=20`);
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
        
        // Store notifications with total count from API
        dispatch(setNotifications({
          notifications: mappedNotifications,
          totalCount: data.data.total || mappedNotifications.length,
          unreadCount: data.data.unreadCount || 0
        }));
      } else {
        dispatch(setError(data.error || 'Failed to fetch notifications'));
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
      dispatch(setError('Failed to fetch notifications'));
    } finally {
      dispatch(setLoading(false));
    }
  };

  // Handle notification hover (mark as read)
  const handleMarkNotificationAsReadOnHover = async (notification) => {
    if (notification.isRead) return;
    
    try {
      await authenticatedFetch('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          notificationId: notification.id,
          action: 'mark_read'
        })
      });
      
      // Update Redux store
      dispatch(markNotificationAsRead(notification.id));
    } catch (error) {
      console.error('Error marking notification as read on hover:', error);
    }
  };

  // Handle join call button click
  const handleJoinCall = async (e, notification) => {
    e.stopPropagation(); // Prevent notification click
    
    if (!notification.conferenceName) {
      showError('Conference name not available');
      return;
    }

    try {
      // Mark notification as read
      if (!notification.isRead) {
        await authenticatedFetch('/api/notifications', {
          method: 'PUT',
          body: JSON.stringify({
            notificationId: notification.id,
            action: 'mark_read'
          })
        });
        dispatch(markNotificationAsRead(notification.id));
      }

      // Start call using CallContext - this opens GlobalWebCallInterface
      startCall({
        callSid: notification.callSid,
        conferenceName: notification.conferenceName,
        customerId: notification.customerId,
        saleId: notification.lastSaleId,
        phoneNumber: notification.callerNumber,
        customerName: notification.customerName
      });

      // Close dropdown
      setIsOpen(false);
      showSuccess('Opening call interface...');
    } catch (error) {
      console.error('Error joining call:', error);
      showError('Failed to open call interface');
    }
  };

  // Handle notification click
  const handleNotificationClick = async (notification) => {
    // For inbound call notifications, open GlobalWebCallInterface and sale
    if (notification.conferenceName) {
      // Mark as read
      if (!notification.isRead) {
        try {
          await authenticatedFetch('/api/notifications', {
            method: 'PUT',
            body: JSON.stringify({
              notificationId: notification.id,
              action: 'mark_read'
            })
          });
          dispatch(markNotificationAsRead(notification.id));
        } catch (error) {
          console.error('Error marking notification as read:', error);
        }
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

      // Open the sale in the same window if saleId exists
      if (notification.lastSaleId || notification.saleId) {
        router.push(`/add-sale?id=${notification.lastSaleId || notification.saleId}`);
      }

      // Close dropdown but keep notification visible
      setIsOpen(false);
      return;
    }

    // Mark as read if not already read
    if (!notification.isRead) {
      try {
        await authenticatedFetch('/api/notifications', {
          method: 'PUT',
          body: JSON.stringify({
            notificationId: notification.id,
            action: 'mark_read'
          })
        });
        
        // Update Redux store
        dispatch(markNotificationAsRead(notification.id));
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    }
    
    // Close dropdown and navigate
    setIsOpen(false);
    
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

  // Toggle dropdown
  const toggleDropdown = () => {
    if (!isOpen && (user?.role === 'supervisor' || user?.role === 'admin')) {
      // Use cache to prevent excessive API calls
      const lastFetch = localStorage.getItem('lastNotificationFetch');
      const now = Date.now();
      const shouldFetch = !notifications.length || 
                        !lastFetch || 
                        (now - parseInt(lastFetch)) > 2000; // 2 seconds
      
      if (shouldFetch) {
        fetchNotifications();
        localStorage.setItem('lastNotificationFetch', now.toString());
      }
    }
    setIsOpen(!isOpen);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    // Listen for custom event to close dropdown when new notification arrives
    const handleCloseDropdown = () => {
      setIsOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('closeNotificationDropdown', handleCloseDropdown);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('closeNotificationDropdown', handleCloseDropdown);
    };
  }, []);

  // Show latest 5 notifications in dropdown
  const displayNotifications = notifications.slice(0, 5);

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

  if (!user) return null;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Notification Bell Button */}
      <button
        onClick={toggleDropdown}
        className="relative p-2 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-100 rounded-full transition-colors duration-200"
        title="Notifications"
      >
        
        {/* Bell Icon */}
        <span className="text-xl">🔔</span>
        
        {/* Unread Count Badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium z-10">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        
        {/* Connection Status Indicator */}
        <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full ${
          connectionStatus === 'connected' ? 'bg-green-500' :
          connectionStatus === 'reconnecting' ? 'bg-yellow-500' :
          connectionStatus === 'error' || connectionStatus === 'failed' ? 'bg-red-500' :
          connectionStatus === 'waiting_for_auth' ? 'bg-blue-500' :
          connectionStatus === 'not_supervisor' ? 'bg-gray-400' :
          'bg-gray-400'
        }`} title={`Connection: ${connectionStatus}`}></div>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              <div className="flex items-center space-x-2">
                {/* Connection Status */}
                <span className={`text-xs px-2 py-1 rounded-full ${
                  connectionStatus === 'connected' ? 'text-green-600' :
                  connectionStatus === 'reconnecting' ? 'text-yellow-600' :
                  connectionStatus === 'error' ? 'text-red-600' :
                  connectionStatus === 'failed' ? 'text-red-800' :
                  connectionStatus === 'waiting_for_auth' ? 'text-blue-600' :
                  connectionStatus === 'not_supervisor' ? 'text-gray-500' :
                  'text-gray-500'
                }`}>
                  {connectionStatus === 'connected' ? 'Connected' :
                   connectionStatus === 'reconnecting' ? 'Reconnecting...' :
                   connectionStatus === 'error' ? 'Connection Error' :
                   connectionStatus === 'failed' ? 'Connection Failed' :
                   connectionStatus === 'waiting_for_auth' ? 'Waiting for Authentication' :
                   connectionStatus === 'not_supervisor' ? 'Not Connected' :
                   'Disconnected'}
                </span>
                
                {/* Reconnect Button */}
                {connectionStatus !== 'connected' && connectionStatus !== 'waiting_for_auth' && (
                  <button
                    onClick={reconnect}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    Reconnect
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Notifications List */}
          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">
                Loading notifications...
              </div>
            ) : error ? (
              <div className="p-4 text-center text-red-500">
                Error: {error}
              </div>
            ) : displayNotifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No notifications
              </div>
            ) : (
              displayNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors duration-150 ${
                    !notification.isRead ? 'bg-blue-50' : ''
                  } ${notification.conferenceName ? '' : 'cursor-pointer'}`}
                  onMouseEnter={() => handleMarkNotificationAsReadOnHover(notification)}
                  onClick={() => !notification.conferenceName && handleNotificationClick(notification)}
                >
                  <div className="flex items-start space-x-3">
                    <div className="text-lg">{getNotificationIcon(notification)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className={`text-sm font-medium ${
                          !notification.isRead ? 'text-gray-900' : 'text-gray-700'
                        }`}>
                          {notification.title}
                        </p>
                        {!notification.isRead && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0"></div>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                        {notification.message}
                      </p>
                      
                      {/* Action buttons for inbound calls */}
                      {notification.conferenceName && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={(e) => handleJoinCall(e, notification)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors duration-200 flex items-center gap-1"
                          >
                            <span>📞</span>
                            <span>Join Call</span>
                          </button>
                          {notification.lastSaleId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/add-sale?id=${notification.lastSaleId}`);
                                setIsOpen(false);
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors duration-200 border border-blue-200"
                            >
                              View Last Sale
                            </button>
                          )}
                          {notification.customerId && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/customers/${notification.customerId}`);
                                setIsOpen(false);
                              }}
                              className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors duration-200 border border-gray-200"
                            >
                              View Customer
                            </button>
                          )}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400">
                          {notification.time}
                        </span>
                        {!notification.conferenceName && (
                          <span className="text-xs text-gray-300 font-mono">
                            ID: {notification.id}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {displayNotifications.length > 0 && (
            <div className="p-4 border-t border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                  <span className="text-sm font-medium text-gray-700">
                    {unreadCount} unread • {totalCount || notifications.length} total
                  </span>
                </div>
                <div className="flex space-x-3">
                  <button
                    onClick={handleMarkAllAsRead}
                    className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors duration-200 border border-blue-200"
                  >
                    Mark all as read
                  </button>
                  <button
                    onClick={() => router.push('/notifications')}
                    className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors duration-200 border border-gray-200"
                  >
                    View all
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
