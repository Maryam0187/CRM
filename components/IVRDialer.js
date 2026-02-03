'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useCall } from '../contexts/CallContext';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import IVRDialerModal from './IVRDialerModal';
import apiClient from '../lib/apiClient';
import { Device } from '@twilio/voice-sdk';

// Global callbacks to open IVR dialer from anywhere
let openDialerCallbacks = new Set();

export function openIVRDialer() {
  openDialerCallbacks.forEach(callback => callback());
}

export default function IVRDialer() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const { showWebInterface } = useCall(); // Only for positioning, not call management
  const { user } = useAuth();
  const { getCallStatus } = useSocket(); // For real-time status updates

  // IVR Call State Management
  const [ivrCallState, setIvrCallState] = useState({
    isCalling: false,
    isConnected: false,
    isConnecting: false,
    currentCall: null,
    callSid: null,
    conferenceName: null,
    phoneNumber: null,
    callStatus: null, // 'queued', 'ringing', 'in-progress', 'completed', etc.
    isMuted: false,
    error: null,
    callTimer: 0
  });

  // Timer ref for call duration
  const timerIntervalRef = useRef(null);
  
  // Twilio Device state for IVR
  const [ivrDevice, setIvrDevice] = useState(null);
  const ivrActiveConnection = useRef(null);
  const ivrLocalMediaStream = useRef(null);
  const isIvrCleaningUp = useRef(false);
  const isIvrDeviceSettingUp = useRef(false);

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

  // Start call timer
  const startIVRTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    
    setIvrCallState(prev => ({ ...prev, callTimer: 0 }));
    
    timerIntervalRef.current = setInterval(() => {
      setIvrCallState(prev => ({
        ...prev,
        callTimer: prev.callTimer + 1
      }));
    }, 1000);
  }, []);

  // Stop call timer
  const stopIVRTimer = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  // Helper function to safely cleanup device
  const safelyCleanupDevice = useCallback((device) => {
    if (!device) return;

    try {
      const deviceState = device.state || device._state;
      
      // Only unregister if device is registered
      if (deviceState === 'registered') {
        if (typeof device.unregister === 'function') {
          device.unregister().catch(err => {
            // Ignore errors if device is already unregistered or destroyed
            if (!err.message?.includes('destroyed') && !err.message?.includes('unregistered')) {
              console.warn('⚠️ [IVR] Error unregistering device:', err);
            }
          });
        }
      } else {
        console.log('📞 [IVR] Skipping unregister - device state:', deviceState);
      }

      // Always try to destroy, but handle errors gracefully
      if (typeof device.destroy === 'function') {
        try {
          device.destroy();
        } catch (destroyErr) {
          // Ignore errors if device is already destroyed
          if (!destroyErr.message?.includes('destroyed')) {
            console.warn('⚠️ [IVR] Error destroying device:', destroyErr);
          }
        }
      }
    } catch (e) {
      console.warn('⚠️ [IVR] Error during device cleanup:', e);
    }
  }, []);

  // Cleanup timer and device on unmount
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
      
      // Cleanup IVR device
      if (ivrDevice && !isIvrCleaningUp.current) {
        isIvrCleaningUp.current = true;
        setTimeout(() => {
          try {
            if (ivrActiveConnection.current) {
              ivrActiveConnection.current.disconnect();
              ivrActiveConnection.current = null;
            }
            safelyCleanupDevice(ivrDevice);
          } catch (e) {
            console.warn('⚠️ [IVR] Error during device cleanup (ignored):', e.message);
          }
          setIvrDevice(null);
          ivrLocalMediaStream.current = null;
          isIvrCleaningUp.current = false;
        }, 300);
      }
    };
  }, [ivrDevice, safelyCleanupDevice]);

  // Start timer when call status becomes 'in-progress'
  useEffect(() => {
    if (ivrCallState.callStatus === 'in-progress' && !timerIntervalRef.current) {
      console.log('⏱️ [IVR] Starting call timer - call is in progress');
      startIVRTimer();
    }
    
    // Stop timer when call ends
    const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
    if (ivrCallState.callStatus && endedStatuses.includes(ivrCallState.callStatus)) {
      console.log('⏱️ [IVR] Stopping call timer - call ended');
      stopIVRTimer();
    }
  }, [ivrCallState.callStatus, startIVRTimer, stopIVRTimer]);

  const handleClose = () => {
    setIsOpen(false);
    setIsMinimized(false);
  };

  const handleMinimize = (minimize) => {
    setIsMinimized(minimize);
  };

  // Handle sending DTMF digits during an active call
  const handleSendDigits = useCallback((digits, callId) => {
    if (!digits || !digits.trim()) {
      console.warn('⚠️ [IVR] No digits provided to send');
      setIvrCallState(prev => ({
        ...prev,
        error: 'No digits to send'
      }));
      return;
    }

    // Check if there's an active connection
    if (!ivrActiveConnection.current) {
      console.warn('⚠️ [IVR] No active connection to send digits');
      setIvrCallState(prev => ({
        ...prev,
        error: 'No active call to send digits to'
      }));
      return;
    }

    // Check if call is connected
    if (!ivrCallState.isConnected && ivrCallState.callStatus !== 'in-progress') {
      console.warn('⚠️ [IVR] Call is not connected, cannot send digits');
      setIvrCallState(prev => ({
        ...prev,
        error: 'Call must be connected to send digits'
      }));
      return;
    }

    try {
      const call = ivrActiveConnection.current;
      const digitsToSend = digits.trim();

      // Validate digits (only allow DTMF characters: 0-9, *, #)
      const validDigits = /^[0-9*#]+$/.test(digitsToSend);
      if (!validDigits) {
        console.warn('⚠️ [IVR] Invalid DTMF digits:', digitsToSend);
        setIvrCallState(prev => ({
          ...prev,
          error: 'Invalid digits. Only 0-9, *, and # are allowed.'
        }));
        return;
      }

      // Check if sendDigits method exists on the call object
      if (typeof call.sendDigits !== 'function') {
        console.warn('⚠️ [IVR] sendDigits method not available on call object');
        setIvrCallState(prev => ({
          ...prev,
          error: 'Send digits not supported in this call state'
        }));
        return;
      }

      // Send the digits
      call.sendDigits(digitsToSend);
      
      console.log(`✅ [IVR] Sent DTMF digits: ${digitsToSend}`);
      
      // Clear any previous errors
      setIvrCallState(prev => ({
        ...prev,
        error: null
      }));

      // Optional: Show success feedback (you can add a toast notification here)
      // The UI will handle clearing the enteredDigits in IVRDialerModal

    } catch (error) {
      console.error('❌ [IVR] Error sending DTMF digits:', error);
      setIvrCallState(prev => ({
        ...prev,
        error: error.message || 'Failed to send digits'
      }));
    }
  }, [ivrCallState.isConnected, ivrCallState.callStatus]);

  // Fetch Twilio token for IVR
  const fetchIVRToken = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/twilio/token');
      if (!response) {
        throw new Error('No response from server');
      }
      
      const data = await response.json();
      
      if (data?.success && data?.token) {
        return data.token;
      } else {
        const errorMsg = data?.error || 'Failed to fetch Twilio token';
        console.error('❌ [IVR] Token fetch unsuccessful:', errorMsg);
        setIvrCallState(prev => ({ ...prev, error: errorMsg }));
        return null;
      }
    } catch (err) {
      console.error('❌ [IVR] Unexpected error fetching Twilio token:', err);
      setIvrCallState(prev => ({ 
        ...prev, 
        error: err?.message || 'An unexpected error occurred. Please try again.' 
      }));
      return null;
    }
  }, []);

  // Get IVR call streams for mute functionality
  const getIVRCallStreams = useCallback(() => {
    if (!ivrActiveConnection.current) {
      return { local: null, remote: null };
    }

    try {
      const call = ivrActiveConnection.current;
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
      console.error('❌ [IVR] Error getting call streams:', err);
      return { local: null, remote: null };
    }
  }, []);

  // Reset call state and cleanup device
  const resetIVRCallState = useCallback(() => {
    stopIVRTimer();
    
    // Disconnect active connection
    if (ivrActiveConnection.current) {
      try {
        ivrActiveConnection.current.disconnect();
      } catch (e) {
        console.warn('⚠️ [IVR] Error disconnecting on reset:', e);
      }
      ivrActiveConnection.current = null;
    }
    
    // Cleanup device if it exists (but don't set ivrDevice to null here to avoid infinite loops)
    // Device cleanup will be handled by the useEffect cleanup or explicit cleanup calls
    
    setIvrCallState({
      isCalling: false,
      isConnected: false,
      isConnecting: false,
      currentCall: null,
      callSid: null,
      conferenceName: null,
      phoneNumber: null,
      callStatus: null,
      isMuted: false,
      error: null,
      callTimer: 0
    });
    ivrLocalMediaStream.current = null;
  }, [stopIVRTimer]);

  // Join IVR conference
  const joinIVRConference = useCallback(async (deviceInstance, conferenceNameToJoin) => {
    const confName = conferenceNameToJoin || ivrCallState.conferenceName;
    
    if (!deviceInstance || !confName) {
      const errorMsg = `Device not ready or conference name missing. Device: ${!!deviceInstance}, Conference: ${confName}`;
      console.error('❌ [IVR]', errorMsg);
      setIvrCallState(prev => ({ ...prev, error: errorMsg }));
      return;
    }
    
    // Check if call has already ended
    const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
    if (ivrCallState.callStatus && endedStatuses.includes(ivrCallState.callStatus)) {
      const errorMsg = `Cannot join call - call has already ended (status: ${ivrCallState.callStatus})`;
      console.warn('⚠️ [IVR]', errorMsg);
      setIvrCallState(prev => ({
        ...prev,
        error: errorMsg,
        isConnecting: false
      }));
      return;
    }
    
    if (ivrCallState.isConnected || ivrActiveConnection.current) {
      try {
        if (ivrActiveConnection.current) {
          let connectionStatus = null;
          if (typeof ivrActiveConnection.current.status === 'function') {
            connectionStatus = ivrActiveConnection.current.status();
          } else {
            connectionStatus = ivrActiveConnection.current.status || ivrActiveConnection.current._status;
          }
          
          if (connectionStatus === 'open' || connectionStatus === 'connected' || connectionStatus === 'answered') {
            console.log('✅ [IVR] Already connected to conference, skipping join');
            setIvrCallState(prev => ({
              ...prev,
              isConnected: true,
              isConnecting: false
            }));
            return;
          }
        }
      } catch (e) {
        console.warn('⚠️ [IVR] Error checking connection:', e);
      }
    }

    setIvrCallState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      const params = {
        To: confName,
        agentId: user?.id ?? '',
        callPurpose: 'ivr_dialer',
        direction: 'outbound-ivr'
      };
      console.log('📞 [IVR] Connecting with params:', params);

      // Request audio permissions before connecting
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
        stream.getTracks().forEach(track => track.stop());
      } catch (audioErr) {
        console.warn('⚠️ [IVR] Audio permission request failed (Twilio SDK will request):', audioErr);
      }

      // Resume AudioContext
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
          console.log('✅ [IVR] AudioContext resumed');
        }
      } catch (audioCtxErr) {
        console.warn('⚠️ [IVR] AudioContext resume failed:', audioCtxErr);
      }

      // Set speaker devices
      try {
        if (deviceInstance.audio) {
          if (typeof deviceInstance.audio.setSpeakerDevices === 'function') {
            await deviceInstance.audio.setSpeakerDevices('default');
            console.log('✅ [IVR] Speaker devices set to default');
          }
          
          if (typeof deviceInstance.audio.setInputDevice === 'function') {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInput = devices.find(d => d.kind === 'audioinput');
            if (audioInput) {
              try {
                await deviceInstance.audio.setInputDevice(audioInput.deviceId);
                console.log('✅ [IVR] Input device set for echo cancellation');
              } catch (inputErr) {
                console.warn('⚠️ [IVR] Setting input device failed (non-critical):', inputErr);
              }
            }
          }
        }
      } catch (speakerErr) {
        console.warn('⚠️ [IVR] Setting speaker devices failed:', speakerErr);
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

      ivrActiveConnection.current = call;

      // Attach event listeners
      if (call && typeof call === 'object') {
        const attachEvents = (callObj) => {
          const onAccept = () => {
            console.log('✅ [IVR] Call accepted - connected to conference');
            setIvrCallState(prev => {
              if (!prev.isConnected) {
                return {
                  ...prev,
                  isConnected: true,
                  isConnecting: false,
                  isCalling: false,
                  callStatus: 'in-progress' // Update status when call is accepted
                };
              }
              // Even if already connected, ensure status is in-progress
              if (prev.callStatus !== 'in-progress') {
                return {
                  ...prev,
                  callStatus: 'in-progress'
                };
              }
              return prev;
            });
            
            try {
              setTimeout(() => {
                const streams = getIVRCallStreams();
                if (streams.local) {
                  ivrLocalMediaStream.current = streams.local;
                  console.log('📞 [IVR] Local media stream captured for mute');
                }
              }, 500);
            } catch (err) {
              console.error('❌ [IVR] Error capturing streams:', err);
            }
          };

          const onDisconnect = () => {
            try {
              console.log('📞 [IVR] Call disconnected (client)');
              setIvrCallState(prev => ({
                ...prev,
                isConnected: false,
                isConnecting: false,
                callStatus: 'completed'
              }));
              ivrActiveConnection.current = null;
              ivrLocalMediaStream.current = null;
              
              // Cleanup device when disconnected
              if (ivrDevice && !isIvrCleaningUp.current) {
                isIvrCleaningUp.current = true;
                console.log('🧹 [IVR] Cleaning up device - call disconnected');
                setTimeout(() => {
                  try {
                    safelyCleanupDevice(ivrDevice);
                    setIvrDevice(null);
                  } catch (e) {
                    console.warn('⚠️ [IVR] Error cleaning up device on disconnect:', e);
                  }
                  isIvrCleaningUp.current = false;
                }, 500);
              }
              
              // Reset state after cleanup
              setTimeout(() => {
                resetIVRCallState();
              }, 1000);
            } catch (e) {
              console.warn('⚠️ [IVR] Error in onDisconnect (ignored):', e.message);
            }
          };

          const onCancel = () => {
            console.log('📞 [IVR] Call canceled');
            setIvrCallState(prev => ({
              ...prev,
              isConnecting: false,
              isConnected: false
            }));
            ivrActiveConnection.current = null;
          };

          const onError = (error) => {
            console.error('❌ [IVR] Call error:', error);
            setIvrCallState(prev => ({
              ...prev,
              error: error.message || 'Call error occurred',
              isConnecting: false,
              isConnected: false
            }));
          };

          const onReject = () => {
            console.log('📞 [IVR] Call rejected');
            setIvrCallState(prev => ({
              ...prev,
              isConnecting: false,
              isConnected: false
            }));
            ivrActiveConnection.current = null;
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
              console.log('📞 [IVR] Setting connected state (fallback)');
              setIvrCallState(prev => ({
                ...prev,
                isConnected: true,
                isConnecting: false,
                isCalling: false
              }));
            }, 2000);
          }
        };

        attachEvents(call);
      }

    } catch (err) {
      console.error('❌ [IVR] Error joining conference:', err);
      setIvrCallState(prev => ({
        ...prev,
        error: err.message || 'Failed to join conference',
        isConnecting: false
      }));
    }
  }, [ivrCallState.conferenceName, ivrCallState.callStatus, ivrCallState.isConnected, user, getIVRCallStreams]);

  // Setup Twilio Device for IVR
  useEffect(() => {
    if (!ivrCallState.conferenceName || !user) {
      // Cleanup device if conference name or user is removed
      if (ivrDevice && (!ivrCallState.conferenceName || !user)) {
        console.log('🧹 [IVR] Cleaning up device: conferenceName or user removed');
        try {
          if (ivrActiveConnection.current) {
            ivrActiveConnection.current.disconnect();
            ivrActiveConnection.current = null;
          }
          safelyCleanupDevice(ivrDevice);
          setIvrDevice(null);
          setIvrCallState(prev => ({
            ...prev,
            isConnected: false,
            isConnecting: false
          }));
          isIvrDeviceSettingUp.current = false;
        } catch (e) {
          console.error('❌ [IVR] Error cleaning up device:', e);
          isIvrDeviceSettingUp.current = false;
        }
      }
      return;
    }

    // If device already exists and conferenceName matches, don't recreate
    if (ivrDevice && ivrCallState.conferenceName) {
      console.log('📞 [IVR] Device already exists, reusing for conference:', ivrCallState.conferenceName);
      
      // Check if there's already an active connection
      if (ivrActiveConnection.current) {
        try {
          let connectionStatus = null;
          if (typeof ivrActiveConnection.current.status === 'function') {
            connectionStatus = ivrActiveConnection.current.status();
          } else {
            connectionStatus = ivrActiveConnection.current.status || ivrActiveConnection.current._status;
          }
          
          if (connectionStatus === 'open' || connectionStatus === 'connected' || connectionStatus === 'answered') {
            console.log('✅ [IVR] Active connection found, restoring state');
            setIvrCallState(prev => ({
              ...prev,
              isConnected: true,
              isConnecting: false
            }));
            return;
          }
        } catch (e) {
          console.warn('⚠️ [IVR] Error checking connection status:', e);
        }
      }
      
      if (!ivrCallState.isConnected && !ivrActiveConnection.current) {
        try {
          const deviceState = ivrDevice.state || ivrDevice._state;
          // Only register if device is unregistered or destroyed
          // Don't register if already registered or currently registering
          if (deviceState === 'unregistered' || deviceState === 'destroyed' || !deviceState) {
            console.log('📞 [IVR] Registering device (state:', deviceState, ')');
            ivrDevice.register().catch(err => {
              // Only log if it's not a state error (which we're trying to prevent)
              if (!err.message?.includes('InvalidStateError') && !err.message?.includes('registering')) {
                console.warn('⚠️ [IVR] Device registration warning:', err);
              }
            });
          } else if (deviceState === 'registering') {
            console.log('📞 [IVR] Device is already registering, skipping');
          } else if (deviceState === 'registered') {
            console.log('📞 [IVR] Device is already registered');
          } else {
            console.log('📞 [IVR] Device in state:', deviceState, '- skipping registration');
          }
        } catch (e) {
          // Don't try to register again in catch block - just log the error
          console.warn('⚠️ [IVR] Error checking device state:', e);
        }
      }
      return;
    }

    // Prevent multiple simultaneous device setups
    if (isIvrDeviceSettingUp.current) {
      console.log('📞 [IVR] Device setup already in progress, skipping');
      return;
    }

    const setupIVRDevice = async () => {
      if (isIvrDeviceSettingUp.current) {
        console.log('📞 [IVR] Device setup already in progress, skipping');
        return;
      }

      isIvrDeviceSettingUp.current = true;
      
      try {
        console.log('📞 [IVR] Starting device setup for conference:', ivrCallState.conferenceName);
        setIvrCallState(prev => ({ ...prev, isConnecting: true, error: null }));

        const token = await fetchIVRToken();
        if (!token) {
          setIvrCallState(prev => ({ ...prev, isConnecting: false }));
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
          logLevel: 0,
          codecPreferences: ['opus', 'pcmu'],
          allowIncomingWhileBusy: false,
          enableRTCStats: false,
          closeProtection: false,
          disableInsights: true
        });

        twilioDevice.on('destroyed', () => {
          setTimeout(() => {
            if (ivrDevice === twilioDevice) {
              console.warn = originalWarn;
              console.error = originalError;
            }
          }, 2000);
        });

        twilioDevice.on('registered', () => {
          console.log('✅ [IVR] Twilio Device registered');
          setIvrDevice(twilioDevice);
          setIvrCallState(prev => ({ ...prev, error: null }));
          
          if (ivrCallState.conferenceName) {
            if (ivrActiveConnection.current) {
              try {
                let connectionStatus = null;
                if (typeof ivrActiveConnection.current.status === 'function') {
                  connectionStatus = ivrActiveConnection.current.status();
                } else {
                  connectionStatus = ivrActiveConnection.current.status || ivrActiveConnection.current._status;
                }
                
                if (connectionStatus === 'open' || connectionStatus === 'connected' || connectionStatus === 'answered') {
                  console.log('✅ [IVR] Already connected, skipping auto-join');
                  setIvrCallState(prev => ({
                    ...prev,
                    isConnected: true,
                    isConnecting: false
                  }));
                  return;
                }
              } catch (e) {
                console.warn('⚠️ [IVR] Error checking connection status:', e);
              }
            }
            
            if (!ivrCallState.isConnected && !ivrActiveConnection.current) {
              console.log('📞 [IVR] Auto-joining conference immediately:', ivrCallState.conferenceName);
              joinIVRConference(twilioDevice, ivrCallState.conferenceName);
            }
          }
        });

        twilioDevice.on('error', (error) => {
          console.error('❌ [IVR] Twilio Device error:', error);
          setIvrCallState(prev => ({
            ...prev,
            error: error.message || 'Device error occurred',
            isConnecting: false
          }));
        });

        twilioDevice.on('incoming', (call) => {
          console.log('📞 [IVR] Incoming call (auto-rejecting):', call);
          call.reject();
        });

        twilioDevice.on('tokenWillExpire', async () => {
          console.log('🔄 [IVR] Token expiring, fetching new token...');
          const newToken = await fetchIVRToken();
          if (newToken) {
            twilioDevice.updateToken(newToken);
          }
        });

        // Check device state before registering
        const deviceState = twilioDevice.state || twilioDevice._state;
        if (deviceState === 'unregistered' || deviceState === 'destroyed' || !deviceState) {
          twilioDevice.register();
        } else {
          console.log('📞 [IVR] Device already in state:', deviceState, '- skipping initial registration');
        }
        
        setIvrDevice(twilioDevice);
        isIvrDeviceSettingUp.current = false;

      } catch (err) {
        console.error('❌ [IVR] Failed to set up Twilio Device:', err);
        setIvrCallState(prev => ({
          ...prev,
          error: err.message,
          isConnecting: false
        }));
        isIvrDeviceSettingUp.current = false;
      }
    };

    setupIVRDevice();

    return () => {
      if (ivrDevice && !isIvrCleaningUp.current) {
        isIvrCleaningUp.current = true;
        setTimeout(() => {
          try {
            if (ivrActiveConnection.current) {
              ivrActiveConnection.current.disconnect();
              ivrActiveConnection.current = null;
            }
            safelyCleanupDevice(ivrDevice);
          } catch (e) {
            console.warn('⚠️ [IVR] Error during device cleanup (ignored):', e.message);
          }
          setIvrDevice(null);
          setIvrCallState(prev => ({
            ...prev,
            isConnected: false,
            isConnecting: false
          }));
          ivrLocalMediaStream.current = null;
          isIvrCleaningUp.current = false;
          isIvrDeviceSettingUp.current = false;
        }, 300);
      }
    };
  }, [ivrCallState.conferenceName, user, fetchIVRToken, ivrDevice, ivrCallState.isConnected, joinIVRConference]);

  // Socket event listeners for real-time IVR call status updates
  useEffect(() => {
    if (!ivrCallState.callSid && !ivrCallState.conferenceName) {
      return; // No active IVR call to monitor
    }

    // Helper to normalize status
    const normalizeUiStatus = (s) => {
      const x = s ? String(s) : '';
      if (x === 'initiated') return 'queued';
      if (x === 'answered') return 'in-progress';
      return x;
    };

    // Check initial status from socket context
    const updateStatusFromSocket = () => {
      if (ivrCallState.callSid) {
        const statusData = getCallStatus(ivrCallState.callSid);
        if (statusData) {
          // Check if this is an IVR call
          const isIvrCall = statusData.twilioData?.isIvrCall || 
                           statusData.callPurpose === 'ivr_dialer' ||
                           (statusData.conferenceName && statusData.conferenceName.startsWith('ivr-call-'));
          
          if (isIvrCall) {
            const statusForUiRaw = statusData.uiStatus || statusData.status;
            const statusForUi = normalizeUiStatus(statusForUiRaw);
            
            console.log('📞 [IVR] Initial status from socket:', {
              callSid: ivrCallState.callSid,
              status: statusForUi,
              rawStatus: statusForUiRaw
            });

            setIvrCallState(prev => {
              // Prevent downgrades
              const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
              const order = { queued: 1, ringing: 2, 'in-progress': 3 };
              const currentUi = normalizeUiStatus(prev.callStatus);
              const currentOrder = order[currentUi] || 0;
              const nextOrder = order[statusForUi] || 0;

              const shouldApply =
                endedStatuses.includes(statusForUi) ||
                (!endedStatuses.includes(currentUi) && nextOrder >= currentOrder);

              if (shouldApply && prev.callStatus !== statusForUi) {
                return {
                  ...prev,
                  callStatus: statusForUi
                };
              }
              return prev;
            });
          }
        }
      }
    };

    // Check initial status
    updateStatusFromSocket();

    // Listen for real-time call status updates
    const handleCallStatusUpdate = (event) => {
      const { callStatusData } = event.detail;
      
      // FIRST: Verify this is an IVR call - ignore CRM calls immediately
      const isIvrCall = callStatusData.twilioData?.isIvrCall || 
                        callStatusData.callPurpose === 'ivr_dialer' ||
                        (callStatusData.conferenceName && callStatusData.conferenceName.startsWith('ivr-call-'));
      
      if (!isIvrCall) {
        // Not an IVR call - ignore (this is a CRM call handled by GlobalWebCallInterface)
        return;
      }
      
      // SECOND: Only process updates for this specific IVR call
      const matchesCallSid = callStatusData?.callSid === ivrCallState.callSid;
      const matchesConference = callStatusData?.conferenceName === ivrCallState.conferenceName;
      
      if (!matchesCallSid && !matchesConference) {
        return; // Not for this IVR call (could be another IVR call)
      }

      console.log('📞 [IVR] Real-time status update received:', {
        callSid: callStatusData?.callSid?.substring(0, 20),
        status: callStatusData?.status,
        uiStatus: callStatusData?.uiStatus,
        conferenceName: callStatusData?.conferenceName
      });

      // Normalize status
      const statusForUiRaw = callStatusData.uiStatus || callStatusData.status;
      const statusForUi = normalizeUiStatus(statusForUiRaw);
      
      // Prevent downgrades (e.g., don't go from 'in-progress' back to 'ringing')
      const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
      const order = { queued: 1, ringing: 2, 'in-progress': 3 };
      
      setIvrCallState(prev => {
        const currentUi = normalizeUiStatus(prev.callStatus);
        const currentOrder = order[currentUi] || 0;
        const nextOrder = order[statusForUi] || 0;

        const shouldApply =
          endedStatuses.includes(statusForUi) ||
          (!endedStatuses.includes(currentUi) && nextOrder >= currentOrder);

        if (shouldApply && prev.callStatus !== statusForUi) {
          console.log('📨 [IVR] Status update applied:', {
            from: currentUi,
            to: statusForUi,
            callSid: callStatusData?.callSid?.substring(0, 20)
          });

          // If call ended, disconnect and cleanup
          if (endedStatuses.includes(statusForUi)) {
            console.log('🏁 [IVR] Call ended via socket update:', statusForUi);
            
            // Disconnect if connected
            if (ivrActiveConnection.current) {
              try {
                ivrActiveConnection.current.disconnect();
              } catch (e) {
                console.warn('⚠️ [IVR] Error disconnecting on call end:', e);
              }
              ivrActiveConnection.current = null;
            }

            // Cleanup device when call ends
            if (ivrDevice && !isIvrCleaningUp.current) {
              isIvrCleaningUp.current = true;
              console.log('🧹 [IVR] Cleaning up device - call ended');
              setTimeout(() => {
                try {
                  safelyCleanupDevice(ivrDevice);
                  setIvrDevice(null);
                } catch (e) {
                  console.warn('⚠️ [IVR] Error cleaning up device on call end:', e);
                }
                isIvrCleaningUp.current = false;
              }, 500);
            }

            // Reset state after a short delay
            setTimeout(() => {
              resetIVRCallState();
            }, 1000);
          }

          return {
            ...prev,
            callStatus: statusForUi
          };
        } else {
          console.log('⏭️ [IVR] Status update skipped (downgrade or duplicate):', {
            current: currentUi,
            received: statusForUi
          });
        }
        
        return prev;
      });
    };

    // Listen for conference events (optional, for future use)
    const handleConferenceEvent = (event) => {
      const { conferenceEventData } = event.detail;
      
      // FIRST: Verify this is an IVR conference - ignore CRM conferences immediately
      const isIvrConference = conferenceEventData?.conferenceName?.startsWith('ivr-call-') ||
                              conferenceEventData?.isIvrCall;
      if (!isIvrConference) {
        // Not an IVR conference - ignore (this is a CRM conference handled by GlobalWebCallInterface)
        return;
      }
      
      // SECOND: Only process events for this specific IVR conference
      if (conferenceEventData?.conferenceName !== ivrCallState.conferenceName) {
        return; // Not for this IVR conference (could be another IVR call)
      }

      console.log('🎯 [IVR] Conference event received:', {
        event: conferenceEventData?.event,
        conferenceName: conferenceEventData?.conferenceName,
        participantRole: conferenceEventData?.participantRole
      });

      // Handle specific conference events if needed
      // For now, just log them
    };

    // Register event listeners
    window.addEventListener('callStatusUpdate', handleCallStatusUpdate);
    window.addEventListener('conferenceEvent', handleConferenceEvent);

    // Cleanup
    return () => {
      window.removeEventListener('callStatusUpdate', handleCallStatusUpdate);
      window.removeEventListener('conferenceEvent', handleConferenceEvent);
    };
  }, [ivrCallState.callSid, ivrCallState.conferenceName, ivrCallState.callStatus, getCallStatus, resetIVRCallState]);

  // Handle making a call
  const handleMakeCall = async (phoneNumber) => {
    if (!phoneNumber || !phoneNumber.trim()) {
      setIvrCallState(prev => ({
        ...prev,
        error: 'Phone number is required'
      }));
      return;
    }

    if (!user?.id) {
      setIvrCallState(prev => ({
        ...prev,
        error: 'User not authenticated'
      }));
      return;
    }

    try {
      // Set calling state
      setIvrCallState(prev => ({
        ...prev,
        isCalling: true,
        isConnecting: false,
        phoneNumber: phoneNumber.trim(),
        error: null,
        callStatus: 'queued'
      }));

      console.log('📞 [IVR] Initiating call to:', phoneNumber.trim());

      // Call IVR initiate API
      const response = await apiClient.post('/api/calls/ivr-initiate', {
        phoneNumber: phoneNumber.trim(),
        agentId: user.id,
        callPurpose: 'ivr_dialer'
      });

      if (!response) {
        throw new Error('No response from server');
      }

      const result = await response.json();

      if (result?.success) {
        const { callSid, conferenceName, to } = result.data;
        
        console.log('✅ [IVR] Call initiated successfully:', {
          callSid,
          conferenceName,
          to
        });

        // Update state with call information
        setIvrCallState(prev => ({
          ...prev,
          callSid,
          conferenceName,
          phoneNumber: to,
          isCalling: true,
          callStatus: 'queued'
        }));

        // Device will auto-join conference when it's set up
        // The useEffect hook will trigger device setup when conferenceName is set
        console.log('📞 [IVR] Conference name set, device will auto-join:', conferenceName);
        
      } else {
        const errorMsg = result?.message || result?.error || 'Failed to initiate call';
        console.error('❌ [IVR] Call initiation failed:', errorMsg);
        setIvrCallState(prev => ({
          ...prev,
          error: errorMsg,
          isCalling: false,
          callStatus: null
        }));
      }
    } catch (error) {
      console.error('❌ [IVR] Error initiating call:', error);
      const errorMsg = error?.message || 'An unexpected error occurred';
      setIvrCallState(prev => ({
        ...prev,
        error: errorMsg,
        isCalling: false,
        callStatus: null
      }));
    }
  };

  // Handle hangup
  const handleIVRHangup = useCallback(async () => {
    try {
      console.log('📞 [IVR] Hanging up call');
      
      // Disconnect from conference
      if (ivrActiveConnection.current) {
        try {
          const call = ivrActiveConnection.current;
          let status = null;
          
          try {
            if (typeof call.status === 'function') {
              status = call.status();
            } else {
              status = call.status || call._status;
            }
          } catch (e) {
            console.warn('⚠️ [IVR] Error getting call status:', e);
          }
          
          if (status === 'open' || status === 'connected' || status === 'answered') {
            console.log('📞 [IVR] Disconnecting active call');
            call.disconnect();
          } else {
            console.log('📞 [IVR] Canceling call (not yet connected)');
            if (ivrDevice && typeof ivrDevice.disconnectAll === 'function') {
              ivrDevice.disconnectAll();
            }
          }
        } catch (err) {
          console.warn('⚠️ [IVR] Error disconnecting call:', err);
        }
        ivrActiveConnection.current = null;
      } else if (ivrDevice && typeof ivrDevice.disconnectAll === 'function') {
        console.log('📞 [IVR] No active connection, disconnecting all calls');
        ivrDevice.disconnectAll();
      }
      
      // Call hangup API if we have a callSid
      if (ivrCallState.callSid) {
        try {
          await apiClient.post('/api/calls/ivr-hangup', {
            callSid: ivrCallState.callSid,
            conferenceName: ivrCallState.conferenceName
          });
        } catch (err) {
          console.warn('⚠️ [IVR] Hangup API error (non-critical):', err);
        }
      }

      // Cleanup device when hanging up
      if (ivrDevice && !isIvrCleaningUp.current) {
        isIvrCleaningUp.current = true;
        console.log('🧹 [IVR] Cleaning up device - manual hangup');
        setTimeout(() => {
          try {
            safelyCleanupDevice(ivrDevice);
            setIvrDevice(null);
          } catch (e) {
            console.warn('⚠️ [IVR] Error cleaning up device on hangup:', e);
          }
          isIvrCleaningUp.current = false;
        }, 500);
      }

      // Reset state
      resetIVRCallState();
      
      console.log('✅ [IVR] Call hung up');
    } catch (error) {
      console.error('❌ [IVR] Error hanging up:', error);
      // Reset state anyway
      resetIVRCallState();
    }
  }, [ivrCallState.callSid, ivrCallState.conferenceName, ivrDevice, resetIVRCallState, safelyCleanupDevice]);

  // Handle mute/unmute
  const handleIVRMute = useCallback(async () => {
    try {
      if (!ivrActiveConnection.current || !ivrCallState.isConnected) {
        console.warn('⚠️ [IVR] Cannot mute: call not connected');
        return;
      }

      const call = ivrActiveConnection.current;
      const isCurrentlyMuted = ivrCallState.isMuted;

      // Try SDK mute method first
      if (typeof call.mute === 'function') {
        try {
          call.mute(!isCurrentlyMuted);
          setIvrCallState(prev => ({
            ...prev,
            isMuted: !isCurrentlyMuted
          }));
          console.log(`✅ [IVR] Call ${!isCurrentlyMuted ? 'muted' : 'unmuted'} using SDK mute() method`);
          return;
        } catch (err) {
          console.warn('⚠️ [IVR] SDK mute() failed:', err);
        }
      }

      // Fallback: Use local media stream
      if (ivrLocalMediaStream.current) {
        try {
          const tracks = ivrLocalMediaStream.current.getAudioTracks();
          if (tracks.length > 0) {
            tracks.forEach(track => {
              track.enabled = isCurrentlyMuted; // Enable if muted, disable if unmuted
            });
            setIvrCallState(prev => ({
              ...prev,
              isMuted: !isCurrentlyMuted
            }));
            console.log(`✅ [IVR] Call ${!isCurrentlyMuted ? 'muted' : 'unmuted'} via local media stream`);
            return;
          }
        } catch (err) {
          console.warn('⚠️ [IVR] Error using local media stream:', err);
        }
      }

      // Fallback: Get streams and mute
      try {
        const { local } = getIVRCallStreams();
        if (local && local.getAudioTracks().length > 0) {
          local.getAudioTracks().forEach(track => {
            track.enabled = isCurrentlyMuted;
          });
          setIvrCallState(prev => ({
            ...prev,
            isMuted: !isCurrentlyMuted
          }));
          console.log(`✅ [IVR] Call ${!isCurrentlyMuted ? 'muted' : 'unmuted'} via getIVRCallStreams`);
          return;
        }
      } catch (err) {
        console.warn('⚠️ [IVR] Error using getIVRCallStreams:', err);
      }

      console.error('❌ [IVR] Cannot mute: no method available');
    } catch (err) {
      console.error('❌ [IVR] Error muting/unmuting call:', err);
    }
  }, [ivrCallState.isConnected, ivrCallState.isMuted, getIVRCallStreams]);

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
      onHangup={handleIVRHangup}
      onMute={handleIVRMute}
      // Pass IVR call state
      isConnected={ivrCallState.isConnected}
      isCalling={ivrCallState.isCalling}
      isConnecting={ivrCallState.isConnecting}
      callStatus={ivrCallState.callStatus}
      isMuted={ivrCallState.isMuted}
      callTimer={ivrCallState.callTimer}
      phoneNumber={ivrCallState.phoneNumber}
      error={ivrCallState.error}
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

