'use client';

import { useEffect, useRef, useState } from 'react';
import { useCall } from '../contexts/CallContext';
import { useSocket } from '../contexts/SocketContext';
import WebCallInterface from './WebCallInterface';
import apiClient from '../lib/apiClient';

export default function GlobalWebCallInterface() {
  const { 
    showWebInterface, 
    conferenceName, 
    currentCallSid,
    callStatus,
    callTimer,
    finalDuration,
    callMetadata,
    updateCallStatus,
    setWebCallInterfaceRef,
    callConnected,
    endCall,
    setIsMuted,
    isMuted
  } = useCall();
  
  const [isMinimized, setIsMinimized] = useState(false);
  
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

  // Handle hangup
  const handleHangup = async () => {
    try {
      // Step 1: Disconnect WebCallInterface (SDK connection)
      if (webCallInterfaceRef.current?.hangUp) {
        webCallInterfaceRef.current.hangUp();
      }

      // Step 2: Cancel outbound call via API
      if (currentCallSid) {
        try {
          await apiClient.post('/api/calls/hangup', {
            callSid: currentCallSid
          });
        } catch (err) {
          // Non-critical - call might already be ended
          console.warn('Hangup API error (non-critical):', err);
        }
      }

      // Step 3: End call in context (this will hide the interface)
      endCall();
    } catch (err) {
      console.error('Error hanging up call:', err);
      // Still end the call in context
      endCall();
    }
  };

  if (!showWebInterface || !conferenceName) {
    return null;
  }

  const durationToShow = finalDuration || callTimer;

  return (
    <div className={`fixed bottom-4 right-4 z-[9999] transition-all duration-300 ${
      isMinimized ? 'w-64' : 'w-80'
    }`}>
      <div className="bg-white rounded-lg shadow-2xl border-2 border-blue-200 backdrop-blur-sm overflow-hidden">
        {/* Header with minimize button */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0">
              {callStatus === 'in-progress' ? (
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              ) : callStatus === 'ringing' ? (
                <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
              ) : (
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">
                {callMetadata?.customerName || 'Active Call'}
              </div>
              {callMetadata?.phoneNumber && (
                <div className="text-xs text-blue-100 truncate">
                  {callMetadata.phoneNumber}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="ml-2 p-1 hover:bg-blue-700 rounded transition-colors"
            aria-label={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        </div>

        {!isMinimized && (
          <div className="p-4">
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
            
            {/* Call Information */}
            <div className="mt-3 space-y-2">
              {/* Timer Display */}
              {(callStatus === 'in-progress' || callStatus === 'ringing' || finalDuration) && durationToShow > 0 && (
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span className="text-xs text-gray-600 font-medium">Call Duration</span>
                  <span className={`text-lg font-bold ${
                    callStatus === 'in-progress' ? 'text-green-600' : 'text-gray-600'
                  }`}>
                    {formatTimer(durationToShow)}
                  </span>
                </div>
              )}
              
              {/* Status Badge */}
              {callStatus && (
                <div className="flex items-center justify-center">
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${
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

              {/* Mute Status */}
              {isMuted && callStatus === 'in-progress' && (
                <div className="flex items-center justify-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                  <span>Microphone Muted</span>
                </div>
              )}

              {/* Hangup Button */}
              {(callStatus === 'in-progress' || callStatus === 'ringing' || callStatus === 'connecting') && (
                <button
                  onClick={handleHangup}
                  className="w-full mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                  </svg>
                  End Call
                </button>
              )}
            </div>
          </div>
        )}

        {/* Minimized view - just show timer and status */}
        {isMinimized && (
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {callStatus === 'in-progress' && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              )}
              {callStatus === 'ringing' && (
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              )}
              <span className="text-sm font-medium text-gray-700">
                {callMetadata?.customerName || 'Call'}
              </span>
            </div>
            {durationToShow > 0 && (
              <span className="text-sm font-bold text-green-600">
                {formatTimer(durationToShow)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Helper function
function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

