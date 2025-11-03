import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useCallStatus } from '../lib/useCallStatus';
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
  const { isConnected } = useSocket();
  const [isCalling, setIsCalling] = useState(false);
  const [currentCallSid, setCurrentCallSid] = useState(null);
  const [error, setError] = useState(null);
  const [callStartTime, setCallStartTime] = useState(null);
  const [callTimer, setCallTimer] = useState(0);
  const ringingInterval = useRef(null);
  const timerInterval = useRef(null);
  
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

  // Handle call timer for in-progress calls
  useEffect(() => {
    const callStatus = currentCallStatus?.status;
    
    if (callStatus === 'in-progress' && !callStartTime) {
      // Call just started, set start time
      setCallStartTime(Date.now());
      setCallTimer(0);
      
      // Start timer interval
      if (!timerInterval.current) {
        timerInterval.current = setInterval(() => {
          setCallTimer(prev => prev + 1);
        }, 1000);
      }
    } else if (callStatus !== 'in-progress' && timerInterval.current) {
      // Call ended, stop timer
      clearInterval(timerInterval.current);
      timerInterval.current = null;
      setCallStartTime(null);
      setCallTimer(0);
    }
  }, [currentCallStatus?.status, callStartTime]);

  // Handle call completion
  useEffect(() => {
    if (isCallCompleted() && currentCallSid) {
      console.log('📞 Call completed, cleaning up');
      setIsCalling(false);
      setCurrentCallSid(null);
      setCallStartTime(null);
      setCallTimer(0);
      if (ringingInterval.current) {
        clearInterval(ringingInterval.current);
        ringingInterval.current = null;
      }
      if (timerInterval.current) {
        clearInterval(timerInterval.current);
        timerInterval.current = null;
      }
    }
  }, [currentCallStatus, isCallCompleted, currentCallSid]);

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
        console.log('📞 Call initiated successfully:', result.data);
        console.log('📞 Call SID:', result.data.callSid);
        console.log('📞 Initial status:', result.data.status);
        console.log('📞 Customer ID:', customerId);
        console.log('📞 Sale ID:', saleId);
        console.log('📞 Agent ID:', user.id);
        
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
    
    let colorClasses;
    const callStatus = currentCallStatus?.status;
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

  // Format timer display
  const formatTimer = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getButtonText = () => {
    const callStatus = currentCallStatus?.status;
    if (callStatus === 'ringing') {
      return 'Ringing...';
    } else if (callStatus === 'in-progress') {
      return formatTimer(callTimer);
    } else if (isCalling) {
      return 'Calling...';
    } else {
      return 'Call';
    }
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

  return (
    <div className="inline-flex items-center gap-2">
      {/* Status indicator */}
      {getStatusText() && (
        <div className={`px-2 py-1 rounded text-xs font-medium ${
          currentCallStatus?.status === 'ringing' ? 'bg-blue-100 text-blue-800' :
          currentCallStatus?.status === 'in-progress' ? 'bg-green-100 text-green-800' :
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
      
      {/* Call button */}
      <button
        onClick={handleCall}
        disabled={isCalling || isCallActive()}
        className={getButtonClasses()}
        title={`Call ${customerName || phoneNumber}`}
      >
        <PhoneIcon isCalling={isCalling || isCallActive()} />
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

