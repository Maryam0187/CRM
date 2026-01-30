'use client';

import { useState, useEffect } from 'react';
import { useCall } from '../contexts/CallContext';
import IVRDialerModal from './IVRDialerModal';

// Global callbacks to open IVR dialer from anywhere
let openDialerCallbacks = new Set();

export function openIVRDialer() {
  openDialerCallbacks.forEach(callback => callback());
}

export default function IVRDialer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const { showWebInterface } = useCall();

  // Register this instance to receive open events
  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setIsMinimized(false);
    };
    
    openDialerCallbacks.add(handleOpen);
    
    return () => {
      openDialerCallbacks.delete(handleOpen);
    };
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const handleMinimize = (minimize) => {
    setIsMinimized(minimize);
  };

  const handleSendDigits = (digits, callId) => {
    // TODO: Implement send digits
    console.log('Send digits:', digits, callId);
  };

  const handleMakeCall = (phoneNumber) => {
    // TODO: Implement make call
    console.log('Make call:', phoneNumber);
  };

  return (
    <IVRDialerModal
      isOpen={isOpen}
      onClose={handleClose}
      onMinimize={handleMinimize}
      onAddNew={() => {
        // Handle add new modal if needed
      }}
      onSendDigits={handleSendDigits}
      onMakeCall={handleMakeCall}
      isConnected={false}
      callId="navbar-dialer"
      callLabel="IVR Dialer"
      isMinimized={isMinimized}
      canAddNew={true}
      mode="dial"
      isAutomatedCall={false}
      isGlobalCallInterfaceOpen={showWebInterface}
    />
  );
}

