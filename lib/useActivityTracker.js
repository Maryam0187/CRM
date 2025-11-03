'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import apiClient from './apiClient';

/**
 * Hook to track user activity and automatically set status to "away" after inactivity
 * @param {Object} options - Configuration options
 * @param {number} options.inactivityTimeout - Time in milliseconds before setting status to "away" (default: 5 minutes)
 * @param {boolean} options.enabled - Whether activity tracking is enabled (default: true)
 */
export function useActivityTracker({ inactivityTimeout = 5 * 60 * 1000, enabled = true } = {}) {
  const { user, accessToken } = useAuth();
  const { socket, isConnected } = useSocket();
  const inactivityTimerRef = useRef(null);
  const isAwayRef = useRef(false);
  const lastActivityRef = useRef(Date.now());
  const isUpdatingRef = useRef(false); // Track if status update is in progress

  // Update status via API
  const updateStatus = useCallback(async (status) => {
    if (!user || !accessToken || isAwayRef.current === (status === 'away')) {
      return;
    }

    // Prevent duplicate calls
    if (isUpdatingRef.current) {
      return;
    }

    isUpdatingRef.current = true;

    try {
      const response = await apiClient.put('/api/users/status', { status });

      if (response.ok) {
        isAwayRef.current = status === 'away';
        
        // Also emit via socket for real-time updates
        if (socket && isConnected) {
          socket.emit('status_update', { status });
        }
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      isUpdatingRef.current = false;
    }
  }, [user, accessToken, socket, isConnected]);

  // Reset inactivity timer with debouncing
  const resetInactivityTimer = useCallback(() => {
    // Clear existing timer
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }

    // Set new timer for inactivity
    inactivityTimerRef.current = setTimeout(() => {
      if (!isAwayRef.current) {
        updateStatus('away');
      }
    }, inactivityTimeout);

    lastActivityRef.current = Date.now();
    
    // If user was away, set them back to online (only once)
    if (isAwayRef.current && !isUpdatingRef.current) {
      updateStatus('online');
    }
  }, [inactivityTimeout, updateStatus]);

  // Handle user activity
  const handleActivity = useCallback(() => {
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  // Set up activity listeners
  useEffect(() => {
    if (!enabled || !user) {
      return;
    }

    // Events that indicate user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start the inactivity timer
    resetInactivityTimer();

    // Cleanup
    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [enabled, user, handleActivity, resetInactivityTimer]);

  // Handle page visibility change (tab focus/blur)
  useEffect(() => {
    if (!enabled || !user) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Tab is hidden, set to away after a shorter timeout
        if (inactivityTimerRef.current) {
          clearTimeout(inactivityTimerRef.current);
        }
        inactivityTimerRef.current = setTimeout(() => {
          updateStatus('away');
        }, 60000); // 1 minute when tab is hidden
      } else {
        // Tab is visible, reset timer
        resetInactivityTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, user, updateStatus, resetInactivityTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, []);

  return {
    lastActivity: lastActivityRef.current,
    isAway: isAwayRef.current,
    resetActivity: resetInactivityTimer
  };
}

