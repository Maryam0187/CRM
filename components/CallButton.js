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
  const { isConnected } = useSocket();
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
  const [isTransferring, setIsTransferring] = useState(false);
  const ringingInterval = useRef(null);
  const timerInterval = useRef(null);
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
    };
  }, []);

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
        
        // Use fetch directly with proper error handling
        try {
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            const headers = {
              'Content-Type': 'application/json',
            };
            
            if (token) {
              headers['Authorization'] = `Bearer ${token}`;
            }
            
            // Use absolute URL to avoid fetch issues
            const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
            const hangupUrl = `${baseUrl}/api/calls/hangup`;
            
            console.log('📞 Calling hangup API:', hangupUrl, { callSid: completedCallSid });
            
            const response = await fetch(hangupUrl, {
              method: 'POST',
              headers: headers,
              body: JSON.stringify({ callSid: completedCallSid }),
              // Add timeout to prevent hanging
              signal: AbortSignal.timeout(5000) // 5 second timeout
            });
            
            if (response.ok) {
              const result = await response.json();
              if (result.success) {
                console.log('✅ Customer call hung up successfully');
              } else {
                console.error('❌ Failed to hang up customer call:', result.message || result.error);
              }
            } else {
              const errorText = await response.text().catch(() => 'Unknown error');
              console.error('❌ Hangup API returned error:', response.status, errorText);
            }
          } catch (err) {
            // Handle AbortError (timeout) and other errors gracefully
            if (err.name === 'AbortError') {
              console.warn('⚠️ Hangup API call timed out (call may still be terminated)');
            } else {
              console.error('❌ Error calling hangup API:', err);
              console.error('❌ Error details:', {
                message: err.message,
                name: err.name,
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
    
    // Clear intervals
    if (ringingInterval.current) {
      clearInterval(ringingInterval.current);
      ringingInterval.current = null;
    }
    if (timerInterval.current) {
      clearInterval(timerInterval.current);
      timerInterval.current = null;
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

  return (
    <div className="inline-flex flex-col gap-2">
      <div className="inline-flex items-center gap-2">
        {/* Status indicator */}
        {getStatusText() && (
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            isRinging ? 'bg-blue-100 text-blue-800' :
            isCallActiveState ? 'bg-green-100 text-green-800' :
            currentCallStatus?.status === 'completed' ? 'bg-gray-100 text-gray-800' :
            currentCallStatus?.status === 'failed' ? 'bg-red-100 text-red-800' :
            currentCallStatus?.status === 'busy' ? 'bg-yellow-100 text-yellow-800' :
            currentCallStatus?.status === 'no-answer' ? 'bg-orange-100 text-orange-800' :
            isCalling ? 'bg-orange-100 text-orange-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {getStatusText()}
          </div>
        )}
        
        {/* Call button - shows "Ringing" when connecting, or "Call" when idle */}
        {!isCallActiveState && !isRinging && (
          <button
            onClick={handleCall}
            disabled={isCalling}
            className={getButtonClasses()}
            title={`Call ${customerName || phoneNumber}`}
          >
            <PhoneIcon isCalling={isCalling} />
            {getButtonText()}
          </button>
        )}
        
        {/* Call status button - shows "Ringing..." or timer when call is active */}
        {(isRinging || isCallActiveState) && (
          <button
            disabled
            className={getButtonClasses()}
            title="Call Status"
          >
            <PhoneIcon isCalling={isRinging || isCallActiveState} />
            {getButtonText()}
          </button>
        )}
        
        {/* Call Control Buttons - shows when call is in-progress */}
        {isCallActiveState && (
          <>
            {/* Mute/Unmute button */}
            <button
              onClick={() => {
                if (webCallInterfaceRef.current && typeof webCallInterfaceRef.current.toggleMute === 'function') {
                  webCallInterfaceRef.current.toggleMute();
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md font-medium transition-colors duration-200 bg-gray-500 hover:bg-gray-600 text-white"
              title={webCallInterfaceRef.current?.isMuted?.() ? "Unmute" : "Mute"}
            >
              {webCallInterfaceRef.current?.isMuted?.() ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
              {webCallInterfaceRef.current?.isMuted?.() ? "Unmute" : "Mute"}
            </button>

            {/* Hold/Resume button */}
            <button
              onClick={() => {
                if (webCallInterfaceRef.current && typeof webCallInterfaceRef.current.toggleHold === 'function') {
                  webCallInterfaceRef.current.toggleHold();
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md font-medium transition-colors duration-200 bg-yellow-500 hover:bg-yellow-600 text-white"
              title={webCallInterfaceRef.current?.isOnHold?.() ? "Resume" : "Hold"}
            >
              {webCallInterfaceRef.current?.isOnHold?.() ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {webCallInterfaceRef.current?.isOnHold?.() ? "Resume" : "Hold"}
            </button>
          </>
        )}

        {/* End Call button - shows when call is ringing or in-progress */}
        {(isRinging || isCallActiveState) && (
          <button
            onClick={handleEndCall}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md font-medium transition-colors duration-200 bg-red-500 hover:bg-red-600 text-white"
            title="End Call"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            End Call
          </button>
        )}
      </div>
      
      {error && (
        <div className="text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Transfer Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Transfer Call</h3>
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
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowTransferModal(false);
                  setTransferPhoneNumber('');
                  setIsTransferring(false);
                }}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 transition-colors"
                disabled={isTransferring}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!transferPhoneNumber.trim()) {
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
                    const response = await fetch(`${baseUrl}/api/calls/transfer`, {
                      method: 'POST',
                      headers: headers,
                      body: JSON.stringify({
                        callSid: currentCallSid,
                        transferTo: transferPhoneNumber.trim()
                      })
                    });

                    const result = await response.json();

                    if (result.success) {
                      console.log('✅ Call transferred successfully');
                      setShowTransferModal(false);
                      setTransferPhoneNumber('');
                      // Optionally end the current call after transfer
                      // handleEndCall();
                    } else {
                      setError(result.message || result.error || 'Failed to transfer call');
                    }
                  } catch (err) {
                    console.error('❌ Error transferring call:', err);
                    setError(err.message || 'Failed to transfer call');
                  } finally {
                    setIsTransferring(false);
                  }
                }}
                className="px-4 py-2 bg-purple-500 text-white rounded-md hover:bg-purple-600 transition-colors"
                disabled={isTransferring || !transferPhoneNumber.trim()}
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

