'use client';

import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
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
  const callStatusRef = useRef(null); // Track current call status for priority checks
  const ringingStartTimeRef = useRef(null); // Track when 'ringing' status started (to prevent premature transition to in-progress)
  const pendingInProgressTimeoutRef = useRef(null); // Track pending delayed transition to in-progress

  // Keep callStatusRef in sync with callStatus state
  useEffect(() => {
    callStatusRef.current = callStatus;
    
    // Track when we enter 'ringing' state
    if (callStatus === 'ringing') {
      ringingStartTimeRef.current = Date.now();
    } else if (callStatus !== 'ringing' && ringingStartTimeRef.current !== null) {
      // Clear the ringing start time if we're no longer in ringing state
      ringingStartTimeRef.current = null;
    }
  }, [callStatus]);

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
    
    // Don't set initial status to 'ringing' - wait for Twilio to report actual status
    // For outbound calls: agent connects to conference first (before customer answers)
    // Status will be updated via Twilio callbacks when:
    // - 'ringing' when customer's phone is actually ringing
    // - 'in-progress' when customer answers
    // Setting status to null initially - it will be updated by status callbacks
    setCallStatus(null);
    ringingStartTimeRef.current = null; // Reset ringing start time for new call
    console.log('📞 Call started - waiting for status updates from Twilio', { callSid: callData.callSid });
  }, []);

  // Call connected
  const callConnected = useCallback(() => {
    setIsWebCallConnected(true);
    setIsCalling(false);
    // Note: Timer is NOT started here - it starts in updateCallStatus when status becomes 'in-progress'
    // This ensures timer only starts when customer answers (for outbound calls), not when agent connects
  }, []);

  // End call
  const endCall = useCallback(() => {
    // Clear any pending status transition timeouts
    if (pendingInProgressTimeoutRef.current) {
      clearTimeout(pendingInProgressTimeoutRef.current);
      pendingInProgressTimeoutRef.current = null;
    }
    
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
    callStatusRef.current = null;
    ringingStartTimeRef.current = null;
    
    // Hide interface after delay
    setTimeout(() => {
      setShowWebInterface(false);
      resetTimer();
    }, 500);
  }, [callTimer, callStatus, stopTimer, resetTimer]);

  // Update call status
  const updateCallStatus = useCallback((status) => {
    const currentStatus = callStatusRef.current;
    
    // If we're already in-progress and new status is ringing, ignore the ringing status
    // (Don't go backwards from in-progress to ringing)
    if (currentStatus === 'in-progress' && status === 'ringing') {
      console.log('⚠️ Ignoring ringing status - call is already in-progress');
      return; // Don't update status
    }
    
    // If we're already in-progress and status is also in-progress, no need to update
    if (currentStatus === 'in-progress' && status === 'in-progress') {
      return; // Already in-progress, no update needed
    }
    
    // Trust Twilio's callbacks - they should be accurate
    // The backend now filters out conference/Dial callbacks, so we only get customer call status
    // However, we still want to ensure 'ringing' state is visible for a brief moment
    if (status === 'in-progress' && currentStatus === 'ringing') {
      const timeSinceRingingStarted = ringingStartTimeRef.current ? Date.now() - ringingStartTimeRef.current : 0;
      const minRingingDuration = 500; // 500ms minimum - just enough to show ringing state briefly
      
      if (timeSinceRingingStarted < minRingingDuration) {
        console.log('⏳ Brief delay to show ringing state (', timeSinceRingingStarted, 'ms < ', minRingingDuration, 'ms)');
        
        // Clear any existing pending timeout
        if (pendingInProgressTimeoutRef.current) {
          clearTimeout(pendingInProgressTimeoutRef.current);
        }
        
        // Schedule the transition after the minimum duration
        const delay = minRingingDuration - timeSinceRingingStarted;
        pendingInProgressTimeoutRef.current = setTimeout(() => {
          pendingInProgressTimeoutRef.current = null;
          // Only transition if we're still in ringing state
          if (callStatusRef.current === 'ringing') {
            console.log('✅ Transitioning to in-progress after brief delay');
            setCallStatus('in-progress');
            // Start timer when we transition to in-progress
            if (!timerIntervalRef.current) {
              startTimer();
            }
          }
        }, delay);
        return; // Don't update status yet
      } else {
        // Normal flow: ringing -> in-progress (customer answered)
        console.log('✅ Customer answered - transitioning from ringing to in-progress');
      }
    }
    
    // For outbound calls, if we get 'in-progress' without seeing 'ringing' first, 
    // it might be from a conference connection - but backend should filter this now
    // We'll trust the backend filtering
    
    // Log status updates for debugging
    if (status === 'ringing') {
      console.log('🔔 RINGING status update received', { currentStatus, newStatus: status });
    }
    if (status === 'in-progress') {
      console.log('📞 IN-PROGRESS status update received', { currentStatus, newStatus: status });
    }
    
    // Update the state (ref will be updated by useEffect)
    setCallStatus(status);
    console.log('📞 Call status updated:', { from: currentStatus, to: status });
    
    // Start timer ONLY when customer picks up (call goes to in-progress)
    // Do NOT start timer during ringing state
    if (status === 'in-progress' && !timerIntervalRef.current) {
      console.log('⏱️ Starting call timer - customer answered');
      startTimer();
    }
    
    // Stop timer when call ends (including busy, no-answer, voicemail)
    if (status === 'completed' || status === 'failed' || status === 'canceled' || 
        status === 'busy' || status === 'no-answer' || status === 'voicemail') {
      stopTimer();
      // Only save duration if call was actually in-progress before ending
      // For busy/no-answer/voicemail, don't save duration as call never connected
      if (callTimer > 0 && (status === 'completed' || status === 'failed' || status === 'canceled')) {
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
        // Note: We don't set initial status here - it will be updated by Twilio callbacks
        // For outbound calls: agent connects to conference first, then customer's phone rings
        // Status will be updated via socket/callbacks when Twilio reports actual status
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


