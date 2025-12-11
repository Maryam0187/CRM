'use client';

import { useEffect, useRef } from 'react';
import { useCall } from '../contexts/CallContext';
import { useSocket } from '../contexts/SocketContext';
import WebCallInterface from './WebCallInterface';

export default function GlobalWebCallInterface() {
  const { 
    showWebInterface, 
    conferenceName, 
    currentCallSid,
    callStatus,
    callTimer,
    updateCallStatus,
    setWebCallInterfaceRef,
    callConnected,
    endCall,
    setIsMuted
  } = useCall();
  
  const { getCallStatus } = useSocket();
  const webCallInterfaceRef = useRef(null);
  const muteSyncIntervalRef = useRef(null);

  // Update call status from socket
  useEffect(() => {
    if (!currentCallSid) return;

    const updateStatus = () => {
      const statusData = getCallStatus(currentCallSid);
      if (statusData?.status) {
        updateCallStatus(statusData.status);
      }
    };

    // Update immediately
    updateStatus();

    // Listen for status updates
    const handleStatusUpdate = (event) => {
      const { callStatusData } = event.detail;
      if (callStatusData?.callSid === currentCallSid) {
        updateCallStatus(callStatusData.status);
      }
    };

    window.addEventListener('callStatusUpdate', handleStatusUpdate);
    
    // Poll for updates (fallback)
    const interval = setInterval(updateStatus, 1000);

    return () => {
      window.removeEventListener('callStatusUpdate', handleStatusUpdate);
      clearInterval(interval);
    };
  }, [currentCallSid, getCallStatus, updateCallStatus]);

  // Set ref in context and manage mute sync interval
  useEffect(() => {
    if (webCallInterfaceRef.current) {
      setWebCallInterfaceRef(webCallInterfaceRef.current);
    }
    
    return () => {
      // Cleanup mute sync interval
      if (muteSyncIntervalRef.current) {
        clearInterval(muteSyncIntervalRef.current);
        muteSyncIntervalRef.current = null;
      }
    };
  }, [setWebCallInterfaceRef]);

  if (!showWebInterface || !conferenceName) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 bg-white rounded-lg shadow-2xl border-2 border-blue-200 p-4 backdrop-blur-sm">
      <WebCallInterface
        ref={webCallInterfaceRef}
        conferenceName={conferenceName}
        onCallConnected={() => {
          callConnected();
          // Sync mute state periodically when connected (same as previous flow)
          if (muteSyncIntervalRef.current) {
            clearInterval(muteSyncIntervalRef.current);
          }
          muteSyncIntervalRef.current = setInterval(() => {
            if (webCallInterfaceRef.current?.getMutedState) {
              setIsMuted(webCallInterfaceRef.current.getMutedState());
            }
          }, 500);
        }}
        onCallDisconnected={() => {
          // Clear mute sync interval
          if (muteSyncIntervalRef.current) {
            clearInterval(muteSyncIntervalRef.current);
            muteSyncIntervalRef.current = null;
          }
          endCall();
        }}
      />
      
      {/* Timer Display */}
      {callStatus === 'in-progress' && callTimer > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 font-medium">Call Duration</span>
            <span className="text-lg font-bold text-green-600">
              {formatTimer(callTimer)}
            </span>
          </div>
        </div>
      )}
      
      {/* Status Badge */}
      {callStatus && (
        <div className="mt-2">
          <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold ${
            callStatus === 'in-progress' ? 'bg-green-100 text-green-700' :
            callStatus === 'ringing' ? 'bg-blue-100 text-blue-700' :
            callStatus === 'completed' ? 'bg-gray-100 text-gray-700' :
            'bg-red-100 text-red-700'
          }`}>
            {callStatus === 'in-progress' && (
              <>
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>In Progress</span>
              </>
            )}
            {callStatus === 'ringing' && (
              <>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                <span>Ringing</span>
              </>
            )}
            {callStatus === 'completed' && <span>Completed</span>}
            {!['in-progress', 'ringing', 'completed'].includes(callStatus) && (
              <span>{callStatus}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function
function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

