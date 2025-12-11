import React, { forwardRef, useImperativeHandle } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCall } from '../contexts/CallContext';

const CallButton = forwardRef(function CallButton({ 
  customerId, 
  saleId, 
  phoneNumber, 
  customerName, 
  callPurpose = 'follow_up',
  onCallInitiated,
  onCallCompleted,
  className = '',
  size = 'default',
  disabled = false
}, ref) {
  const { user } = useAuth();
  
  // Use global call context
  const {
    isCalling,
    currentCallSid,
    isWebCallConnected,
    initiateCall,
    error: callError
  } = useCall();
  
  // Check if there's an active call (any call, not just this one)
  const hasActiveCall = currentCallSid || isCalling || isWebCallConnected;
  
  // Determine if this button should be disabled
  const isButtonDisabled = disabled || hasActiveCall || !phoneNumber || !user?.id;

  // Handle call initiation
  const handleCall = async () => {
    if (isButtonDisabled) return;

    await initiateCall({
      customerId,
      saleId,
      phoneNumber,
      customerName,
      agentId: user.id,
      callPurpose,
      onCallInitiated: (data) => {
        if (onCallInitiated) {
          onCallInitiated(data);
        }
      },
      onError: (error) => {
        console.error('Call initiation error:', error);
      }
    });
  };

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    hasActiveCall: () => hasActiveCall,
    hangUp: () => {
      // Hangup is handled by GlobalWebCallInterface
      console.log('Hangup should be done via GlobalWebCallInterface');
    },
    getCallState: () => ({
      isCalling,
      currentCallSid,
      isWebCallConnected,
      hasActiveCall
    })
  }), [hasActiveCall, isCalling, currentCallSid, isWebCallConnected]);

  // Button size classes
  const sizeClasses = {
    small: 'px-3 py-1.5 text-sm',
    default: 'px-4 py-2 text-base',
    large: 'px-6 py-3 text-lg'
  };

  return (
    <>
      <button
        onClick={handleCall}
        disabled={isButtonDisabled}
        className={`
          ${sizeClasses[size] || sizeClasses.default}
          font-medium rounded-lg transition-colors duration-200
          ${isButtonDisabled 
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
            : 'bg-green-600 hover:bg-green-700 text-white'
          }
          ${className}
        `}
      >
        {isCalling ? 'Calling...' : 'Call'}
      </button>
      
      {callError && (
        <div className="mt-2 text-sm text-red-600">
          {callError}
        </div>
      )}
    </>
  );
});

CallButton.displayName = 'CallButton';

export default CallButton;
