'use client';

import { useSocket } from '../contexts/SocketContext';
import { useAppDispatch, useAppSelector } from '../store/hooks';
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

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toastNotifications.map((notification) => (
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
