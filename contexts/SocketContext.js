'use client';

import { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useAppDispatch } from '../store/hooks';
import { addNotification } from '../store/slices/notificationSlice';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const { user, accessToken } = useAuth();
  const dispatch = useAppDispatch();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [notifications, setNotifications] = useState([]);
  const [toastNotifications, setToastNotifications] = useState([]);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const [onlineUsers, setOnlineUsers] = useState(new Set());
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  // Initialize socket connection
  useEffect(() => {
    // Don't attempt connection if user is not authenticated or no access token
    if (!user || !accessToken) {
      console.log('No user or access token available for socket connection - waiting for authentication');
      setIsConnected(false);
      setConnectionStatus('waiting_for_auth');
      return;
    }

    console.log('🔌 Initializing Socket.IO connection...');
    
    const socketInstance = io(process.env.NODE_ENV === 'production' 
      ? process.env.NEXT_PUBLIC_SOCKET_URL || 'https://your-domain.com'
      : 'http://localhost:3000', {
      auth: {
        token: accessToken
      },
      transports: ['websocket', 'polling'],
      timeout: 20000,
      forceNew: true
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

    setSocket(socketInstance);

    // Cleanup on unmount
    return () => {
      console.log('🧹 Cleaning up socket connection...');
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

  const value = {
    socket,
    isConnected,
    connectionStatus,
    notifications,
    toastNotifications,
    typingUsers,
    onlineUsers,
    reconnect,
    joinRoom,
    leaveRoom,
    startTyping,
    stopTyping,
    getOnlineUsersCount,
    getTypingUsers
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
