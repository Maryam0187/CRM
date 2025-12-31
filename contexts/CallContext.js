'use client';

import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import apiClient from '../lib/apiClient';

const CallContext = createContext(undefined);

export function CallProvider({ children }) {
  // ============================================================================
  // STATE
  // ============================================================================
  
  const [isCalling, setIsCalling] = useState(false);
  const [currentCallSid, setCurrentCallSid] = useState(null);
  const [conferenceName, setConferenceName] = useState(null);
  const [showWebInterface, setShowWebInterface] = useState(false);
  const [isWebCallConnected, setIsWebCallConnected] = useState(false);
  const [error, setError] = useState(null);
  const [callTimer, setCallTimer] = useState(0);
  const [finalDuration, setFinalDuration] = useState(null);
  const [callMetadata, setCallMetadata] = useState(null);
  const [callStatus, setCallStatus] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  
  // ============================================================================
  // REFS
  // ============================================================================
  
  const timerIntervalRef = useRef(null);
  const muteSyncIntervalRef = useRef(null);
  const webCallInterfaceRef = useRef(null);
  const callStatusRef = useRef(null);
  const ringingStartTimeRef = useRef(null);
  const pendingInProgressTimeoutRef = useRef(null);
  
  // ============================================================================
  // EFFECTS
  // ============================================================================
  
  useEffect(() => {
    callStatusRef.current = callStatus;
    
    if (callStatus === 'ringing') {
      ringingStartTimeRef.current = Date.now();
    } else if (callStatus !== 'ringing' && ringingStartTimeRef.current !== null) {
      ringingStartTimeRef.current = null;
    }
  }, [callStatus]);
  
  // ============================================================================
  // TIMER FUNCTIONS
  // ============================================================================
  
  const startTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    setCallTimer(0);
    timerIntervalRef.current = setInterval(() => {
      setCallTimer(prev => prev + 1);
    }, 1000);
  }, []);
  
  const stopTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);
  
  const resetTimer = useCallback(() => {
    stopTimer();
    setCallTimer(0);
    setFinalDuration(null);
  }, [stopTimer]);
  
  // ============================================================================
  // CALL MANAGEMENT FUNCTIONS
  // ============================================================================
  
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
    setCallStatus(null);
    ringingStartTimeRef.current = null;
  }, []);
  
  const callConnected = useCallback(() => {
    setIsWebCallConnected(true);
    setIsCalling(false);
  }, []);
  
  const endCall = useCallback(() => {
    if (pendingInProgressTimeoutRef.current) {
      clearTimeout(pendingInProgressTimeoutRef.current);
      pendingInProgressTimeoutRef.current = null;
    }
    
    const currentTimer = callTimer;
    if (currentTimer > 0 && callStatus === 'in-progress') {
      setFinalDuration(currentTimer);
    }
    
    stopTimer();
    setIsCalling(false);
    setIsWebCallConnected(false);
    setIsMuted(false);
    setError(null);
    setCurrentCallSid(null);
    setConferenceName(null);
    setCallMetadata(null);
    setCallStatus(null);
    callStatusRef.current = null;
    ringingStartTimeRef.current = null;
    
    setTimeout(() => {
      setShowWebInterface(false);
      resetTimer();
    }, 500);
  }, [callTimer, callStatus, stopTimer, resetTimer]);
  
  const updateCallStatus = useCallback((status) => {
    const currentStatus = callStatusRef.current;
    
    // Prevent duplicate status updates
    if (currentStatus === status) {
      return;
    }
    
    // Prevent backwards transitions
    if (currentStatus === 'in-progress' && status === 'ringing') {
      return;
    }
    
    // Prevent duplicate in-progress updates
    if (currentStatus === 'in-progress' && status === 'in-progress') {
      return;
    }
    
    // Update status
    setCallStatus(status);
    
    // Start timer ONLY when customer picks up
    if (status === 'in-progress' && !timerIntervalRef.current) {
      startTimer();
    }
    
    // Stop timer when call ends
    if (status === 'completed' || status === 'failed' || status === 'canceled' || 
        status === 'busy' || status === 'no-answer' || status === 'voicemail') {
      stopTimer();
      
      if (callTimer > 0 && (status === 'completed' || status === 'failed' || status === 'canceled')) {
        setFinalDuration(callTimer);
      }
    }
  }, [callTimer, startTimer, stopTimer]);
  
  const setWebCallInterfaceRef = useCallback((ref) => {
    webCallInterfaceRef.current = ref;
  }, []);
  
  const getWebCallInterfaceRef = useCallback(() => {
    return webCallInterfaceRef.current;
  }, []);
  
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
      console.error('Error initiating call:', err);
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
