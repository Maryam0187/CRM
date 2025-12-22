'use client';

import { useSocket } from '../contexts/SocketContext';
import { useAppDispatch } from '../store/hooks';
import { markNotificationAsRead } from '../store/slices/notificationSlice';
import NotificationToast from './NotificationToast';

export default function ToastManager() {
  const { toastNotifications } = useSocket();
  const dispatch = useAppDispatch();

  const handleCloseToast = (notificationId) => {
    // Toast notifications are managed by SocketContext
    // This function can be empty or we can add local toast state management
  };

  const handleMarkAsRead = (notificationId) => {
    dispatch(markNotificationAsRead(notificationId));
  };

  // Filter out inbound call notifications - we only show dialog, not toast
  const filteredNotifications = toastNotifications.filter((notification) => {
    // Check if this is an inbound call notification
    const isInboundCall = notification.conferenceName || notification.conference_name || notification.type === 'inbound_call';
    
    // Don't show toast for inbound calls - only show dialog box
    return !isInboundCall;
  });

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {filteredNotifications.map((notification) => (
        <NotificationToast
          key={notification.id}
          notification={notification}
          onClose={() => handleCloseToast(notification.id)}
          onMarkAsRead={handleMarkAsRead}
        />
      ))}
    </div>
  );
}
