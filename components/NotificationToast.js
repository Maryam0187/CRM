'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useCall } from '../contexts/CallContext';
import { useToast } from '../contexts/ToastContext';

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

// Get notification icon based on type
const getNotificationIcon = (notification) => {
  if (notification.type) {
    switch (notification.type) {
      case 'sale_status_updated':
      case 'sale_created':
      case 'sale_completed':
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
        return '📋';
      default:
        return '🔔';
    }
  }
  return '🔔';
};

export default function NotificationToast({ notification, onClose, onMarkAsRead }) {
  const router = useRouter();
  const { startCall } = useCall();
  const { showSuccess, showError } = useToast();
  const [isVisible, setIsVisible] = useState(true);
  const [isClosing, setIsClosing] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef(null);

  // Auto-dismiss after 3 seconds (paused when hovered)
  // BUT: Don't auto-dismiss inbound call notifications (they have conferenceName)
  useEffect(() => {
    // Skip auto-dismiss for inbound call notifications
    if (notification.conferenceName) {
      return;
    }

    if (!isHovered) {
      timerRef.current = setTimeout(() => {
        handleClose();
      }, 3000);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isHovered, notification.conferenceName]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsVisible(false);
      onClose();
    }, 300); // Animation duration
  };

  const handleJoinCall = async (e) => {
    e.stopPropagation();
    
    if (!notification.conferenceName) {
      showError('Conference name not available');
      return;
    }

    try {
      // Mark notification as read
      if (!notification.isRead && onMarkAsRead) {
        onMarkAsRead(notification.id);
      }

      // Start call using CallContext
      startCall({
        callSid: notification.callSid,
        conferenceName: notification.conferenceName,
        customerId: notification.customerId,
        saleId: notification.lastSaleId,
        phoneNumber: notification.callerNumber,
        customerName: notification.customerName
      });

      handleClose();
      showSuccess('Joining call...');
    } catch (error) {
      console.error('Error joining call:', error);
      showError('Failed to join call');
    }
  };

  const handleClick = () => {
    // For inbound call notifications, open GlobalWebCallInterface and sale
    if (notification.conferenceName) {
      // Mark as read
      if (!notification.isRead && onMarkAsRead) {
        onMarkAsRead(notification.id);
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
        const saleId = notification.lastSaleId || notification.saleId;
        // Use setTimeout to ensure navigation happens after state updates
        setTimeout(() => {
          router.push(`/add-sale?id=${saleId}`);
        }, 100);
      }

      // Don't close the notification - keep it visible
      return;
    }

    // Mark as read if not already read
    if (!notification.isRead && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }

    // Navigate based on notification type - prioritize lastSaleId
    if (notification.lastSaleId || notification.saleId) {
      const saleId = notification.lastSaleId || notification.saleId;
      router.push(`/add-sale?id=${saleId}`);
    } else {
      router.push('/');
    }

    // Close the toast
    handleClose();
  };

  if (!isVisible) return null;

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-sm w-full bg-white rounded-lg shadow-lg border border-gray-200 transform transition-all duration-300 ${
        isClosing ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
      } ${isHovered ? 'shadow-xl border-blue-300' : ''} ${notification.conferenceName ? 'cursor-pointer border-green-300' : ''}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleClick}
    >
      <div className="p-4">
        {/* Header with close button */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center space-x-2">
            <span className="text-lg">
              {getNotificationIcon(notification)}
            </span>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-gray-900">
                {notification.title}
              </h4>
              <p className="text-xs text-gray-500">
                {notification.time && !isNaN(new Date(notification.time).getTime()) 
                  ? formatNotificationTime(new Date(notification.time))
                  : notification.time || 'Just now'
                }
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Message */}
        <p className="text-sm text-gray-700 mb-3 line-clamp-2">
          {notification.message}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
          {notification.conferenceName ? (
            <div className="flex items-center gap-2">
              <button
                onClick={handleJoinCall}
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
                    handleClose();
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors duration-200 border border-blue-200"
                >
                  View Sale
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={handleClick}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
            >
              View Details
            </button>
          )}
          <div className="flex items-center space-x-2">
            {!notification.isRead && (
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
            )}
            <span className="text-xs text-gray-400">
              {notification.type?.replace('_', ' ').toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar for auto-dismiss - only show for non-inbound call notifications */}
      {!notification.conferenceName && (
        <div className="h-1 bg-gray-200 rounded-b-lg overflow-hidden">
          <div 
            className={`h-full bg-blue-500 transition-all duration-3000 ease-linear ${
              isHovered ? 'animate-pulse' : ''
            }`}
            style={{
              width: '100%',
              animation: isHovered ? 'none' : 'shrink 3s linear forwards'
            }}
          />
        </div>
      )}

      <style jsx>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
