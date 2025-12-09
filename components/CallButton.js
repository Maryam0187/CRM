import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
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
  const { getCallStatus } = useSocket();
  
  // Core call state
  const [isCalling, setIsCalling] = useState(false);
  const [currentCallSid, setCurrentCallSid] = useState(null);
  const [showWebInterface, setShowWebInterface] = useState(false);
  const [isWebCallConnected, setIsWebCallConnected] = useState(false);
  const [error, setError] = useState(null);
  
  // Timer state
  const [callTimer, setCallTimer] = useState(0);
  const [finalDuration, setFinalDuration] = useState(null); // Store final duration when call ends
  
  // Transfer modal state
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferPhoneNumber, setTransferPhoneNumber] = useState('');
  const [transferType, setTransferType] = useState('blind');
  const [transferDestinationType, setTransferDestinationType] = useState('phone');
  const [selectedAgentId, setSelectedAgentId] = useState(null);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);
  
  // Mute state
  const [isMuted, setIsMuted] = useState(false);
  
  // Refs
  const ringingInterval = useRef(null);
  const timerInterval = useRef(null);
  const muteSyncInterval = useRef(null);
  const hasNotifiedCompletion = useRef(false);
  const webCallInterfaceRef = useRef(null);
  const previousCallSid = useRef(null);
  
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

  // Clean up all intervals on unmount
  useEffect(() => {
    return () => {
      if (ringingInterval.current) clearInterval(ringingInterval.current);
      if (timerInterval.current) clearInterval(timerInterval.current);
      if (muteSyncInterval.current) clearInterval(muteSyncInterval.current);
    };
  }, []);

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

  // Handle timer - start when in-progress, stop when ended
  useEffect(() => {
    // Stop timer immediately for any end state
    if (isEnded) {
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
      setCallTimer(0);
      return;
    }
    
    // Start timer when call becomes in-progress
    if (isInProgress) {
      if (!timerInterval.current) {
        setCallTimer(0);
        timerInterval.current = setInterval(() => {
          setCallTimer(prev => prev + 1);
        }, 1000);
      }
    } else {
      // Not in progress - stop timer
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
        setCallTimer(0);
      }
    }
  }, [isInProgress, isEnded]);

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
      
      // Stop all intervals immediately
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
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
      
      // Notify parent
      if (onCallCompleted && currentCallSid) {
        onCallCompleted({
          callSid: currentCallSid,
          status: callStatus,
          duration: durationFromStatus || callTimer,
          customerId,
          saleId,
          phoneNumber,
          customerName
        });
      }
      
      // Reset state after showing status (2 seconds)
      setTimeout(() => {
        setIsCalling(false);
        setIsWebCallConnected(false);
        setShowWebInterface(false);
        setTimeout(() => {
          setCurrentCallSid(null);
          setCallTimer(0);
          setFinalDuration(null);
        }, 100);
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
      setFinalDuration(null);
      setCallTimer(0);
    }
  }, [currentCallSid]);

  // Initiate call
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
        setCurrentCallSid(result.data.callSid);
        // Agent joins call via Voice SDK (conference)
        setShowWebInterface(true);
        
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

  // End call - called when agent clicks "End Call" button
  const handleEndCall = async () => {
    if (hasNotifiedCompletion.current) return;
    
    hasNotifiedCompletion.current = true;
    const completedCallSid = currentCallSid;
    
    // Preserve current timer value if call was in progress
    if (isInProgress && callTimer > 0) {
      setFinalDuration(callTimer);
    }
    
    // Stop all intervals immediately
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
    }
    if (ringingInterval.current) {
      clearInterval(ringingInterval.current);
      ringingInterval.current = null;
    }
    if (muteSyncInterval.current) {
      clearInterval(muteSyncInterval.current);
      muteSyncInterval.current = null;
    }
    
    // Don't reset timer yet - preserve it for display
    // setCallTimer(0);
    
    try {
      // Disconnect web call first (immediate) - always try to hang up, even during ringing
      if (webCallInterfaceRef.current?.hangUp) {
        try {
          // Always try to hang up - works for ringing, in-progress, or any state
          webCallInterfaceRef.current.hangUp();
        } catch (err) {
          // Ignore errors - call might be in any state (ringing, connecting, etc.)
          console.warn('Web call hangup error (ignored):', err.message);
        }
      }
      
      // Hang up via API (with timeout)
      if (completedCallSid) {
        try {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('TIMEOUT')), 5000)
          );
          const apiCallPromise = apiClient.post('/api/calls/hangup', {
            callSid: completedCallSid
          });
          await Promise.race([apiCallPromise, timeoutPromise]);
        } catch (err) {
          // Ignore errors - call will be terminated by Twilio
          console.warn('Hangup API error (ignored):', err.message);
        }
      }
    } catch (err) {
      console.error('Error in handleEndCall:', err);
    }
    
    // Reset state immediately
    setIsCalling(false);
    setIsWebCallConnected(false);
    setShowWebInterface(false);
    setError(null);
    setIsMuted(false);
    
    // Notify parent
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
    
    setTimeout(() => {
      setCurrentCallSid(null);
    }, 100);
  };

  // Fetch agents for transfer
  const fetchAvailableAgents = async () => {
    setLoadingAgents(true);
    try {
      const response = await apiClient.get('/api/calls/agents');
      if (response?.ok) {
        const result = await response.json();
        if (result.success) {
          setAvailableAgents(result.data || []);
        }
      }
    } catch (err) {
      console.warn('Error fetching agents:', err);
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
        
        {/* Call Button - shows when idle */}
        {!isRinging && !isInProgress && !isEnded && !isCalling && (
          <button
            onClick={handleCall}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg bg-blue-600 hover:bg-blue-700 text-white"
            title={`Call ${customerName || phoneNumber}`}
          >
            <PhoneIcon isCalling={false} />
            {getDisplayText()}
          </button>
        )}
        
        {/* Calling State */}
        {isCalling && !isRinging && !isInProgress && !isEnded && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-orange-50 text-orange-700 border border-orange-200">
            <span className="inline-block w-2 h-2 bg-orange-500 rounded-full mr-2 animate-pulse"></span>
            <PhoneIcon isCalling={true} />
            {getDisplayText()}
          </div>
        )}
        
        {/* Ringing State */}
        {isRinging && !isEnded && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <span className="inline-block w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
            <PhoneIcon isCalling={true} />
            {getDisplayText()}
          </div>
        )}
        
        {/* In-Progress State - shows timer */}
        {isInProgress && !isEnded && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-green-50 text-green-700 border border-green-200">
            <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
            <PhoneIcon isCalling={true} />
            {getDisplayText()}
          </div>
        )}
        
        {/* Ended State - shows duration if call was in-progress */}
        {isEnded && (finalDuration || callTimer > 0) && callStatus === 'completed' && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold bg-gray-50 text-gray-700 border border-gray-200">
            <PhoneIcon isCalling={false} />
            {getDisplayText()}
          </div>
        )}
      </div>

      {/* Call Controls - only when in-progress */}
      {isInProgress && (
        <div className="inline-flex items-center gap-2 flex-wrap relative z-10">
          {/* Mute Button */}
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (webCallInterfaceRef.current?.toggleMute) {
                const success = await webCallInterfaceRef.current.toggleMute();
                if (success !== false && webCallInterfaceRef.current?.getMutedState) {
                  // Update state immediately
                  setIsMuted(webCallInterfaceRef.current.getMutedState());
                }
              }
            }}
            disabled={!isWebCallConnected || !webCallInterfaceRef.current}
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
              handleEndCall();
            }}
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

      {/* End Call Button - when ringing */}
      {isRinging && (
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

                    const response = await apiClient.post('/api/calls/transfer', requestBody);
                    
                    if (response?.ok) {
                      const result = await response.json();
                      if (result.success) {
                        setShowTransferModal(false);
                        setTransferPhoneNumber('');
                        setSelectedAgentId(null);
                        setTransferType('blind');
                        setTransferDestinationType('phone');
                      } else {
                        setError(result.message || result.error || 'Failed to transfer call');
                      }
                    } else {
                      setError('Transfer failed');
                    }
                  } catch (err) {
                    console.error('Error transferring call:', err);
                    setError(err.message || 'Failed to transfer call');
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

      {/* Web Call Interface - hidden, works in background */}
      {/* Agent joins call via Voice SDK using WebCallInterface */}
      {showWebInterface && (
        <div className="hidden">
          <WebCallInterface
            ref={webCallInterfaceRef}
            conferenceName={null}
            onCallConnected={() => {
              setIsWebCallConnected(true);
              // Sync mute state periodically
              if (muteSyncInterval.current) clearInterval(muteSyncInterval.current);
              muteSyncInterval.current = setInterval(() => {
                if (webCallInterfaceRef.current?.getMutedState) {
                  setIsMuted(webCallInterfaceRef.current.getMutedState());
                }
              }, 500);
            }}
            onCallDisconnected={() => {
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
