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
  const isCleaningUp = useRef(false); // Track if device cleanup is in progress

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
      // Clean up device if conferenceName or user is removed
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
          logLevel: 1, // Set to 1 to reduce verbose logging (0 = silent, 1 = errors only)
          codecPreferences: ['opus', 'pcmu'],
          allowIncomingWhileBusy: false,
          enableRTCStats: false,
          closeProtection: false,
        });
        
        // Suppress console warnings for insights errors
        const originalWarn = console.warn;
        const originalError = console.error;
        
        // Helper function to check if message should be filtered
        const shouldFilterMessage = (message) => {
          const lowerMessage = message.toLowerCase();
          return lowerMessage.includes('cannot connect to insights') ||
                 lowerMessage.includes('unable to post') ||
                 (lowerMessage.includes('failed to fetch') && (lowerMessage.includes('insights') || lowerMessage.includes('eventpublisher'))) ||
                 (lowerMessage.includes('heartbeat') && lowerMessage.includes('wstransport')) ||
                 lowerMessage.includes('wstransport') ||
                 lowerMessage.includes('dtls-transport-state') ||
                 (lowerMessage.includes('connection disconnected') && lowerMessage.includes('insights')) ||
                 lowerMessage.includes('quality-metrics') ||
                 lowerMessage.includes('eventpublisher') ||
                 (lowerMessage.includes('insights') && (lowerMessage.includes('error') || lowerMessage.includes('failed'))) ||
                 (lowerMessage.includes('twiliovoice') && lowerMessage.includes('device') && (lowerMessage.includes('cannot') || lowerMessage.includes('failed')));
        };
        
        // Filter out Twilio insights warnings and errors
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
        
        // Keep filtering active even after device is destroyed
        // Don't restore console methods immediately - SDK may still send async insights
        twilioDevice.on('destroyed', () => {
          // Delay restoration to allow async SDK operations to complete
          setTimeout(() => {
            // Only restore if this device instance is still the current device
            // This prevents restoring when a new device has been created
            if (device === twilioDevice) {
              console.warn = originalWarn;
              console.error = originalError;
            }
          }, 2000); // Wait 2 seconds for async operations to complete
        });

        twilioDevice.on('registered', () => {
          console.log('✅ Twilio Device registered');
          setDevice(twilioDevice);
          setError(null);
          // Auto-join conference IMMEDIATELY when device is registered
          // This ensures agent is in conference BEFORE customer answers
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
          // Reject unexpected incoming calls
          call.reject();
        });

        twilioDevice.on('tokenWillExpire', async () => {
          console.log('🔄 Token expiring, refreshing...');
          const newToken = await fetchToken();
          if (newToken) {
            twilioDevice.updateToken(newToken);
          }
        });

        // Register device (this will connect to Twilio but won't request mic yet)
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
          // Disconnect any active calls first
          if (activeConnection.current) {
            try {
              // Try to disconnect the call
              if (typeof activeConnection.current.disconnect === 'function') {
                activeConnection.current.disconnect();
              }
            } catch (e) {
              // Ignore disconnect errors - call might already be disconnected
            }
            activeConnection.current = null;
          }
          
          // Try to disconnect all calls on device
          try {
            if (typeof device.disconnectAll === 'function') {
              device.disconnectAll();
            }
          } catch (e) {
            // Ignore - might already be disconnected
          }
          
          // Unregister and destroy device (with error handling)
          try {
            if (device && typeof device.unregister === 'function') {
              device.unregister();
            }
          } catch (e) {
            // Ignore unregister errors
          }
          
          try {
            if (device && typeof device.destroy === 'function') {
              device.destroy();
            }
          } catch (e) {
            // Ignore destroy errors - device might already be destroyed
          }
          
          setDevice(null);
          setIsConnected(false);
          setIsConnecting(false);
        } catch (e) {
          // Ignore all cleanup errors
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
      
      // Use TwiML App to connect to conference
      const params = {
        To: conferenceName
      };

      console.log('📞 Connecting with params:', params);
      
      // Request microphone permissions explicitly before connecting
      try {
        console.log('🎤 Requesting microphone permissions...');
        
        // Check current permission status
        if (navigator.permissions && navigator.permissions.query) {
          const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
          console.log('🎤 Current microphone permission:', permissionStatus.state);
          
          if (permissionStatus.state === 'denied') {
            setError('Microphone access is denied. Please enable microphone access in your browser settings and try again.');
            setIsConnecting(false);
            return;
          }
        }
        
        // Request microphone permission explicitly
        const stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }, 
          video: false 
        });
        
        console.log('✅ Microphone permission granted');
        
        // Stop the test stream immediately - Twilio SDK will request its own stream
        stream.getTracks().forEach(track => {
          track.stop();
        });
        
      } catch (audioErr) {
        console.error('❌ Microphone permission request failed:', audioErr);
        
        // Handle different error types
        if (audioErr.name === 'NotAllowedError' || audioErr.name === 'PermissionDeniedError') {
          setError('Microphone access was denied. Please allow microphone access in your browser settings and refresh the page.');
        } else if (audioErr.name === 'NotFoundError' || audioErr.name === 'DevicesNotFoundError') {
          setError('No microphone found. Please connect a microphone and try again.');
        } else if (audioErr.name === 'NotReadableError' || audioErr.name === 'TrackStartError') {
          setError('Microphone is being used by another application. Please close other applications using the microphone and try again.');
        } else {
          setError(`Microphone access error: ${audioErr.message || 'Please check your microphone settings and try again.'}`);
        }
        
        setIsConnecting(false);
        return;
      }
      
      // Connect to conference - Twilio SDK will handle all audio automatically
      // SDK 2.x returns a Promise
      const callPromise = deviceInstance.connect({ params });
      
      if (!callPromise) {
        throw new Error('Failed to create call');
      }

      // Await the Promise to get the actual Call object
      const call = await callPromise;
      
      if (!call) {
        throw new Error('Failed to get call object from promise');
      }

      console.log('📞 Call object created:', call);
      activeConnection.current = call;

      // SDK 2.x Call object - attach event listeners
      if (call && typeof call === 'object') {
        // Try to attach event listeners using the available method
        if (typeof call.addEventListener === 'function') {
          console.log('📞 Using addEventListener for events');
          
          call.addEventListener('accept', () => {
            console.log('✅ Call accepted - connected to conference');
            setIsConnected(true);
            setIsConnecting(false);
            // Twilio SDK handles all audio automatically - no manual intervention needed
            onCallConnected && onCallConnected(call);
          });

          call.addEventListener('disconnect', () => {
            console.log('📞 Call disconnected');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
            
            // Unregister device to stop heartbeat messages after call ends
            if (device && !isCleaningUp.current) {
              try {
                isCleaningUp.current = true;
                console.log('🧹 Unregistering device after call disconnect');
                device.unregister();
              } catch (e) {
                // Silently ignore - device might already be destroyed
              } finally {
                setTimeout(() => {
                  isCleaningUp.current = false;
                }, 1000);
              }
            }
            
            onCallDisconnected && onCallDisconnected();
          });

          call.addEventListener('error', (err) => {
            console.error('❌ Call error:', err);
            const errorCode = err?.code || err?.twilioError?.code;
            const errorMessage = err?.message || err?.twilioError?.message || 'Unknown error';
            
            // Handle specific error codes
            if (errorCode === 31603 || errorMessage.includes('Decline')) {
              setError('Call was declined by Twilio. Please check TwiML App configuration in Twilio Console.');
            } else if (errorCode === 31005) {
              setError('Connection error. Please check your internet connection and try again.');
            } else {
              setError(`Call error: ${errorMessage} (Code: ${errorCode || 'N/A'})`);
            }
            
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
            
            // Unregister device to stop heartbeat messages after call error
            if (device) {
              try {
                console.log('🧹 Unregistering device after call error');
                device.unregister();
              } catch (e) {
                console.warn('⚠️ Error unregistering device (ignored):', e.message);
              }
            }
          });

          call.addEventListener('reject', () => {
            console.error('❌ Call rejected');
            setError('Call was rejected. Please check TwiML App Voice URL configuration.');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
            
            // Unregister device to stop heartbeat messages after call rejection
            if (device) {
              try {
                console.log('🧹 Unregistering device after call rejection');
                device.unregister();
              } catch (e) {
                console.warn('⚠️ Error unregistering device (ignored):', e.message);
              }
            }
          });
        } else if (typeof call.on === 'function') {
          console.log('📞 Using .on() for events');
          
          call.on('accept', () => {
            console.log('✅ Call accepted - connected to conference');
            setIsConnected(true);
            setIsConnecting(false);
            // Twilio SDK handles all audio automatically - no manual intervention needed
            onCallConnected && onCallConnected(call);
          });

          call.on('disconnect', () => {
            console.log('📞 Call disconnected');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
            
            // Unregister device to stop heartbeat messages after call ends
            if (device) {
              try {
                console.log('🧹 Unregistering device after call disconnect');
                device.unregister();
              } catch (e) {
                console.warn('⚠️ Error unregistering device (ignored):', e.message);
              }
            }
            
            onCallDisconnected && onCallDisconnected();
          });

          call.on('error', (err) => {
            console.error('❌ Call error:', err);
            const errorCode = err?.code || err?.twilioError?.code;
            const errorMessage = err?.message || err?.twilioError?.message || 'Unknown error';
            
            // Handle specific error codes
            if (errorCode === 31603 || errorMessage.includes('Decline')) {
              setError('Call was declined by Twilio. Please check TwiML App configuration in Twilio Console.');
            } else if (errorCode === 31005) {
              setError('Connection error. Please check your internet connection and try again.');
            } else {
              setError(`Call error: ${errorMessage} (Code: ${errorCode || 'N/A'})`);
            }
            
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
            
            // Unregister device to stop heartbeat messages after call error
            if (device) {
              try {
                console.log('🧹 Unregistering device after call error');
                device.unregister();
              } catch (e) {
                console.warn('⚠️ Error unregistering device (ignored):', e.message);
              }
            }
          });

          call.on('reject', () => {
            console.error('❌ Call rejected');
            setError('Call was rejected. Please check TwiML App Voice URL configuration.');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
            
            // Unregister device to stop heartbeat messages after call rejection
            if (device) {
              try {
                console.log('🧹 Unregistering device after call rejection');
                device.unregister();
              } catch (e) {
                console.warn('⚠️ Error unregistering device (ignored):', e.message);
              }
            }
          });
        } else {
          console.warn('⚠️ Call object does not support event listeners');
          // Set connected after a delay as fallback
          setTimeout(() => {
            console.log('📞 Setting connected state (fallback)');
            setIsConnected(true);
            setIsConnecting(false);
            onCallConnected && onCallConnected(call);
          }, 2000);
        }
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
    console.log('📞 hangUp called');
    
    // Prevent double cleanup
    if (isCleaningUp.current) {
      console.log('⚠️ Cleanup already in progress, skipping');
      return;
    }
    
    let deviceDestroyed = false;
    let callDisconnected = false;
    
    try {
      // Try to disconnect active connection if it exists
      if (activeConnection.current) {
        const call = activeConnection.current;
        
        try {
          // Try disconnect method (standard for SDK 2.x)
          if (typeof call.disconnect === 'function') {
            console.log('📞 Disconnecting call using call.disconnect()');
            call.disconnect();
            callDisconnected = true;
          }
        } catch (callErr) {
          // Ignore errors during disconnect
          console.warn('⚠️ Error disconnecting call (ignored):', callErr.message);
        }
        
        activeConnection.current = null;
      }
      
      // Only use device.disconnectAll() as fallback if call.disconnect() failed
      if (device && typeof device.disconnectAll === 'function' && !callDisconnected) {
        try {
          console.log('📞 Disconnecting all calls using device.disconnectAll() (fallback)');
          device.disconnectAll();
          deviceDestroyed = true;
          isCleaningUp.current = true;
        } catch (e) {
          console.warn('⚠️ Error in device.disconnectAll (ignored):', e.message);
        }
      }
    } catch (err) {
      console.warn('⚠️ Error in hangUp (ignored):', err.message);
    } finally {
      // Always update state regardless of disconnect success
      setIsConnected(false);
      setIsConnecting(false);
      
      // Unregister device to stop heartbeat messages after hangup
      if (device && !deviceDestroyed && !isCleaningUp.current) {
        setTimeout(() => {
          try {
            isCleaningUp.current = true;
            if (device && typeof device.unregister === 'function') {
              const deviceState = device.state || (device._state ? device._state() : null);
              if (deviceState !== 'destroyed') {
                console.log('🧹 Unregistering device after hangup');
                device.unregister();
              }
            }
          } catch (e) {
            // Silently ignore
          } finally {
            setTimeout(() => {
              isCleaningUp.current = false;
            }, 1000);
          }
        }, 100);
      }
      
      onCallDisconnected && onCallDisconnected();
    }
  };

  // Mute/Unmute functionality - use SDK's built-in methods
  const mute = async () => {
    try {
      if (!activeConnection.current || !isConnected) {
        console.warn('⚠️ Cannot mute: call not connected');
        return false;
      }

      const call = activeConnection.current;

      // Use SDK's built-in mute method if available
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

      console.error('❌ Cannot mute: SDK mute method not available');
      setError('Unable to mute call. Mute functionality may not be supported.');
      return false;
    } catch (err) {
      console.error('❌ Error muting call:', err);
      setError('Failed to mute call. Please try again.');
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

      // Use SDK's built-in unmute method if available
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

      console.error('❌ Cannot unmute: SDK mute method not available');
      setError('Unable to unmute call. Unmute functionality may not be supported.');
      return false;
    } catch (err) {
      console.error('❌ Error unmuting call:', err);
      setError('Failed to unmute call. Please try again.');
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
