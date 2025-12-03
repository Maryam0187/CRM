'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSocket } from '../contexts/SocketContext';

/**
 * Custom hook for managing call status updates via Socket.IO
 * @param {string} callSid - The call SID to monitor (optional)
 * @returns {object} Call status management functions and data
 */
export const useCallStatus = (callSid = null) => {
  const { 
    socket, 
    isConnected, 
    callStatusUpdates, 
    joinCallRoom, 
    leaveCallRoom, 
    getCallStatus, 
    getAllCallStatuses 
  } = useSocket();
  
  const [currentCallStatus, setCurrentCallStatus] = useState(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  // Monitor specific call if callSid is provided
  useEffect(() => {
    if (!callSid || !isConnected) {
      // If callSid is cleared or not connected, stop monitoring
      if (isMonitoring) {
        setIsMonitoring(false);
      }
      return;
    }

    // Only join if not already monitoring this call
    if (!isMonitoring) {
      setIsMonitoring(true);
      joinCallRoom(callSid);
      
      // Get initial status
      const initialStatus = getCallStatus(callSid);
      if (initialStatus) {
        setCurrentCallStatus(initialStatus);
      }
    }
    
    return () => {
      if (callSid) {
        leaveCallRoom(callSid);
      }
      setIsMonitoring(false);
    };
    // Only depend on callSid and isConnected - socket functions are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callSid, isConnected]);

  // Listen for call status updates
  useEffect(() => {
    const handleCallStatusUpdate = (event) => {
      const { callStatusData } = event.detail;
      console.log('🔔 useCallStatus received update:', callStatusData);
      console.log('🔔 Monitoring callSid:', callSid);
      console.log('🔔 Update callSid:', callStatusData.callSid);
      console.log('🔔 Status:', callStatusData.status);
      console.log('🔔 Do they match?', callSid === callStatusData.callSid);
      
      // If monitoring a specific call, update current status IMMEDIATELY
      if (callSid && callStatusData.callSid === callSid) {
        console.log('✅ Updating current call status IMMEDIATELY for callSid:', callSid, 'Status:', callStatusData.status);
        // Use functional update to ensure immediate state update
        setCurrentCallStatus(prev => {
          // Force update even if status is the same (in case other fields changed)
          if (prev?.status !== callStatusData.status) {
            console.log('📞 Status changed from', prev?.status, 'to', callStatusData.status);
          }
          return callStatusData;
        });
      } else if (!callSid) {
        // If no callSid is being monitored, still update if we have a status
        // This handles cases where callSid might be set later
        console.log('🔔 No specific callSid being monitored, but received update');
        if (callStatusData.callSid) {
          // Try to get status from socket context
          const statusFromContext = getCallStatus(callStatusData.callSid);
          if (statusFromContext) {
            setCurrentCallStatus(statusFromContext);
          }
        }
      } else {
        console.log('⚠️ CallSid mismatch - not updating. Expected:', callSid, 'Got:', callStatusData.callSid);
      }
    };

    window.addEventListener('callStatusUpdate', handleCallStatusUpdate);
    
    return () => {
      window.removeEventListener('callStatusUpdate', handleCallStatusUpdate);
    };
  }, [callSid, getCallStatus]);

  // Get call status for a specific call
  const getStatus = useCallback((targetCallSid) => {
    return getCallStatus(targetCallSid);
  }, [getCallStatus]);

  // Get all call statuses
  const getAllStatuses = useCallback(() => {
    return getAllCallStatuses();
  }, [getAllCallStatuses]);

  // Check if a call is active
  const isCallActive = useCallback((targetCallSid = callSid) => {
    const status = targetCallSid ? getCallStatus(targetCallSid) : currentCallStatus;
    return status && ['queued', 'ringing', 'in-progress'].includes(status.status);
  }, [callSid, currentCallStatus, getCallStatus]);

  // Check if a call is completed
  const isCallCompleted = useCallback((targetCallSid = callSid) => {
    const status = targetCallSid ? getCallStatus(targetCallSid) : currentCallStatus;
    return status && ['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(status.status);
  }, [callSid, currentCallStatus, getCallStatus]);

  // Format call duration
  const formatDuration = useCallback((seconds) => {
    if (!seconds) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  // Get status display text
  const getStatusDisplay = useCallback((status) => {
    const statusMap = {
      'queued': 'Queued',
      'ringing': 'Ringing',
      'in-progress': 'In Progress',
      'completed': 'Completed',
      'busy': 'Busy',
      'failed': 'Failed',
      'no-answer': 'No Answer',
      'canceled': 'Canceled'
    };
    return statusMap[status] || status;
  }, []);

  return {
    // State
    currentCallStatus,
    isMonitoring,
    isConnected,
    
    // Functions
    getStatus,
    getAllStatuses,
    isCallActive,
    isCallCompleted,
    formatDuration,
    getStatusDisplay,
    
    // Direct access to socket data
    callStatusUpdates: callStatusUpdates
  };
};

export default useCallStatus;
