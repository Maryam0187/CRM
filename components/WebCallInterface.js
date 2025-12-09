'use client';

import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { Device } from '@twilio/voice-sdk';

const WebCallInterface = forwardRef(function WebCallInterface({ conferenceName, onCallConnected, onCallDisconnected }, ref) {
  const { user } = useAuth();
  const [device, setDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
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
          // Disable insights to prevent failed fetch errors
          insights: {
            enabled: false
          }
        });
        
        // Suppress console warnings for insights errors
        const originalWarn = console.warn;
        const originalError = console.error;
        
        const shouldFilterMessage = (message) => {
          const lowerMessage = message.toLowerCase();
          return lowerMessage.includes('cannot connect to insights') ||
                 lowerMessage.includes('unable to post') ||
                 lowerMessage.includes('failed to fetch') ||
                 (lowerMessage.includes('insights') && (lowerMessage.includes('error') || lowerMessage.includes('failed') || lowerMessage.includes('cannot'))) ||
                 lowerMessage.includes('eventpublisher') ||
                 (lowerMessage.includes('heartbeat') && lowerMessage.includes('wstransport')) ||
                 lowerMessage.includes('wstransport') ||
                 lowerMessage.includes('dtls-transport-state') ||
                 (lowerMessage.includes('connection disconnected') && lowerMessage.includes('insights')) ||
                 lowerMessage.includes('quality-metrics') ||
                 lowerMessage.includes('metrics-sample') ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('device') && (lowerMessage.includes('cannot') || lowerMessage.includes('failed'))) ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('eventpublisher'));
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
          
          try {
            if (device && typeof device.unregister === 'function') {
              device.unregister();
            }
          } catch (e) {
            // Ignore
          }
          
          try {
            if (device && typeof device.destroy === 'function') {
              device.destroy();
            }
          } catch (e) {
            // Ignore
          }
          
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

          // Disconnect event
          const onDisconnect = () => {
            try {
              console.log('📞 Call disconnected');
              setIsConnected(false);
              setIsConnecting(false);
              activeConnection.current = null;
              localMediaStream.current = null;
              
              if (device && !isCleaningUp.current) {
                try {
                  isCleaningUp.current = true;
                  console.log('🧹 Unregistering device after call disconnect');
                  device.unregister();
                } catch (e) {
                  // Ignore
                } finally {
                  setTimeout(() => {
                    isCleaningUp.current = false;
                  }, 1000);
                }
              }
              
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
              } else if (errorCode === 31005) {
                setError('Connection error. Please check your internet connection and try again.');
              } else {
                setError(`Call error: ${errorMessage} (Code: ${errorCode || 'N/A'})`);
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
    // Prevent navigation on errors
    try {
      console.log('📞 hangUp called');
      
      if (isCleaningUp.current) {
        console.log('⚠️ Cleanup already in progress, skipping');
        return;
      }
      
      isCleaningUp.current = true;
      let deviceDestroyed = false;
      let callDisconnected = false;
      
      // Get call status to determine if we're in ringing state
      // Status might be a function or property - handle both
      let callStatus = null;
      try {
        if (activeConnection.current) {
          const call = activeConnection.current;
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
        }
      } catch (statusErr) {
        console.warn('⚠️ Error getting call status:', statusErr);
        callStatus = null;
      }
      
      const isRinging = callStatus === 'ringing' || callStatus === 'pending' || callStatus === 'connecting';
      
      console.log('📞 Call status during hangup:', callStatus);
      
      // If ringing or connecting, use device.disconnectAll() directly (more reliable)
      if (isRinging || !isConnected) {
        console.log('📞 Call is ringing/connecting, using device.disconnectAll()');
        if (device && typeof device.disconnectAll === 'function') {
          try {
            device.disconnectAll();
            deviceDestroyed = true;
            callDisconnected = true;
            console.log('✅ Disconnected all calls via device.disconnectAll()');
          } catch (e) {
            console.warn('⚠️ Error in device.disconnectAll:', e.message);
          }
        }
      } else if (activeConnection.current) {
        // For connected calls, try call.disconnect() first
        const call = activeConnection.current;
        
          try {
            // Check if call is in a valid state to disconnect
            // Status might be a function or property - handle both
            let currentStatus = null;
            if (typeof call.status === 'function') {
              try {
                currentStatus = call.status();
              } catch (e) {
                currentStatus = call._status || null;
              }
            } else {
              currentStatus = call.status || call._status || null;
            }
            
            if (currentStatus && (currentStatus === 'open' || currentStatus === 'answered' || currentStatus === 'connected')) {
              if (typeof call.disconnect === 'function') {
                console.log('📞 Disconnecting call using call.disconnect()');
                call.disconnect();
                callDisconnected = true;
              }
            } else {
            // Call might be in transition state, use device.disconnectAll()
            console.log('📞 Call in transition state, using device.disconnectAll()');
            if (device && typeof device.disconnectAll === 'function') {
              device.disconnectAll();
              deviceDestroyed = true;
              callDisconnected = true;
            }
          }
        } catch (callErr) {
          console.warn('⚠️ Error disconnecting call, trying device.disconnectAll():', callErr.message);
          // Fallback to device.disconnectAll() if call.disconnect() fails
          if (device && typeof device.disconnectAll === 'function') {
            try {
              device.disconnectAll();
              deviceDestroyed = true;
              callDisconnected = true;
            } catch (e) {
              console.warn('⚠️ Error in device.disconnectAll (fallback):', e.message);
            }
          }
        }
      }
      
      // Clear active connection reference
      activeConnection.current = null;
      
    } catch (err) {
      console.warn('⚠️ Error in hangUp (ignored):', err.message);
      // Ensure we still try to disconnect via device
      if (device && typeof device.disconnectAll === 'function' && !callDisconnected) {
        try {
          device.disconnectAll();
          deviceDestroyed = true;
        } catch (e) {
          console.warn('⚠️ Final fallback disconnect failed:', e.message);
        }
      }
    } finally {
      // Always update state regardless of disconnect success
      setIsConnected(false);
      setIsConnecting(false);
      localMediaStream.current = null;
      
      // Unregister device if not destroyed (using public API only)
      if (device && !deviceDestroyed && typeof device.unregister === 'function') {
        try {
          // Only use device.state (public API), not _state (internal)
          if (device.state && device.state !== 'destroyed') {
            console.log('🧹 Unregistering device after hangup');
            device.unregister();
          }
        } catch (e) {
          // Ignore - device might already be destroyed
          console.warn('⚠️ Error unregistering device (ignored):', e.message);
        }
      }
      
      // Reset cleanup flag after a delay
      setTimeout(() => {
        isCleaningUp.current = false;
      }, 1000);
      
      // Safely call callback
      try {
        onCallDisconnected && onCallDisconnected();
      } catch (callbackErr) {
        console.warn('Error in onCallDisconnected callback:', callbackErr);
        // Prevent error from propagating
      }
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

  return (
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
  );
});

export default WebCallInterface;
