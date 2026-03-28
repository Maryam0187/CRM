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
      customerName: callData.customerName,
      dialParams: callData.dialParams, // Preserve dialParams if provided
      mutedByDefault: callData.mutedByDefault === true
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
    console.log('🔚 [CALL CONTEXT] endCall triggered - clearing all call state:', {
      currentCallSid,
      conferenceName,
      callStatus,
      callTimer,
      isWebCallConnected
    });
    
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
      console.log('✅ [CALL CONTEXT] Call state cleanup completed');
    }, 500);
  }, [callTimer, callStatus, stopTimer, resetTimer, currentCallSid, conferenceName, isWebCallConnected]);
  
  const updateCallStatus = useCallback((status) => {
    const currentStatus = callStatusRef.current;
    
    // Prevent duplicate status updates
    if (currentStatus === status) {
      return;
    }
    
    // Prevent backwards transitions only if we've actually started timing the call.
    // If we got a premature "in-progress" (agent joined conference) we allow reverting to "ringing".
    if (currentStatus === 'in-progress' && status === 'ringing') {
      const timerIsRunning = !!timerIntervalRef.current;
      if (timerIsRunning) return;
    }
    
    // Prevent duplicate in-progress updates
    if (currentStatus === 'in-progress' && status === 'in-progress') {
      return;
    }
    
    // Update status
    setCallStatus(status);
    
    // Start timer ONLY when customer picks up (status = 'in-progress')
    // This happens when customer answers, NOT when agent joins conference
    if (status === 'in-progress' && !timerIntervalRef.current) {
      startTimer();
      // Ensure timer is visible immediately by setting it to 0
      setCallTimer(0);
    }
    
    // Stop timer when call ends
    const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
    if (endedStatuses.includes(status)) {
      stopTimer();
      
      // Preserve final duration if call was in progress
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
      callSource,
      state,
      city,
      zipcode,
      callNotes,
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
      // NEW FLOW: Agent connects first, then customer is dialed
      // Step 1: Set conference name to trigger agent connection
      const timestamp = Date.now();
      const confName = `call-${agentId}${timestamp}`;
      const pendingCallSid = `pending-${timestamp}`;
      
      // Store dial parameters for later use
      const dialParams = {
        customerId,
        saleId,
        agentId,
        phoneNumber,
        customerName,
        state,
        city,
        zipcode,
        callNotes: callNotes != null ? String(callNotes).trim() : undefined,
        conferenceName: confName,
        callPurpose,
        callSource,
        customMessage: `Hello ${customerName || 'there'}, this is a call from our CRM system.`
      };
      
      // Start call with conference name (agent will auto-connect)
      // dialParams will be stored in callMetadata for GlobalWebCallInterface to use
      startCall({
        callSid: pendingCallSid,
        conferenceName: confName,
        customerId,
        saleId,
        phoneNumber,
        customerName,
        dialParams // Pass dialParams to startCall
      });
      
      // Return immediately - customer will be dialed after agent connects
      // The GlobalWebCallInterface will handle dialing customer after agent connects
      if (onCallInitiated) {
        onCallInitiated({
          callSid: pendingCallSid,
          conferenceName: confName,
          to: phoneNumber,
          dialParams // Store for later dialing
        });
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
