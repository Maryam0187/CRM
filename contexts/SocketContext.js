'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthContext';
import { useAppDispatch } from '../store/hooks';
import { addNotification } from '../store/slices/notificationSlice';
import { useToast } from './ToastContext';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user, accessToken, logout } = useAuth();
  const router = useRouter();
  const { showWarning, showError } = useToast();
  const dispatch = useAppDispatch();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [notifications, setNotifications] = useState([]);
  const [toastNotifications, setToastNotifications] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const [callStatusUpdates, setCallStatusUpdates] = useState(new Map());
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;
  const socketInitializedRef = useRef(false);

  // Initialize socket connection
  useEffect(() => {
    // Don't attempt connection if user is not authenticated or no access token
    if (!user || !accessToken) {
      // Only log if we had a socket before (to avoid spam during initial load)
      if (socket && isConnected) {
        console.log('⚠️ User or access token unavailable - socket will disconnect');
        setIsConnected(false);
        setConnectionStatus('waiting_for_auth');
      } else {
        // Silent check - don't spam console during normal auth flow
      setIsConnected(false);
      setConnectionStatus('waiting_for_auth');
      }
      socketInitializedRef.current = false;
      return;
    }

    // Prevent re-initialization if socket already exists and is connected
    if (socket && socket.connected) {
      socketInitializedRef.current = true;
      return;
    }

    // Prevent re-initialization if we're already in the process of initializing
    if (socketInitializedRef.current && socket) {
      return;
    }

    socketInitializedRef.current = true;

    console.log('🔌 Initializing Socket.IO connection...');
    
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Determine the correct Socket.IO URL
    let socketUrl;
    if (isProduction) {
      // Production: Use environment variable or fallback to Railway URL
      socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'https://crm-production-0339.up.railway.app';
    } else {
      // Development: Use localhost with current port
      const port = window.location.port || '3000';
      socketUrl = `http://localhost:${port}`;
    }
    
    console.log('Socket URL:', socketUrl);
    console.log('Environment:', isProduction ? 'production' : 'development');
    
    const socketInstance = io(socketUrl, {
      auth: {
        token: accessToken
      },
      transports: isProduction ? ['websocket'] : ['websocket', 'polling'],
      timeout: isProduction ? 60000 : 20000,
      forceNew: true,
      // Development optimizations
      ...(!isProduction && {
        upgrade: true,
        rememberUpgrade: false,
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: 3,
        compression: false,
        path: '/api/socket'
      }),
      // Production optimizations
      ...(isProduction && {
        upgrade: true,
        rememberUpgrade: true,
        autoConnect: true,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        maxReconnectionAttempts: 5,
        compression: true,
        path: process.env.NEXT_PUBLIC_SOCKET_PATH || '/api/socket'
      })
    });

    // Connection event handlers
    socketInstance.on('connect', () => {
      console.log('🔗 Socket.IO connected:', socketInstance.id);
      setIsConnected(true);
      setConnectionStatus('connected');
      reconnectAttempts.current = 0;
      
      // Clear any existing reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    socketInstance.on('connected', (data) => {
      console.log('✅ Socket.IO connection confirmed:', data);
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('🔌 Socket.IO disconnected:', reason);
      setIsConnected(false);
      setConnectionStatus('disconnected');
      
      // Attempt to reconnect if not a manual disconnect
      if (reason !== 'io client disconnect' && user) {
        attemptReconnect();
      }
    });

    socketInstance.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection error:', error);
      setIsConnected(false);
      setConnectionStatus('error');
      
      if (user) {
        attemptReconnect();
      }
    });

    // Notification handlers
    socketInstance.on('notification', (notification) => {
      console.log('📨 Received notification:', notification);
      
      // Format the time field for display
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

      // Format the notification time
      const formattedNotification = {
        ...notification,
        time: notification.time ? formatNotificationTime(new Date(notification.time)) : 'Just now'
      };
      
      // Dispatch to Redux store
      dispatch(addNotification(formattedNotification));
      
      // Dispatch custom event to notify components about new notification
      // This allows the notifications page to update its total count
      const newNotificationEvent = new CustomEvent('newNotificationArrived', {
        detail: { notification: formattedNotification }
      });
      window.dispatchEvent(newNotificationEvent);
      
      // Close notification dropdown when new notification arrives
      // This ensures user sees fresh data from database instead of stale dropdown data
      const closeDropdownEvent = new CustomEvent('closeNotificationDropdown');
      window.dispatchEvent(closeDropdownEvent);
      
      // Keep local state for backward compatibility (can be removed later)
      setNotifications(prev => {
        const exists = prev.some(n => n.id === notification.id);
        if (exists) {
          console.log('🔍 Duplicate notification detected, skipping:', notification.id);
          return prev;
        }
        return [formattedNotification, ...prev.slice(0, 49)];
      });
      
      // Add to toast notifications for real-time display (also deduplicate)
      setToastNotifications(prev => {
        const exists = prev.some(n => n.id === notification.id);
        if (exists) {
          return prev;
        }
        return [formattedNotification, ...prev.slice(0, 4)]; // Keep max 5 toasts
      });
    });

    // User presence handlers
    socketInstance.on('user_joined', (data) => {
      console.log('👤 User joined:', data);
      setOnlineUsers(prev => new Set([...prev, data.userId]));
    });

    socketInstance.on('user_left', (data) => {
      console.log('👤 User left:', data);
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.userId);
        return newSet;
      });
    });

    socketInstance.on('user_disconnected', (data) => {
      console.log('👤 User disconnected:', data);
      setOnlineUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(data.userId);
        return newSet;
      });
    });

    // Typing indicators
    socketInstance.on('user_typing', (data) => {
      console.log('⌨️ User typing:', data);
      setTypingUsers(prev => {
        const newMap = new Map(prev);
        newMap.set(data.userId, data);
        return newMap;
      });
    });

    socketInstance.on('user_stopped_typing', (data) => {
      console.log('⌨️ User stopped typing:', data);
      setTypingUsers(prev => {
        const newMap = new Map(prev);
        newMap.delete(data.userId);
        return newMap;
      });
    });

    // Call status update handlers
    socketInstance.on('call_status_update', (data) => {
      console.log('📞 Call status update received:', data);
      console.log('📞 Socket.IO event data:', JSON.stringify(data, null, 2));
      console.log('📞 Current user ID:', user?.id);
      console.log('📞 Call agent ID:', data.agentId);
      console.log('📞 Is this call for current user?', user?.id === data.agentId);
      
      // Update call status in state
      setCallStatusUpdates(prev => {
        const newMap = new Map(prev);
        newMap.set(data.callSid, data);
        console.log('📞 Updated call status map:', Array.from(newMap.entries()));
        return newMap;
      });

      // Dispatch custom event for components to listen to
      const callStatusEvent = new CustomEvent('callStatusUpdate', {
        detail: { callStatusData: data }
      });
      console.log('📞 Dispatching custom event:', callStatusEvent);
      window.dispatchEvent(callStatusEvent);
    });

    // Force logout handler
    socketInstance.on('force_logout', (data) => {
      console.log('🔐 Force logout received:', data);
      const { reason, message } = data;
      
      // Show appropriate notification based on reason
      if (reason === 'account_deactivated') {
        showError(message || 'Your account has been deactivated by an administrator.');
      } else if (reason === 'admin_action') {
        showWarning(message || 'You have been logged out by an administrator.');
      } else {
        // new_login or other reasons
        showWarning(message || 'You have been logged out because you logged in from another device.');
      }
      
      // Logout and redirect after a short delay to allow notification to be seen
      setTimeout(() => {
        logout();
        router.push('/signin');
      }, 2000);
    });

    setSocket(socketInstance);

    // Cleanup on unmount or when dependencies change
    return () => {
      socketInitializedRef.current = false;
      // Only log cleanup if socket was actually connected
      if (socketInstance && socketInstance.connected) {
      console.log('🧹 Cleaning up socket connection...');
      }
      if (socketInstance) {
        socketInstance.disconnect();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [user, accessToken]);

  // Handle authentication state changes
  useEffect(() => {
    if (user && accessToken && !isConnected && connectionStatus === 'waiting_for_auth') {
      console.log('🔐 User authenticated, attempting socket connection...');
      // The main useEffect will handle the connection
    } else if ((!user || !accessToken) && isConnected) {
      console.log('🔐 User logged out or access token missing, disconnecting socket...');
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
        setConnectionStatus('disconnected');
      }
    }
  }, [user, accessToken, isConnected, connectionStatus]);

  // Reconnection logic
  const attemptReconnect = () => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      setConnectionStatus('failed');
      return;
    }

    reconnectAttempts.current++;
    console.log(`Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
    setConnectionStatus('reconnecting');

    reconnectTimeoutRef.current = setTimeout(() => {
      if (socket) {
        socket.connect();
      }
    }, reconnectDelay * reconnectAttempts.current);
  };

  // Manual reconnection
  const reconnect = () => {
    if (socket) {
      reconnectAttempts.current = 0;
      socket.connect();
    }
  };

  // Join room
  const joinRoom = (roomName) => {
    if (socket && isConnected) {
      socket.emit('join_room', roomName);
      console.log(`🏠 Joined room: ${roomName}`);
    }
  };

  // Leave room
  const leaveRoom = (roomName) => {
    if (socket && isConnected) {
      socket.emit('leave_room', roomName);
      console.log(`🚪 Left room: ${roomName}`);
    }
  };

  // Send typing indicator
  const startTyping = (roomName, message = '') => {
    if (socket && isConnected) {
      socket.emit('typing_start', { roomName, message });
    }
  };

  const stopTyping = (roomName) => {
    if (socket && isConnected) {
      socket.emit('typing_stop', { roomName });
    }
  };

  // Get online users count
  const getOnlineUsersCount = () => {
    return onlineUsers.size;
  };

  // Get typing users for a room
  const getTypingUsers = (roomName) => {
    return Array.from(typingUsers.values()).filter(user => user.roomName === roomName);
  };

  // Call room management
  const joinCallRoom = (callSid) => {
    if (socket && isConnected) {
      socket.emit('join_call_room', callSid);
      console.log(`📞 Joined call room: ${callSid}`);
    }
  };

  const leaveCallRoom = (callSid) => {
    if (socket && isConnected) {
      socket.emit('leave_call_room', callSid);
      console.log(`📞 Left call room: ${callSid}`);
    }
  };

  // Get call status for a specific call
  const getCallStatus = (callSid) => {
    return callStatusUpdates.get(callSid);
  };

  // Get all call statuses
  const getAllCallStatuses = () => {
    return Array.from(callStatusUpdates.values());
  };

  const value = {
    socket,
    isConnected,
    connectionStatus,
    notifications,
    toastNotifications,
    typingUsers,
    onlineUsers,
    callStatusUpdates,
    reconnect,
    joinRoom,
    leaveRoom,
    startTyping,
    stopTyping,
    getOnlineUsersCount,
    getTypingUsers,
    joinCallRoom,
    leaveCallRoom,
    getCallStatus,
    getAllCallStatuses
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
