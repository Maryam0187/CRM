# Socket.IO Implementation Guide

This document describes the Socket.IO implementation for real-time notifications and room-based communication in the CRM system.

## Overview

The Socket.IO implementation provides:
- Real-time notifications for supervisors, admins, and agents
- Room-based communication for different user roles
- Typing indicators and user presence
- Automatic reconnection and error handling
- Integration with existing notification system

## Architecture

### Server Side
- **Custom Server**: `server.js` - Custom Next.js server with Socket.IO integration
- **Socket Manager**: `lib/socket.js` - Centralized Socket.IO management
- **Authentication**: JWT-based authentication for socket connections
- **Room Management**: Automatic room assignment based on user roles

### Client Side
- **Socket Context**: `contexts/SocketContext.js` - React context for Socket.IO
- **Notification Bell**: Updated `components/NotificationBell.js` - Real-time notifications
- **Test Component**: `components/SocketTest.js` - Testing and debugging

## Features

### 1. Real-time Notifications
- **Sale Creation**: Notifications when new sales are created
- **Sale Updates**: Notifications when sale status changes
- **Role-based**: Different notifications for supervisors, admins, and agents
- **Persistence**: Notifications stored in database and sent via Socket.IO

### 2. Room Management
- **User Rooms**: `user_{userId}` - Personal notifications
- **Role Rooms**: `role_{role}` - Role-based notifications
- **Special Rooms**: `supervisors`, `admins`, `agents` - Group notifications
- **Custom Rooms**: Dynamic room joining/leaving

### 3. User Presence
- **Online Status**: Track connected users
- **User Join/Leave**: Notifications when users connect/disconnect
- **Room Membership**: Track users in specific rooms

### 4. Typing Indicators
- **Real-time Typing**: Show when users are typing
- **Room-based**: Typing indicators per room
- **Auto-cleanup**: Automatic cleanup when users stop typing

## Setup Instructions

### 1. Install Dependencies
```bash
npm install socket.io socket.io-client
```

### 2. Environment Variables
Add to your `.env` file:
```env
JWT_SECRET=your-jwt-secret-key
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
NEXT_PUBLIC_SOCKET_URL=https://your-domain.com
```

### 3. Start the Server
```bash
# Development
npm run dev

# Production
npm run build
npm run start
```

## Usage

### 1. Socket Context
```javascript
import { useSocket } from '../contexts/SocketContext';

function MyComponent() {
  const { 
    isConnected, 
    notifications, 
    joinRoom, 
    leaveRoom,
    startTyping,
    stopTyping 
  } = useSocket();
  
  // Use socket functionality
}
```

### 2. Room Management
```javascript
// Join a room
joinRoom('sales-team');

// Leave a room
leaveRoom('sales-team');
```

### 3. Typing Indicators
```javascript
// Start typing
startTyping('sales-team', 'Working on the proposal...');

// Stop typing
stopTyping('sales-team');
```

### 4. Notifications
```javascript
// Get unread count
const unreadCount = getUnreadCount();

// Mark as read
markNotificationAsRead(notificationId);
```

## API Endpoints

### 1. Test Socket Notifications
```bash
# Send test notification
POST /api/test-socket
{
  "type": "supervisors",
  "message": "Test notification",
  "room": "sales-team"
}
```

### 2. Get Connection Status
```bash
# Get connected users
GET /api/test-socket?action=status

# Get room info
GET /api/test-socket?action=rooms&room=sales-team
```

## Room Types

### 1. Automatic Rooms
- `user_{userId}` - Personal user room
- `role_{role}` - Role-based room (supervisor, admin, agent)
- `supervisors` - All supervisors
- `admins` - All admins
- `agents` - All agents

### 2. Custom Rooms
- `sales-team` - Sales team room
- `support-team` - Support team room
- `management` - Management room

## Notification Types

### 1. Sale Notifications
- `sale_created` - New sale created
- `sale_status_updated` - Sale status changed
- `sale_completed` - Sale completed

### 2. System Notifications
- `user_joined` - User joined room
- `user_left` - User left room
- `user_disconnected` - User disconnected

### 3. Typing Notifications
- `user_typing` - User started typing
- `user_stopped_typing` - User stopped typing

## Testing

### 1. Test Page
Visit `/test-socket` to access the Socket.IO test panel.

### 2. Test API
```bash
# Send test notification to supervisors
curl -X POST http://localhost:3000/api/test-socket \
  -H "Content-Type: application/json" \
  -d '{"type": "supervisors", "message": "Test notification"}'
```

### 3. Connection Status
```bash
# Check connection status
curl http://localhost:3000/api/test-socket?action=status
```

## Error Handling

### 1. Connection Errors
- Automatic reconnection with exponential backoff
- Maximum 5 reconnection attempts
- Connection status indicators in UI

### 2. Authentication Errors
- JWT token validation
- Automatic token refresh
- Graceful fallback to polling

### 3. Network Errors
- Fallback to polling transport
- Connection retry logic
- Offline/online detection

## Performance Considerations

### 1. Connection Limits
- Monitor connected users
- Implement rate limiting
- Clean up inactive connections

### 2. Memory Management
- Limit notification history
- Clean up old notifications
- Optimize room management

### 3. Scalability
- Consider Redis adapter for multiple servers
- Implement connection pooling
- Monitor server resources

## Security

### 1. Authentication
- JWT token validation
- User role verification
- Connection authorization

### 2. Room Access
- Role-based room access
- User permission checks
- Secure room joining

### 3. Data Validation
- Input sanitization
- Rate limiting
- Malicious request prevention

## Troubleshooting

### 1. Connection Issues
- Check JWT token validity
- Verify server configuration
- Check network connectivity

### 2. Notification Issues
- Verify user roles
- Check room assignments
- Validate notification data

### 3. Performance Issues
- Monitor connection count
- Check server resources
- Optimize room management

## Future Enhancements

### 1. Features
- File sharing via sockets
- Video/audio calls
- Screen sharing
- Collaborative editing

### 2. Scalability
- Redis adapter for clustering
- Load balancing
- Horizontal scaling

### 3. Analytics
- Connection metrics
- Usage statistics
- Performance monitoring

## Support

For issues or questions:
1. Check the test page at `/test-socket`
2. Review server logs
3. Check browser console for errors
4. Verify environment configuration
