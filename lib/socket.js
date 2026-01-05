const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const path = require('path');
const { pathToFileURL } = require('url');

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userRooms = new Map(); // userId -> [room1, room2, ...]
    this.sessionSockets = new Map(); // sessionId -> socketId
    this.socketSessions = new Map(); // socketId -> sessionId
    this.participantUpdateInterval = null; // Interval for periodic participant updates
    this.activeCalls = new Map(); // callSid -> { conferenceName, agentId, lastUpdate }
    this._participantMonitoringModules = null; // Cached modules for participant monitoring
  }

  initialize(server) {
    if (!this.io) {
      const isProduction = process.env.NODE_ENV === 'production';
      
      console.log(`🔧 Initializing Socket.IO for ${isProduction ? 'production' : 'development'} environment`);
      
      this.io = new Server(server, {
        cors: {
          origin: isProduction 
            ? process.env.SOCKET_IO_CORS_ORIGIN || process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL
            : ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:3001"],
          methods: ["GET", "POST"],
          credentials: true
        },
        transports: isProduction ? ['websocket'] : ['websocket', 'polling'],
        allowEIO3: true,
        pingTimeout: isProduction ? 60000 : 20000,
        pingInterval: isProduction ? 25000 : 10000,
        maxHttpBufferSize: 1e6, // 1MB
        compression: isProduction,
        serveClient: false, // Don't serve client files in production
        path: process.env.SOCKET_IO_PATH || '/api/socket',
        // Development optimizations
        ...(!isProduction && {
          allowUpgrades: true,
          upgradeTimeout: 10000,
          cookie: true, // Enable cookies for development
        }),
        // Production optimizations
        ...(isProduction && {
          allowUpgrades: true,
          upgradeTimeout: 10000,
          cookie: false, // Disable cookies for better performance
          httpCompression: {
            threshold: 1024,
            level: 6,
            memLevel: 8
          }
        })
      });

      this.setupMiddleware();
      this.setupEventHandlers();
      
      if (isProduction) {
        console.log('🔌 Socket.IO server initialized for production');
      } else {
        console.log('🔌 Socket.IO server initialized for development');
      }
    }
    return this.io;
  }

  getIO() {
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
        socket.sessionId = decoded.sessionId; // Store sessionId from JWT
        
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
      console.log(`🔗 User ${socket.userId} (${socket.userName}) connected with socket ${socket.id}, sessionId: ${socket.sessionId}`);
      
      // Store user connection
      this.connectedUsers.set(socket.userId, socket.id);
      
      // Store session mapping if sessionId exists
      if (socket.sessionId) {
        this.sessionSockets.set(socket.sessionId, socket.id);
        this.socketSessions.set(socket.id, socket.sessionId);
        console.log(`📝 Mapped session ${socket.sessionId} to socket ${socket.id}`);
      }
      
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
      
      // Handle call room joining
      socket.on('join_call_room', (callSid) => {
        this.joinCallRoom(socket, callSid);
      });
      
      // Handle call room leaving
      socket.on('leave_call_room', (callSid) => {
        this.leaveCallRoom(socket, callSid);
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
      
      // Handle status updates
      socket.on('status_update', (data) => {
        this.handleStatusUpdate(socket, data);
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

      // Update user status to online in database and broadcast
      this.updateUserStatusToOnline(socket.userId);
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

  handleStatusUpdate(socket, data) {
    const { status } = data;
    if (!status || !['online', 'offline', 'away'].includes(status)) {
      console.warn(`Invalid status update from user ${socket.userId}: ${status}`);
      return;
    }

    console.log(`📊 User ${socket.userId} status updated to: ${status}`);
    
    // Broadcast status change to all relevant rooms
    this.broadcastUserStatusChange(socket.userId, status);
  }

  async updateUserStatusToOnline(userId) {
    try {
      // Update database status to online
      const { User } = require('../models');
      const user = await User.findByPk(userId);
      if (user && user.status !== 'online') {
        await user.update({ status: 'online' });
        console.log(`✅ Updated user ${userId} status to online in database via socket connection`);
      }
      
      // Broadcast status change
      this.broadcastUserStatusChange(userId, 'online');
    } catch (error) {
      console.error('Error updating user status to online:', error);
      // Still broadcast even if DB update fails
      this.broadcastUserStatusChange(userId, 'online');
    }
  }

  broadcastUserStatusChange(userId, status, callStatus = null) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot broadcast status change');
      return;
    }

    const statusData = {
      userId,
      status,
      callStatus: callStatus || null,
      timestamp: new Date().toISOString()
    };

    // Broadcast to role-based rooms
    this.io.to('agents').emit('user_status_change', statusData);
    this.io.to('supervisors').emit('user_status_change', statusData);
    this.io.to('admins').emit('user_status_change', statusData);
    
    // Broadcast to all connected users (for admin/supervisor dashboards)
    this.io.emit('user_status_change', statusData);
    
    // Also emit specific call status change if callStatus is provided
    if (callStatus !== null) {
      this.io.emit('user_call_status_change', {
        userId,
        callStatus,
        timestamp: new Date().toISOString()
      });
    }
    
    console.log(`📊 Status change broadcasted: User ${userId} is now ${status}`);
  }

  async handleDisconnect(socket) {
    const userId = socket.userId;
    const sessionId = socket.sessionId;
    
    // Clean up session mappings first
    if (sessionId) {
      this.sessionSockets.delete(sessionId);
      this.socketSessions.delete(socket.id);
      console.log(`🧹 Cleaned up session mapping for session ${sessionId}`);
    }
    
    // Remove user from connected users
    this.connectedUsers.delete(userId);
    
    // First, invalidate the current session (if it exists)
    // Then check if user has any other active sessions before broadcasting offline
    // Only broadcast offline if this was the last active session
    try {
      const { UserSession, User } = require('../models');
      
      // Invalidate the current session first
      if (sessionId) {
        try {
          const session = await UserSession.findOne({
            where: {
              sessionId: sessionId,
              userId: userId,
              isActive: true
            }
          });
          
          if (session) {
            await session.update({ isActive: false });
            console.log(`✅ Session ${sessionId} invalidated for user ${userId} via socket disconnect`);
          }
        } catch (sessionError) {
          console.error('Error invalidating session on socket disconnect:', sessionError);
          // Continue even if session invalidation fails
        }
      }
      
      // Now check for other active sessions (after invalidating the current one)
      const activeSessions = await UserSession.findAll({
        where: {
          userId: userId,
          isActive: true
        }
      });
      
      // Only broadcast offline if no other active sessions exist
      if (activeSessions.length === 0) {
        // Update database status to offline
        try {
          const user = await User.findByPk(userId);
          if (user && user.status !== 'offline') {
            await user.update({ status: 'offline' });
            console.log(`✅ Updated user ${userId} status to offline in database via socket disconnect`);
          }
        } catch (dbError) {
          console.error('Error updating user status in database on disconnect:', dbError);
        }
        
        this.broadcastUserStatusChange(userId, 'offline');
        console.log(`📊 User ${userId} disconnected - no other active sessions, broadcasting offline`);
      } else {
        console.log(`📊 User ${userId} disconnected - ${activeSessions.length} other active session(s) exist, not broadcasting offline`);
      }
    } catch (error) {
      console.error('Error checking active sessions on disconnect:', error);
      // Fallback: broadcast offline if we can't check sessions
      this.broadcastUserStatusChange(userId, 'offline');
    }
    
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

  // Call status related methods
  sendCallStatusUpdate(callSid, callData) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send call status update');
      return false;
    }

    const callStatusData = {
      type: 'call_status_update',
      callSid,
      ...callData,
      timestamp: new Date().toISOString()
    };

    // Send to all connected users (broadcast)
    this.io.emit('call_status_update', callStatusData);
    console.log(`📞 Call status update sent for ${callSid}:`, callData.status);
    return true;
  }

  sendCallStatusToAgent(agentId, callSid, callData) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send call status to agent');
      return false;
    }

    const callStatusData = {
      type: 'call_status_update',
      callSid,
      ...callData,
      timestamp: new Date().toISOString()
    };

    console.log('📞 Attempting to send call status to agent:', {
      agentId,
      callSid,
      status: callData.status,
      connectedUsers: Array.from(this.connectedUsers.keys())
    });

    // Send to specific agent
    const socketId = this.connectedUsers.get(agentId);
    if (socketId) {
      this.io.to(socketId).emit('call_status_update', callStatusData);
      console.log(`📞 Call status update sent to agent ${agentId} for ${callSid}:`, callData.status);
      return true;
    }
    console.log(`❌ Agent ${agentId} not connected, call status not sent`);
    return false;
  }

  sendCallStatusToSupervisors(callSid, callData) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send call status to supervisors');
      return;
    }

    const callStatusData = {
      type: 'call_status_update',
      callSid,
      ...callData,
      timestamp: new Date().toISOString()
    };

    this.io.to('supervisors').emit('call_status_update', callStatusData);
    console.log(`📞 Call status update sent to supervisors for ${callSid}:`, callData.status);
  }

  sendCallStatusToRoom(roomName, callSid, callData) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send call status to room');
      return;
    }

    const callStatusData = {
      type: 'call_status_update',
      callSid,
      ...callData,
      timestamp: new Date().toISOString()
    };

    this.io.to(roomName).emit('call_status_update', callStatusData);
    console.log(`📞 Call status update sent to room ${roomName} for ${callSid}:`, callData.status);
  }

  // Send participant status updates (dedicated for real-time participant tracking)
  sendParticipantUpdate(callSid, conferenceName, participants, agentId = null) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot send participant update');
      return false;
    }

    const participantData = {
      type: 'participant_update',
      callSid,
      conferenceName,
      participants: Array.isArray(participants) ? participants : [],
      count: Array.isArray(participants) ? participants.length : 0,
      timestamp: new Date().toISOString()
    };

    // Send to specific agent if provided
    if (agentId) {
      const socketId = this.connectedUsers.get(agentId);
      if (socketId) {
        this.io.to(socketId).emit('participant_update', participantData);
        console.log(`📊 Participant update sent to agent ${agentId} for ${callSid}:`, participants.length, 'participants');
      }
    }

    // Send to call room
    this.io.to(`call_${callSid}`).emit('participant_update', participantData);

    // Broadcast to all (for supervisors/admins)
    this.io.emit('participant_update', participantData);
    
    console.log(`📊 Participant update broadcasted for ${callSid}:`, participants.length, 'participants');
    return true;
  }

  // Join user to call-specific room
  joinCallRoom(socket, callSid) {
    const roomName = `call_${callSid}`;
    socket.join(roomName);
    console.log(`📞 User ${socket.userId} joined call room: ${roomName}`);
    return roomName;
  }

  // Leave call-specific room
  leaveCallRoom(socket, callSid) {
    const roomName = `call_${callSid}`;
    socket.leave(roomName);
    console.log(`📞 User ${socket.userId} left call room: ${roomName}`);
    return roomName;
  }

  // Cleanup call room - disconnect all sockets from the room
  cleanupCallRoom(callSid) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot cleanup call room');
      return;
    }

    const roomName = `call_${callSid}`;
    this.io.socketsLeave(roomName);
    console.log(`🧹 Cleaned up call room: ${roomName}`);
    
    // Remove from active calls tracking
    this.activeCalls.delete(callSid);
  }

  // Register active call for participant monitoring
  registerActiveCall(callSid, conferenceName, agentId) {
    if (!callSid || !conferenceName) return;
    
    this.activeCalls.set(callSid, {
      conferenceName,
      agentId,
      lastUpdate: new Date()
    });
    
    // Start monitoring if not already started
    this.startParticipantMonitoring();
  }

  // Unregister call (when it ends)
  unregisterActiveCall(callSid) {
    this.activeCalls.delete(callSid);
    
    // Stop monitoring if no active calls
    if (this.activeCalls.size === 0) {
      this.stopParticipantMonitoring();
    }
  }

  // Start periodic participant status monitoring
  startParticipantMonitoring() {
    if (this.participantUpdateInterval) {
      return; // Already monitoring
    }

    console.log('📊 Starting participant status monitoring...');
    
    this.participantUpdateInterval = setInterval(async () => {
      await this.updateAllActiveParticipants();
    }, 3000); // Update every 3 seconds
  }

  // Stop participant monitoring
  stopParticipantMonitoring() {
    if (this.participantUpdateInterval) {
      clearInterval(this.participantUpdateInterval);
      this.participantUpdateInterval = null;
      console.log('📊 Stopped participant status monitoring');
    }
  }

  // Get or cache modules for participant monitoring
  async _getParticipantMonitoringModules() {
    if (this._participantMonitoringModules) {
      return this._participantMonitoringModules;
    }

    try {
      // twilio.js is CommonJS - use require()
      const twilioModule = require('./twilio');
      
      if (!twilioModule || !twilioModule.getConferenceParticipants) {
        throw new Error('Failed to load getConferenceParticipants from twilio module');
      }
      
      // For sequelize-db (ES module), use pathToFileURL for proper import
      let sequelizeDb;
      
      try {
        // Convert file path to file:// URL for ES module import
        const sequelizeDbPath = path.resolve(__dirname, 'sequelize-db.js');
        const sequelizeDbUrl = pathToFileURL(sequelizeDbPath).href;
        const sequelizeDbModule = await import(sequelizeDbUrl);
        sequelizeDb = sequelizeDbModule.default;
      } catch (e1) {
        // Fallback: Try relative path (might work in Next.js context)
        try {
          const sequelizeDbModule = await import('./sequelize-db.js');
          sequelizeDb = sequelizeDbModule.default;
        } catch (e2) {
          console.warn('⚠️ Could not import sequelize-db, participant monitoring will be disabled');
          console.warn('⚠️ Import errors:', { e1: e1.message, e2: e2.message });
          throw e2;
        }
      }
      
      if (!sequelizeDb) {
        throw new Error('Failed to load sequelizeDb from sequelize-db module');
      }
      
      const Op = require('sequelize').Op;

      this._participantMonitoringModules = {
        getConferenceParticipants: twilioModule.getConferenceParticipants,
        sequelizeDb,
        Op
      };

      return this._participantMonitoringModules;
    } catch (importError) {
      console.error('❌ Error importing modules for participant monitoring:', importError);
      console.error('❌ Import error details:', {
        message: importError.message,
        stack: importError.stack?.split('\n').slice(0, 5).join('\n')
      });
      // Don't throw - just return null and disable monitoring
      return null;
    }
  }

  // Update participant status for all active calls
  async updateAllActiveParticipants() {
    if (!this.io || this.activeCalls.size === 0) {
      return;
    }

    // Get cached modules
    const modules = await this._getParticipantMonitoringModules();
    if (!modules) {
      // Modules couldn't be loaded, skip this update cycle
      return;
    }

    const { getConferenceParticipants, sequelizeDb, Op } = modules;

    // Get active calls from database to verify they're still active
    try {
      const activeCallSids = Array.from(this.activeCalls.keys());
      const activeCallLogs = await sequelizeDb.CallLog.findAll({
        where: {
          callSid: { [Op.in]: activeCallSids },
          status: { [Op.in]: ['ringing', 'in-progress'] }
        },
        attributes: ['callSid', 'agentId', 'twilioData', 'status']
      });

      const activeCallSidsSet = new Set(activeCallLogs.map(log => log.callSid));

      // Remove calls that are no longer active
      for (const [callSid] of this.activeCalls) {
        if (!activeCallSidsSet.has(callSid)) {
          this.activeCalls.delete(callSid);
        }
      }

      // Update participants for each active call
      for (const callLog of activeCallLogs) {
        const callInfo = this.activeCalls.get(callLog.callSid);
        if (!callInfo) continue;

        const conferenceName = callLog.twilioData?.conferenceName || 
                              (callLog.agentId ? `call-${callLog.agentId}` : null);
        
        if (!conferenceName) continue;

        try {
          const participants = await getConferenceParticipants(conferenceName);
          const participantData = participants.map(p => ({
            callSid: p.callSid,
            status: p.status,
            muted: p.muted,
            hold: p.hold
          }));

          // Send update via Socket.IO
          this.sendParticipantUpdate(
            callLog.callSid,
            conferenceName,
            participantData,
            callLog.agentId
          );

          // Update last update time
          callInfo.lastUpdate = new Date();
        } catch (error) {
          console.warn(`⚠️ Error updating participants for ${callLog.callSid}:`, error.message);
        }
      }
    } catch (error) {
      console.error('❌ Error in participant monitoring:', error);
    }
  }

  // Force logout user by sessionId
  forceLogoutUser(sessionId, reason = 'admin_action', data = {}) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot force logout user');
      return false;
    }

    const socketId = this.sessionSockets.get(sessionId);
    if (!socketId) {
      console.log(`❌ No active socket found for session ${sessionId}`);
      return false;
    }

    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket) {
      console.log(`❌ Socket ${socketId} not found`);
      // Clean up stale mapping
      this.sessionSockets.delete(sessionId);
      this.socketSessions.delete(socketId);
      return false;
    }

    // Emit force_logout event to the socket
    socket.emit('force_logout', {
      reason: reason,
      message: data.message || 'You have been logged out.',
      timestamp: data.timestamp || new Date().toISOString()
    });

    console.log(`🔐 Force logout sent to session ${sessionId} (socket ${socketId}), reason: ${reason}`);
    
    // Disconnect the socket after a short delay to allow the event to be received
    setTimeout(() => {
      socket.disconnect(true);
      console.log(`🔌 Disconnected socket ${socketId} for session ${sessionId}`);
    }, 100);

    return true;
  }

  // Force logout all sessions for a user
  async forceLogoutUserSessions(userId, reason = 'admin_action', data = {}) {
    if (!this.io) {
      console.warn('⚠️ Socket.IO server not initialized, cannot force logout user sessions');
      return { success: false, count: 0 };
    }

    // Find all sockets for this user
    const socketId = this.connectedUsers.get(userId);
    if (!socketId) {
      console.log(`❌ No active socket found for user ${userId}`);
      return { success: false, count: 0 };
    }

    const socket = this.io.sockets.sockets.get(socketId);
    if (!socket || !socket.sessionId) {
      console.log(`❌ Socket or sessionId not found for user ${userId}`);
      return { success: false, count: 0 };
    }

    // Force logout using sessionId
    const result = this.forceLogoutUser(socket.sessionId, reason, data);
    return { success: result, count: result ? 1 : 0 };
  }
}

// Global singleton pattern - ensure only one instance exists
if (!global.socketManagerInstance) {
  global.socketManagerInstance = new SocketManager();
}

module.exports = global.socketManagerInstance;
