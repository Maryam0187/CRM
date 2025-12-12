'use client';

import { createContext, useContext, useState, useRef, useCallback } from 'react';
import apiClient from '../lib/apiClient';

const CallContext = createContext(undefined);

export function CallProvider({ children }) {
  // Core call state
  const [isCalling, setIsCalling] = useState(false);
  const [currentCallSid, setCurrentCallSid] = useState(null);
  const [conferenceName, setConferenceName] = useState(null);
  const [showWebInterface, setShowWebInterface] = useState(false);
  const [isWebCallConnected, setIsWebCallConnected] = useState(false);
  const [error, setError] = useState(null);
  
  // Timer state
  const [callTimer, setCallTimer] = useState(0);
  const [finalDuration, setFinalDuration] = useState(null);
  
  // Call metadata
  const [callMetadata, setCallMetadata] = useState(null); // { customerId, saleId, phoneNumber, customerName }
  
  // Call status (from socket)
  const [callStatus, setCallStatus] = useState(null); // 'ringing', 'in-progress', 'completed', etc.
  
  // Mute state
  const [isMuted, setIsMuted] = useState(false);
  
  // Refs for intervals
  const timerIntervalRef = useRef(null);
  const muteSyncIntervalRef = useRef(null);
  const webCallInterfaceRef = useRef(null);

  // Start timer
  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    setCallTimer(0);
    timerIntervalRef.current = setInterval(() => {
      setCallTimer(prev => prev + 1);
    }, 1000);
  }, []);

  // Stop timer
  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Reset timer
  const resetTimer = useCallback(() => {
    stopTimer();
    setCallTimer(0);
    setFinalDuration(null);
  }, [stopTimer]);

  // Start call
  const startCall = useCallback((callData) => {
    setIsCalling(true);
    setCurrentCallSid(callData.callSid);
    setConferenceName(callData.conferenceName);
    setCallMetadata({
      customerId: callData.customerId,
      saleId: callData.saleId,
      phoneNumber: callData.phoneNumber,
      customerName: callData.customerName
    });
    setShowWebInterface(true);
    setError(null);
  }, []);

  // Call connected
  const callConnected = useCallback(() => {
    setIsWebCallConnected(true);
    setIsCalling(false);
    startTimer();
  }, [startTimer]);

  // End call
  const endCall = useCallback(() => {
    // Preserve timer
    const currentTimer = callTimer;
    if (currentTimer > 0 && callStatus === 'in-progress') {
      setFinalDuration(currentTimer);
    }
    
    // Stop timer
    stopTimer();
    
    // Reset state
    setIsCalling(false);
    setIsWebCallConnected(false);
    setIsMuted(false);
    setError(null);
    
    // Clear call data
    setCurrentCallSid(null);
    setConferenceName(null);
    setCallMetadata(null);
    setCallStatus(null);
    
    // Hide interface after delay
    setTimeout(() => {
      setShowWebInterface(false);
      resetTimer();
    }, 500);
  }, [callTimer, callStatus, stopTimer, resetTimer]);

  // Update call status
  const updateCallStatus = useCallback((status) => {
    setCallStatus(status);
    
    // Start timer when call goes to ringing (not wait for in-progress)
    if (status === 'ringing' && !timerIntervalRef.current) {
      startTimer();
    }
    
    // Also start timer when call goes in-progress (if not already started)
    if (status === 'in-progress' && !timerIntervalRef.current) {
      startTimer();
    }
    
    // Stop timer when call ends
    if (status === 'completed' || status === 'failed' || status === 'canceled') {
      stopTimer();
      if (callTimer > 0) {
        setFinalDuration(callTimer);
      }
    }
  }, [callTimer, startTimer, stopTimer]);

  // Set WebCallInterface ref
  const setWebCallInterfaceRef = useCallback((ref) => {
    webCallInterfaceRef.current = ref;
  }, []);

  // Get WebCallInterface ref
  const getWebCallInterfaceRef = useCallback(() => {
    return webCallInterfaceRef.current;
  }, []);

  // Initiate call - moved from CallButton
  const initiateCall = useCallback(async (callParams) => {
    const {
      customerId,
      saleId,
      phoneNumber,
      customerName,
      agentId,
      callPurpose = 'follow_up',
      onCallInitiated,
      onError
    } = callParams;

    if (!phoneNumber || !agentId) {
      const errorMsg = 'Phone number or agent ID missing';
      setError(errorMsg);
      if (onError) onError(errorMsg);
      return;
    }

    setError(null);
    setIsCalling(true);

    try {
      const response = await apiClient.post('/api/calls/initiate', {
        customerId,
        saleId,
        agentId,
        phoneNumber,
        callPurpose,
        customMessage: `Hello ${customerName || 'there'}, this is a call from our CRM system.`
      });

      if (!response) {
        throw new Error('No response from server');
      }

      const result = await response.json();

      if (result?.success) {
        const confName = result.data?.conferenceName || `call-${agentId}`;
        const callSid = result.data?.callSid;

        if (!callSid) {
          throw new Error('Call SID not received from server');
        }

        // Start call using existing startCall function
        startCall({
          callSid,
          conferenceName: confName,
          customerId,
          saleId,
          phoneNumber,
          customerName
        });

        if (onCallInitiated) {
          onCallInitiated(result.data);
        }
      } else {
        const errorMsg = result?.message || result?.error || 'Failed to initiate call';
        setError(errorMsg);
        setIsCalling(false);
        if (onError) onError(errorMsg);
      }
    } catch (err) {
      console.error('❌ Error initiating call:', err);
      const errorMsg = err?.message || 'An unexpected error occurred. Please try again.';
      setError(errorMsg);
      setIsCalling(false);
      if (onError) onError(errorMsg);
    }
  }, [startCall]);

  const value = {
    // State
    isCalling,
    currentCallSid,
    conferenceName,
    showWebInterface,
    isWebCallConnected,
    error,
    callTimer,
    finalDuration,
    callMetadata,
    callStatus,
    isMuted,
    
    // Setters
    setIsCalling,
    setCurrentCallSid,
    setConferenceName,
    setShowWebInterface,
    setIsWebCallConnected,
    setError,
    setCallTimer,
    setFinalDuration,
    setCallMetadata,
    setIsMuted,
    
    // Actions
    startCall,
    initiateCall,
    callConnected,
    endCall,
    updateCallStatus,
    startTimer,
    stopTimer,
    resetTimer,
    setWebCallInterfaceRef,
    getWebCallInterfaceRef,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}

export function useCall() {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}


