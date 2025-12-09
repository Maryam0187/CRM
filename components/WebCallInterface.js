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
          // Don't request audio permissions during registration
          // Audio will be requested only when joining conference
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
          localMediaStream.current = null;
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
      
      // Request audio permissions ONLY when actually joining the call
      // This prevents unnecessary mic access when device is just registered
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
        // Release the test stream immediately - Twilio SDK will request its own
        stream.getTracks().forEach(track => track.stop());
      } catch (audioErr) {
        console.warn('⚠️ Audio permission request failed (Twilio SDK will request):', audioErr);
        // Continue anyway - Twilio SDK will request permissions
      }
      
      // Connect to conference (Twilio SDK 2.x returns a Promise)
      // Await the Promise to get the actual Call object
      const callPromise = deviceInstance.connect({ params });
      
      if (!callPromise) {
        throw new Error('Failed to create call');
      }

      // Await the Promise to get the Call object
      const call = await callPromise;
      
      if (!call) {
        throw new Error('Failed to get call object from promise');
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
            
            // Get and store media streams for mute functionality
            try {
              setTimeout(() => {
                const streams = getCallStreams();
                if (streams.local) {
                  localMediaStream.current = streams.local;
                  console.log('📞 Local media stream captured for mute');
                }
                console.log('📞 Media streams captured for mute');
              }, 500); // Wait a bit for streams to be ready
            } catch (err) {
              console.error('❌ Error capturing streams:', err);
            }
            
            onCallConnected && onCallConnected(call);
          });

          call.addEventListener('disconnect', () => {
            console.log('📞 Call disconnected');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
            localMediaStream.current = null; // Clear stored stream
            
            // Unregister device to stop heartbeat messages after call ends
            // Only if not already cleaning up (to prevent double cleanup)
            if (device && !isCleaningUp.current) {
              try {
                isCleaningUp.current = true;
                console.log('🧹 Unregistering device after call disconnect');
                device.unregister();
              } catch (e) {
                // Silently ignore - device might already be destroyed
              } finally {
                // Reset flag after a delay to allow for async operations
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
            
            // Get and store media streams for mute functionality
            try {
              setTimeout(() => {
                const streams = getCallStreams();
                if (streams.local) {
                  localMediaStream.current = streams.local;
                  console.log('📞 Local media stream captured for mute');
                }
                console.log('📞 Media streams captured for mute');
              }, 500); // Wait a bit for streams to be ready
            } catch (err) {
              console.error('❌ Error capturing streams:', err);
            }
            
            onCallConnected && onCallConnected(call);
          });

          call.on('disconnect', () => {
            console.log('📞 Call disconnected');
            setIsConnected(false);
            setIsConnecting(false);
            activeConnection.current = null;
            localMediaStream.current = null; // Clear stored stream
            
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
          // Check if call has status property (indicates it's a valid Call object)
          if (call.status) {
            console.log('📞 Call status before disconnect:', call.status);
          }
          
          // Try disconnect method (standard for SDK 2.x)
          if (typeof call.disconnect === 'function') {
            console.log('📞 Disconnecting call using call.disconnect()');
            call.disconnect();
            callDisconnected = true;
          }
        } catch (callErr) {
          // Ignore errors during disconnect - call might be in ringing state or not fully connected
          console.warn('⚠️ Error disconnecting call (ignored):', callErr.message);
        }
        
        activeConnection.current = null;
      }
      
      // Only use device.disconnectAll() as fallback if call.disconnect() failed or no active connection
      // Note: disconnectAll() destroys the device, so we won't unregister afterwards
      if (device && typeof device.disconnectAll === 'function' && !callDisconnected) {
        try {
          console.log('📞 Disconnecting all calls using device.disconnectAll() (fallback)');
          device.disconnectAll();
          deviceDestroyed = true; // Mark that device is destroyed
          isCleaningUp.current = true;
        } catch (e) {
          // Ignore errors - call might already be disconnected or in ringing state
          console.warn('⚠️ Error in device.disconnectAll (ignored):', e.message);
        }
      }
    } catch (err) {
      // Ignore all errors - call might be in any state (ringing, connecting, etc.)
      console.warn('⚠️ Error in hangUp (ignored):', err.message);
    } finally {
      // Always update state regardless of disconnect success
      setIsConnected(false);
      setIsConnecting(false);
      localMediaStream.current = null; // Clear stored stream
      
      // Unregister device to stop heartbeat messages after hangup
      // Only if device wasn't destroyed by disconnectAll() and not already cleaning up
      // Add a small delay to let disconnect operations complete first
      if (device && !deviceDestroyed && !isCleaningUp.current) {
        setTimeout(() => {
          try {
            isCleaningUp.current = true;
            // Check if device is already destroyed before trying to unregister
            if (device && typeof device.unregister === 'function') {
              // Check device state if available
              const deviceState = device.state || (device._state ? device._state() : null);
              if (deviceState !== 'destroyed') {
                console.log('🧹 Unregistering device after hangup');
                device.unregister();
              }
            }
          } catch (e) {
            // Silently ignore - device might already be destroyed or unregistered
            // These errors are harmless and expected during cleanup
          } finally {
            // Reset flag after cleanup completes
            setTimeout(() => {
              isCleaningUp.current = false;
            }, 1000);
          }
        }, 100); // Small delay to let disconnect complete
      }
      
      onCallDisconnected && onCallDisconnected();
    }
  };

  // Get media streams from the call - simplified approach
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

  // Mute/Unmute functionality - disable/enable local audio tracks
  const mute = async () => {
    try {
      if (!activeConnection.current || !isConnected) {
        console.warn('⚠️ Cannot mute: call not connected');
        return false;
      }

      if (!device) {
        console.warn('⚠️ Cannot mute: device not ready');
        return false;
      }

      const call = activeConnection.current;
      let muted = false;

      console.log('🔇 Attempting to mute call...');
      console.log('📞 Call object:', call);
      console.log('📞 Call object keys:', Object.keys(call || {}));
      
      // Log all properties (including non-enumerable) for debugging
      if (call) {
        const allProps = [];
        let obj = call;
        while (obj && obj !== Object.prototype) {
          allProps.push(...Object.getOwnPropertyNames(obj));
          obj = Object.getPrototypeOf(obj);
        }
        console.log('📞 All call properties:', [...new Set(allProps)].filter(p => !p.startsWith('__')));
        
        // Log specific properties that might contain peer connection
        console.log('📞 call._peerConnection:', call._peerConnection);
        console.log('📞 call._pc:', call._pc);
        console.log('📞 call.connection:', call.connection);
        console.log('📞 call._connection:', call._connection);
        console.log('📞 call._signaling:', call._signaling);
        console.log('📞 call._mediaStream:', call._mediaStream);
        console.log('📞 call._localStream:', call._localStream);
      }

      // Method 1: Try to access peer connection through call's internal properties
      // Twilio SDK 2.x stores peer connection in various places
      let pc = null;
      
      // Try all possible ways to get peer connection from the call object
      const pcGetters = [
        () => call.getPeerConnection?.(),
        () => call._peerConnection,
        () => call._pc,
        () => call.peerConnection,
        () => call.connection?.getPeerConnection?.(),
        () => call.connection?._peerConnection,
        () => call.connection?._pc,
        () => call._signaling?.getPeerConnection?.(),
        () => call._signaling?._peerConnection,
        // Try accessing through device's internal state
        () => {
          try {
            if (device._calls && device._calls instanceof Map && device._calls.size > 0) {
              const deviceCall = Array.from(device._calls.values())[0];
              return deviceCall?._peerConnection || deviceCall?._pc || deviceCall?.getPeerConnection?.();
            }
          } catch (e) {
            return null;
          }
        },
        // Try accessing through device's connection manager
        () => {
          try {
            if (device._connectionManager) {
              const connections = device._connectionManager._connections;
              if (connections && connections.size > 0) {
                const conn = Array.from(connections.values())[0];
                return conn?._peerConnection || conn?._pc || conn?.getPeerConnection?.();
              }
            }
          } catch (e) {
            return null;
          }
        },
        // Try accessing through device's signaling
        () => {
          try {
            if (device._signaling) {
              return device._signaling._peerConnection || device._signaling.getPeerConnection?.();
            }
          } catch (e) {
            return null;
          }
        }
      ];
      
      for (const getter of pcGetters) {
        try {
          const result = getter();
          if (result && result.getSenders) {
            pc = result;
            console.log('✅ Got peer connection via:', getter.toString().substring(0, 80));
            break;
          }
        } catch (e) {
          // Continue trying
        }
      }

      // Method 1: Mute via peer connection senders (most reliable)
      if (pc) {
        try {
          const senders = pc.getSenders();
          console.log('📞 Found', senders.length, 'senders in peer connection');
          
          senders.forEach((sender) => {
            if (sender.track && sender.track.kind === 'audio') {
              console.log('🔇 Muting sender track:', sender.track.id);
              sender.track.enabled = false;
              muted = true;
            }
          });
          
          if (muted) {
            setIsMuted(true);
            console.log('✅ Call muted via peer connection senders');
            return true;
          }
        } catch (err) {
          console.warn('⚠️ Error accessing senders:', err);
        }
      }

      // Method 2: Try to use stored local media stream (most reliable if available)
      if (!muted && localMediaStream.current) {
        try {
          const tracks = localMediaStream.current.getAudioTracks();
          if (tracks.length > 0) {
            console.log('📞 Found', tracks.length, 'audio tracks in stored local stream');
            tracks.forEach(track => {
              console.log('🔇 Muting track:', track.id);
              track.enabled = false;
              muted = true;
            });
            if (muted) {
              setIsMuted(true);
              console.log('✅ Call muted via stored local media stream');
              return true;
            }
          }
        } catch (err) {
          console.warn('⚠️ Error accessing stored local media stream:', err);
        }
      }

      // Method 3: Try to access audio tracks directly from call's media stream
      if (!muted) {
        try {
          // Try multiple ways to get the media stream
          const streamGetters = [
            () => call.getLocalStream?.(),
            () => call._localStream,
            () => call._mediaStream,
            () => call.mediaStream,
            () => call.stream,
            () => call.connection?.getLocalStream?.(),
            () => call.connection?._localStream,
          ];
          
          for (const getter of streamGetters) {
            try {
              const stream = getter();
              if (stream && stream.getAudioTracks) {
                const tracks = stream.getAudioTracks();
                if (tracks.length > 0) {
                  console.log('📞 Found', tracks.length, 'audio tracks in stream');
                  // Store it for future use
                  localMediaStream.current = stream;
                  tracks.forEach(track => {
                    console.log('🔇 Muting track:', track.id);
                    track.enabled = false;
                    muted = true;
                  });
                  if (muted) {
                    setIsMuted(true);
                    console.log('✅ Call muted via call media stream');
                    return true;
                  }
                }
              }
            } catch (e) {
              // Continue trying
            }
          }
        } catch (err) {
          console.warn('⚠️ Error accessing call media stream:', err);
        }
      }

      // Method 4: Try getCallStreams helper
      if (!muted) {
        try {
          const { local } = getCallStreams();
          if (local && local.getAudioTracks().length > 0) {
            local.getAudioTracks().forEach(track => {
              console.log('🔇 Muting track:', track.id);
              track.enabled = false;
            });
            setIsMuted(true);
            muted = true;
            console.log('✅ Call muted by disabling audio tracks from getCallStreams');
            return true;
          }
        } catch (err) {
          console.warn('⚠️ Error using getCallStreams:', err);
        }
      }

      // Method 5: Try direct mute method (if available in SDK)
      if (!muted && typeof call.mute === 'function') {
        try {
          call.mute(true);
          setIsMuted(true);
          muted = true;
          console.log('✅ Call muted using call.mute(true)');
          return true;
        } catch (err) {
          console.warn('⚠️ call.mute() failed:', err);
        }
      }

      // Method 6: Try accessing call's internal connection manager
      if (!muted) {
        try {
          // Try to access through call's internal connection
          if (call._connection) {
            const connection = call._connection;
            const connectionPc = connection._peerConnection || connection._pc || connection.getPeerConnection?.();
            if (connectionPc) {
              const senders = connectionPc.getSenders();
              senders.forEach((sender) => {
                if (sender.track && sender.track.kind === 'audio') {
                  sender.track.enabled = false;
                  muted = true;
                }
              });
              if (muted) {
                setIsMuted(true);
                console.log('✅ Call muted via call._connection peer connection');
                return true;
              }
            }
          }
        } catch (err) {
          console.warn('⚠️ Error accessing call._connection:', err);
        }
      }

      if (!muted) {
        console.error('❌ Cannot mute: no method available');
        console.error('📞 Call object details:', {
          hasDevice: !!device,
          hasActiveConnection: !!activeConnection.current,
          hasPeerConnection: !!pc,
          callKeys: Object.keys(call || {}),
          callType: typeof call,
          deviceCallsSize: device ? (device.calls?.size || device.activeCalls?.size || device._calls?.size || 0) : 0
        });
        setError('Unable to mute call. Please try again.');
        return false;
      }

      return true;
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

      if (!device) {
        console.warn('⚠️ Cannot unmute: device not ready');
        return false;
      }

      const call = activeConnection.current;
      let unmuted = false;

      console.log('🔊 Attempting to unmute call...');

      // Method 1: Try to use stored local media stream (most reliable if available)
      if (localMediaStream.current) {
        try {
          const tracks = localMediaStream.current.getAudioTracks();
          if (tracks.length > 0) {
            console.log('📞 Found', tracks.length, 'audio tracks in stored local stream');
            tracks.forEach(track => {
              console.log('🔊 Unmuting track:', track.id);
              track.enabled = true;
              unmuted = true;
            });
            if (unmuted) {
              setIsMuted(false);
              console.log('✅ Call unmuted via stored local media stream');
              return true;
            }
          }
        } catch (err) {
          console.warn('⚠️ Error accessing stored local media stream:', err);
        }
      }

      // Try to get call from device first
      let deviceCall = null;
      try {
        let deviceCalls = null;
        if (device.calls && device.calls instanceof Map) {
          deviceCalls = device.calls;
        } else if (device.activeCalls && device.activeCalls instanceof Map) {
          deviceCalls = device.activeCalls;
        } else if (device._calls && device._calls instanceof Map) {
          deviceCalls = device._calls;
        } else if (typeof device.getCalls === 'function') {
          deviceCalls = device.getCalls();
        }
        
        if (deviceCalls && deviceCalls.size > 0) {
          deviceCall = Array.from(deviceCalls.values())[0];
        }
      } catch (err) {
        console.warn('⚠️ Error accessing device calls:', err);
      }

      // Use device call if available, otherwise use activeConnection
      const callToUnmute = deviceCall || call;
      
      // Try to get peer connection
      let pc = null;
      
      if (deviceCall) {
        if (typeof deviceCall.getPeerConnection === 'function') {
          try {
            pc = deviceCall.getPeerConnection();
          } catch (e) {
            console.warn('⚠️ getPeerConnection() failed:', e);
          }
        }
        
        if (!pc) {
          pc = deviceCall._peerConnection || 
               deviceCall._pc || 
               deviceCall.peerConnection ||
               deviceCall.connection?._peerConnection ||
               null;
        }
      }
      
      if (!pc) {
        pc = call._peerConnection || call._pc || call.peerConnection || null;
      }

      // Method 1: Unmute via peer connection senders
      if (pc) {
        try {
          const senders = pc.getSenders();
          console.log('📞 Found', senders.length, 'senders');
          
          senders.forEach((sender) => {
            if (sender.track && sender.track.kind === 'audio') {
              console.log('🔊 Unmuting sender track:', sender.track.id);
              sender.track.enabled = true;
              unmuted = true;
            }
          });
          
          if (unmuted) {
            setIsMuted(false);
            console.log('✅ Call unmuted via peer connection senders');
            return true;
          }
        } catch (err) {
          console.warn('⚠️ Error accessing senders:', err);
        }
      }

      // Method 2: Try getCallStreams helper
      if (!unmuted) {
        try {
          const { local } = getCallStreams();
          if (local && local.getAudioTracks().length > 0) {
            local.getAudioTracks().forEach(track => {
              console.log('🔊 Unmuting track:', track.id);
              track.enabled = true;
            });
            setIsMuted(false);
            unmuted = true;
            console.log('✅ Call unmuted by enabling audio tracks from getCallStreams');
            return true;
          }
        } catch (err) {
          console.warn('⚠️ Error using getCallStreams:', err);
        }
      }

      // Method 3: Try direct unmute method
      if (!unmuted && typeof callToUnmute.mute === 'function') {
        try {
          callToUnmute.mute(false);
          setIsMuted(false);
          unmuted = true;
          console.log('✅ Call unmuted using call.mute(false)');
          return true;
        } catch (err) {
          console.warn('⚠️ call.mute(false) failed:', err);
        }
      }

      if (!unmuted) {
        console.error('❌ Cannot unmute: no method available');
        setError('Unable to unmute call. Please try again.');
        return false;
      }

      return true;
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
