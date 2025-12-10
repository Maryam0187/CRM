'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
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

const WebCallInterface = forwardRef(function WebCallInterface({ conferenceName, onCallConnected, onCallDisconnected }, ref) {
  const { user } = useAuth();
  const [device, setDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [callStatus, setCallStatus] = useState(null); // Track current call status for UI display
  const activeConnection = useRef(null);
  const localMediaStream = useRef(null); // Store local media stream for muting
  const isCleaningUp = useRef(false);

  const fetchToken = async () => {
    try {
      const response = await apiClient.get('/api/twilio/token');
      const data = await response.json();
      if (data.success) {
        return data.token;
      } else {
        throw new Error(data.error || 'Failed to fetch Twilio token');
      }
    } catch (err) {
      console.error('Error fetching Twilio token:', err);
      setError(err.message);
      return null;
    }
  };

  // Setup device only when conferenceName is provided and user is available
  useEffect(() => {
    if (!conferenceName || !user) {
      if (device) {
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

    const setupDevice = async () => {
      try {
        console.log('📞 Starting device setup for conference:', conferenceName);
        const token = await fetchToken();
        if (!token) {
          console.error('❌ Failed to fetch token');
          return;
        }

        console.log('📞 Setting up Twilio Device (SDK 2.x)...');
        
        const twilioDevice = new Device(token, {
          logLevel: 1,
          codecPreferences: ['opus', 'pcmu'],
          allowIncomingWhileBusy: false,
          enableRTCStats: false,
          closeProtection: false,
          disableInsights: true

        });
        
        // Suppress console warnings for insights errors
        const originalWarn = console.warn;
        const originalError = console.error;
        
        const shouldFilterMessage = (message) => {
          const lowerMessage = message.toLowerCase();
          // Filter all Twilio Insights-related errors and warnings
          // These are harmless analytics errors that don't affect call functionality
          // They occur when network blocks Insights POSTs or CORS issues occur
          return lowerMessage.includes('cannot connect to insights') ||
                 lowerMessage.includes('unable to post') ||
                 lowerMessage.includes('failed to fetch') ||
                 lowerMessage.includes('received error:') ||
                 lowerMessage.includes('received error: typeerror') ||
                 lowerMessage.includes('typeerror: failed to fetch') ||
                 lowerMessage.includes('typeerror') ||
                 // Catch the specific error pattern: "[TwilioVoice][EventPublisher] Unable to post..."
                 (lowerMessage.includes('[twiliovoice]') && lowerMessage.includes('[eventpublisher]') && lowerMessage.includes('unable to post')) ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('eventpublisher') && lowerMessage.includes('unable to post')) ||
                 (lowerMessage.includes('insights') && (lowerMessage.includes('error') || lowerMessage.includes('failed') || lowerMessage.includes('cannot') || lowerMessage.includes('unable'))) ||
                 lowerMessage.includes('eventpublisher') ||
                 lowerMessage.includes('event publisher') ||
                 (lowerMessage.includes('heartbeat') && lowerMessage.includes('wstransport')) ||
                 lowerMessage.includes('wstransport') ||
                 lowerMessage.includes('dtls-transport-state') ||
                 lowerMessage.includes('dtls-transport-state closed event') ||
                 (lowerMessage.includes('connection disconnected') && (lowerMessage.includes('insights') || lowerMessage.includes('event'))) ||
                 lowerMessage.includes('connection disconnected-by-local') ||
                 lowerMessage.includes('disconnected-by-local event') ||
                 lowerMessage.includes('quality-metrics') ||
                 lowerMessage.includes('metrics-sample') ||
                 lowerMessage.includes('quality-metrics-samples') ||
                 lowerMessage.includes('metrics-sample event') ||
                 lowerMessage.includes('unable to post dtls-transport-state') ||
                 lowerMessage.includes('unable to post quality-metrics') ||
                 lowerMessage.includes('unable to post connection') ||
                 // Filter Twilio SDK internal verbose logs
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('device') && (lowerMessage.includes('rejecting') || lowerMessage.includes('disconnectall') || lowerMessage.includes('unregistered') || lowerMessage.includes('destroyed') || lowerMessage.includes('stream is offline'))) ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('pstream') && lowerMessage.includes('destroy')) ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('wstransport') && (lowerMessage.includes('close') || lowerMessage.includes('closing') || lowerMessage.includes('cleaning up'))) ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('device') && (lowerMessage.includes('cannot') || lowerMessage.includes('failed'))) ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('eventpublisher')) ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('event publisher')) ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('unable to post'));
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
          // Auto-join conference when device is registered
          if (conferenceName && !isConnected) {
            console.log('📞 Auto-joining conference immediately:', conferenceName);
            joinConference(twilioDevice);
          }
        });

        // Listen to device-level events for graceful cleanup
        twilioDevice.on('unregistered', () => {
          console.log('📞 Device unregistered');
        });

        twilioDevice.on('offline', () => {
          console.log('📞 Device offline');
        });

        twilioDevice.on('error', (err) => {
          console.error('❌ Twilio Device error:', err);
          setError(`Device error: ${err.message || err.code}`);
          setIsConnecting(false);
        });

        twilioDevice.on('incoming', (call) => {
          console.log('📞 Incoming call:', call);
          call.reject();
        });

        twilioDevice.on('tokenWillExpire', async () => {
          console.log('🔄 Token expiring, refreshing...');
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
      }
    };

    setupDevice();

    return () => {
      if (device) {
        console.log('🧹 Cleaning up device on unmount');
        try {
          if (activeConnection.current) {
            try {
              if (typeof activeConnection.current.disconnect === 'function') {
                activeConnection.current.disconnect();
              }
            } catch (e) {
              // Ignore
            }
            activeConnection.current = null;
          }
          
          try {
            if (typeof device.disconnectAll === 'function') {
              device.disconnectAll();
            }
          } catch (e) {
            // Ignore
          }
          
          // Wait for disconnect to settle before destroying
          // This prevents crashes from destroying device while Insights events are being sent
          setTimeout(() => {
            try {
              if (device && typeof device.unregister === 'function') {
                device.unregister();
              }
            } catch (e) {
              // Ignore
            }
            
            // Only destroy if truly needed (component unmounting)
            // Device can be reused, so destroy only when necessary
            try {
              if (device && typeof device.destroy === 'function') {
                device.destroy();
              }
            } catch (e) {
              // Ignore - device might already be destroyed
              console.warn('⚠️ Error destroying device on unmount (ignored):', e.message);
            }
          }, 300); // Wait 300ms for SDK to finish sending Insights events
          
          setDevice(null);
          setIsConnected(false);
          setIsConnecting(false);
          localMediaStream.current = null;
        } catch (e) {
          console.warn('⚠️ Error during device cleanup (ignored):', e.message);
        }
      }
    };
  }, [conferenceName, user]);

  const joinConference = async (deviceInstance = device) => {
    if (!deviceInstance || !conferenceName) {
      const errorMsg = `Device not ready or conference name missing. Device: ${!!deviceInstance}, Conference: ${conferenceName}`;
      console.error('❌', errorMsg);
      setError(errorMsg);
      return;
    }
    if (isConnected) {
      console.log('⚠️ Already connected, skipping join');
      return;
    }

    setIsConnecting(true);
    setError(null);
    setCallStatus('connecting');

    try {
      console.log(`📞 Attempting to join conference: ${conferenceName}`);
      
      const params = {
        To: conferenceName
      };

      console.log('📞 Connecting with params:', params);
      
      // Request audio permissions before connecting
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }, 
          video: false 
        });
        console.log('✅ Audio permissions granted');
        // Release test stream - SDK will request its own
        stream.getTracks().forEach(track => track.stop());
      } catch (audioErr) {
        console.warn('⚠️ Audio permission request failed (Twilio SDK will request):', audioErr);
        // Continue anyway - SDK will request permissions
      }

      // Resume AudioContext (user gesture)
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
          console.log('✅ AudioContext resumed');
        }
      } catch (audioCtxErr) {
        console.warn('⚠️ AudioContext resume failed:', audioCtxErr);
      }

      // Set speaker devices
      try {
        if (deviceInstance.audio && typeof deviceInstance.audio.setSpeakerDevices === 'function') {
          await deviceInstance.audio.setSpeakerDevices('default');
          console.log('✅ Speaker devices set to default');
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
      
      // Check initial status and update UI
      try {
        let initialStatus = null;
        if (typeof call.status === 'function') {
          try {
            initialStatus = call.status();
          } catch (e) {
            initialStatus = call._status || null;
          }
        } else {
          initialStatus = call.status || call._status || null;
        }
        
        if (initialStatus === 'ringing' || initialStatus === 'pending' || initialStatus === 'connecting') {
          setCallStatus('ringing');
        } else if (initialStatus === 'open' || initialStatus === 'answered' || initialStatus === 'connected') {
          setCallStatus('connected');
        }
      } catch (e) {
        // Ignore status check errors
      }

      // Attach event listeners
      if (call && typeof call === 'object') {
        const attachEvents = (callObj) => {
          // Accept event
          const onAccept = () => {
            console.log('✅ Call accepted - connected to conference');
            setIsConnected(true);
            setIsConnecting(false);
            
            // Get and store media streams for mute functionality
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
            
            onCallConnected && onCallConnected(callObj);
          };

          // Disconnect event - wait for SDK to finish sending Insights events before cleanup
          const onDisconnect = () => {
            try {
              console.log('📞 Call disconnected (client) - waiting for SDK to finish...');
              setIsConnected(false);
              setIsConnecting(false);
              setCallStatus('disconnected');
              activeConnection.current = null;
              localMediaStream.current = null;
              
              // Wait 300ms to allow SDK to finish sending Insights events and DTLS to close
              // This prevents race conditions and crashes from premature device destruction
              setTimeout(() => {
                try {
                  if (device && !isCleaningUp.current) {
                    isCleaningUp.current = true;
                    console.log('🧹 Safe to cleanup after disconnect event');
                    // Only unregister, don't destroy - let device stay alive for potential reuse
                    if (typeof device.unregister === 'function') {
                      device.unregister();
                    }
                    setTimeout(() => {
                      isCleaningUp.current = false;
                    }, 1000);
                  }
                } catch (e) {
                  console.warn('⚠️ Cleanup error after disconnect (ignored):', e.message);
                  isCleaningUp.current = false;
                }
              }, 300); // 200-500ms usually ok; adjust if you still see problems
              
              // Safely call callback
              try {
                onCallDisconnected && onCallDisconnected();
              } catch (callbackErr) {
                console.warn('Error in onCallDisconnected callback:', callbackErr);
              }
            } catch (disconnectErr) {
              console.error('Error in disconnect handler:', disconnectErr);
              // Still reset state
              setIsConnected(false);
              setIsConnecting(false);
            }
          };

          // Cancel event (customer declined/no answer)
          const onCancel = () => {
            try {
              console.log('❌ Call canceled (customer declined or no answer)');
              setIsConnected(false);
              setIsConnecting(false);
              setCallStatus('canceled');
              activeConnection.current = null;
              localMediaStream.current = null;
              
              // Safely call callback
              try {
                onCallDisconnected && onCallDisconnected();
              } catch (callbackErr) {
                console.warn('Error in onCallDisconnected callback:', callbackErr);
              }
            } catch (cancelErr) {
              console.error('Error in cancel handler:', cancelErr);
              setIsConnected(false);
              setIsConnecting(false);
            }
          };

          // Error event
          const onError = (err) => {
            try {
              console.error('❌ Call error:', err);
              const errorCode = err?.code || err?.twilioError?.code;
              const errorMessage = err?.message || err?.twilioError?.message || 'Unknown error';
              
              if (errorCode === 31603 || errorMessage.includes('Decline')) {
                setError('Call was declined by customer or Twilio.');
                setCallStatus('declined');
              } else if (errorCode === 31005) {
                setError('Connection error. Please check your internet connection and try again.');
                setCallStatus('error');
              } else {
                setError(`Call error: ${errorMessage} (Code: ${errorCode || 'N/A'})`);
                setCallStatus('error');
              }
              
              setIsConnected(false);
              setIsConnecting(false);
              activeConnection.current = null;
              
              // Safely call callback
              try {
                onCallDisconnected && onCallDisconnected();
              } catch (callbackErr) {
                console.warn('Error in onCallDisconnected callback:', callbackErr);
              }
            } catch (errorHandlerErr) {
              console.error('Error in error handler:', errorHandlerErr);
              // Still try to reset state
              setIsConnected(false);
              setIsConnecting(false);
            }
          };

          // Reject event
          const onReject = () => {
            try {
              console.error('❌ Call rejected');
              setError('Call was rejected. Please check TwiML App Voice URL configuration.');
              setCallStatus('rejected');
              setIsConnected(false);
              setIsConnecting(false);
              activeConnection.current = null;
              
              // Safely call callback
              try {
                onCallDisconnected && onCallDisconnected();
              } catch (callbackErr) {
                console.warn('Error in onCallDisconnected callback:', callbackErr);
              }
            } catch (rejectErr) {
              console.error('Error in reject handler:', rejectErr);
              setIsConnected(false);
              setIsConnecting(false);
            }
          };

          // Try addEventListener first, then .on()
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
            // Fallback
            setTimeout(() => {
              console.log('📞 Setting connected state (fallback)');
              setIsConnected(true);
              setIsConnecting(false);
              onCallConnected && onCallConnected(callObj);
            }, 2000);
          }
        };

        attachEvents(call);
      } else {
        throw new Error('Invalid call object returned');
      }

    } catch (err) {
      console.error('❌ Error joining conference:', err);
      setError(err.message || 'Failed to join conference');
      setIsConnecting(false);
    }
  };

  const hangUp = () => {
    try {
      console.log('📞 hangUp called');
      setCallStatus('disconnecting');
      
      if (isCleaningUp.current) {
        console.log('⚠️ Cleanup already in progress, skipping');
        return;
      }
      
      // Check if we have an active call connection
      if (activeConnection.current) {
        const call = activeConnection.current;
        
        try {
          // Get call status - handle both function and property
          let callStatus = null;
          if (typeof call.status === 'function') {
            try {
              callStatus = call.status();
            } catch (e) {
              // If function call fails, try as property
              callStatus = call._status || null;
            }
          } else {
            callStatus = call.status || call._status || null;
          }
          
          console.log('📞 Call status during hangup:', callStatus);
          
          // If call is open (connected), disconnect it directly
          if (callStatus === 'open' || callStatus === 'answered' || callStatus === 'connected') {
            if (typeof call.disconnect === 'function') {
              console.log('📞 Call is open, disconnecting via call.disconnect()');
              call.disconnect();
              // Clear reference after disconnect
              activeConnection.current = null;
            }
          } else if (callStatus === 'ringing' || callStatus === 'pending' || callStatus === 'connecting') {
            // If call is ringing, use device.disconnectAll() to cancel it
            console.log('📞 Call is ringing/connecting, using device.disconnectAll()');
            if (device && typeof device.disconnectAll === 'function') {
              device.disconnectAll();
            }
            activeConnection.current = null;
          } else {
            // For any other status, use device.disconnectAll() as fallback
            console.log('📞 Call in unknown state, using device.disconnectAll()');
            if (device && typeof device.disconnectAll === 'function') {
              device.disconnectAll();
            }
            activeConnection.current = null;
          }
        } catch (callErr) {
          console.warn('⚠️ Error checking call status, using device.disconnectAll():', callErr.message);
          // Fallback to device.disconnectAll() if call status check fails
          if (device && typeof device.disconnectAll === 'function') {
            device.disconnectAll();
          }
          activeConnection.current = null;
        }
      } else {
        // No active connection, just use device.disconnectAll()
        if (device && typeof device.disconnectAll === 'function') {
          console.log('📞 No active call, using device.disconnectAll()');
          device.disconnectAll();
        }
      }
      
      // Update UI state immediately
      setIsConnected(false);
      setIsConnecting(false);
      localMediaStream.current = null;
      
      // Call callback immediately for UI updates
      try {
        onCallDisconnected && onCallDisconnected();
      } catch (callbackErr) {
        console.warn('Error in onCallDisconnected callback:', callbackErr);
      }
      
    } catch (err) {
      console.warn('⚠️ Error in hangUp (ignored):', err.message);
      // Fallback: try device.disconnectAll() if everything else fails
      if (device && typeof device.disconnectAll === 'function') {
        try {
          device.disconnectAll();
        } catch (e) {
          console.warn('⚠️ Final fallback disconnect failed:', e.message);
        }
      }
      // Still update UI state
      setIsConnected(false);
      setIsConnecting(false);
      activeConnection.current = null;
    }
  };

  // Get media streams from the call - for mute functionality
  const getCallStreams = () => {
    if (!activeConnection.current) {
      return { local: null, remote: null };
    }

    try {
      const call = activeConnection.current;
      let localStream = null;
      let remoteStream = null;

      // Try to get peer connection to access tracks
      const pc = call.getPeerConnection ? call.getPeerConnection() : 
                  (call._peerConnection || call._pc || null);

      if (pc) {
        // Get local audio tracks (agent's microphone)
        const localTracks = [];
        pc.getSenders().forEach(sender => {
          if (sender.track && sender.track.kind === 'audio') {
            localTracks.push(sender.track);
          }
        });
        if (localTracks.length > 0) {
          localStream = new MediaStream(localTracks);
        }

        // Get remote audio tracks (customer's audio)
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

      // Fallback: Try direct methods if available
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

      // Try SDK's built-in mute method first
      if (typeof call.mute === 'function') {
        try {
          call.mute(true);
          setIsMuted(true);
          console.log('✅ Call muted using SDK mute() method');
          return true;
        } catch (err) {
          console.warn('⚠️ SDK mute() failed:', err);
        }
      }

      // Fallback: Use local media stream (from working version)
      if (localMediaStream.current) {
        try {
          const tracks = localMediaStream.current.getAudioTracks();
          if (tracks.length > 0) {
            tracks.forEach(track => {
              track.enabled = false;
            });
            setIsMuted(true);
            console.log('✅ Call muted via local media stream');
            return true;
          }
        } catch (err) {
          console.warn('⚠️ Error using local media stream:', err);
        }
      }

      // Fallback: Try getCallStreams
      try {
        const { local } = getCallStreams();
        if (local && local.getAudioTracks().length > 0) {
          local.getAudioTracks().forEach(track => {
            track.enabled = false;
          });
          setIsMuted(true);
          console.log('✅ Call muted via getCallStreams');
          return true;
        }
      } catch (err) {
        console.warn('⚠️ Error using getCallStreams:', err);
      }

      // Try peer connection directly
      try {
        const pc = call.getPeerConnection ? call.getPeerConnection() : 
                    (call._peerConnection || call._pc || null);
        if (pc) {
          const senders = pc.getSenders();
          senders.forEach((sender) => {
            if (sender.track && sender.track.kind === 'audio') {
              sender.track.enabled = false;
            }
          });
          setIsMuted(true);
          console.log('✅ Call muted via peer connection');
          return true;
        }
      } catch (err) {
        console.warn('⚠️ Error using peer connection:', err);
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

      // Try SDK's built-in mute method first
      if (typeof call.mute === 'function') {
        try {
          call.mute(false);
          setIsMuted(false);
          console.log('✅ Call unmuted using SDK mute() method');
          return true;
        } catch (err) {
          console.warn('⚠️ SDK unmute() failed:', err);
        }
      }

      // Fallback: Use local media stream
      if (localMediaStream.current) {
        try {
          const tracks = localMediaStream.current.getAudioTracks();
          if (tracks.length > 0) {
            tracks.forEach(track => {
              track.enabled = true;
            });
            setIsMuted(false);
            console.log('✅ Call unmuted via local media stream');
            return true;
          }
        } catch (err) {
          console.warn('⚠️ Error using local media stream:', err);
        }
      }

      // Fallback: Try getCallStreams
      try {
        const { local } = getCallStreams();
        if (local && local.getAudioTracks().length > 0) {
          local.getAudioTracks().forEach(track => {
            track.enabled = true;
          });
          setIsMuted(false);
          console.log('✅ Call unmuted via getCallStreams');
          return true;
        }
      } catch (err) {
        console.warn('⚠️ Error using getCallStreams:', err);
      }

      // Try peer connection directly
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
    if (isMuted) {
      return await unmute();
    } else {
      return await mute();
    }
  };

  // Expose methods and state via ref
  useImperativeHandle(ref, () => ({
    hangUp,
    mute,
    unmute,
    toggleMute,
    isMuted: () => isMuted,
    getMutedState: () => isMuted
  }));

  if (!conferenceName) {
    return null;
  }

  // Get status display info for bottom-right indicator
  const getStatusDisplay = () => {
    if (!callStatus && !isConnecting && !isConnected) return null;
    
    const statusConfig = {
      'connecting': { text: 'Connecting...', color: 'blue', icon: '🔄' },
      'ringing': { text: 'Ringing...', color: 'yellow', icon: '📞' },
      'connected': { text: 'Connected', color: 'green', icon: '✓' },
      'disconnecting': { text: 'Disconnecting...', color: 'orange', icon: '📞' },
      'canceling': { text: 'Canceling...', color: 'orange', icon: '📞' },
      'disconnected': { text: 'Disconnected', color: 'gray', icon: '✕' },
      'canceled': { text: 'Canceled', color: 'orange', icon: '✕' },
      'declined': { text: 'Declined', color: 'red', icon: '✕' },
      'rejected': { text: 'Rejected', color: 'red', icon: '✕' },
      'error': { text: 'Error', color: 'red', icon: '⚠' }
    };

    const config = statusConfig[callStatus] || (isConnecting ? statusConfig['connecting'] : isConnected ? statusConfig['connected'] : null);
    return config;
  };

  const statusDisplay = getStatusDisplay();

  return (
    <>
      {/* Call Status Indicator - Fixed Bottom Right (above WebCallInterface) */}
      {statusDisplay && (
        <div className="fixed bottom-32 right-4 z-50">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border-2 backdrop-blur-sm ${
            statusDisplay.color === 'green' ? 'bg-green-50/90 border-green-300 text-green-700' :
            statusDisplay.color === 'blue' ? 'bg-blue-50/90 border-blue-300 text-blue-700' :
            statusDisplay.color === 'yellow' ? 'bg-yellow-50/90 border-yellow-300 text-yellow-700' :
            statusDisplay.color === 'orange' ? 'bg-orange-50/90 border-orange-300 text-orange-700' :
            statusDisplay.color === 'red' ? 'bg-red-50/90 border-red-300 text-red-700' :
            'bg-gray-50/90 border-gray-300 text-gray-700'
          }`}>
            {(statusDisplay.color === 'blue' || statusDisplay.color === 'orange') && (isConnecting || callStatus === 'connecting' || callStatus === 'disconnecting' || callStatus === 'canceling') && (
              <div className={`animate-spin rounded-full h-4 w-4 border-2 ${
                statusDisplay.color === 'blue' ? 'border-blue-600 border-t-transparent' : 'border-orange-600 border-t-transparent'
              }`}></div>
            )}
            {(statusDisplay.color === 'green' && isConnected) && (
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            )}
            {!isConnecting && !isConnected && !callStatus?.includes('ing') && (
              <span className="text-lg">{statusDisplay.icon}</span>
            )}
            <span className="font-semibold text-sm">{statusDisplay.text}</span>
            {isMuted && isConnected && (
              <span className="text-xs px-2 py-0.5 bg-gray-200/80 rounded" title="Muted">🔇 Muted</span>
            )}
          </div>
        </div>
      )}

      {/* Main Component */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">Web Call</h3>
          {isConnected && (
            <div className="flex items-center gap-2 text-green-600">
              <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm">Connected</span>
            </div>
          )}
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-100 text-red-700 text-sm rounded">
            {error}
          </div>
        )}

        {isConnecting && (
          <div className="flex items-center gap-2 text-blue-600">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span>Connecting...</span>
          </div>
        )}

        {isConnected && (
          <div className="flex items-center gap-2 text-green-600">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span>Connected to conference</span>
          </div>
        )}

        {!isConnected && !isConnecting && !error && device && (
          <button
            onClick={() => joinConference()}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Join Call
          </button>
        )}

        {!device && !error && (
          <div className="text-sm text-gray-500">Initializing device...</div>
        )}

        <div className="mt-2 text-xs text-gray-500">
          Conference: {conferenceName}
        </div>
      </div>
    </>
  );
});

export default WebCallInterface;
