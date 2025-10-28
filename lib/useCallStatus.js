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
    if (callSid && isConnected) {
      setIsMonitoring(true);
      joinCallRoom(callSid);
      
      // Get initial status
      const initialStatus = getCallStatus(callSid);
      setCurrentCallStatus(initialStatus);
      
      return () => {
        leaveCallRoom(callSid);
        setIsMonitoring(false);
      };
    }
  }, [callSid, isConnected, joinCallRoom, leaveCallRoom, getCallStatus]);

  // Listen for call status updates
  useEffect(() => {
    const handleCallStatusUpdate = (event) => {
      const { callStatusData } = event.detail;
      
      // If monitoring a specific call, update current status
      if (callSid && callStatusData.callSid === callSid) {
        setCurrentCallStatus(callStatusData);
      }
    };

    window.addEventListener('callStatusUpdate', handleCallStatusUpdate);
    
    return () => {
      window.removeEventListener('callStatusUpdate', handleCallStatusUpdate);
    };
  }, [callSid]);

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
