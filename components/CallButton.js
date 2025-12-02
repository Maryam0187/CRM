import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCallStatus } from '../lib/useCallStatus';
import apiClient from '../lib/apiClient';
import WebCallInterface from './WebCallInterface';

const CallButton = ({ 
  customerId, 
  saleId, 
  phoneNumber, 
  customerName, 
  callPurpose = 'follow_up',
  onCallInitiated,
  onCallCompleted,
  className = '',
  size = 'default'
}) => {
  const { user } = useAuth();
  const [isCalling, setIsCalling] = useState(false);
  const [currentCallSid, setCurrentCallSid] = useState(null);
  const [conferenceName, setConferenceName] = useState(null);
  const [showWebInterface, setShowWebInterface] = useState(false);
  const [isWebCallConnected, setIsWebCallConnected] = useState(false);
  const [error, setError] = useState(null);
  const [callStartTime, setCallStartTime] = useState(null);
  const [callTimer, setCallTimer] = useState(0);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferPhoneNumber, setTransferPhoneNumber] = useState('');
  const [transferType, setTransferType] = useState('blind'); // 'blind' or 'warm'
  const [transferDestinationType, setTransferDestinationType] = useState('phone'); // 'phone' or 'agent'
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  // Fetch available agents for transfer
  const fetchAvailableAgents = async () => {
    setLoadingAgents(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      const headers = {
        'Content-Type': 'application/json',
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const response = await fetch(`${baseUrl}/api/calls/agents`, {
        method: 'GET',
        headers: headers
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setAvailableAgents(result.data || []);
        }
      }
    } catch (err) {
      console.error('❌ Error fetching agents:', err);
    } finally {
      setLoadingAgents(false);
    }
  };
  const [isMuted, setIsMuted] = useState(false);
  const ringingInterval = useRef(null);
  const timerInterval = useRef(null);
  const stateSyncInterval = useRef(null);
  const hasNotifiedCompletion = useRef(false);
  const webCallInterfaceRef = useRef(null);
  const previousCallSid = useRef(null);
  
  // Use the custom hook for call status management
  const { 
    currentCallStatus, 
    isCallActive, 
    isCallCompleted, 
    formatDuration 
  } = useCallStatus(currentCallSid);

  // Clean up intervals on unmount
  useEffect(() => {
    return () => {
      if (ringingInterval.current) {
        clearInterval(ringingInterval.current);
      }
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
      if (stateSyncInterval.current) {
        clearInterval(stateSyncInterval.current);
      }
    };
  }, []);

  // Note: Call status updates are handled via Socket.IO in real-time
  // The useCallStatus hook listens to 'callStatusUpdate' events dispatched by SocketContext
  // No polling needed - Socket.IO provides instant updates when Twilio webhooks arrive

  // Play ringing sound effect
  const playRingingSound = () => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      // Create a two-tone ringing sound
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

  // Start ringing sound when call is ringing
  useEffect(() => {
    const callStatus = currentCallStatus?.status;
    console.log('📞 Call status changed to:', callStatus, 'for callSid:', currentCallSid);
    console.log('📞 Full call status object:', currentCallStatus);
    console.log('📞 Current callSid state:', currentCallSid);
    console.log('📞 Call status callSid:', currentCallStatus?.callSid);
    
    if (callStatus === 'ringing' && !ringingInterval.current) {
      console.log('📞 Starting ringing sound');
      // Play initial ring
      playRingingSound();
      // Set up repeating ring every 2 seconds
      ringingInterval.current = setInterval(playRingingSound, 2000);
    } else if (callStatus !== 'ringing' && ringingInterval.current) {
      console.log('📞 Stopping ringing sound');
      clearInterval(ringingInterval.current);
      ringingInterval.current = null;
    }
  }, [currentCallStatus?.status, currentCallSid]);

  // Handle call timer for in-progress calls (from Twilio status updates)
  useEffect(() => {
    const callStatus = currentCallStatus?.status;
    
    // Start timer immediately when call becomes in-progress (customer answers)
    // Don't wait for web call to connect - the call has already started
    if (callStatus === 'in-progress' && !callStartTime) {
      // Call just started via Twilio status update, set start time immediately
      console.log('📞 Call in-progress detected, starting timer immediately');
      const now = Date.now();
      setCallStartTime(now);
      setCallTimer(0);
      
      // Clear any existing timer first
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
      }
      
      // Start timer interval immediately - no delay
      timerInterval.current = setInterval(() => {
        setCallTimer(prev => prev + 1);
      }, 1000);
    } else if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer') {
      // Call ended - preserve final timer value before clearing
      const finalDuration = callTimer;
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
      // Don't reset timer immediately - let it show final duration briefly
      // Reset after a delay to allow UI to show final duration
      setTimeout(() => {
        setCallStartTime(null);
        setCallTimer(0);
      }, 2000);
    } else if ((callStatus !== 'in-progress' && !isWebCallConnected) && timerInterval.current) {
      // Call ended for other reasons, stop timer
      clearInterval(timerInterval.current);
      timerInterval.current = null;
      setCallStartTime(null);
      setCallTimer(0);
    }
  }, [currentCallStatus?.status, callStartTime, isWebCallConnected]);

  // Handle call completion - when customer hangs up or call ends
  useEffect(() => {
    const callStatus = currentCallStatus?.status;
    const isCompleted = callStatus === 'completed' || callStatus === 'failed' || callStatus === 'busy' || callStatus === 'no-answer';
    
    // Only handle if call is completed AND we haven't already notified AND we have a callSid
    if (isCompleted && currentCallSid && !hasNotifiedCompletion.current) {
      console.log('📞 Call completed by customer or system, cleaning up:', callStatus);
      
      // Mark as notified immediately to prevent loops
      hasNotifiedCompletion.current = true;
      
      // Stop timer but preserve final value briefly
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
      
      // Stop ringing if still playing
      if (ringingInterval.current) {
        clearInterval(ringingInterval.current);
        ringingInterval.current = null;
      }
      
      // Save callSid before clearing
      const completedCallSid = currentCallSid;
      
      // Notify parent component that call is completed (only once)
      if (onCallCompleted && completedCallSid) {
        onCallCompleted({
          callSid: completedCallSid,
          status: callStatus,
          customerId,
          saleId,
          phoneNumber,
          customerName
        });
      }
      
      // Reset state after showing final duration (2 seconds)
      setTimeout(() => {
        setIsCalling(false);
        setIsWebCallConnected(false);
        setShowWebInterface(false);
        setCallStartTime(null);
        setCallTimer(0);
        // Clear callSid and conferenceName after notification
        setTimeout(() => {
          setCurrentCallSid(null);
          setConferenceName(null);
        }, 100);
      }, 2000);
    }
  }, [currentCallStatus?.status, currentCallSid, onCallCompleted, customerId, saleId, phoneNumber, customerName]);

  // Reset completion notification flag when a new call starts (different callSid)
  useEffect(() => {
    if (currentCallSid) {
      // Only reset if this is a different call (new callSid)
      if (previousCallSid.current !== currentCallSid) {
        hasNotifiedCompletion.current = false;
        previousCallSid.current = currentCallSid;
      }
    } else {
      // No active call, reset the flag
      hasNotifiedCompletion.current = false;
      previousCallSid.current = null;
    }
  }, [currentCallSid]);

  const handleCall = async () => {
    if (!phoneNumber || !user?.id) {
      setError('Phone number or user information missing');
      return;
    }

    setIsCalling(true);
    setError(null);

    try {
      const response = await apiClient.post('/api/calls/initiate', {
        customerId,
        saleId,
        agentId: user.id,
        phoneNumber,
        callPurpose,
        customMessage: `Hello ${customerName || 'there'}, this is a call from our CRM system.`
      });

      const result = await response.json();

      if (result.success) {
        // Call initiated successfully
        setCurrentCallSid(result.data.callSid);
        // Set conference name from response or generate it
        const confName = result.data.conferenceName || `call-${user.id}`;
        setConferenceName(confName);
        setShowWebInterface(true);
        console.log('📞 Call initiated successfully:', result.data);
        console.log('📞 Conference name:', confName);
        console.log('📞 showWebInterface set to:', true);
        console.log('📞 conferenceName set to:', confName);
        
        if (onCallInitiated) {
          onCallInitiated(result.data);
        }
      } else {
        setError(result.message || 'Failed to initiate call');
        setIsCalling(false);
      }
    } catch (err) {
      console.error('Error initiating call:', err);
      setError('Network error. Please try again.');
      setIsCalling(false);
    }
  };

  if (!phoneNumber) {
    return (
      <button
        disabled
        className={`${getButtonClasses()} opacity-50 cursor-not-allowed`}
        title="No phone number available"
      >
        <PhoneIcon />
        No Number
      </button>
    );
  }

  const getButtonClasses = () => {
    const baseClasses = 'inline-flex items-center gap-2 px-3 py-2 rounded-md font-medium transition-colors duration-200';
    const sizeClasses = {
      small: 'px-2 py-1 text-sm',
      default: 'px-3 py-2',
      large: 'px-4 py-3 text-lg'
    };
    
    // Determine ringing state (including web interface connecting)
    const isRingingState = currentCallStatus?.status === 'ringing' || 
                          (showWebInterface && !isWebCallConnected && !error);
    
    let colorClasses;
    if (isRingingState) {
      colorClasses = 'bg-blue-500 hover:bg-blue-600 text-white animate-pulse';
    } else if (isCallActiveState) {
      colorClasses = 'bg-green-500 hover:bg-green-600 text-white';
    } else if (isCalling) {
      colorClasses = 'bg-orange-500 hover:bg-orange-600 text-white';
    } else {
      colorClasses = 'bg-green-500 hover:bg-green-600 text-white';
    }
    
    return `${baseClasses} ${sizeClasses[size]} ${colorClasses} ${className}`;
  };

  // Format timer display
  const formatTimer = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getButtonText = () => {
    const callStatus = currentCallStatus?.status;
    // Show "Ringing" when call is ringing or when web interface is connecting
    if (callStatus === 'ringing' || (showWebInterface && !isWebCallConnected && !error)) {
      return 'Ringing...';
    } else if (callStatus === 'in-progress' || isWebCallConnected) {
      return formatTimer(callTimer);
    } else if (isCalling) {
      return 'Calling...';
    } else {
      return 'Call';
    }
  };

  const handleEndCall = async () => {
    console.log('📞 End call button clicked');
    
    // Prevent multiple calls to onCallCompleted
    if (hasNotifiedCompletion.current) {
      console.log('📞 Already notified completion, skipping');
      return;
    }
    
    // Mark as completed immediately to prevent loops
    hasNotifiedCompletion.current = true;
    
    // Save callSid before clearing state
    const completedCallSid = currentCallSid;
    
    try {
      // First, hang up the customer's call via API
      if (completedCallSid) {
        console.log('📞 Hanging up customer call via API:', completedCallSid);
        
        // Use apiClient with proper timeout and error handling
        try {
          // Create a promise that will timeout after 5 seconds
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('TIMEOUT')), 5000);
          });
          
          // Call hangup API using apiClient
          const apiCallPromise = apiClient.post('/api/calls/hangup', {
            callSid: completedCallSid
          }).catch(err => {
            // Re-throw network errors so they can be handled properly
            throw err;
          });
          
          // Race between API call and timeout
          const response = await Promise.race([apiCallPromise, timeoutPromise]);
          
          if (response && response.ok) {
            const result = await response.json().catch(() => ({}));
            if (result.success) {
              console.log('✅ Customer call hung up successfully');
            } else {
              console.error('❌ Failed to hang up customer call:', result.message || result.error || 'Unknown error');
            }
          } else if (response) {
            const status = response.status || 'Unknown';
            const errorText = await response.text().catch(() => 'Unknown error');
            console.error('❌ Hangup API returned error:', status, errorText);
          }
        } catch (err) {
          // Handle timeout and network errors gracefully
          if (err.message === 'TIMEOUT') {
            console.warn('⚠️ Hangup API call timed out after 5 seconds (call may still be terminated by Twilio)');
          } else if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
            console.warn('⚠️ Hangup API call failed to connect. Network error - call may still be terminated by Twilio.');
          } else if (err.name === 'AbortError') {
            console.warn('⚠️ Hangup API call was aborted (call may still be terminated by Twilio)');
          } else {
            console.error('❌ Error calling hangup API:', err);
            console.error('❌ Error details:', {
              message: err.message || 'Unknown error',
              name: err.name || 'Unknown',
              callSid: completedCallSid
            });
          }
          // Continue with cleanup even if API call fails
          // The call might be terminated by Twilio when agent disconnects from conference
        }
      }
      
      // Then disconnect web call if connected
      if (webCallInterfaceRef.current && typeof webCallInterfaceRef.current.hangUp === 'function') {
        console.log('📞 Disconnecting web interface');
        webCallInterfaceRef.current.hangUp();
      }
    } catch (err) {
      console.error('Error in handleEndCall:', err);
      // Continue with cleanup even if there's an error
    }
    
    // Reset all call state immediately
    setIsCalling(false);
    setIsWebCallConnected(false);
    setShowWebInterface(false);
    setError(null);
    setIsMuted(false);
    
    // Clear intervals
    if (ringingInterval.current) {
      clearInterval(ringingInterval.current);
      ringingInterval.current = null;
    }
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    if (stateSyncInterval.current) {
      clearInterval(stateSyncInterval.current);
      stateSyncInterval.current = null;
    }
    
    // Reset timer after showing final duration
    setTimeout(() => {
      setCallStartTime(null);
      setCallTimer(0);
    }, 1000);
    
    // Notify parent ONCE
    if (onCallCompleted && completedCallSid) {
      onCallCompleted({
        callSid: completedCallSid,
        status: 'completed',
        customerId,
        saleId,
        phoneNumber,
        customerName
      });
    }
    
    // Clear callSid and conferenceName after a delay to prevent re-triggering
    setTimeout(() => {
      setCurrentCallSid(null);
      setConferenceName(null);
    }, 100);
  };

  const getStatusText = () => {
    const callStatus = currentCallStatus?.status;
    if (callStatus === 'ringing') {
      return 'Ringing';
    } else if (callStatus === 'in-progress') {
      return 'In Progress';
    } else if (callStatus === 'completed') {
      return 'Completed';
    } else if (callStatus === 'failed') {
      return 'Failed';
    } else if (callStatus === 'busy') {
      return 'Busy';
    } else if (callStatus === 'no-answer') {
      return 'No Answer';
    } else if (isCalling) {
      return 'Calling';
    }
    return null;
  };

  // Determine if call is in ringing state (including web interface connecting)
  // Show "Ringing" when: call status is ringing OR web interface is shown but not connected yet
  const isRinging = currentCallStatus?.status === 'ringing' || 
                    (showWebInterface && !isWebCallConnected && !error && !isCallCompleted());
  
  // Determine if call is active (in-progress or web call connected)
  const isCallActiveState = (currentCallStatus?.status === 'in-progress' || isWebCallConnected) && !isCallCompleted();
  
  // Determine if customer has picked up (call is in-progress, not just ringing)
  const isCallInProgress = currentCallStatus?.status === 'in-progress' && !isCallCompleted();

  return (
    <div className="inline-flex flex-col gap-3">
      {/* Call Status Display */}
      <div className="inline-flex items-center gap-2">
        {/* Status indicator - only show for completed/failed/busy/no-answer states */}
        {(() => {
          const callStatus = currentCallStatus?.status;
          const shouldShowStatus = callStatus === 'completed' || 
                                  callStatus === 'failed' || 
                                  callStatus === 'busy' || 
                                  callStatus === 'no-answer';
          
          return shouldShowStatus && getStatusText() ? (
            <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold shadow-sm ${
              callStatus === 'completed' ? 'bg-gray-100 text-gray-700 border border-gray-200' :
              callStatus === 'failed' ? 'bg-red-100 text-red-700 border border-red-200' :
              callStatus === 'busy' ? 'bg-yellow-100 text-yellow-700 border border-yellow-200' :
              callStatus === 'no-answer' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
              'bg-gray-100 text-gray-700 border border-gray-200'
            }`}>
              {getStatusText()}
            </div>
          ) : null;
        })()}
        
        {/* Call button - shows "Call" when idle */}
        {!isCallActiveState && !isRinging && (
          <button
            onClick={handleCall}
            disabled={isCalling}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg ${
              isCalling 
                ? 'bg-blue-400 text-white cursor-not-allowed' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
            title={`Call ${customerName || phoneNumber}`}
          >
            <PhoneIcon isCalling={isCalling} />
            {getButtonText()}
          </button>
        )}
        
        {/* Call status display - shows timer when call is active or ringing */}
        {(isRinging || isCallActiveState) && (
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold ${
            isRinging ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-green-50 text-green-700 border border-green-200'
          }`}>
            {isRinging && <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>}
            {isCallActiveState && <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>}
            <PhoneIcon isCalling={isRinging || isCallActiveState} />
            {getButtonText()}
          </div>
        )}
      </div>

      {/* Call Control Buttons - shows when call is in-progress (customer picked up) */}
      {isCallInProgress && (
        <div className="inline-flex items-center gap-2 flex-wrap">
          {/* Mute/Unmute button */}
          <button
            onClick={() => {
              if (!webCallInterfaceRef.current) {
                console.warn('⚠️ WebCallInterface ref not available');
                return;
              }
              
              if (typeof webCallInterfaceRef.current.toggleMute !== 'function') {
                console.error('❌ toggleMute method not available');
                return;
              }
              
              try {
                webCallInterfaceRef.current.toggleMute();
                // Update local state after a brief delay to allow WebCallInterface to update
                setTimeout(() => {
                  if (webCallInterfaceRef.current?.getMutedState) {
                    setIsMuted(webCallInterfaceRef.current.getMutedState());
                  }
                }, 100);
              } catch (err) {
                console.error('❌ Error toggling mute:', err);
                setError('Failed to toggle mute. Please try again.');
              }
            }}
            disabled={!isWebCallConnected || !webCallInterfaceRef.current}
            className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg ${
              isMuted 
                ? 'bg-red-500 hover:bg-red-600 text-white' 
                : 'bg-gray-600 hover:bg-gray-700 text-white'
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

          {/* Transfer button */}
          <button
            onClick={async () => {
              setShowTransferModal(true);
              // Fetch available agents when opening modal
              await fetchAvailableAgents();
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg bg-purple-500 hover:bg-purple-600 text-white"
            title="Transfer Call"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <span className="text-sm">Transfer</span>
          </button>

          {/* End Call button */}
          <button
            onClick={handleEndCall}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg bg-red-500 hover:bg-red-600 text-white"
            title="End Call"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm">End Call</span>
          </button>
        </div>
      )}

      {/* End Call button - shows when ringing (before customer picks up) */}
      {isRinging && !isCallInProgress && (
        <button
          onClick={handleEndCall}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg bg-red-500 hover:bg-red-600 text-white"
          title="End Call"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-sm">End Call</span>
        </button>
      )}

      {error && (
        <div className="text-xs text-red-600 mt-2">
          {error}
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">Transfer Call</h3>
            
            {/* Transfer Type Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transfer Type
              </label>
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

            {/* Destination Type Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transfer To
              </label>
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

            {/* Agent Selection */}
            {transferDestinationType === 'agent' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Agent
                </label>
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

            {/* Phone Number Input */}
            {transferDestinationType === 'phone' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Phone Number to Transfer To
                </label>
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
                    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
                    const headers = {
                      'Content-Type': 'application/json',
                    };
                    
                    if (token) {
                      headers['Authorization'] = `Bearer ${token}`;
                    }

                    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
                    const requestBody = {
                      callSid: currentCallSid,
                      transferType: transferType
                    };

                    if (transferDestinationType === 'agent') {
                      requestBody.agentId = selectedAgentId;
                    } else {
                      requestBody.transferTo = transferPhoneNumber.trim();
                    }

                    // Use apiClient for better error handling
                    const response = await apiClient.post('/api/calls/transfer', requestBody);
                    
                    if (response && response.ok) {
                      const result = await response.json();
                      
                      if (result.success) {
                        console.log('✅ Call transferred successfully:', result.data);
                        setShowTransferModal(false);
                        setTransferPhoneNumber('');
                        setSelectedAgentId(null);
                        setTransferType('blind');
                        setTransferDestinationType('phone');
                        
                        // For blind transfer, optionally end the current call
                        if (transferType === 'blind') {
                          // The call is redirected, agent can hang up
                        }
                      } else {
                        setError(result.message || result.error || 'Failed to transfer call');
                      }
                    } else {
                      const errorText = response ? await response.text().catch(() => 'Unknown error') : 'No response';
                      setError(`Transfer failed: ${errorText}`);
                    }
                  } catch (err) {
                    console.error('❌ Error transferring call:', err);
                    
                    // Handle network errors gracefully
                    if (err.name === 'TypeError' && err.message === 'Failed to fetch') {
                      setError('Network error. Please check your connection and try again.');
                    } else {
                      setError(err.message || 'Failed to transfer call');
                    }
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
              <div className="mt-2 text-xs text-red-600">
                {error}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Web Call Interface - hidden, works in background */}
      {showWebInterface && conferenceName && (
        <div className="hidden">
          <WebCallInterface
            ref={webCallInterfaceRef}
            conferenceName={conferenceName}
            onCallConnected={() => {
              console.log('✅ Web call connected');
              setIsWebCallConnected(true);
              
              // Timer should already be running from when call status became "in-progress"
              // Only start timer if it's not already running (fallback)
              if (!callStartTime && !timerInterval.current) {
                console.log('📞 Starting timer from web call connection (fallback)');
                const now = Date.now();
                setCallStartTime(now);
                setCallTimer(0);
                timerInterval.current = setInterval(() => {
                  setCallTimer(prev => prev + 1);
                }, 1000);
              }
              
              console.log('✅ Timer started immediately');
              
              // Set up interval to sync mute state
              if (stateSyncInterval.current) {
                clearInterval(stateSyncInterval.current);
              }
              stateSyncInterval.current = setInterval(() => {
                if (webCallInterfaceRef.current) {
                  setIsMuted(webCallInterfaceRef.current.getMutedState?.() || false);
                }
              }, 200);
            }}
            onCallDisconnected={() => {
              console.log('📞 Web call disconnected');
              setIsWebCallConnected(false);
              handleEndCall();
            }}
          />
        </div>
      )}
    </div>
  );
};

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

