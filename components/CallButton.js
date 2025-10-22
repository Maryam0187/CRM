import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';

const CallButton = ({ 
  customerId, 
  saleId, 
  phoneNumber, 
  customerName, 
  callPurpose = 'follow_up',
  onCallInitiated,
  className = '',
  size = 'default'
}) => {
  const { user } = useAuth();
  const [isCalling, setIsCalling] = useState(false);
  const [callStatus, setCallStatus] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [currentCallSid, setCurrentCallSid] = useState(null);
  const [error, setError] = useState(null);
  const durationInterval = useRef(null);
  const ringingInterval = useRef(null);
  const eventSource = useRef(null);

  // Clean up intervals and SSE connection on unmount
  useEffect(() => {
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
      if (ringingInterval.current) {
        clearInterval(ringingInterval.current);
      }
      if (eventSource.current) {
        eventSource.current.close();
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
    console.log('📞 Call status changed to:', callStatus);
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
  }, [callStatus]);

  // Start duration timer when call is in progress
  useEffect(() => {
    if (callStatus === 'in-progress' && !durationInterval.current) {
      setCallDuration(0);
      durationInterval.current = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else if (callStatus !== 'in-progress' && durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  }, [callStatus]);

  // Set up SSE connection for real-time status updates
  useEffect(() => {
    if (!currentCallSid) return;

    console.log('📡 Setting up SSE connection for call:', currentCallSid);
    
    // Close any existing connection
    if (eventSource.current) {
      eventSource.current.close();
    }

    // Create new SSE connection
    eventSource.current = new EventSource(`/api/calls/status-stream/${currentCallSid}`);
    
    eventSource.current.onopen = () => {
      console.log('📡 SSE connection opened for call:', currentCallSid);
    };

    eventSource.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📡 SSE message received:', data);
        
        if (data.type === 'connected') {
          console.log('📡 SSE connected for call:', data.callSid);
        } else if (data.type === 'status_update') {
          console.log('📡 Status update received:', data.status);
          setCallStatus(data.status);
          
          // If call is completed, close connection
          if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(data.status)) {
            console.log('📡 Call ended, closing SSE connection');
            setIsCalling(false);
            setCallStatus(null);
            setCurrentCallSid(null);
            if (durationInterval.current) {
              clearInterval(durationInterval.current);
              durationInterval.current = null;
            }
            if (ringingInterval.current) {
              clearInterval(ringingInterval.current);
              ringingInterval.current = null;
            }
            eventSource.current.close();
          }
        } else if (data.type === 'error') {
          console.error('📡 SSE error:', data.message);
        }
      } catch (error) {
        console.error('📡 Error parsing SSE message:', error);
      }
    };

    eventSource.current.onerror = (error) => {
      console.error('📡 SSE connection error:', error);
      // Try to reconnect after 3 seconds
      setTimeout(() => {
        if (eventSource.current && eventSource.current.readyState === EventSource.CLOSED) {
          console.log('📡 Attempting to reconnect SSE...');
          eventSource.current = new EventSource(`/api/calls/status-stream/${currentCallSid}`);
        }
      }, 3000);
    };

    // Fallback mechanism: if status is still "queued" after 3 seconds, assume it's ringing
    const fallbackTimer = setTimeout(() => {
      if (callStatus === 'queued' || !callStatus) {
        console.log('📞 Fallback: Assuming call is ringing after 3 seconds');
        setCallStatus('ringing');
      }
    }, 3000);
    
    return () => {
      console.log('📡 Cleaning up SSE connection for call:', currentCallSid);
      if (eventSource.current) {
        eventSource.current.close();
      }
      clearTimeout(fallbackTimer);
    };
  }, [currentCallSid]);

  const handleCall = async () => {
    if (!phoneNumber || !user?.id) {
      setError('Phone number or user information missing');
      return;
    }

    setIsCalling(true);
    setCallStatus('queued');
    setCallDuration(0);
    setError(null);

    try {
      const response = await fetch('/api/calls/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId,
          saleId,
          agentId: user.id,
          phoneNumber,
          callPurpose,
          customMessage: `Hello ${customerName || 'there'}, this is a call from our CRM system.`
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Call initiated successfully
        setCurrentCallSid(result.data.callSid);
        console.log('📞 Call initiated successfully:', result.data);
        console.log('📞 Call SID:', result.data.callSid);
        console.log('📞 Initial status:', result.data.status);
        
        if (onCallInitiated) {
          onCallInitiated(result.data);
        }
      } else {
        setError(result.message || 'Failed to initiate call');
        setIsCalling(false);
        setCallStatus(null);
      }
    } catch (err) {
      console.error('Error initiating call:', err);
      setError('Network error. Please try again.');
      setIsCalling(false);
      setCallStatus(null);
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
    
    let colorClasses;
    if (callStatus === 'ringing') {
      colorClasses = 'bg-blue-500 hover:bg-blue-600 text-white animate-pulse';
    } else if (callStatus === 'in-progress') {
      colorClasses = 'bg-green-500 hover:bg-green-600 text-white';
    } else if (isCalling) {
      colorClasses = 'bg-orange-500 hover:bg-orange-600 text-white';
    } else {
      colorClasses = 'bg-green-500 hover:bg-green-600 text-white';
    }
    
    return `${baseClasses} ${sizeClasses[size]} ${colorClasses} ${className}`;
  };

  const getButtonText = () => {
    if (callStatus === 'ringing') {
      return 'Ringing...';
    } else if (callStatus === 'in-progress') {
      const minutes = Math.floor(callDuration / 60);
      const seconds = callDuration % 60;
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } else if (isCalling) {
      return 'Calling...';
    } else {
      return 'Call';
    }
  };

  return (
    <div className="inline-block">
      <button
        onClick={handleCall}
        disabled={isCalling || callStatus}
        className={getButtonClasses()}
        title={`Call ${customerName || phoneNumber}`}
      >
        <PhoneIcon isCalling={isCalling || callStatus} />
        {getButtonText()}
      </button>
      
      {error && (
        <div className="mt-1 text-xs text-red-600">
          {error}
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

