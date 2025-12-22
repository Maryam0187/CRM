'use client';

import { createContext, useContext, useState, useCallback } from 'react';

const InboundCallContext = createContext(undefined);

export function InboundCallProvider({ children }) {
  const [activeCall, setActiveCall] = useState(null);
  const [minimizedCalls, setMinimizedCalls] = useState([]);
  
  const showInboundCall = useCallback((notification) => {
    // Check if this call is already being shown
    if (activeCall?.callSid === notification?.callSid) {
      return;
    }
    
    // Check if it's minimized
    const isMinimized = minimizedCalls.some(call => call.callSid === notification?.callSid);
    if (isMinimized) {
      // Restore from minimized
      setMinimizedCalls(prev => prev.filter(call => call.callSid !== notification?.callSid));
    }
    
    setActiveCall(notification);
  }, [activeCall, minimizedCalls]);
  
  const closeInboundCall = useCallback(() => {
    setActiveCall(null);
  }, []);
  
  const minimizeInboundCall = useCallback((notification) => {
    if (notification) {
      setMinimizedCalls(prev => {
        // Don't add duplicates
        if (prev.some(call => call.callSid === notification.callSid)) {
          return prev;
        }
        return [...prev, notification];
      });
    }
    setActiveCall(null);
  }, []);
  
  const restoreMinimizedCall = useCallback((notification) => {
    setMinimizedCalls(prev => prev.filter(call => call.callSid !== notification?.callSid));
    setActiveCall(notification);
  }, []);
  
  const removeMinimizedCall = useCallback((notification) => {
    setMinimizedCalls(prev => prev.filter(call => call.callSid !== notification?.callSid));
  }, []);
  
  return (
    <InboundCallContext.Provider value={{
      activeCall,
      minimizedCalls,
      showInboundCall,
      closeInboundCall,
      minimizeInboundCall,
      restoreMinimizedCall,
      removeMinimizedCall
    }}>
      {children}
    </InboundCallContext.Provider>
  );
}

export function useInboundCall() {
  const context = useContext(InboundCallContext);
  if (context === undefined) {
    throw new Error('useInboundCall must be used within an InboundCallProvider');
  }
  return context;
}

