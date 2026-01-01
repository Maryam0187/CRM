'use client';

import { useEffect, useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { useCall } from '../contexts/CallContext';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { Device } from '@twilio/voice-sdk';

// Add global unhandled rejection handler to prevent SDK errors from crashing app
if (typeof window !== 'undefined' && !window.__twilioRejectionHandlerAdded) {
  window.__twilioRejectionHandlerAdded = true;
  
  window.addEventListener('unhandledrejection', (e) => {
    // Filter out Twilio Insights errors - they're informational and harmless
    const reason = e.reason?.message || e.reason?.toString() || '';
    const reasonStr = String(reason).toLowerCase();
    
    const isTwilioInsightsError = 
      reasonStr.includes('insights') ||
      reasonStr.includes('eventgw') ||
      reasonStr.includes('eventpublisher') ||
      reasonStr.includes('failed to fetch') ||
      reasonStr.includes('typeerror') ||
      reasonStr.includes('dtls-transport-state') ||
      reasonStr.includes('quality-metrics') ||
      reasonStr.includes('disconnected-by-local') ||
      reasonStr.includes('metrics-sample');
    
    if (isTwilioInsightsError) {
      // Silently ignore Insights-related unhandled rejections
      // These are normal when network blocks Insights POSTs or CORS issues occur
      e.preventDefault();
      return;
    }
    
    // Log other unhandled rejections but don't let them crash the app
    console.warn('⚠️ Unhandled promise rejection (prevented crash):', e.reason);
    e.preventDefault();
  });
}

export default function GlobalWebCallInterface() {
  // Get all call-related state from context
  const { 
    // Core state
    isCalling,
    currentCallSid,
    conferenceName,
    showWebInterface,
    isWebCallConnected,
    error: callError,
    
    // Timer state
    callTimer,
    finalDuration,
    
    // Call metadata
    callMetadata,
    
    // Call status
    callStatus,
    
    // Mute state
    isMuted,
    
    // Actions
    updateCallStatus,
    setWebCallInterfaceRef,
    callConnected,
    endCall,
    setIsMuted,
    startTimer,
    stopTimer,
    resetTimer
  } = useCall();
  
  // Get user from auth context (needed for device setup)
  const { user } = useAuth();
  
  const { getCallStatus } = useSocket();
  const [isMinimized, setIsMinimized] = useState(false);
  
  // Twilio SDK state
  const [device, setDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [localIsMuted, setLocalIsMuted] = useState(false);
  const activeConnection = useRef(null);
  const localMediaStream = useRef(null);
  const isCleaningUp = useRef(false);
  const muteSyncIntervalRef = useRef(null);
  const webCallInterfaceRef = useRef(null);
  const ringingAudioContextRef = useRef(null); // For Web Audio API
  const ringingOscillatorsRef = useRef([]); // For storing oscillators
  const callStatusRef = useRef(callStatus); // Track current call status for interval checks

  // Fetch Twilio token
  const fetchToken = async () => {
    try {
      let response;
      try {
        response = await apiClient.get('/api/twilio/token');
      } catch (apiErr) {
        console.error('❌ Failed to fetch Twilio token (API error):', apiErr);
        setError(apiErr?.message || 'Network error. Please check your connection and try again.');
        return null;
      }

      if (!response) {
        console.error('❌ No response when fetching Twilio token');
        setError('No response from server. Please try again.');
        return null;
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonErr) {
        console.error('❌ Failed to parse token response:', jsonErr);
        setError('Invalid response from server. Please try again.');
        return null;
      }

      if (data?.success && data?.token) {
        return data.token;
      } else {
        const errorMsg = data?.error || 'Failed to fetch Twilio token';
        console.error('❌ Token fetch unsuccessful:', errorMsg);
        setError(errorMsg);
        return null;
      }
    } catch (err) {
      console.error('❌ Unexpected error fetching Twilio token:', err);
      setError(err?.message || 'An unexpected error occurred. Please try again.');
      return null;
    }
  };

  // Setup Twilio device
  useEffect(() => {
    if (!conferenceName || !user) {
      if (device && (!conferenceName || !user)) {
        console.log('🧹 Cleaning up device: conferenceName or user removed');
        try {
          if (activeConnection.current) {
            activeConnection.current.disconnect();
            activeConnection.current = null;
          }
          device.unregister();
          device.destroy();
          setDevice(null);
          setIsConnected(false);
          setIsConnecting(false);
        } catch (e) {
          console.error('Error cleaning up device:', e);
        }
      }
      return;
    }
    
    // If device already exists and conferenceName matches, don't recreate
    if (device && conferenceName) {
      console.log('📞 Device already exists, reusing for conference:', conferenceName);
      
      // Check if there's already an active connection
      if (activeConnection.current) {
        try {
          let connectionStatus = null;
          if (typeof activeConnection.current.status === 'function') {
            connectionStatus = activeConnection.current.status();
          } else {
            connectionStatus = activeConnection.current.status || activeConnection.current._status;
          }
          
          if (connectionStatus === 'open' || connectionStatus === 'connected' || connectionStatus === 'answered') {
            console.log('✅ Active connection found, restoring state');
            setIsConnected(true);
            setIsConnecting(false);
            return;
          }
        } catch (e) {
          console.warn('⚠️ Error checking connection status:', e);
        }
      }
      
      if (!isConnected && !activeConnection.current) {
        try {
          const deviceState = device.state || device._state;
          if (deviceState && deviceState !== 'registered') {
            device.register().catch(err => {
              console.warn('⚠️ Device re-registration warning:', err);
            });
          }
        } catch (e) {
          device.register().catch(err => {
            console.warn('⚠️ Device re-registration warning:', err);
          });
        }
      }
      return;
    }

    const setupDevice = async () => {
      try {
        console.log('📞 Starting device setup for conference:', conferenceName);
        setIsConnecting(true);
        setError(null);

        const token = await fetchToken();
        if (!token) {
          setIsConnecting(false);
          return;
        }

        // Suppress Twilio SDK console noise
        const originalWarn = console.warn;
        const originalError = console.error;
        
        const shouldFilterMessage = (message) => {
          const lowerMessage = String(message).toLowerCase();
          return lowerMessage.includes('cannot connect to insights') ||
                 lowerMessage.includes('unable to post') ||
                 lowerMessage.includes('failed to fetch') ||
                 lowerMessage.includes('received error:') ||
                 lowerMessage.includes('typeerror') ||
                 (lowerMessage.includes('[twiliovoice]') && lowerMessage.includes('[eventpublisher]'));
        };
        
        console.warn = (...args) => {
          const message = args.join(' ');
          if (!shouldFilterMessage(message)) {
            originalWarn.apply(console, args);
          }
        };
        
        console.error = (...args) => {
          const message = args.join(' ');
          if (!shouldFilterMessage(message)) {
            originalError.apply(console, args);
          }
        };

        const twilioDevice = new Device(token, {
          logLevel: 1,
          codecPreferences: ['opus', 'pcmu'],
          allowIncomingWhileBusy: false,
          enableRTCStats: false,
          closeProtection: false,
          disableInsights: true
        });

        twilioDevice.on('destroyed', () => {
          setTimeout(() => {
            if (device === twilioDevice) {
              console.warn = originalWarn;
              console.error = originalError;
            }
          }, 2000);
        });

        twilioDevice.on('registered', () => {
          console.log('✅ Twilio Device registered');
          setDevice(twilioDevice);
          setError(null);
          
          if (conferenceName) {
            if (activeConnection.current) {
              try {
                let connectionStatus = null;
                if (typeof activeConnection.current.status === 'function') {
                  connectionStatus = activeConnection.current.status();
                } else {
                  connectionStatus = activeConnection.current.status || activeConnection.current._status;
                }
                
                if (connectionStatus === 'open' || connectionStatus === 'connected' || connectionStatus === 'answered') {
                  console.log('✅ Already connected, skipping auto-join');
                  setIsConnected(true);
                  setIsConnecting(false);
                  return;
                }
              } catch (e) {
                console.warn('⚠️ Error checking connection status:', e);
              }
            }
            
            if (!isConnected && !activeConnection.current) {
              console.log('📞 Auto-joining conference immediately:', conferenceName);
              joinConference(twilioDevice);
            }
          }
        });

        twilioDevice.on('error', (error) => {
          console.error('❌ Twilio Device error:', error);
          setError(error.message || 'Device error occurred');
          setIsConnecting(false);
        });

        twilioDevice.on('incoming', (call) => {
          console.log('📞 Incoming call (auto-rejecting):', call);
          call.reject();
        });

        twilioDevice.on('tokenWillExpire', async () => {
          console.log('🔄 Token expiring, fetching new token...');
          const newToken = await fetchToken();
          if (newToken) {
            twilioDevice.updateToken(newToken);
          }
        });

        twilioDevice.register();
        setDevice(twilioDevice);

      } catch (err) {
        console.error('❌ Failed to set up Twilio Device:', err);
        setError(err.message);
        setIsConnecting(false);
      }
    };

    setupDevice();

    return () => {
      if (device && !isCleaningUp.current) {
        isCleaningUp.current = true;
        setTimeout(() => {
          try {
            if (activeConnection.current) {
              activeConnection.current.disconnect();
              activeConnection.current = null;
            }
            if (device && typeof device.unregister === 'function') {
              device.unregister();
            }
            if (device && typeof device.destroy === 'function') {
              device.destroy();
            }
          } catch (e) {
            console.warn('⚠️ Error during device cleanup (ignored):', e.message);
          }
          setDevice(null);
          setIsConnected(false);
          setIsConnecting(false);
          localMediaStream.current = null;
        }, 300);
      }
    };
  }, [conferenceName, user]);

  // Restore connection state on mount if connection already exists
  useEffect(() => {
    if (activeConnection.current && conferenceName) {
      try {
        let connectionStatus = null;
        if (typeof activeConnection.current.status === 'function') {
          connectionStatus = activeConnection.current.status();
        } else {
          connectionStatus = activeConnection.current.status || activeConnection.current._status;
        }
        
        if (connectionStatus === 'open' || connectionStatus === 'connected' || connectionStatus === 'answered') {
          console.log('✅ Restoring connection state on remount - already connected');
          setIsConnected(true);
          setIsConnecting(false);
        }
      } catch (e) {
        console.warn('⚠️ Error restoring connection state:', e);
      }
    }
  }, []);

  // Join conference
  const joinConference = async (deviceInstance = device) => {
    if (!deviceInstance || !conferenceName) {
      const errorMsg = `Device not ready or conference name missing. Device: ${!!deviceInstance}, Conference: ${conferenceName}`;
      console.error('❌', errorMsg);
      setError(errorMsg);
      return;
    }
    
    // Check if call has already ended - check both local state and socket status
    const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
    
    // First check local callStatus
    if (callStatus && endedStatuses.includes(callStatus)) {
      const errorMsg = `Cannot join call - call has already ended (status: ${callStatus})`;
      console.warn('⚠️', errorMsg);
      setError(errorMsg);
      setIsConnecting(false);
      // End the call context to clean up
      setTimeout(() => {
        endCall();
      }, 1000);
      return;
    }
    
    // Also check actual call status from socket/API if we have a callSid
    if (currentCallSid) {
      const actualStatusData = getCallStatus(currentCallSid);
      if (actualStatusData?.status && endedStatuses.includes(actualStatusData.status)) {
        const errorMsg = `Cannot join call - call has already ended (status: ${actualStatusData.status})`;
        console.warn('⚠️', errorMsg);
        setError(errorMsg);
        setIsConnecting(false);
        // Update local status to match actual status
        updateCallStatus(actualStatusData.status);
        // End the call context to clean up
        setTimeout(() => {
          endCall();
        }, 1000);
        return;
      }
    }
    
    if (isConnected || activeConnection.current) {
      try {
        if (activeConnection.current) {
          let connectionStatus = null;
          if (typeof activeConnection.current.status === 'function') {
            connectionStatus = activeConnection.current.status();
          } else {
            connectionStatus = activeConnection.current.status || activeConnection.current._status;
          }
          
          if (connectionStatus === 'open' || connectionStatus === 'connected' || connectionStatus === 'answered') {
            console.log('✅ Already connected to conference, skipping join');
            setIsConnected(true);
            setIsConnecting(false);
            return;
          }
        }
      } catch (e) {
        console.warn('⚠️ Error checking connection:', e);
      }
    }

    setIsConnecting(true);
    setError(null);

    try {
      const params = { To: conferenceName };
      console.log('📞 Connecting with params:', params);

      // Request audio permissions before connecting with proper echo cancellation
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            googEchoCancellation: true,
            googNoiseSuppression: true,
            googAutoGainControl: true,
            googHighpassFilter: true,
            googTypingNoiseDetection: true
          }, 
          video: false 
        });
        // Release the stream immediately - we just needed permission
        stream.getTracks().forEach(track => track.stop());
      } catch (audioErr) {
        console.warn('⚠️ Audio permission request failed (Twilio SDK will request):', audioErr);
      }

      // Resume AudioContext
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
          console.log('✅ AudioContext resumed');
        }
      } catch (audioCtxErr) {
        console.warn('⚠️ AudioContext resume failed:', audioCtxErr);
      }

      // Set speaker devices and ensure echo cancellation
      try {
        if (deviceInstance.audio) {
          if (typeof deviceInstance.audio.setSpeakerDevices === 'function') {
            await deviceInstance.audio.setSpeakerDevices('default');
            console.log('✅ Speaker devices set to default');
          }
          
          if (typeof deviceInstance.audio.setInputDevice === 'function') {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInput = devices.find(d => d.kind === 'audioinput');
            if (audioInput) {
              try {
                await deviceInstance.audio.setInputDevice(audioInput.deviceId);
                console.log('✅ Input device set for echo cancellation');
              } catch (inputErr) {
                console.warn('⚠️ Setting input device failed (non-critical):', inputErr);
              }
            }
          }
        }
      } catch (speakerErr) {
        console.warn('⚠️ Setting speaker devices failed:', speakerErr);
      }
      
      // Connect to conference
      const callPromise = deviceInstance.connect({ params });
      
      if (!callPromise) {
        throw new Error('Failed to create call');
      }

      const call = await callPromise;
      
      if (!call) {
        throw new Error('Failed to get call object from promise');
      }

      console.log('📞 Call object created:', call);
      activeConnection.current = call;

      // Attach event listeners
      if (call && typeof call === 'object') {
        const attachEvents = (callObj) => {
          const onAccept = () => {
            console.log('✅ Call accepted - connected to conference');
            if (!isConnected) {
              setIsConnected(true);
              setIsConnecting(false);
              
              try {
                setTimeout(() => {
                  const streams = getCallStreams();
                  if (streams.local) {
                    localMediaStream.current = streams.local;
                    console.log('📞 Local media stream captured for mute');
                  }
                }, 500);
              } catch (err) {
                console.error('❌ Error capturing streams:', err);
              }
              
              if (!isWebCallConnected) {
                callConnected();
              }
              
              // Check if this is an inbound call
              const isInboundCall = conferenceName && conferenceName.startsWith('inbound-');
              
              // Check if call has ended on the server (only for outbound calls)
              // For inbound calls, don't check status here as it might not be set yet
              if (!isInboundCall && currentCallSid) {
                const actualStatusData = getCallStatus(currentCallSid);
                const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
                if (actualStatusData?.status && endedStatuses.includes(actualStatusData.status)) {
                  console.warn('⚠️ Call has ended on server, disconnecting immediately');
                  updateCallStatus(actualStatusData.status);
                  disconnectCall('call_ended_on_server');
                  setTimeout(() => {
                    endCall();
                  }, 500);
                  return;
                }
              }
              
              // For inbound calls: customer is already in conference, so set to in-progress when agent joins
              // For outbound calls: wait for Twilio to report customer answered (status will come from callbacks)
              if (isInboundCall) {
                // Inbound: customer is already waiting, so when agent joins, call is in-progress
                console.log('📞 Inbound call - agent joined, setting status to in-progress');
                updateCallStatus('in-progress');
              } else {
                // Outbound: agent connected to conference, but customer may not have answered yet
                // Don't set to in-progress here - wait for Twilio status callback to report customer answered
                console.log('📞 Outbound call - agent connected, waiting for customer to answer (status will come from Twilio)');
                // Status will be updated via socket/callbacks when customer actually answers
              }
            } else {
              console.log('✅ Already connected, skipping onAccept callback');
            }
          };

          const onDisconnect = () => {
            try {
              console.log('📞 Call disconnected (client) - waiting for SDK to finish...');
              setIsConnected(false);
              setIsConnecting(false);
              activeConnection.current = null;
              localMediaStream.current = null;
              
              setTimeout(() => {
                try {
                  if (device && !isCleaningUp.current) {
                    isCleaningUp.current = true;
                    console.log('🧹 Safe to cleanup after disconnect event');
                    if (typeof device.unregister === 'function') {
                      device.unregister();
                    }
                    setTimeout(() => {
                      isCleaningUp.current = false;
                    }, 1000);
                  }
                } catch (e) {
                  console.warn('⚠️ Cleanup error after disconnect (ignored):', e.message);
                }
              }, 300);
              
              endCall();
            } catch (e) {
              console.warn('⚠️ Error in onDisconnect (ignored):', e.message);
            }
          };

          const onCancel = () => {
            console.log('📞 Call canceled');
            setIsConnecting(false);
            setIsConnected(false);
            activeConnection.current = null;
          };

          const onError = (error) => {
            console.error('❌ Call error:', error);
            setError(error.message || 'Call error occurred');
            setIsConnecting(false);
            setIsConnected(false);
          };

          const onReject = () => {
            console.log('📞 Call rejected');
            setIsConnecting(false);
            setIsConnected(false);
            activeConnection.current = null;
          };

          if (typeof callObj.addEventListener === 'function') {
            callObj.addEventListener('accept', onAccept);
            callObj.addEventListener('disconnect', onDisconnect);
            callObj.addEventListener('cancel', onCancel);
            callObj.addEventListener('error', onError);
            callObj.addEventListener('reject', onReject);
          } else if (typeof callObj.on === 'function') {
            callObj.on('accept', onAccept);
            callObj.on('disconnect', onDisconnect);
            callObj.on('cancel', onCancel);
            callObj.on('error', onError);
            callObj.on('reject', onReject);
          } else {
            setTimeout(() => {
              console.log('📞 Setting connected state (fallback)');
              setIsConnected(true);
              setIsConnecting(false);
              if (!isWebCallConnected) {
                callConnected();
              }
            }, 2000);
          }
        };

        attachEvents(call);
      }

    } catch (err) {
      console.error('❌ Error joining conference:', err);
      setError(err.message || 'Failed to join conference');
      setIsConnecting(false);
    }
  };

  // Get call streams
  const getCallStreams = () => {
    if (!activeConnection.current) {
      return { local: null, remote: null };
    }

    try {
      const call = activeConnection.current;
      let localStream = null;
      let remoteStream = null;

      const pc = call.getPeerConnection ? call.getPeerConnection() : 
                  (call._peerConnection || call._pc || null);

      if (pc) {
        const localTracks = [];
        pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === 'audio') {
            localTracks.push(sender.track);
          }
        });
        if (localTracks.length > 0) {
          localStream = new MediaStream(localTracks);
        }

        const remoteTracks = [];
        pc.getReceivers().forEach(receiver => {
          if (receiver.track && receiver.track.kind === 'audio') {
            remoteTracks.push(receiver.track);
          }
        });
        if (remoteTracks.length > 0) {
          remoteStream = new MediaStream(remoteTracks);
        }
      }

      if (!localStream && typeof call.getLocalStream === 'function') {
        localStream = call.getLocalStream();
      }
      if (!remoteStream && typeof call.getRemoteStream === 'function') {
        remoteStream = call.getRemoteStream();
      }

      return { local: localStream, remote: remoteStream };
    } catch (err) {
      console.error('❌ Error getting call streams:', err);
      return { local: null, remote: null };
    }
  };

  // Mute/Unmute functionality
  const mute = async () => {
    try {
      if (!activeConnection.current || !isConnected) {
        console.warn('⚠️ Cannot mute: call not connected');
        return false;
      }

      const call = activeConnection.current;

      if (typeof call.mute === 'function') {
        try {
          call.mute(true);
          setLocalIsMuted(true);
          setIsMuted(true);
          console.log('✅ Call muted using SDK mute() method');
          return true;
        } catch (err) {
          console.warn('⚠️ SDK mute() failed:', err);
        }
      }

      if (localMediaStream.current) {
        try {
          const tracks = localMediaStream.current.getAudioTracks();
          if (tracks.length > 0) {
            tracks.forEach(track => {
              track.enabled = false;
            });
            setLocalIsMuted(true);
            setIsMuted(true);
            console.log('✅ Call muted via local media stream');
            return true;
          }
        } catch (err) {
          console.warn('⚠️ Error using local media stream:', err);
        }
      }

      try {
        const { local } = getCallStreams();
        if (local && local.getAudioTracks().length > 0) {
          local.getAudioTracks().forEach(track => {
            track.enabled = false;
          });
          setLocalIsMuted(true);
          setIsMuted(true);
          console.log('✅ Call muted via getCallStreams');
          return true;
        }
      } catch (err) {
        console.warn('⚠️ Error using getCallStreams:', err);
      }

      console.error('❌ Cannot mute: no method available');
      return false;
    } catch (err) {
      console.error('❌ Error muting call:', err);
      return false;
    }
  };

  const unmute = async () => {
    try {
      if (!activeConnection.current || !isConnected) {
        console.warn('⚠️ Cannot unmute: call not connected');
        return false;
      }

      const call = activeConnection.current;

      if (typeof call.mute === 'function') {
        try {
          call.mute(false);
          setLocalIsMuted(false);
          setIsMuted(false);
          console.log('✅ Call unmuted using SDK mute() method');
          return true;
        } catch (err) {
          console.warn('⚠️ SDK unmute() failed:', err);
        }
      }

      if (localMediaStream.current) {
        try {
          const tracks = localMediaStream.current.getAudioTracks();
          if (tracks.length > 0) {
            tracks.forEach(track => {
              track.enabled = true;
            });
            setLocalIsMuted(false);
            setIsMuted(false);
            console.log('✅ Call unmuted via local media stream');
            return true;
          }
        } catch (err) {
          console.warn('⚠️ Error using local media stream:', err);
        }
      }

      try {
        const { local } = getCallStreams();
        if (local && local.getAudioTracks().length > 0) {
          local.getAudioTracks().forEach(track => {
            track.enabled = true;
          });
          setLocalIsMuted(false);
          setIsMuted(false);
          console.log('✅ Call unmuted via getCallStreams');
          return true;
        }
      } catch (err) {
        console.warn('⚠️ Error using getCallStreams:', err);
      }

      try {
        const pc = call.getPeerConnection ? call.getPeerConnection() : 
                    (call._peerConnection || call._pc || null);
        if (pc) {
          const senders = pc.getSenders();
          senders.forEach((sender) => {
            if (sender.track && sender.track.kind === 'audio') {
              sender.track.enabled = true;
            }
          });
          setLocalIsMuted(false);
          setIsMuted(false);
          console.log('✅ Call unmuted via peer connection');
          return true;
        }
      } catch (err) {
        console.warn('⚠️ Error using peer connection:', err);
      }

      console.error('❌ Cannot unmute: no method available');
      return false;
    } catch (err) {
      console.error('❌ Error unmuting call:', err);
      return false;
    }
  };

  const toggleMute = async () => {
    if (localIsMuted) {
      return await unmute();
    } else {
      return await mute();
    }
  };

  // Helper function to disconnect call
  const disconnectCall = useCallback((reason = 'manual') => {
    try {
      console.log(`📞 Disconnecting call (reason: ${reason})`);
      
      // Disconnect the active connection first
      if (activeConnection.current) {
        try {
          const call = activeConnection.current;
          // Try multiple methods to ensure disconnection
          if (typeof call.disconnect === 'function') {
            call.disconnect();
          }
          // Also try status method if available
          if (typeof call.status === 'function' && call.status() !== 'closed') {
            // Force disconnect if still open
            try {
              call.disconnect();
            } catch (e) {
              // Ignore
            }
          }
        } catch (err) {
          console.warn('⚠️ Error disconnecting call:', err);
        }
      }
      
      // Also disconnect via device (this is more reliable)
      if (device) {
        try {
          if (typeof device.disconnectAll === 'function') {
            device.disconnectAll();
          }
        } catch (err) {
          console.warn('⚠️ Error disconnecting all calls:', err);
        }
      }
      
      // Clean up state immediately
      setIsConnected(false);
      setIsConnecting(false);
      activeConnection.current = null;
      localMediaStream.current = null;
    } catch (err) {
      console.warn('⚠️ Error in disconnectCall (ignored):', err.message);
    }
  }, [device]);

  // Hangup function
  const hangUp = () => {
    try {
      console.log('📞 hangUp called');
      
      if (activeConnection.current) {
        const call = activeConnection.current;
        let status = null;
        
        try {
          if (typeof call.status === 'function') {
            status = call.status();
          } else {
            status = call.status || call._status;
          }
        } catch (e) {
          console.warn('⚠️ Error getting call status:', e);
        }
        
        if (status === 'open' || status === 'connected' || status === 'answered') {
          console.log('📞 Disconnecting active call');
          call.disconnect();
        } else {
          console.log('📞 Canceling call (not yet connected)');
          if (device && typeof device.disconnectAll === 'function') {
            device.disconnectAll();
          }
        }
      } else if (device && typeof device.disconnectAll === 'function') {
        console.log('📞 No active connection, disconnecting all calls');
        device.disconnectAll();
      }
      
      disconnectCall('manual');
    } catch (err) {
      console.warn('⚠️ Error in hangUp (ignored):', err.message);
    }
  };

  // Expose methods via ref
  useEffect(() => {
    webCallInterfaceRef.current = {
      hangUp,
      mute,
      unmute,
      toggleMute,
      getMutedState: () => localIsMuted
    };
    
    if (setWebCallInterfaceRef) {
      setWebCallInterfaceRef(webCallInterfaceRef.current);
    }
  }, [setWebCallInterfaceRef, localIsMuted]);

  // Update call status from socket
  useEffect(() => {
    if (!currentCallSid) return;

    const updateStatus = () => {
      const statusData = getCallStatus(currentCallSid);
      if (statusData?.status) {
        // Ignore client call status updates
        const isClientCall = statusData.twilioData?.isClientCall;
        if (isClientCall) {
          return; // Don't process client call status updates
        }
        
        // Backend now derives the correct status based on answeredBy, duration, and answerTime
        // We can trust the status from backend - it's already been validated
        updateCallStatus(statusData.status);
        
        // If call is completed/failed/canceled, disconnect the call
        // But only if we're actually connected (not just connecting)
        if (['completed', 'failed', 'canceled', 'busy', 'no-answer'].includes(statusData.status)) {
          if (isConnected || isWebCallConnected) {
            console.log('📞 Call ended remotely, disconnecting...');
            disconnectCall('remote_status_update');
            // End the call in context
            setTimeout(() => {
              endCall();
            }, 500);
          }
        }
      }
    };

    updateStatus();

    const handleStatusUpdate = (event) => {
      const { callStatusData } = event.detail;
      if (callStatusData?.callSid === currentCallSid) {
        // Ignore client call status updates (they shouldn't trigger disconnects)
        const isClientCall = callStatusData.twilioData?.isClientCall;
        if (isClientCall) {
          return; // Don't process client call status updates
        }
        
        // Backend now derives the correct status based on answeredBy, duration, and answerTime
        // We can trust the status from backend - it's already been validated
        updateCallStatus(callStatusData.status);
        
        // If call is completed/failed/canceled, disconnect the call IMMEDIATELY
        // This handles the case when customer hangs up - agent browser should disconnect too
        const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
        if (endedStatuses.includes(callStatusData.status)) {
          // Disconnect immediately if we have any connection (even if just connecting)
          if (isConnected || isWebCallConnected || activeConnection.current) {
            console.log(`📞 Call ended remotely (status: ${callStatusData.status}) - disconnecting agent browser immediately...`);
            // Disconnect immediately - no delay
            disconnectCall('customer_ended_call');
            // End the call in context
            setTimeout(() => {
              endCall();
            }, 200);
          }
        }
      }
    };

    window.addEventListener('callStatusUpdate', handleStatusUpdate);
    
    const interval = setInterval(updateStatus, 1000);

    return () => {
      window.removeEventListener('callStatusUpdate', handleStatusUpdate);
      clearInterval(interval);
    };
  }, [currentCallSid, getCallStatus, updateCallStatus, device, endCall, disconnectCall]);

  // Sync mute state
  useEffect(() => {
    if (isConnected) {
      if (muteSyncIntervalRef.current) {
        clearInterval(muteSyncIntervalRef.current);
      }
      muteSyncIntervalRef.current = setInterval(() => {
        if (webCallInterfaceRef.current?.getMutedState) {
          setIsMuted(webCallInterfaceRef.current.getMutedState());
        }
      }, 500);
    }
    
    return () => {
      if (muteSyncIntervalRef.current) {
        clearInterval(muteSyncIntervalRef.current);
        muteSyncIntervalRef.current = null;
      }
    };
  }, [isConnected, setIsMuted]);

  // Watch for call status changes and disconnect when call ends
  // This is a backup mechanism - ensures disconnection even if socket update is missed
  useEffect(() => {
    if (!callStatus) return;
    
    // If call status indicates the call has ended, disconnect IMMEDIATELY
    // This handles the case when customer hangs up - agent browser should disconnect too
    const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
    if (endedStatuses.includes(callStatus)) {
      // Disconnect immediately if we have any connection (even if just connecting)
      if (isConnected || isWebCallConnected || activeConnection.current) {
        console.log(`📞 Call status changed to ${callStatus} - disconnecting agent browser immediately...`);
        // Disconnect immediately - no delay
        disconnectCall('customer_ended_call_status');
        setTimeout(() => {
          endCall();
        }, 200);
      }
    }
  }, [callStatus, isConnected, isWebCallConnected, disconnectCall, endCall]);

  // Update callStatus ref whenever callStatus changes
  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  // Play/stop default Twilio ringing sound
  useEffect(() => {
    let ringingInterval = null;
    
    // Stop any existing ringing sound first (cleanup from previous status)
    const stopRingingSound = () => {
      if (ringingInterval) {
        clearInterval(ringingInterval);
        ringingInterval = null;
      }
      if (ringingOscillatorsRef.current.length > 0) {
        ringingOscillatorsRef.current.forEach(osc => {
          try {
            osc.stop();
            osc.disconnect();
          } catch (e) {
            // Ignore errors
          }
        });
        ringingOscillatorsRef.current = [];
      }
    };
    
    // Only play ringing sound if status is 'ringing' AND not connected
    if (callStatus === 'ringing' && !isWebCallConnected && !isConnected) {
      // Create Web Audio API context for standard phone ringtone
      if (!ringingAudioContextRef.current) {
        ringingAudioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      const audioContext = ringingAudioContextRef.current;
      
      // Resume audio context if suspended (required by browsers)
      if (audioContext.state === 'suspended') {
        audioContext.resume().catch(err => console.warn('Failed to resume audio context:', err));
      }
      
      // Standard phone ringtone: alternating between 440Hz and 480Hz
      // Pattern: 400ms sound, 200ms silence, 400ms sound, 2000ms silence (repeat)
      const playRingtone = () => {
        // Check current status using ref (to avoid stale closure)
        if (callStatusRef.current !== 'ringing' || isWebCallConnected || isConnected) {
          stopRingingSound();
          return;
        }
        
        // Stop any existing oscillators
        ringingOscillatorsRef.current.forEach(osc => {
          try {
            osc.stop();
            osc.disconnect();
          } catch (e) {
            // Ignore errors
          }
        });
        ringingOscillatorsRef.current = [];
        
        // Create two oscillators for the ringtone (standard phone ring)
        const oscillator1 = audioContext.createOscillator();
        const oscillator2 = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator1.type = 'sine';
        oscillator1.frequency.value = 440; // A4 note
        oscillator2.type = 'sine';
        oscillator2.frequency.value = 480; // Slightly higher
        
        gainNode.gain.value = 0.3; // Volume level
        
        oscillator1.connect(gainNode);
        oscillator2.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Start oscillators
        oscillator1.start();
        oscillator2.start();
        
        // Stop after 400ms
        setTimeout(() => {
          try {
            oscillator1.stop();
            oscillator2.stop();
          } catch (e) {
            // Ignore errors
          }
        }, 400);
        
        ringingOscillatorsRef.current.push(oscillator1, oscillator2);
      };
      
      // Play ringtone immediately
      playRingtone();
      
      // Then repeat: 400ms sound, 200ms silence, 400ms sound, 2000ms silence
      ringingInterval = setInterval(() => {
        // Check current status using ref to avoid stale closure
        if (callStatusRef.current === 'ringing' && !isWebCallConnected && !isConnected) {
          playRingtone();
        } else {
          stopRingingSound();
        }
      }, 3000); // Total cycle: 400ms + 200ms + 400ms + 2000ms = 3000ms
    } else {
      // Stop ringing when status changes to anything other than 'ringing' or when connected
      stopRingingSound();
    }
    
    return () => {
      // Cleanup on unmount or status change
      stopRingingSound();
    };
  }, [callStatus, isWebCallConnected, isConnected]);

  // Handle hangup
  const handleHangup = async () => {
    try {
      if (webCallInterfaceRef.current?.hangUp) {
        webCallInterfaceRef.current.hangUp();
      }

      if (currentCallSid) {
        try {
          await apiClient.post('/api/calls/hangup', {
            callSid: currentCallSid
          });
        } catch (err) {
          console.warn('Hangup API error (non-critical):', err);
        }
      }

      endCall();
    } catch (err) {
      console.error('Error hanging up call:', err);
      endCall();
    }
  };

  if (!showWebInterface || !conferenceName) {
    return null;
  }

  const durationToShow = finalDuration || callTimer;
  const displayError = error || callError;

  return (
    <div className={`fixed bottom-4 right-4 z-[9999] transition-all duration-300 ${
      isMinimized ? 'w-64' : 'w-80'
    }`}>
      <div className="bg-white rounded-lg shadow-2xl border-2 border-blue-200 backdrop-blur-sm overflow-hidden">
        {/* Header with minimize button and call status */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-3 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0">
              {callStatus === 'in-progress' ? (
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              ) : callStatus === 'ringing' ? (
                // Customer's phone is ringing
                <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
              ) : callStatus === 'queued' ? (
                // Call is queued (not ringing yet)
                <div className="w-3 h-3 bg-gray-400 rounded-full animate-pulse"></div>
              ) : (
                <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">
                {callMetadata?.customerName || 'Active Call'}
              </div>
              <div className="flex items-center gap-2">
                {callMetadata?.phoneNumber && (
                  <div className="text-xs text-blue-100 truncate">
                    {callMetadata.phoneNumber}
                  </div>
                )}
                {/* Call Status in Header - show for all active call states */}
                {(callStatus || (isWebCallConnected || isConnected)) && (
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    callStatus === 'in-progress' ? 'bg-green-500/30 text-green-100' :
                    callStatus === 'ringing' ? 'bg-yellow-500/30 text-yellow-100' :
                    callStatus === 'queued' ? 'bg-gray-500/30 text-gray-100' :
                    callStatus === 'completed' ? 'bg-gray-500/30 text-gray-100' :
                    'bg-red-500/30 text-red-100'
                  }`}>
                    {/* 
                      Outbound call status flow:
                      - "Queued": Call initiated, customer phone not ringing yet
                      - "Ringing": Customer's phone is ringing
                      - "In Progress": Customer answered, call active
                      - "Completed": Call ended (by customer or agent)
                    */}
                    {callStatus === 'in-progress' ? 'In Progress' :
                     callStatus === 'ringing' ? 'Ringing' :
                     callStatus === 'queued' ? 'Queued' :
                     callStatus === 'completed' ? 'Completed' :
                     callStatus && !['in-progress', 'ringing', 'queued', 'completed'].includes(callStatus) ? callStatus :
                     !callStatus && (isWebCallConnected || isConnected) ? 'Connecting' : ''}
                  </div>
                )}
                {/* Timer in Header - only show when in-progress */}
                {callStatus === 'in-progress' && (
                  <div className="text-xs font-bold text-white">
                    {formatTimer(durationToShow)}
                  </div>
                )}
              </div>
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

        {/* Main content - only show when not minimized */}
        {!isMinimized && (
          <div className="p-4">
            {/* Error Display */}
            {displayError && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg mb-3">
                <div className="font-semibold mb-1">⚠️ Error</div>
                <div>{displayError}</div>
              </div>
            )}

            {/* Connecting State */}
            {(isCalling || isConnecting) && !isWebCallConnected && !isConnected && (
              <div className="flex items-center gap-3 py-3 px-4 bg-blue-50 rounded-lg border border-blue-200 mb-3">
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
                <div>
                  <div className="font-semibold text-blue-700">Connecting...</div>
                  <div className="text-xs text-blue-600">Please wait</div>
                </div>
              </div>
            )}

            {/* Join Call Button for Inbound Calls - Show when not connected and call hasn't ended */}
            {conferenceName && conferenceName.startsWith('inbound-') && !isWebCallConnected && !isConnected && !isConnecting && !isCalling && 
             (!callStatus || !['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'].includes(callStatus)) && (
              <div className="mb-3">
                <button
                  onClick={() => joinConference()}
                  className="w-full px-4 py-3 font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white shadow-lg"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.517l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>Join Call</span>
                </button>
                
                {/* Quick Links */}
                {callMetadata?.saleId && (
                  <button
                    onClick={() => window.open(`/add-sale?id=${callMetadata.saleId}`, '_blank')}
                    className="w-full mt-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors duration-200 border border-blue-200 flex items-center justify-center gap-1"
                  >
                    <span>📋</span>
                    <span>View Sale</span>
                  </button>
                )}
              </div>
            )}

            {/* Connected State Info */}
            {(isWebCallConnected || isConnected) && (
              <div className={`flex items-center gap-3 py-2 px-3 rounded-lg border mb-3 ${
                callStatus === 'in-progress' 
                  ? 'bg-green-50 border-green-200' 
                  : callStatus === 'ringing'
                  ? 'bg-yellow-50 border-yellow-200'
                  : callStatus === 'queued'
                  ? 'bg-gray-50 border-gray-200'
                  : 'bg-green-50 border-green-200'
              }`}>
                <div className={`w-3 h-3 rounded-full animate-pulse ${
                  callStatus === 'in-progress' 
                    ? 'bg-green-500' 
                    : callStatus === 'ringing'
                    ? 'bg-yellow-500'
                    : callStatus === 'queued'
                    ? 'bg-gray-500'
                    : 'bg-green-500'
                }`}></div>
                <div className={`text-sm font-semibold ${
                  callStatus === 'in-progress' 
                    ? 'text-green-700' 
                    : callStatus === 'ringing'
                    ? 'text-yellow-700'
                    : callStatus === 'queued'
                    ? 'text-gray-700'
                    : 'text-green-700'
                }`}>
                  {callStatus === 'in-progress' ? 'Call Connected' :
                   callStatus === 'ringing' ? 'Customer Phone Ringing' :
                   callStatus === 'queued' ? 'Call Queued' :
                   'Call Connected'}
                </div>
              </div>
            )}

            {/* Mute/Unmute Button */}
            {(isWebCallConnected || isConnected) && (callStatus === 'in-progress' || callStatus === 'ringing' || !callStatus) && (
              <button
                onClick={toggleMute}
                className={`w-full px-4 py-2 font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 mb-3 ${
                  isMuted 
                    ? 'bg-orange-600 hover:bg-orange-700 text-white' 
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                {isMuted ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                    Unmute
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Mute
                  </>
                )}
              </button>
            )}

            {/* Mute Status Indicator */}
            {isMuted && (callStatus === 'in-progress' || (isWebCallConnected || isConnected)) && (
              <div className="flex items-center justify-center gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded mb-3">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                </svg>
                <span>Microphone Muted</span>
              </div>
            )}

            {/* Hangup Button - highlight when call ended */}
            {(isWebCallConnected || isConnected || callStatus === 'in-progress' || callStatus === 'ringing' || callStatus === 'connecting' || isCalling || isConnecting || callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled') && (
              <button
                onClick={handleHangup}
                className={`w-full px-4 py-2 font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 ${
                  callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled'
                    ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg ring-2 ring-green-400 ring-offset-2 animate-pulse'
                    : 'bg-red-600 hover:bg-red-700 text-white'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                </svg>
                {callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled' ? 'Call Ended' : 'End Call'}
              </button>
            )}
        </div>
      )}
      
        {/* Minimized view - just show timer and status */}
        {isMinimized && (
          <div className="p-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
            {(callStatus === 'in-progress' || (isWebCallConnected || isConnected)) && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            )}
            {callStatus === 'ringing' && !(isWebCallConnected || isConnected) && (
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              )}
              <span className="text-sm font-medium text-gray-700">
                {callMetadata?.customerName || 'Call'}
              </span>
            </div>
            {/* Timer in minimized view - only show when in-progress */}
            {callStatus === 'in-progress' && (
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
