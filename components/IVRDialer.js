'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useCall } from '../contexts/CallContext';
import { useAuth } from '../contexts/AuthContext';
import IVRDialerModal from './IVRDialerModal';
import apiClient from '../lib/apiClient';

// Global callbacks to open IVR dialer from anywhere
let openDialerCallbacks = new Set();

export function openIVRDialer() {
  openDialerCallbacks.forEach(callback => callback());
}

export default function IVRDialer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const { showWebInterface } = useCall(); // Only for positioning, not call management
  const { user } = useAuth();

  // IVR Call State Management
  const [ivrCallState, setIvrCallState] = useState({
    isCalling: false,
    isConnected: false,
    isConnecting: false,
    currentCall: null,
    callSid: null,
    conferenceName: null,
    phoneNumber: null,
    callStatus: null, // 'queued', 'ringing', 'in-progress', 'completed', etc.
    isMuted: false,
    error: null,
    callTimer: 0
  });

  // Timer ref for call duration
  const timerIntervalRef = useRef(null);

  // Register this instance to receive open events
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setIsMinimized(false);
    };
    
    openDialerCallbacks.add(handleOpen);
    
    return () => {
      openDialerCallbacks.delete(handleOpen);
    };
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // Start timer when call status becomes 'in-progress'
  useEffect(() => {
    if (ivrCallState.callStatus === 'in-progress' && !timerIntervalRef.current) {
      console.log('⏱️ [IVR] Starting call timer - call is in progress');
      startIVRTimer();
    }
    
    // Stop timer when call ends
    const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
    if (ivrCallState.callStatus && endedStatuses.includes(ivrCallState.callStatus)) {
      console.log('⏱️ [IVR] Stopping call timer - call ended');
      stopIVRTimer();
    }
  }, [ivrCallState.callStatus, startIVRTimer, stopIVRTimer]);

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const handleMinimize = (minimize) => {
    setIsMinimized(minimize);
  };

  const handleSendDigits = (digits, callId) => {
    // TODO: Implement send digits for IVR
    console.log('Send digits:', digits, callId);
  };

  // Start call timer
  const startIVRTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    setIvrCallState(prev => ({ ...prev, callTimer: 0 }));
    
    timerIntervalRef.current = setInterval(() => {
      setIvrCallState(prev => ({
        ...prev,
        callTimer: prev.callTimer + 1
      }));
    }, 1000);
  }, []);

  // Stop call timer
  const stopIVRTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Reset call state
  const resetIVRCallState = () => {
    stopIVRTimer();
    setIvrCallState({
      isCalling: false,
      isConnected: false,
      isConnecting: false,
      currentCall: null,
      callSid: null,
      conferenceName: null,
      phoneNumber: null,
      callStatus: null,
      isMuted: false,
      error: null,
      callTimer: 0
    });
  };

  // Handle making a call
  const handleMakeCall = async (phoneNumber) => {
    if (!phoneNumber || !phoneNumber.trim()) {
      setIvrCallState(prev => ({
        ...prev,
        error: 'Phone number is required'
      }));
      return;
    }

    if (!user?.id) {
      setIvrCallState(prev => ({
        ...prev,
        error: 'User not authenticated'
      }));
      return;
    }

    try {
      // Set calling state
      setIvrCallState(prev => ({
        ...prev,
        isCalling: true,
        isConnecting: false,
        phoneNumber: phoneNumber.trim(),
        error: null,
        callStatus: 'queued'
      }));

      console.log('📞 [IVR] Initiating call to:', phoneNumber.trim());

      // Call IVR initiate API
      const response = await apiClient.post('/api/calls/ivr-initiate', {
        phoneNumber: phoneNumber.trim(),
        agentId: user.id,
        callPurpose: 'ivr_dialer'
      });

      if (!response) {
        throw new Error('No response from server');
      }

      const result = await response.json();

      if (result?.success) {
        const { callSid, conferenceName, to } = result.data;
        
        console.log('✅ [IVR] Call initiated successfully:', {
          callSid,
          conferenceName,
          to
        });

        // Update state with call information
        setIvrCallState(prev => ({
          ...prev,
          callSid,
          conferenceName,
          phoneNumber: to,
          isCalling: true,
          callStatus: 'queued'
        }));

        // TODO: In next step, we'll join the conference here
        // For now, just log that we have the conference name
        console.log('📞 [IVR] Ready to join conference:', conferenceName);
        
      } else {
        const errorMsg = result?.message || result?.error || 'Failed to initiate call';
        console.error('❌ [IVR] Call initiation failed:', errorMsg);
        setIvrCallState(prev => ({
          ...prev,
          error: errorMsg,
          isCalling: false,
          callStatus: null
        }));
      }
    } catch (error) {
      console.error('❌ [IVR] Error initiating call:', error);
      const errorMsg = error?.message || 'An unexpected error occurred';
      setIvrCallState(prev => ({
        ...prev,
        error: errorMsg,
        isCalling: false,
        callStatus: null
      }));
    }
  };

  // Handle hangup
  const handleIVRHangup = async () => {
    try {
      console.log('📞 [IVR] Hanging up call');
      
      // TODO: Disconnect from conference (will implement in next step)
      
      // Call hangup API if we have a callSid
      if (ivrCallState.callSid) {
        try {
          await apiClient.post('/api/calls/ivr-hangup', {
            callSid: ivrCallState.callSid,
            conferenceName: ivrCallState.conferenceName
          });
        } catch (err) {
          console.warn('⚠️ [IVR] Hangup API error (non-critical):', err);
        }
      }

      // Reset state
      resetIVRCallState();
      
      console.log('✅ [IVR] Call hung up');
    } catch (error) {
      console.error('❌ [IVR] Error hanging up:', error);
      // Reset state anyway
      resetIVRCallState();
    }
  };

  // Handle mute (placeholder for now)
  const handleIVRMute = async () => {
    // TODO: Implement mute functionality in next step
    console.log('📞 [IVR] Mute toggle (not yet implemented)');
  };

  return (
    <IVRDialerModal
      isOpen={isOpen}
      onClose={handleClose}
      onMinimize={handleMinimize}
      onAddNew={() => {
        // Handle add new modal if needed
      }}
      onSendDigits={handleSendDigits}
      onMakeCall={handleMakeCall}
      onHangup={handleIVRHangup}
      onMute={handleIVRMute}
      // Pass IVR call state
      isConnected={ivrCallState.isConnected}
      isCalling={ivrCallState.isCalling}
      isConnecting={ivrCallState.isConnecting}
      callStatus={ivrCallState.callStatus}
      isMuted={ivrCallState.isMuted}
      callTimer={ivrCallState.callTimer}
      phoneNumber={ivrCallState.phoneNumber}
      error={ivrCallState.error}
      callId="navbar-dialer"
      callLabel="IVR Dialer"
      isMinimized={isMinimized}
      canAddNew={true}
      mode="dial"
      isAutomatedCall={false}
      isGlobalCallInterfaceOpen={showWebInterface}
    />
  );
}

