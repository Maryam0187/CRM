const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userRooms = new Map(); // userId -> [room1, room2, ...]
  }

  initialize(server) {
    if (!this.io) {
      this.io = new Server(server, {
        cors: {
          origin: process.env.NODE_ENV === 'production' 
            ? process.env.FRONTEND_URL 
            : "http://localhost:3000",
          methods: ["GET", "POST"],
          credentials: true
        },
        transports: ['websocket', 'polling']
      });

      this.setupMiddleware();
      this.setupEventHandlers();
      console.log('🔌 Socket.IO server initialized successfully');
    }
    return this.io;
  }

  setupMiddleware() {
    // Authentication middleware - using JWT tokens
    this.io.use((socket, next) => {
      try {
        const token = socket.handshake.auth.token || 
                      socket.handshake.headers.authorization?.replace('Bearer ', '') ||
                      socket.handshake.query.token;
        
        
        if (!token) {
          return next(new Error('Authentication error: No token provided'));
        }

        // Verify JWT token
        const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Check if it's an access token
        if (decoded.type !== 'access') {
          return next(new Error('Authentication error: Invalid token type'));
        }

        socket.userId = decoded.userId;
        socket.userRole = decoded.role;
        socket.userName = decoded.name;
        
        next();
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          next(new Error('Authentication error: Token expired'));
        } else if (error.name === 'JsonWebTokenError') {
          next(new Error('Authentication error: Invalid token'));
        } else {
          next(new Error('Authentication error: Token verification failed'));
        }
      }
    });
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`🔗 User ${socket.userId} (${socket.userName}) connected with socket ${socket.id}`);
      
      // Store user connection
      this.connectedUsers.set(socket.userId, socket.id);
      
      // Join user to role-based rooms
      this.joinUserToRooms(socket);
      
      // Handle room joining
      socket.on('join_room', (roomName) => {
        this.joinRoom(socket, roomName);
      });
      
      // Handle room leaving
      socket.on('leave_room', (roomName) => {
        this.leaveRoom(socket, roomName);
      });
      
      // Handle notification acknowledgment
      socket.on('notification_ack', (data) => {
        this.handleNotificationAck(socket, data);
      });
      
      // Handle typing indicators
      socket.on('typing_start', (data) => {
        this.handleTypingStart(socket, data);
      });
      
      socket.on('typing_stop', (data) => {
        this.handleTypingStop(socket, data);
      });
      
      // Handle disconnect
      socket.on('disconnect', (reason) => {
        console.log(`🔌 User ${socket.userId} disconnected: ${reason}`);
        this.handleDisconnect(socket);
      });
      
      // Send connection confirmation
      socket.emit('connected', {
        message: 'Connected to real-time notifications',
        userId: socket.userId,
        userRole: socket.userRole,
        timestamp: new Date().toISOString()
      });
    });
  }

  joinUserToRooms(socket) {
    const userId = socket.userId;
    const userRole = socket.userRole;
    
    // Join user-specific room
    socket.join(`user_${userId}`);
    
    // Join role-based rooms
    socket.join(`role_${userRole}`);
    
    // Join supervisor room if user is supervisor
    if (userRole === 'supervisor') {
      socket.join('supervisors');
    }
    
    // Join admin room if user is admin
    if (userRole === 'admin') {
      socket.join('admins');
    }
    
    // Join agent room if user is agent
    if (userRole === 'agent') {
      socket.join('agents');
    }
    
    // Store user rooms
    this.userRooms.set(userId, [
      `user_${userId}`,
      `role_${userRole}`,
      ...(userRole === 'supervisor' ? ['supervisors'] : []),
      ...(userRole === 'admin' ? ['admins'] : []),
      ...(userRole === 'agent' ? ['agents'] : [])
    ]);
    
    console.log(`🏠 User ${userId} joined rooms:`, this.userRooms.get(userId));
  }

  joinRoom(socket, roomName) {
    if (!roomName) return;
    
    socket.join(roomName);
    const userId = socket.userId;
    
    // Update user rooms
    const currentRooms = this.userRooms.get(userId) || [];
    if (!currentRooms.includes(roomName)) {
      this.userRooms.set(userId, [...currentRooms, roomName]);
    }
    
    console.log(`🏠 User ${userId} joined room: ${roomName}`);
    
    // Notify room members
    socket.to(roomName).emit('user_joined', {
      userId: socket.userId,
      userName: socket.userName,
      roomName,
      timestamp: new Date().toISOString()
    });
  }

  leaveRoom(socket, roomName) {
    if (!roomName) return;
    
    socket.leave(roomName);
    const userId = socket.userId;
    
    // Update user rooms
    const currentRooms = this.userRooms.get(userId) || [];
    this.userRooms.set(userId, currentRooms.filter(room => room !== roomName));
    
    console.log(`🚪 User ${userId} left room: ${roomName}`);
    
    // Notify room members
    socket.to(roomName).emit('user_left', {
      userId: socket.userId,
      userName: socket.userName,
      roomName,
      timestamp: new Date().toISOString()
    });
  }

  handleNotificationAck(socket, data) {
    console.log(`✅ User ${socket.userId} acknowledged notification:`, data);
    
    // You can implement notification acknowledgment logic here
    // For example, mark notification as read in database
  }

  handleTypingStart(socket, data) {
    const { roomName, message } = data;
    if (roomName) {
      socket.to(roomName).emit('user_typing', {
        userId: socket.userId,
        userName: socket.userName,
        message,
        timestamp: new Date().toISOString()
      });
    }
  }

  handleTypingStop(socket, data) {
    const { roomName } = data;
    if (roomName) {
      socket.to(roomName).emit('user_stopped_typing', {
        userId: socket.userId,
        userName: socket.userName,
        timestamp: new Date().toISOString()
      });
    }
  }

  handleDisconnect(socket) {
    const userId = socket.userId;
    
    // Remove user from connected users
    this.connectedUsers.delete(userId);
    
    // Clean up user rooms
    this.userRooms.delete(userId);
    
    // Notify other users in the same rooms
    const rooms = this.userRooms.get(userId) || [];
    rooms.forEach(roomName => {
      socket.to(roomName).emit('user_disconnected', {
        userId,
        userName: socket.userName,
        roomName,
        timestamp: new Date().toISOString()
      });
    });
  }

  // Public methods for sending notifications
  sendNotificationToUser(userId, notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send notification to user');
      return false;
    }
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('notification', notification);
      console.log(`📨 Notification sent to user ${userId}:`, notification.title);
      return true;
    }
    console.log(`❌ User ${userId} not connected, notification not sent`);
    return false;
  }

  sendNotificationToRole(role, notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send notification to role');
      return;
    }
    this.io.to(`role_${role}`).emit('notification', notification);
    console.log(`📨 Notification sent to role ${role}:`, notification.title);
  }

  sendNotificationToRoom(roomName, notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send notification to room');
      return;
    }
    this.io.to(roomName).emit('notification', notification);
    console.log(`📨 Notification sent to room ${roomName}:`, notification.title);
  }

  sendNotificationToSupervisors(notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send notification to supervisors');
      return;
    }
    this.io.to('supervisors').emit('notification', notification);
    console.log(`📨 Notification sent to supervisors:`, notification.title);
  }

  sendNotificationToAdmins(notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send notification to admins');
      return;
    }
    this.io.to('admins').emit('notification', notification);
    console.log(`📨 Notification sent to admins:`, notification.title);
  }

  sendNotificationToAgents(notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send notification to agents');
      return;
    }
    this.io.to('agents').emit('notification', notification);
    console.log(`📨 Notification sent to agents:`, notification.title);
  }

  // Broadcast to all connected users
  broadcastNotification(notification) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot broadcast notification');
      return;
    }
    this.io.emit('notification', notification);
    console.log(`📨 Notification broadcasted to all users:`, notification.title);
  }

  // Get connected users count
  getConnectedUsersCount() {
    return this.connectedUsers.size;
  }

  // Get users in a specific room
  getUsersInRoom(roomName) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot get room users');
      return 0;
    }
    const room = this.io.sockets.adapter.rooms.get(roomName);
    return room ? room.size : 0;
  }

  // Get all connected users
  getConnectedUsers() {
    return Array.from(this.connectedUsers.keys());
  }

  // Check if Socket.IO server is ready
  isReady() {
    return this.io !== null;
  }

  // Get user rooms
  getUserRooms(userId) {
    return this.userRooms.get(userId) || [];
  }
}

// Global singleton pattern - ensure only one instance exists
if (!global.socketManagerInstance) {
  global.socketManagerInstance = new SocketManager();
}

module.exports = global.socketManagerInstance;
