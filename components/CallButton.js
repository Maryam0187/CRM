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

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, []);

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

  // Poll for call status updates
  useEffect(() => {
    if (!currentCallSid) return;

    const pollCallStatus = async () => {
      try {
        const response = await fetch(`/api/calls/status/${currentCallSid}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.callLog) {
            setCallStatus(data.callLog.status);
            
            // If call is completed, stop polling
            if (['completed', 'failed', 'busy', 'no-answer', 'canceled'].includes(data.callLog.status)) {
              setIsCalling(false);
              setCallStatus(null);
              setCurrentCallSid(null);
              if (durationInterval.current) {
                clearInterval(durationInterval.current);
                durationInterval.current = null;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error polling call status:', error);
      }
    };

    const interval = setInterval(pollCallStatus, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
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
        
        if (onCallInitiated) {
          onCallInitiated(result.data);
        }
        
        console.log('Call initiated:', result.data);
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

