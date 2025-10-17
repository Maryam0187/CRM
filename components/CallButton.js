import React, { useState } from 'react';
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
  const [error, setError] = useState(null);

  const handleCall = async () => {
    if (!phoneNumber || !user?.id) {
      setError('Phone number or user information missing');
      return;
    }

    setIsCalling(true);
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
        if (onCallInitiated) {
          onCallInitiated(result.data);
        }
        
        // Show success message
        console.log('Call initiated:', result.data);
      } else {
        setError(result.message || 'Failed to initiate call');
      }
    } catch (err) {
      console.error('Error initiating call:', err);
      setError('Network error. Please try again.');
    } finally {
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
    
    const colorClasses = isCalling 
      ? 'bg-orange-500 hover:bg-orange-600 text-white' 
      : 'bg-green-500 hover:bg-green-600 text-white';
    
    return `${baseClasses} ${sizeClasses[size]} ${colorClasses} ${className}`;
  };

  return (
    <div className="inline-block">
      <button
        onClick={handleCall}
        disabled={isCalling}
        className={getButtonClasses()}
        title={`Call ${customerName || phoneNumber}`}
      >
        <PhoneIcon isCalling={isCalling} />
        {isCalling ? 'Calling...' : 'Call'}
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

