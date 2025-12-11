import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useCall } from '../contexts/CallContext';
import { useCallStatus } from '../lib/useCallStatus';
import apiClient from '../lib/apiClient';

const CallButton = forwardRef(function CallButton({ 
  customerId, 
  saleId, 
  phoneNumber, 
  customerName, 
  callPurpose = 'follow_up',
  onCallInitiated,
  onCallCompleted,
  className = '',
  size = 'default'
}, ref) {
  const { user } = useAuth();
  const { getCallStatus } = useSocket();
  
  // Use global call context
  const {
    isCalling,
    currentCallSid,
    conferenceName,
    isWebCallConnected,
    callTimer,
    finalDuration,
    callStatus: contextCallStatus,
    startCall: contextStartCall,
    callConnected: contextCallConnected,
    endCall: contextEndCall,
    updateCallStatus,
    setWebCallInterfaceRef,
    getWebCallInterfaceRef,
    setIsMuted,
    isMuted
  } = useCall();
  
  // Local component state (not in global store)
  const [error, setError] = useState(null);
  
  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferPhoneNumber, setTransferPhoneNumber] = useState('');
  const [transferType, setTransferType] = useState('blind');
  const [transferDestinationType, setTransferDestinationType] = useState('phone');
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  
  // Refs
  const ringingInterval = useRef(null);
  const muteSyncInterval = useRef(null);
  const hasNotifiedCompletion = useRef(false);
  const previousCallSid = useRef(null);
  const isEndingCall = useRef(false); // Prevent multiple calls to handleEndCall
  const handleEndCallRef = useRef(null); // Will be set after handleEndCall is defined
  
  // Get call status - use socket context directly for immediate updates
  const { currentCallStatus, isCallCompleted } = useCallStatus(currentCallSid);
  
  // Get latest status directly from socket context (immediate, no delay)
  const getLatestStatus = () => {
    if (currentCallSid) {
      return getCallStatus(currentCallSid) || currentCallStatus;
    }
    return currentCallStatus;
  };
  
  // Get current call status - always use latest from socket context
  const callStatus = getLatestStatus()?.status || null;
  
  // Simple state flags - clear and direct
  const isRinging = callStatus === 'ringing';
  const isInProgress = callStatus === 'in-progress';
  const isEnded = callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer' || callStatus === 'canceled';
  
  // Disconnect WebCallInterface if call ended but we're still connected
  useEffect(() => {
    if (isEnded && isWebCallConnected) {
      console.log('📞 Call ended, disconnecting WebCallInterface');
      const webInterface = getWebCallInterfaceRef();
      if (webInterface?.hangUp) {
        webInterface.hangUp();
      }
      contextEndCall();
    }
  }, [isEnded, isWebCallConnected, getWebCallInterfaceRef, contextEndCall]);

  // Clean up all intervals and hangup call on unmount
  useEffect(() => {
    return () => {
      // Clear all intervals
      if (ringingInterval.current) clearInterval(ringingInterval.current);
      if (muteSyncInterval.current) clearInterval(muteSyncInterval.current);
      
      // Timer is managed by context, so we don't need to clear it here
      
      // If there's an active call, hang it up (same as clicking "End Call")
      // Use ref to get latest values without dependencies
      const hasActiveCall = currentCallSid || isCalling || isWebCallConnected;
      if (hasActiveCall && !isEndingCall.current) {
        console.log('🧹 CallButton unmounting with active call - hanging up');
        try {
          // Call handleEndCall to properly cleanup
          // This disconnects SDK, cancels outbound call, resets state
          handleEndCallRef.current();
        } catch (err) {
          console.warn('Error hanging up call on CallButton unmount:', err);
        }
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on unmount

  // Play ringing sound
  const playRingingSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.2);
      oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.4);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.6);
      
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.1);
      gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.8);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.8);
    } catch (error) {
      console.log('Audio context not available:', error);
    }
  };

  // Handle ringing sound
  useEffect(() => {
    if (isRinging && !ringingInterval.current) {
      playRingingSound();
      ringingInterval.current = setInterval(playRingingSound, 2000);
    } else if (!isRinging && ringingInterval.current) {
      clearInterval(ringingInterval.current);
      ringingInterval.current = null;
    }
  }, [isRinging]);

  // Timer is now managed by CallContext, so we don't need local timer management here
  // The context automatically starts/stops the timer based on call status

  // Handle call completion - triggered when call ends (by customer or agent)
  useEffect(() => {
    if (isEnded && currentCallSid && !hasNotifiedCompletion.current) {
      hasNotifiedCompletion.current = true;
      
      // Get duration from call status update or use current timer
      const latestStatus = getLatestStatus();
      const durationFromStatus = latestStatus?.duration || 0;
      
      // Preserve duration - use status duration if available, otherwise use timer
      if (durationFromStatus > 0) {
        setFinalDuration(durationFromStatus);
        setCallTimer(durationFromStatus);
      } else if (callTimer > 0 && !finalDuration) {
        // Use current timer if status doesn't have duration yet
        setFinalDuration(callTimer);
      }
      
      // Timer is managed by context, so we don't need to stop it here
      if (ringingInterval.current) {
        clearInterval(ringingInterval.current);
        ringingInterval.current = null;
      }
      if (muteSyncInterval.current) {
        clearInterval(muteSyncInterval.current);
        muteSyncInterval.current = null;
      }
      
      // Don't reset timer - keep it for display
      // setCallTimer(0);
      
      // Notify parent (with error handling to prevent navigation issues)
      if (onCallCompleted && currentCallSid) {
        try {
          onCallCompleted({
            callSid: currentCallSid,
            status: callStatus,
            duration: durationFromStatus || callTimer,
            customerId,
            saleId,
            phoneNumber,
            customerName
          });
        } catch (callbackErr) {
          console.warn('Error in onCallCompleted callback:', callbackErr);
          // Don't let callback errors break the app or cause navigation
        }
      }
      
      // Reset state after showing status (2 seconds) - use context
      setTimeout(() => {
        contextEndCall();
      }, 2000);
    }
  }, [isEnded, currentCallSid, callStatus, callTimer, finalDuration, getLatestStatus, onCallCompleted, customerId, saleId, phoneNumber, customerName]);

  // Reset completion flag and duration for new calls
  useEffect(() => {
    if (currentCallSid && previousCallSid.current !== currentCallSid) {
      hasNotifiedCompletion.current = false;
      previousCallSid.current = currentCallSid;
      setFinalDuration(null); // Reset final duration for new call
    } else if (!currentCallSid) {
      hasNotifiedCompletion.current = false;
      previousCallSid.current = null;
      // Duration and timer are managed by context
    }
  }, [currentCallSid]);

  // Initiate call
  const handleCall = async () => {
    if (!phoneNumber || !user?.id) {
      setError('Phone number or user information missing');
      return;
    }

    setError(null);

    try {
      let response;
      try {
        response = await apiClient.post('/api/calls/initiate', {
          customerId,
          saleId,
          agentId: user.id,
          phoneNumber,
          callPurpose,
          customMessage: `Hello ${customerName || 'there'}, this is a call from our CRM system.`
        });
      } catch (apiErr) {
        // Network error or API client error
        // Handle network errors (AbortError, Failed to fetch, TypeError, etc.)
        const errorName = apiErr?.name || '';
        const errorMessage = apiErr?.message || String(apiErr) || '';
        const errorString = errorMessage.toLowerCase();
        
        const isNetworkError = 
          errorName === 'AbortError' ||
          errorName === 'TypeError' ||
          errorName === 'NetworkError' ||
          errorMessage === 'Failed to fetch' ||
          errorString.includes('failed to fetch') ||
          errorString.includes('fetch') ||
          errorString.includes('network') ||
          errorString.includes('networkerror');
        
        if (isNetworkError) {
          // Network errors are expected and handled - log as info, not error
          console.warn('⚠️ Network error detected (handled):', errorMessage);
          setError('Network error. Please check your connection and try again.');
          contextEndCall();
          return;
        }
        
        // For non-network errors, log as error
        console.error('❌ API call failed:', apiErr);
        
        // Handle Response objects that might have been returned instead of thrown
        if (apiErr instanceof Response) {
          // If it's a Response object, try to parse it
          try {
            const errorData = await apiErr.json().catch(() => ({}));
            const errorMsg = errorData?.message || errorData?.error || `Server error (${apiErr.status})`;
            setError(errorMsg);
            contextEndCall();
            return;
          } catch (parseErr) {
            setError(`Server error (${apiErr.status}). Please try again.`);
            contextEndCall();
            return;
          }
        }

        // For other errors, show the error message
        setError(apiErr?.message || 'Network error. Please check your connection and try again.');
        contextEndCall();
        return;
      }

      // Check if response exists and is valid
      if (!response) {
        console.error('❌ No response from API');
        setError('No response from server. Please try again.');
        contextEndCall();
        return;
      }

      let result;
      try {
        result = await response.json();
      } catch (jsonErr) {
        console.error('❌ Failed to parse response:', jsonErr);
        setError('Invalid response from server. Please try again.');
        contextEndCall();
        return;
      }

      if (result?.success) {
        try {
          // Use context to start call - this will show WebCallInterface globally
          const confName = result.data?.conferenceName || `call-${user.id}`;
          const callSid = result.data?.callSid;
          
          if (!callSid) {
            throw new Error('Call SID not received from server');
          }
          
          contextStartCall({
            callSid,
            conferenceName: confName,
            customerId,
            saleId,
            phoneNumber,
            customerName
          });
          
          if (onCallInitiated) {
            try {
              onCallInitiated(result.data);
            } catch (callbackErr) {
              console.warn('⚠️ Error in onCallInitiated callback (ignored):', callbackErr);
            }
          }
        } catch (stateErr) {
          console.error('❌ Error updating call state:', stateErr);
          setError('Failed to initialize call. Please try again.');
          contextEndCall();
        }
      } else {
        const errorMsg = result?.message || result?.error || 'Failed to initiate call';
        console.error('❌ Call initiation failed:', errorMsg);
        setError(errorMsg);
        contextEndCall();
      }
    } catch (err) {
      // Catch any unexpected errors
      console.error('❌ Unexpected error initiating call:', err);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
      contextEndCall();
    }
  };

  // End call - called when agent clicks "End Call" button
  const handleEndCall = async () => {
    console.log('handleEndCall called');
    
    // Prevent multiple simultaneous calls to handleEndCall
    if (hasNotifiedCompletion.current || isEndingCall.current) {
      console.log('⚠️ handleEndCall already in progress, skipping duplicate call');
      return;
    }
    
    isEndingCall.current = true;
    hasNotifiedCompletion.current = true;
    const completedCallSid = currentCallSid;
    
    // Preserve current timer value if call was in progress
    if (isInProgress && callTimer > 0) {
      setFinalDuration(callTimer);
    }
    
    // Stop all intervals immediately
    if (ringingInterval.current) {
      clearInterval(ringingInterval.current);
      ringingInterval.current = null;
    }
    if (muteSyncInterval.current) {
      clearInterval(muteSyncInterval.current);
      muteSyncInterval.current = null;
    }
    
    try {
      // Step 1: Disconnect agent's WebCallInterface (SDK connection to conference)
      const webInterface = getWebCallInterfaceRef();
      if (webInterface?.hangUp) {
        try {
          // Always try to hang up - works for ringing, in-progress, or any state
          webInterface.hangUp();
        } catch (err) {
          // Ignore errors - call might be in any state (ringing, connecting, etc.)
          console.warn('Web call hangup error (ignored):', err.message);
        }
      }
      
      // Step 2: Cancel the outbound call to customer's phone
      // This stops the customer's phone from ringing
      // Use fetch directly to avoid token refresh issues, fire-and-forget
      if (completedCallSid) {
        setTimeout(() => {
          try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            
            if (!token) {
              console.warn('⚠️ No token available for hangup API call');
              return;
            }

            // Use fetch with a timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
              controller.abort();
            }, 5000); // 5 second timeout

            fetch('/api/calls/hangup', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                callSid: completedCallSid
              }),
              signal: controller.signal
            })
            .then(response => {
              clearTimeout(timeoutId);
              if (response?.ok) {
                console.log('✅ Outbound call canceled successfully');
              } else {
                // Non-critical - call might already be ended
                console.warn('⚠️ Hangup API returned non-OK status:', response?.status);
              }
            })
            .catch(err => {
              clearTimeout(timeoutId);
              // Silently ignore errors - API is idempotent, call might already be ended
              // Don't log AbortError (timeout) as it's expected
              if (err?.name !== 'AbortError') {
                console.debug('⚠️ Hangup API error (ignored, non-critical):', err?.message || 'Unknown error');
              }
            });
          } catch (err) {
            // Catch any synchronous errors and ignore them (non-critical)
            console.debug('⚠️ Hangup API setup error (ignored):', err?.message || 'Unknown error');
          }
        }, 100); // Small delay to ensure SDK disconnect happens first
      }
      
    } catch (err) {
      // Don't let errors break the app - always cleanup state
      console.error('❌ Error in handleEndCall:', err);
      setError('Error ending call. State has been reset.');
      
      // Always cleanup state even on error
      try {
        contextEndCall();
      } catch (cleanupErr) {
        console.error('❌ Error during cleanup:', cleanupErr);
      }
      
      // Reset flags
      isEndingCall.current = false;
      hasNotifiedCompletion.current = false;
    }
    
    // Reset local error state
    setError(null);
    
    // Use context to end call - this handles all state cleanup
    contextEndCall();
    
    // Notify parent
    if (onCallCompleted && completedCallSid) {
      try {
        onCallCompleted({
          callSid: completedCallSid,
          status: 'completed',
          customerId,
          saleId,
          phoneNumber,
          customerName
        });
      } catch (callbackErr) {
        console.warn('Error in onCallCompleted callback:', callbackErr);
      }
    }
    
    // Reset completion flag after delay
    setTimeout(() => {
      hasNotifiedCompletion.current = false;
      isEndingCall.current = false;
    }, 1000);
  };
  
  // Update handleEndCall ref whenever handleEndCall changes
  useEffect(() => {
    handleEndCallRef.current = handleEndCall;
  }, [handleEndCall]);

  // Expose call state and methods via ref
  useImperativeHandle(ref, () => ({
    hasActiveCall: () => {
      // Check if there's an active call (ringing, connecting, or in-progress)
      // Use the derived state values
      const latestStatus = getLatestStatus();
      const callStatusValue = latestStatus?.status || null;
      const ringing = callStatusValue === 'ringing';
      const inProgress = callStatusValue === 'in-progress';
      
      return !!(currentCallSid || isCalling || isWebCallConnected || ringing || inProgress);
    },
    hangUp: () => {
      // Expose hangup method to parent
      if (!isEndingCall.current) {
        handleEndCall();
      }
    },
    getCallState: () => {
      const latestStatus = getLatestStatus();
      const callStatusValue = latestStatus?.status || null;
      return {
        isCalling,
        currentCallSid,
        isWebCallConnected,
        isRinging: callStatusValue === 'ringing',
        isInProgress: callStatusValue === 'in-progress',
        isEnded: callStatusValue === 'completed' || callStatusValue === 'failed' || callStatusValue === 'canceled'
      };
    }
  }), [currentCallSid, isCalling, isWebCallConnected, getLatestStatus, handleEndCall]);

  // Fetch agents for transfer
  const fetchAvailableAgents = async () => {
    setLoadingAgents(true);
    setError(null); // Clear previous errors
    
    try {
      let response;
      try {
        response = await apiClient.get('/api/calls/agents');
      } catch (apiErr) {
        console.error('❌ Failed to fetch agents:', apiErr);
        setError('Failed to load agents. Please try again.');
        setAvailableAgents([]);
        return;
      }

      if (!response) {
        console.error('❌ No response when fetching agents');
        setError('No response from server.');
        setAvailableAgents([]);
        return;
      }

      if (response?.ok) {
        try {
          const result = await response.json();
          if (result?.success) {
            setAvailableAgents(result.data || []);
          } else {
            console.warn('⚠️ Agents fetch returned unsuccessful:', result?.message);
            setError(result?.message || 'Failed to load agents.');
            setAvailableAgents([]);
          }
        } catch (jsonErr) {
          console.error('❌ Failed to parse agents response:', jsonErr);
          setError('Invalid response from server.');
          setAvailableAgents([]);
        }
      } else {
        console.error('❌ Agents API returned non-OK status:', response?.status);
        setError(`Server error (${response?.status}). Please try again.`);
        setAvailableAgents([]);
      }
    } catch (err) {
      // Catch any unexpected errors
      console.error('❌ Unexpected error fetching agents:', err);
      setError(err?.message || 'An unexpected error occurred.');
      setAvailableAgents([]);
    } finally {
      setLoadingAgents(false);
    }
  };

  // Format timer
  const formatTimer = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Get display text - simple flow: Calling -> Ringing -> Timer -> Status with Duration
  const getDisplayText = () => {
    // Show "Calling..." immediately when button is clicked (before any status)
    if (isCalling && !callStatus) return 'Calling...';
    // Show "Ringing..." when status is ringing
    if (isRinging) return 'Ringing...';
    // Show timer when in-progress
    if (isInProgress) return formatTimer(callTimer);
    // Show status with duration when ended (if call was in-progress)
    if (isEnded) {
      const durationToShow = finalDuration || callTimer;
      // Show duration for completed calls that had time in-progress
      if (durationToShow > 0 && callStatus === 'completed') {
        return `${formatTimer(durationToShow)}`;
      }
      // Show status text for other end states
      if (callStatus === 'completed') return 'Completed';
      if (callStatus === 'failed') return 'Failed';
      if (callStatus === 'busy') return 'Busy';
      if (callStatus === 'no-answer') return 'No Answer';
      if (callStatus === 'canceled') return 'Canceled';
    }
    return 'Call';
  };

  // Get status badge text
  const getStatusBadgeText = () => {
    if (callStatus === 'completed') return 'Completed';
    if (callStatus === 'failed') return 'Failed';
    if (callStatus === 'busy') return 'Busy';
    if (callStatus === 'no-answer') return 'No Answer';
    if (callStatus === 'canceled') return 'Canceled';
    return null;
  };

  if (!phoneNumber) {
    return (
      <button disabled className="opacity-50 cursor-not-allowed" title="No phone number available">
        <PhoneIcon /> No Number
      </button>
    );
  }

  return (
    <div className="inline-flex flex-col gap-3">
      {/* Status Display */}
      <div className="inline-flex items-center gap-2">
        {/* Status Badge - only for end states */}
        {isEnded && getStatusBadgeText() && (
          <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm ${
            callStatus === 'completed' ? 'bg-gray-100 text-gray-700 border border-gray-200' :
            callStatus === 'failed' ? 'bg-red-100 text-red-700 border border-red-200' :
            callStatus === 'busy' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
            callStatus === 'no-answer' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
            callStatus === 'canceled' ? 'bg-gray-100 text-gray-700 border border-gray-200' :
            'bg-gray-100 text-gray-700 border border-gray-200'
          }`}>
            {getStatusBadgeText()}
          </div>
        )}
        
        {/* Call Button - shows when idle (no active call) */}
        {!isRinging && !isInProgress && !isEnded && !isCalling && !currentCallSid && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCall().catch((err) => {
                // Ensure any unhandled errors are caught and don't cause navigation
                console.error('Unhandled error in handleCall:', err);
                setError('An error occurred. Please try again.');
                contextEndCall();
              });
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
            title={`Call ${customerName || phoneNumber}`}
          >
            <PhoneIcon isCalling={false} />
            {getDisplayText()}
          </button>
        )}
        
        {/* Calling State - only if we have callSid */}
        {isCalling && !isRinging && !isInProgress && !isEnded && currentCallSid && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <span className="inline-block w-2 h-2 bg-orange-500 rounded-full mr-2 animate-pulse"></span>
            <PhoneIcon isCalling={true} />
            {getDisplayText()}
          </div>
        )}
        
        {/* Ringing State - only show if we have a callSid (active call) */}
        {isRinging && !isEnded && currentCallSid && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
            <PhoneIcon isCalling={true} />
            {getDisplayText()}
          </div>
        )}
        
        {/* In-Progress State - shows timer - only show if we have a callSid */}
        {isInProgress && !isEnded && currentCallSid && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-green-50 text-green-700 border border-green-200">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
            <PhoneIcon isCalling={true} />
            {getDisplayText()}
          </div>
        )}
        
        {/* Ended State - show when call ended (check hasNotifiedCompletion or no currentCallSid after ending) */}
        {((isEnded || hasNotifiedCompletion.current) && !currentCallSid) && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-gray-50 text-gray-700 border border-gray-200">
            <PhoneIcon isCalling={false} />
            {finalDuration ? `Completed (${formatTimer(finalDuration)})` : 'Call Ended'}
          </div>
        )}
      </div>

      {/* Call Controls - only when in-progress and not ended */}
      {isInProgress && !isEnded && currentCallSid && (
        <div className="inline-flex items-center gap-2 flex-wrap relative z-10">
          {/* Mute Button */}
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              const webInterface = getWebCallInterfaceRef();
              if (webInterface?.toggleMute) {
                const success = await webInterface.toggleMute();
                if (success !== false && webInterface?.getMutedState) {
                  // Update state immediately
                  setIsMuted(webInterface.getMutedState());
                }
              }
            }}
            disabled={!isWebCallConnected || !getWebCallInterfaceRef()}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg ${
              isMuted ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-600 hover:bg-gray-700 text-white'
            } ${!isWebCallConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            )}
            <span className="text-sm">{isMuted ? "Unmute" : "Mute"}</span>
          </button>

          {/* Transfer Button */}
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!currentCallSid) {
                setError('No active call to transfer');
                return;
              }
              setShowTransferModal(true);
              try {
                await fetchAvailableAgents();
              } catch (err) {
                console.warn('Could not fetch agents:', err);
              }
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg bg-purple-500 hover:bg-purple-600 text-white"
            title="Transfer Call"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span className="text-sm">Transfer</span>
          </button>

          {/* End Call Button */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isEndingCall.current) {
                handleEndCall();
              }
            }}
            disabled={isEndingCall.current}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg ${
              isEndingCall.current 
                ? 'bg-gray-400 cursor-not-allowed' 
                : 'bg-red-500 hover:bg-red-600'
            } text-white`}
            title="End Call"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm">{isEndingCall.current ? 'Ending...' : 'End Call'}</span>
          </button>
        </div>
      )}

      {/* End Call Button - when ringing (only show if not ended and has callSid) */}
      {isRinging && !isEnded && currentCallSid && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isEndingCall.current) {
              handleEndCall();
            }
          }}
          disabled={isEndingCall.current}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg ${
            isEndingCall.current 
              ? 'bg-gray-400 cursor-not-allowed' 
              : 'bg-red-500 hover:bg-red-600'
          } text-white`}
          title="End Call"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-sm">{isEndingCall.current ? 'Ending...' : 'End Call'}</span>
        </button>
      )}

      {error && (
        <div className="text-xs text-red-600 mt-2">{error}</div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-50" 
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isTransferring) {
              setShowTransferModal(false);
            }
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Transfer Call</h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Transfer Type</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="blind"
                    checked={transferType === 'blind'}
                    onChange={(e) => setTransferType(e.target.value)}
                    className="mr-2"
                    disabled={isTransferring}
                  />
                  <span className="text-sm">
                    Blind Transfer
                    <span className="text-xs text-gray-500 block">You leave the call</span>
                  </span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="warm"
                    checked={transferType === 'warm'}
                    onChange={(e) => setTransferType(e.target.value)}
                    className="mr-2"
                    disabled={isTransferring}
                  />
                  <span className="text-sm">
                    Warm Transfer
                    <span className="text-xs text-gray-500 block">You stay in the call</span>
                  </span>
                </label>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Transfer To</label>
              <div className="flex gap-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="agent"
                    checked={transferDestinationType === 'agent'}
                    onChange={(e) => {
                      setTransferDestinationType(e.target.value);
                      setSelectedAgentId(null);
                      setTransferPhoneNumber('');
                    }}
                    className="mr-2"
                    disabled={isTransferring}
                  />
                  <span className="text-sm">Agent</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="phone"
                    checked={transferDestinationType === 'phone'}
                    onChange={(e) => {
                      setTransferDestinationType(e.target.value);
                      setSelectedAgentId(null);
                    }}
                    className="mr-2"
                    disabled={isTransferring}
                  />
                  <span className="text-sm">Phone Number</span>
                </label>
              </div>
            </div>

            {transferDestinationType === 'agent' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Agent</label>
                {loadingAgents ? (
                  <div className="text-sm text-gray-500">Loading agents...</div>
                ) : (
                  <select
                    value={selectedAgentId || ''}
                    onChange={(e) => setSelectedAgentId(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={isTransferring}
                  >
                    <option value="">Select an agent...</option>
                    {availableAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} {agent.phone ? `(${agent.phone})` : '(No phone)'} - {agent.status}
                      </option>
                    ))}
                  </select>
                )}
                {availableAgents.length === 0 && !loadingAgents && (
                  <div className="text-xs text-gray-500 mt-1">No available agents found</div>
                )}
              </div>
            )}

            {transferDestinationType === 'phone' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={transferPhoneNumber}
                  onChange={(e) => setTransferPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={isTransferring}
                />
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferPhoneNumber('');
                  setSelectedAgentId(null);
                  setTransferType('blind');
                  setTransferDestinationType('phone');
                  setIsTransferring(false);
                  setError(null);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                disabled={isTransferring}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (transferDestinationType === 'agent' && !selectedAgentId) {
                    setError('Please select an agent');
                    return;
                  }
                  if (transferDestinationType === 'phone' && !transferPhoneNumber.trim()) {
                    setError('Please enter a phone number');
                    return;
                  }
                  if (!currentCallSid) {
                    setError('No active call to transfer');
                    setShowTransferModal(false);
                    return;
                  }

                  setIsTransferring(true);
                  setError(null);

                  try {
                    const requestBody = {
                      callSid: currentCallSid,
                      transferType: transferType
                    };

                    if (transferDestinationType === 'agent') {
                      requestBody.agentId = selectedAgentId;
                    } else {
                      requestBody.transferTo = transferPhoneNumber.trim();
                    }

                    let response;
                    try {
                      response = await apiClient.post('/api/calls/transfer', requestBody);
                    } catch (apiErr) {
                      console.error('❌ Transfer API call failed:', apiErr);
                      setError(apiErr?.message || 'Network error. Please try again.');
                      return;
                    }

                    if (!response) {
                      console.error('❌ No response from transfer API');
                      setError('No response from server. Please try again.');
                      return;
                    }
                    
                    if (response?.ok) {
                      try {
                        const result = await response.json();
                        if (result?.success) {
                          // Transfer successful
                          setShowTransferModal(false);
                          setTransferPhoneNumber('');
                          setSelectedAgentId(null);
                          setTransferType('blind');
                          setTransferDestinationType('phone');
                          setError(null);
                        } else {
                          const errorMsg = result?.message || result?.error || 'Failed to transfer call';
                          console.error('❌ Transfer failed:', errorMsg);
                          setError(errorMsg);
                        }
                      } catch (jsonErr) {
                        console.error('❌ Failed to parse transfer response:', jsonErr);
                        setError('Invalid response from server. Please try again.');
                      }
                    } else {
                      console.error('❌ Transfer API returned non-OK status:', response?.status);
                      setError(`Transfer failed (${response?.status}). Please try again.`);
                    }
                  } catch (err) {
                    // Catch any unexpected errors
                    console.error('❌ Unexpected error transferring call:', err);
                    setError(err?.message || 'An unexpected error occurred. Please try again.');
                  } finally {
                    setIsTransferring(false);
                  }
                }}
                className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
                disabled={isTransferring || (transferDestinationType === 'agent' && !selectedAgentId) || (transferDestinationType === 'phone' && !transferPhoneNumber.trim())}
              >
                {isTransferring ? 'Transferring...' : 'Transfer'}
              </button>
            </div>
            {error && (
              <div className="mt-2 text-xs text-red-600">{error}</div>
            )}
          </div>
        </div>
      )}

      {/* WebCallInterface is now rendered globally via GlobalWebCallInterface component */}
    </div>
  );
});

const PhoneIcon = ({ isCalling = false }) => (
  <svg
    className={`w-4 h-4 ${isCalling ? 'animate-pulse' : ''}`}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
    />
  </svg>
);

export default CallButton;
