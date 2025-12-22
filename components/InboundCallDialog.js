'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';
import { useCall } from '../contexts/CallContext';
import { useSocket } from '../contexts/SocketContext';
import { authenticatedFetch } from '../lib/apiClient';
import { useAppDispatch } from '../store/hooks';
import { markNotificationAsRead } from '../store/slices/notificationSlice';

export default function InboundCallDialog({ notification, onClose, onMinimize }) {
  const { user } = useAuth();
  const { startCall } = useCall();
  const { getCallStatus } = useSocket();
  const router = useRouter();
  const dispatch = useAppDispatch();
  
  const [callStatus, setCallStatus] = useState('ringing'); // 'ringing', 'in-progress', 'completed', 'missed'
  const [isMinimized, setIsMinimized] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const statusCheckInterval = useRef(null);
  
  // Check call status periodically
  useEffect(() => {
    if (!notification?.callSid) return;
    
    const checkStatus = () => {
      const statusData = getCallStatus(notification.callSid);
      if (statusData?.status) {
        const newStatus = statusData.status;
        setCallStatus(prevStatus => {
          // If call ended and agent never joined, mark as missed
          if (['completed', 'failed', 'canceled', 'busy', 'no-answer'].includes(newStatus) && 
              prevStatus === 'ringing' && !isJoining) {
            return 'missed';
          }
          // If call is in-progress, update status
          if (newStatus === 'in-progress') {
            return 'in-progress';
          }
          // If call ended after joining, mark as completed
          if (['completed', 'failed', 'canceled'].includes(newStatus) && prevStatus === 'in-progress') {
            return 'completed';
          }
          // If call already ended when dialog opens, mark as missed
          if (['completed', 'failed', 'canceled', 'busy', 'no-answer'].includes(newStatus) && prevStatus === 'ringing') {
            return 'missed';
          }
          return prevStatus;
        });
      } else {
        // If no status data, assume it's still ringing (initial state)
        setCallStatus(prevStatus => prevStatus === 'ringing' ? 'ringing' : prevStatus);
      }
    };
    
    // Check immediately
    checkStatus();
    
    // Then check every second
    statusCheckInterval.current = setInterval(checkStatus, 1000);
    
    return () => {
      if (statusCheckInterval.current) {
        clearInterval(statusCheckInterval.current);
      }
    };
  }, [notification?.callSid, getCallStatus, isJoining]);
  
  // Mark notification as read when dialog opens
  useEffect(() => {
    if (notification && !notification.isRead) {
      authenticatedFetch('/api/notifications', {
        method: 'PUT',
        body: JSON.stringify({
          notificationId: notification.id,
          action: 'mark_read'
        })
      }).then(() => {
        dispatch(markNotificationAsRead(notification.id));
      }).catch(err => {
        console.error('Error marking notification as read:', err);
      });
    }
  }, [notification, dispatch]);
  
  const handleJoinCall = async () => {
    if (!notification?.conferenceName) return;
    
    setIsJoining(true);
    
    try {
      // Start the call
      startCall({
        callSid: notification.callSid,
        conferenceName: notification.conferenceName,
        customerId: notification.customerId,
        saleId: notification.saleId,
        phoneNumber: notification.callerNumber,
        customerName: notification.customerName
      });
      
      setCallStatus('in-progress');
      
      // Close the dialog after a short delay to let the call interface open
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error('Error joining call:', error);
      setIsJoining(false);
    }
  };
  
  const handleViewSale = () => {
    if (notification?.saleId) {
      router.push(`/add-sale?id=${notification.saleId}`);
      // Don't close dialog - agent might want to join call after viewing sale
    }
  };
  
  const handleJoinThenViewSale = async () => {
    await handleJoinCall();
    // Wait a bit for call to start, then navigate
    setTimeout(() => {
      if (notification?.saleId) {
        router.push(`/add-sale?id=${notification.saleId}`);
      }
    }, 1000);
  };
  
  const handleViewSaleThenJoin = () => {
    handleViewSale();
    // After navigating, agent can still join from the call interface
    // The call interface will be available via GlobalWebCallInterface
  };
  
  const handleMinimize = () => {
    setIsMinimized(true);
    if (onMinimize) {
      onMinimize(notification);
    }
  };
  
  const handleMaximize = () => {
    setIsMinimized(false);
  };
  
  const handleDismiss = () => {
    if (statusCheckInterval.current) {
      clearInterval(statusCheckInterval.current);
    }
    onClose();
  };
  
  if (!notification) return null;
  
  // Minimized view
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-white rounded-lg shadow-2xl border-2 border-green-500 p-3 flex items-center gap-3 min-w-[250px]">
          <div className="flex-shrink-0">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {notification.customerName || notification.callerNumber}
            </div>
            <div className="text-xs text-gray-600">
              {callStatus === 'ringing' && '📞 Incoming Call'}
              {callStatus === 'missed' && '❌ Missed Call'}
              {callStatus === 'in-progress' && '✅ Call Active'}
              {callStatus === 'completed' && '✓ Call Ended'}
            </div>
          </div>
          <button
            onClick={handleMaximize}
            className="flex-shrink-0 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
          >
            Open
          </button>
        </div>
      </div>
    );
  }
  
  // Full dialog view
  const statusColors = {
    ringing: 'bg-yellow-50 border-yellow-400',
    'in-progress': 'bg-green-50 border-green-400',
    missed: 'bg-red-50 border-red-400',
    completed: 'bg-gray-50 border-gray-400'
  };
  
  const statusIcons = {
    ringing: '📞',
    'in-progress': '✅',
    missed: '❌',
    completed: '✓'
  };
  
  const statusText = {
    ringing: 'Incoming Call',
    'in-progress': 'Call Active',
    missed: 'Missed Call',
    completed: 'Call Ended'
  };
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className={`bg-white rounded-xl shadow-2xl border-4 ${statusColors[callStatus] || statusColors.ringing} max-w-md w-full mx-4 transform transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="text-3xl animate-pulse">
              {statusIcons[callStatus] || statusIcons.ringing}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">
                {statusText[callStatus] || statusText.ringing}
              </h3>
              <p className="text-sm text-gray-600">
                {notification.customerName || 'Unknown Caller'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleMinimize}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Minimize"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            </button>
            <button
              onClick={handleDismiss}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6">
          <div className="space-y-4">
            {/* Caller Info */}
            <div className="text-center">
              <div className="text-2xl font-semibold text-gray-900 mb-1">
                {notification.callerNumber || 'Unknown Number'}
              </div>
              {notification.customerName && (
                <div className="text-sm text-gray-600">
                  {notification.customerName}
                </div>
              )}
            </div>
            
            {/* Status Message */}
            {callStatus === 'ringing' && (
              <div className="text-center text-sm text-gray-600 animate-pulse">
                Call is ringing...
              </div>
            )}
            {callStatus === 'missed' && (
              <div className="text-center text-sm text-red-600 font-medium">
                Customer ended the call before you joined
              </div>
            )}
            {callStatus === 'in-progress' && (
              <div className="text-center text-sm text-green-600 font-medium">
                Call is active
              </div>
            )}
            {callStatus === 'completed' && (
              <div className="text-center text-sm text-gray-600">
                Call has ended
              </div>
            )}
            
            {/* Action Buttons */}
            {callStatus === 'ringing' && (
              <div className="space-y-3">
                <button
                  onClick={handleJoinCall}
                  disabled={isJoining}
                  className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {isJoining ? 'Joining...' : 'Join Call'}
                </button>
                
                    {notification.saleId && (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 border-t border-gray-300"></div>
                      <span className="text-xs text-gray-500 px-2">OR</span>
                      <div className="flex-1 border-t border-gray-300"></div>
                    </div>
                    
                    <button
                      onClick={handleJoinThenViewSale}
                      disabled={isJoining}
                      className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Join Call & View Sale
                    </button>
                    
                    <button
                      onClick={handleViewSaleThenJoin}
                      className="w-full px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      View Sale First
                    </button>
                  </>
                )}
              </div>
            )}
            
            {(callStatus === 'missed' || callStatus === 'completed') && notification.lastSaleId && (
              <button
                onClick={handleViewSale}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View Sale
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

