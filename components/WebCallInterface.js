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
  const activeConnection = useRef(null);

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

  useEffect(() => {
    if (!conferenceName || !user) return;

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
          logLevel: 0, // Reduce log level to suppress warnings
          codecPreferences: ['opus', 'pcmu'],
          // Suppress insights errors
          allowIncomingWhileBusy: false,
          // Enable audio immediately
          enableRTCStats: false,
          // Optimize for faster connection
          closeProtection: false,
        });
        
        // Suppress console warnings for insights errors
        const originalWarn = console.warn;
        const originalError = console.error;
        
        // Filter out Twilio insights warnings
        console.warn = (...args) => {
          const message = args.join(' ');
          if (!message.includes('Cannot connect to insights') && 
              !message.includes('Unable to post') &&
              !message.includes('Failed to fetch')) {
            originalWarn.apply(console, args);
          }
        };
        
        console.error = (...args) => {
          const message = args.join(' ');
          if (!message.includes('Cannot connect to insights') && 
              !message.includes('Unable to post') &&
              !message.includes('Failed to fetch')) {
            originalError.apply(console, args);
          }
        };
        
        // Restore console methods when device is destroyed
        twilioDevice.on('destroyed', () => {
          console.warn = originalWarn;
          console.error = originalError;
        });

        twilioDevice.on('registered', () => {
          console.log('✅ Twilio Device registered');
          setDevice(twilioDevice);
          setError(null);
          // Auto-join conference IMMEDIATELY when device is registered (no delay)
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
        try {
          device.unregister();
          device.destroy();
        } catch (e) {
          console.error('Error cleaning up device:', e);
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
      
      // Request audio permissions IMMEDIATELY before connecting (non-blocking)
      // This ensures audio is ready when connection is established (reduces delay)
      const audioPermissionPromise = navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }, 
        video: false 
      }).then(stream => {
        console.log('✅ Audio permissions granted immediately');
        // Keep stream active briefly to ensure permissions are set
        // Twilio SDK will use these permissions
        setTimeout(() => {
          stream.getTracks().forEach(track => track.stop());
          console.log('📞 Released test audio stream');
        }, 50); // Reduced from 100ms to 50ms
        return stream;
      }).catch(audioErr => {
        console.warn('⚠️ Audio permission request failed (Twilio SDK will request):', audioErr);
        return null;
      });
      
      // Start audio permission request in parallel (don't wait)
      console.log('📞 Requesting audio permissions in parallel...');
      audioPermissionPromise.catch(() => {}); // Suppress unhandled promise rejection
      
      // Connect immediately - don't wait for audio permissions
      // Audio permissions will be ready by the time connection is established
      const call = deviceInstance.connect({ params });
      
      if (!call) {
        throw new Error('Failed to create call');
      }

      console.log('📞 Call object created:', call);
      console.log('📞 Call object type:', typeof call);
      if (call && typeof call === 'object') {
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(call)).filter(name => 
          name !== 'constructor' && typeof call[name] === 'function'
        );
        console.log('📞 Call object methods:', methods);
        console.log('📞 Call.hasDisconnect?', 'disconnect' in call);
        console.log('📞 Call.hasHangup?', 'hangup' in call);
      }
      
      activeConnection.current = call;

      // SDK 2.x Call object - check available methods
      if (call && typeof call === 'object') {
        // Try to attach event listeners using the available method
        if (typeof call.addEventListener === 'function') {
          console.log('📞 Using addEventListener for events');
          
          call.addEventListener('accept', () => {
            console.log('✅ Call accepted - connected to conference');
            setIsConnected(true);
            setIsConnecting(false);
            
            // Ensure audio is enabled and playing
            try {
              // The call object should automatically handle audio, but we can verify
              console.log('📞 Call accepted, audio should be active');
            } catch (err) {
              console.error('❌ Error enabling audio:', err);
            }
            
            onCallConnected && onCallConnected(call);
          });

          call.addEventListener('disconnect', () => {
            console.log('📞 Call disconnected');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
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
          });

          call.addEventListener('reject', () => {
            console.error('❌ Call rejected');
            setError('Call was rejected. Please check TwiML App Voice URL configuration.');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
          });
        } else if (typeof call.on === 'function') {
          console.log('📞 Using .on() for events');
          
          call.on('accept', () => {
            console.log('✅ Call accepted - connected to conference');
            setIsConnected(true);
            setIsConnecting(false);
            onCallConnected && onCallConnected(call);
          });

          call.on('disconnect', () => {
            console.log('📞 Call disconnected');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
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
          });

          call.on('reject', () => {
            console.error('❌ Call rejected');
            setError('Call was rejected. Please check TwiML App Voice URL configuration.');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
          });
        } else {
          console.warn('⚠️ Call object does not support event listeners');
          console.warn('📞 Call object:', call);
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
    
    try {
      if (activeConnection.current) {
        const call = activeConnection.current;
        
        // SDK 2.x - Call object should have disconnect() method
        // But we'll try multiple approaches in case the call is in an error state
        if (call) {
          // Check if call has status property (indicates it's a valid Call object)
          if (call.status) {
            console.log('📞 Call status before disconnect:', call.status);
          }
          
          // Try disconnect method (standard for SDK 2.x)
          if (typeof call.disconnect === 'function') {
            console.log('📞 Disconnecting call using call.disconnect()');
            call.disconnect();
          } 
          // Fallback: try device disconnectAll
          else if (device && typeof device.disconnectAll === 'function') {
            console.log('📞 Disconnecting all calls using device.disconnectAll()');
            device.disconnectAll();
          }
          // If call is already disconnected/errored, just clear the reference
          else {
            console.log('📞 Call object exists but no disconnect method available - clearing reference');
          }
        }
        
        activeConnection.current = null;
      }
      
      // Also try device-level disconnect if available
      if (device && typeof device.disconnectAll === 'function') {
        try {
          device.disconnectAll();
        } catch (e) {
          // Ignore errors - call might already be disconnected
        }
      }
    } catch (err) {
      console.error('❌ Error in hangUp:', err);
    } finally {
      // Always update state regardless of disconnect success
      setIsConnected(false);
      setIsConnecting(false);
      onCallDisconnected && onCallDisconnected();
    }
  };

  // Expose hangUp method via ref
  useImperativeHandle(ref, () => ({
    hangUp
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
