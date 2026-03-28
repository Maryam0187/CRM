'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useCall } from '../contexts/CallContext';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { Device } from '@twilio/voice-sdk';

// Dummy call flow for localhost testing only (never in production)
const isMockCallMode =
  typeof window !== 'undefined' &&
  process.env.NODE_ENV === 'development' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

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
    startCall,
    updateCallStatus,
    setCurrentCallSid,
    setWebCallInterfaceRef,
    callConnected,
    endCall,
    setIsMuted,
    startTimer,
    stopTimer,
    resetTimer
  } = useCall();
  
  // Get user and access token from auth context (needed for device setup)
  const { user, accessToken } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isOnSalePage = pathname === '/add-sale';
  const callEndedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
  const callStatusUiRef = useRef(callStatus);
  useEffect(() => {
    callStatusUiRef.current = callStatus;
  }, [callStatus]);

  const { getCallStatus } = useSocket();
  const [isMinimized, setIsMinimized] = useState(false);
  const [showKeypad, setShowKeypad] = useState(false);
  const [keypadDigits, setKeypadDigits] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [activeRecordingSid, setActiveRecordingSid] = useState(null);
  const [recordingControlLoading, setRecordingControlLoading] = useState(false);
  const [availableAgents, setAvailableAgents] = useState([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const [addParticipantError, setAddParticipantError] = useState('');
  const [addParticipantSuccess, setAddParticipantSuccess] = useState('');
  
  // Track known CallSids for matching conference participants
  const [knownSids, setKnownSids] = useState({
    customerCallSid: null,
    agentCallSid: null
  });
  
  // Participant tracking (local state - no Redux)
  // Each participant: { callSid, role, status, muted, hold }
  // status: 'waiting' | 'ringing' | 'connected' | 'left'
  const [participants, setParticipants] = useState([]);
  
  // Derived participant info
  // Prefer the most advanced customer state to avoid stale duplicate rows (e.g., pending + real SID).
  const customerParticipants = participants.filter(p => p.role === 'customer');
  const customerParticipant =
    customerParticipants.find(p => p.status === 'connected') ||
    customerParticipants.find(p => p.status === 'ringing') ||
    customerParticipants.find(p => p.status === 'waiting') ||
    customerParticipants[0];
  const agentParticipant = participants.find(p => p.role === 'agent');
  
  // Customer is connected when they have status 'connected'
  const customerConnected = customerParticipant?.status === 'connected';
  
  // Keep UI simple and correct:
  // - show Waiting/Queued before customer answers
  // - show Ringing while customer phone is ringing
  // - show In-progress when customer is connected OR backend says so
  const displayCallStatus = (() => {
    if (callStatus && callEndedStatuses.includes(callStatus)) return callStatus;
    // Customer connected is the most reliable indicator they answered
    if (customerConnected) return 'in-progress';
    if (callStatus === 'in-progress') return 'in-progress';
    if (callStatus === 'ringing') return 'ringing';
    if (callStatus === 'queued' || callStatus === 'initiated' || !callStatus) {
      return isCalling ? 'queued' : 'queued';
    }
    return 'queued';
  })();

  const customerAnswered = displayCallStatus === 'in-progress';
  
  // Start timer when customer connects (they answered)
  useEffect(() => {
    if (customerConnected && callStatus !== 'in-progress') {
      console.log('⏱️ [TIMER START] Customer connected, starting timer');
      startTimer();
      // Also update the call status context to in-progress
      updateCallStatus('in-progress');
    }
  }, [customerConnected, callStatus, startTimer, updateCallStatus]);
  
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
  
  // Helper: Determine participant role by matching CallSid
  const resolveRoleByCallSid = (callSid) => {
    if (!callSid) return 'unknown';
    if (knownSids.customerCallSid && callSid === knownSids.customerCallSid) return 'customer';
    if (knownSids.agentCallSid && callSid === knownSids.agentCallSid) return 'agent';
    // If we know current call sid is customer's
    if (currentCallSid && callSid === currentCallSid) return 'customer';
    return 'unknown';
  };

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
          if (device && typeof device.unregister === 'function') device.unregister();
          if (device && typeof device.destroy === 'function') device.destroy();
          setDevice(null);
          setIsConnected(false);
          setIsConnecting(false);
        } catch (e) {
          console.error('Error cleaning up device:', e);
        }
      }
      return;
    }

    // Mock call flow for localhost testing (no Twilio device)
    if (isMockCallMode) {
      console.log('📞 [MOCK] Localhost mode - simulating call success (no Twilio)');
      setIsConnecting(true);
      setError(null);
      setDevice({ _mock: true });
      const t = setTimeout(() => {
        setIsConnected(true);
        setIsConnecting(false);
        callConnected();
        updateCallStatus('in-progress');
        startTimer();
        console.log('✅ [MOCK] Call "connected" - timer started. Use Hang up to end.');
      }, 1500);
      return () => {
        clearTimeout(t);
        setIsConnected(false);
        setIsConnecting(false);
        setDevice(null);
      };
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
      const actualStatusForUi = actualStatusData?.uiStatus || actualStatusData?.status;
      if (actualStatusForUi && endedStatuses.includes(actualStatusForUi)) {
        const errorMsg = `Cannot join call - call has already ended (status: ${actualStatusForUi})`;
        console.warn('⚠️', errorMsg);
        setError(errorMsg);
        setIsConnecting(false);
        // Update local status to match actual status
        updateCallStatus(actualStatusForUi);
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
      // Outbound: conferenceName is `call-<agentId>`
      // Inbound: conferenceName is `inbound-...`
      const params = {
        To: conferenceName,
        agentId: user?.id ?? '',
        customerId: callMetadata?.customerId ?? '',
        saleId: callMetadata?.saleId ?? '',
        callPurpose: 'follow_up',
        direction: conferenceName?.startsWith('inbound-') ? 'inbound' : 'outbound'
      };
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

      // NOTE: Agent CallSid is now captured on the backend in /api/twilio/voice-response
      // The backend broadcasts 'agent_sid_captured' event via socket which updates Redux
      activeConnection.current = call;

      // Attach event listeners
      if (call && typeof call === 'object') {
        const attachEvents = (callObj) => {
          const onAccept = () => {
            console.log('✅ Call accepted - connected to conference');
            // NOTE: Agent CallSid is captured on backend via voice-response webhook
            // and broadcast via socket 'agent_sid_captured' event
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
              
              // NEW FLOW: Dial customer AFTER agent connects (for outbound calls only)
              if (!isInboundCall && callMetadata?.dialParams && currentCallSid?.startsWith('pending-')) {
                console.log('📞 Agent connected - now dialing customer...');
                dialCustomerAfterAgentConnect(callMetadata.dialParams);
              }
              
              // Check if call has ended on the server (only for outbound calls)
              // For inbound calls, don't check status here as it might not be set yet
              if (!isInboundCall && currentCallSid && !currentCallSid.startsWith('pending-')) {
                const actualStatusData = getCallStatus(currentCallSid);
                const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
                const actualStatusForUi = actualStatusData?.uiStatus || actualStatusData?.status;
                if (actualStatusForUi && endedStatuses.includes(actualStatusForUi)) {
                  console.warn('⚠️ Call has ended on server, disconnecting immediately');
                  updateCallStatus(actualStatusForUi);
                  disconnectCall('call_ended_on_server');
                  setTimeout(() => {
                    endCall();
                  }, 500);
                  return;
                }
              }
              
              // Don't set status to in-progress here - wait for Twilio status callback to report customer answered
              // This ensures timer only starts when customer actually picks up, not when agent joins
              // Status will be updated via socket/callbacks when customer actually answers
              console.log('📞 Agent connected to conference, waiting for customer to answer (status will come from Twilio callbacks)');
              // Status will be updated via socket/callbacks when customer actually answers
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

  // Dial customer after agent connects
  const dialCustomerAfterAgentConnect = async (dialParams) => {
    try {
      console.log('📞 [DIAL CUSTOMER] Dialing customer after agent connected:', dialParams);
      
      const response = await apiClient.post('/api/calls/dial-customer', dialParams);
      
      if (!response) {
        throw new Error('No response from server');
      }
      
      const result = await response.json();
      
      if (result?.success) {
        const callSid = result.data?.callSid;
        console.log('✅ [DIAL CUSTOMER] Customer call initiated:', callSid);
        
        // Update currentCallSid with real call SID (replacing pending-*)
        if (callSid && currentCallSid?.startsWith('pending-')) {
          setCurrentCallSid(callSid);
        }
      } else {
        const errorMsg = result?.message || result?.error || 'Failed to dial customer';
        console.error('❌ [DIAL CUSTOMER] Error:', errorMsg);
        setError(errorMsg);
      }
    } catch (err) {
      console.error('❌ [DIAL CUSTOMER] Exception:', err);
      setError(err?.message || 'Failed to dial customer');
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

  // Send DTMF digits during call (keypad)
  const sendKeypadDigits = useCallback((digitsToSend) => {
    if (!digitsToSend || typeof digitsToSend !== 'string') return;
    const validated = digitsToSend.replace(/[^0-9*#]/g, '');
    if (!validated) return;
    try {
      if (!activeConnection.current || !isConnected) {
        console.warn('⚠️ Cannot send digits: call not connected');
        return;
      }
      const call = activeConnection.current;
      if (typeof call.sendDigits === 'function') {
        call.sendDigits(validated);
        console.log(`✅ Sent DTMF digits: ${validated}`);
        setKeypadDigits('');
      } else {
        console.warn('⚠️ sendDigits not available on call object');
      }
    } catch (err) {
      console.error('❌ Error sending DTMF digits:', err);
    }
  }, [isConnected]);

  // Start/stop call recording
  const toggleRecording = useCallback(async () => {
    if (!conferenceName) return;
    setRecordingControlLoading(true);
    try {
      if (isRecording && activeRecordingSid) {
        const res = await apiClient.post('/api/calls/recording-control', {
          action: 'stop',
          conferenceName,
          recordingSid: activeRecordingSid
        });
        const data = await res.json();
        if (data?.success) {
          setIsRecording(false);
          setActiveRecordingSid(null);
          console.log('🎙️ Recording stopped');
        } else {
          setError(data?.message || 'Failed to stop recording');
        }
      } else {
        const res = await apiClient.post('/api/calls/recording-control', {
          action: 'start',
          conferenceName
        });
        const data = await res.json();
        if (data?.success && data?.data?.recordingSid) {
          setIsRecording(true);
          setActiveRecordingSid(data.data.recordingSid);
          console.log('🎙️ Recording started');
        } else {
          setError(data?.message || 'Failed to start recording');
        }
      }
    } catch (err) {
      console.error('❌ Recording control error:', err);
      setError(err?.message || 'Recording control failed');
    } finally {
      setRecordingControlLoading(false);
    }
  }, [conferenceName, isRecording, activeRecordingSid]);

  const loadAvailableAgents = useCallback(async () => {
    setIsLoadingAgents(true);
    setAddParticipantError('');
    try {
      const res = await apiClient.get('/api/calls/agents');
      const data = await res.json();
      if (data?.success && Array.isArray(data?.data)) {
        setAvailableAgents(data.data);
        return;
      }
      setAvailableAgents([]);
      setAddParticipantError(data?.message || 'Failed to load internal agents');
    } catch (err) {
      console.error('❌ Error loading internal agents:', err);
      setAvailableAgents([]);
      setAddParticipantError(err?.message || 'Failed to load internal agents');
    } finally {
      setIsLoadingAgents(false);
    }
  }, []);

  const handleAddParticipant = useCallback(async () => {
    if (!currentCallSid) {
      setAddParticipantError('Active call not found');
      return;
    }
    if (!selectedAgentId) {
      setAddParticipantError('Please select an internal agent');
      return;
    }

    setIsAddingParticipant(true);
    setAddParticipantError('');
    setAddParticipantSuccess('');
    try {
      const res = await apiClient.post('/api/calls/transfer', {
        callSid: currentCallSid,
        transferType: 'warm',
        agentId: Number(selectedAgentId),
        conferenceName,
      });
      const data = await res.json();
      if (data?.success) {
        setAddParticipantSuccess('Participant added. They join muted by default.');
        setSelectedAgentId('');
        await loadAvailableAgents();
        return;
      }
      setAddParticipantError(data?.message || 'Failed to add participant');
    } catch (err) {
      console.error('❌ Error adding participant:', err);
      setAddParticipantError(err?.message || 'Failed to add participant');
    } finally {
      setIsAddingParticipant(false);
    }
  }, [currentCallSid, selectedAgentId, loadAvailableAgents]);

  // Cleanup function for call state
  const cleanupCallState = useCallback((reason = 'unknown') => {
    console.log('🧹 [CLEANUP] Call cleanup:', { reason, conferenceName, currentCallSid });
  }, [conferenceName, currentCallSid]);

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
      
      // Cleanup call state
      cleanupCallState(reason);
    } catch (err) {
      console.warn('⚠️ Error in disconnectCall (ignored):', err.message);
    }
  }, [device, cleanupCallState]);

  // Hangup function
  const hangUp = () => {
    try {
      console.log('📞 [HANGUP] hangUp called - initiating call termination');
      
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
          console.log('📞 [HANGUP] Disconnecting active call');
          call.disconnect();
        } else {
          console.log('📞 [HANGUP] Canceling call (not yet connected)');
          if (device && typeof device.disconnectAll === 'function') {
            device.disconnectAll();
          }
        }
      } else if (device && typeof device.disconnectAll === 'function') {
        console.log('📞 [HANGUP] No active connection, disconnecting all calls');
        device.disconnectAll();
      }
      
      disconnectCall('hangup_button');
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
      if (statusData?.uiStatus || statusData?.status) {
        // Ignore client call status updates
        const isClientCall = statusData.twilioData?.isClientCall;
        if (isClientCall) {
          return; // Don't process client call status updates
        }
        
        // Ignore IVR call status updates (they're handled by IVRDialer)
        const isIvrCall = statusData.twilioData?.isIvrCall || 
                         statusData.callPurpose === 'ivr_dialer' ||
                         (statusData.conferenceName && statusData.conferenceName.startsWith('ivr-call-'));
        if (isIvrCall) {
          console.log('📞 [GLOBAL WEB INTERFACE] Ignoring IVR call status update:', currentCallSid);
          return; // Don't process IVR call status updates
        }
        
        // Use uiStatus for UI/timer (ringing until answered, then in-progress)
        const statusForUi = statusData.uiStatus || statusData.status;
        updateCallStatus(statusForUi);
        
        
        // If call is completed/failed/canceled, disconnect the call
        // But only if we're actually connected (not just connecting)
        if (['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'].includes(statusForUi)) {
          if (isConnected || isWebCallConnected) {
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
      
      console.log('📥 [STATUS EVENT RECEIVED]', {
        receivedCallSid: callStatusData?.callSid?.substring(0, 20),
        currentCallSid: currentCallSid?.substring(0, 20),
        status: callStatusData?.status,
        uiStatus: callStatusData?.uiStatus,
        matches: callStatusData?.callSid === currentCallSid
      });
      
      // Adopt real callSid once we start receiving Twilio callbacks.
      // When call starts, we use a temporary callSid like "pending-...".
      if (currentCallSid?.startsWith('pending-') && callStatusData?.callSid) {
        setCurrentCallSid(callStatusData.callSid);
      }

      if (callStatusData?.callSid === currentCallSid || (currentCallSid?.startsWith('pending-') && callStatusData?.callSid)) {
        // Ignore client call status updates (they shouldn't trigger disconnects)
        const isClientCall = callStatusData.twilioData?.isClientCall;
        if (isClientCall) {
          return; // Don't process client call status updates
        }
        
        // Ignore IVR call status updates (they're handled by IVRDialer)
        const isIvrCall = callStatusData.twilioData?.isIvrCall || 
                         callStatusData.callPurpose === 'ivr_dialer' ||
                         (callStatusData.conferenceName && callStatusData.conferenceName.startsWith('ivr-call-'));
        if (isIvrCall) {
          console.log('📞 [GLOBAL WEB INTERFACE] Ignoring IVR call status update:', {
            callSid: callStatusData?.callSid?.substring(0, 20),
            conferenceName: callStatusData?.conferenceName
          });
          return; // Don't process IVR call status updates
        }
        
        // Backend sends status as-is from Twilio - frontend processes it.
        // IMPORTANT: Twilio callbacks can arrive out-of-order (e.g. `in-progress` then a delayed `ringing`).
        // Never allow "downgrades" once we reached a later lifecycle state.
        const statusForUiRaw = callStatusData.uiStatus || callStatusData.status;
        const normalizeUiStatus = (s) => {
          const x = s ? String(s) : '';
          if (x === 'initiated') return 'queued';
          if (x === 'answered') return 'in-progress';
          return x;
        };
        const statusForUi = normalizeUiStatus(statusForUiRaw);
        const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
        const order = { queued: 1, ringing: 2, 'in-progress': 3 };
        const currentUi = normalizeUiStatus(callStatusUiRef.current);
        const currentOrder = order[currentUi] || 0;
        const nextOrder = order[statusForUi] || 0;

        const shouldApply =
          endedStatuses.includes(statusForUi) ||
          (!endedStatuses.includes(currentUi) && nextOrder >= currentOrder);

        if (shouldApply) {
          console.log('📨 [STATUS UPDATE APPLIED]', { 
            statusForUi, 
            currentUi, 
            currentOrder, 
            nextOrder,
            callSid: callStatusData?.callSid?.substring(0, 20)
          });
          updateCallStatus(statusForUi);
        } else {
          console.log('⏭️ [STATUS UPDATE SKIPPED - DOWNGRADE]', { statusForUi, currentUi });
          // Ignore stale/downgrade updates (keeps UI stable)
          return;
        }
        
        
        // If call is completed/failed/canceled, disconnect the call IMMEDIATELY
        // This handles the case when customer hangs up - agent browser should disconnect too
        if (endedStatuses.includes(statusForUi)) {
          console.log('🏁 [CALL ENDED] Call status indicates call has ended:', {
            callSid: callStatusData?.callSid,
            status: statusForUi,
            conferenceName,
            wasConnected: isConnected || isWebCallConnected
          });
          
          // Disconnect immediately if we have any connection (even if just connecting)
          if (isConnected || isWebCallConnected || activeConnection.current) {
            // Disconnect immediately - no delay
            disconnectCall('call_ended_' + statusForUi);
            // End the call in context
            setTimeout(() => {
              endCall();
            }, 200);
          } else {
            // Cleanup call state even if not connected
            cleanupCallState('call_ended_not_connected_' + statusForUi);
          }
        }
      }
    };

    window.addEventListener('callStatusUpdate', handleStatusUpdate);


    // Listen for conference events (join, leave, mute, hold, etc.)
    const handleConferenceEvent = (event) => {
      const { conferenceEventData } = event.detail;
      
      // Ignore IVR conference events (they're handled by IVRDialer)
      const isIvrConference = conferenceEventData?.conferenceName?.startsWith('ivr-call-') ||
                              conferenceEventData?.isIvrCall;
      if (isIvrConference) {
        console.log('📞 [GLOBAL WEB INTERFACE] Ignoring IVR conference event:', {
          conferenceName: conferenceEventData?.conferenceName,
          event: conferenceEventData?.event
        });
        return; // Don't process IVR conference events
      }
      
      // Debug: Log all received events
      console.log('🎯 [CONFERENCE EVENT RECEIVED]', {
        receivedConferenceName: conferenceEventData?.conferenceName,
        expectedConferenceName: conferenceName,
        matches: conferenceEventData?.conferenceName === conferenceName,
        eventType: conferenceEventData?.event,
        participantRole: conferenceEventData?.participantRole,
        callSid: conferenceEventData?.callSid?.substring(0, 20)
      });
      
      if (conferenceEventData?.conferenceName === conferenceName) {
        const { event: eventType, callSid, participantRole, muted, hold } = conferenceEventData;
        
        // Helper: Determine role by matching CallSid with known SIDs
        const determineRole = (sid, providedRole) => {
          if (providedRole && providedRole !== 'unknown') return providedRole;
          // Match against known customer/agent SIDs
          if (sid && sid === knownSids.customerCallSid) return 'customer';
          if (sid && sid === knownSids.agentCallSid) return 'agent';
          if (sid && sid === currentCallSid) return 'customer'; // currentCallSid is customer's
          return 'unknown';
        };

        // Avoid broad role-only matching for agents; use SID whenever available.
        const matchesParticipant = (p, sid, role) => {
          if (sid) return p.callSid === sid;
          if (role === 'customer') return p.role === 'customer';
          return false;
        };
        
        switch (eventType) {
          case 'agent_sid_captured':
            // Backend captured agent's CallSid - store it for matching
            console.log('✅ [AGENT SID CAPTURED]', {
              agentCallSid: conferenceEventData.agentCallSid,
              customerCallSid: conferenceEventData.customerCallSid
            });
            
            // Store both SIDs for future matching
            setKnownSids(prev => ({
              ...prev,
              agentCallSid: conferenceEventData.agentCallSid || prev.agentCallSid,
              customerCallSid: conferenceEventData.customerCallSid || prev.customerCallSid
            }));
            
            // Update/add agent participant
            setParticipants(prev => {
              const existing = prev.find(p => p.callSid === conferenceEventData.agentCallSid);
              if (existing) {
                return prev.map(p => (p.callSid === conferenceEventData.agentCallSid)
                  ? { ...p, callSid: conferenceEventData.agentCallSid, role: 'agent', status: 'connected' }
                  : p
                );
              }
              return [...prev, {
                callSid: conferenceEventData.agentCallSid,
                role: 'agent',
                status: 'connected',
                muted: false,
                hold: false
              }];
            });
            break;
            
          case 'join':
            // Participant joined conference
            // Backend now sends customerCallSid and agentCallSid for matching
            const { customerCallSid: eventCustomerSid, agentCallSid: eventAgentSid } = conferenceEventData;
            
            // Update known SIDs if provided
            if (eventCustomerSid || eventAgentSid) {
              setKnownSids(prev => ({
                customerCallSid: eventCustomerSid || prev.customerCallSid,
                agentCallSid: eventAgentSid || prev.agentCallSid
              }));
            }
            
            // Determine role using provided SIDs
            let role = participantRole;
            if (!role || role === 'unknown') {
              if (callSid && eventCustomerSid && callSid === eventCustomerSid) role = 'customer';
              else if (callSid && eventAgentSid && callSid === eventAgentSid) role = 'agent';
              else if (callSid && callSid === currentCallSid) role = 'customer';
              else if (callSid && callSid === knownSids.customerCallSid) role = 'customer';
              else if (callSid && callSid === knownSids.agentCallSid) role = 'agent';
            }
            
            console.log('👤 [PARTICIPANT JOIN]', { 
              role, 
              callSid: callSid?.substring(0, 20), 
              participantRole,
              eventCustomerSid: eventCustomerSid?.substring(0, 20),
              eventAgentSid: eventAgentSid?.substring(0, 20)
            });
            
            setParticipants(prev => {
              const existing = prev.find(p => {
                if (callSid) return p.callSid === callSid;
                return role === 'customer' && p.role === 'customer';
              });
              // If customer joined with a real CallSid, merge with existing customer placeholder row.
              const existingCustomerByRole =
                role === 'customer' ? prev.find(p => p.role === 'customer') : null;
              
              // NEW FLOW: Customer only joins conference AFTER they answer
              // So when we get a 'join' event for customer, they've already answered!
              // For agent: join event = connected (WebRTC established)
              const newStatus = 'connected'; // Both customer and agent are connected when they join
              
              console.log('✅ [PARTICIPANTS UPDATE - JOIN]', {
                role,
                newStatus,
                existingFound: !!existing,
                prevCount: prev.length,
                callSid: callSid?.substring(0, 20)
              });
              
              if (existing || existingCustomerByRole) {
                return prev.map(p => ((matchesParticipant(p, callSid, role)) || (role === 'customer' && p.role === 'customer'))
                  ? { 
                      ...p, 
                      callSid: callSid || p.callSid, 
                      role: role !== 'unknown' ? role : p.role,
                      status: role === 'customer' ? (p.status === 'connected' ? 'connected' : newStatus) : newStatus,
                      muted: muted === true, 
                      hold: hold === true 
                    }
                  : p
                );
              }
              return [...prev, {
                callSid,
                role: role || 'unknown',
                status: newStatus,
                muted: muted === true,
                hold: hold === true
              }];
            });
            break;
            
          case 'leave':
            // Participant left - update status to 'left'
            const leaveRole = determineRole(callSid, participantRole);
            console.log('👋 [PARTICIPANT LEAVE]', { role: leaveRole, callSid: callSid?.substring(0, 20) });
            setParticipants(prev => prev.map(p =>
              matchesParticipant(p, callSid, leaveRole)
                ? { ...p, status: 'left' } 
                : p
            ));
            break;
            
          case 'mute':
          case 'unmute':
            // Update mute status
            const muteRole = determineRole(callSid, participantRole);
            setParticipants(prev => prev.map(p =>
              matchesParticipant(p, callSid, muteRole)
                ? { ...p, muted: eventType === 'mute' } 
                : p
            ));
            break;
            
          case 'hold':
          case 'unhold':
            // Update hold status
            const holdRole = determineRole(callSid, participantRole);
            setParticipants(prev => prev.map(p =>
              matchesParticipant(p, callSid, holdRole)
                ? { ...p, hold: eventType === 'hold' } 
                : p
            ));
            break;
          
          case 'speech-start':
          case 'speech-stop':
            // Speech detection - update speaking indicator
            const speechRole = determineRole(callSid, participantRole);
            console.log(`🎤 [${eventType.toUpperCase()}]`, { role: speechRole, callSid: callSid?.substring(0, 20) });
            
            setParticipants(prev => prev.map(p => {
              const isMatch = matchesParticipant(p, callSid, speechRole);
              if (!isMatch) return p;
              
              // IMPORTANT: If customer has speech-start, they DEFINITELY answered!
              // This is more reliable than AnswerTime for conference calls
              if (eventType === 'speech-start' && (p.role === 'customer' || speechRole === 'customer')) {
                if (p.status !== 'connected') {
                  console.log('✅ [CUSTOMER ANSWERED via SPEECH] Customer speaking = definitely connected');
                }
                return { ...p, speaking: true, status: 'connected' };
              }
              
              return { ...p, speaking: eventType === 'speech-start' };
            }));
            break;
            
          case 'start':
            // Conference started
            console.log('🎉 [CONFERENCE START]', conferenceName);
            break;
            
          case 'end':
            // Conference ended - clear all participants
            console.log('🏁 [CONFERENCE END]', conferenceName);
            setParticipants([]);
            setKnownSids({ customerCallSid: null, agentCallSid: null });
            break;
            
          default:
            console.log('📞 [CONFERENCE EVENT]', eventType, { callSid: callSid?.substring(0, 20), participantRole });
            break;
        }
      }
    };

    window.addEventListener('conferenceEvent', handleConferenceEvent);

    // Listen for conference status updates
    const handleConferenceStatus = (event) => {
      const { conferenceStatusData } = event.detail;
      
      if (conferenceStatusData?.conferenceName === conferenceName) {
        // Handle conference status updates
        console.log('📊 [CONFERENCE STATUS]', conferenceStatusData);
      }
    };

    window.addEventListener('conferenceStatus', handleConferenceStatus);
    
    const interval = setInterval(updateStatus, 1000);

    return () => {
      window.removeEventListener('callStatusUpdate', handleStatusUpdate);
      window.removeEventListener('conferenceEvent', handleConferenceEvent);
      window.removeEventListener('conferenceStatus', handleConferenceStatus);
      clearInterval(interval);
    };
  }, [currentCallSid, conferenceName, getCallStatus, updateCallStatus, device, endCall, disconnectCall, knownSids]);

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

  // Sync participant status with call status from backend
  useEffect(() => {
    console.log('📊 [CALL STATUS CHANGED]', { callStatus, previousRef: callStatusRef.current });
    
    // When call status becomes 'in-progress', customer has answered
    // This is the reliable indicator (backend checks AnswerTime)
    if (callStatus === 'in-progress') {
      console.log('✅ [CUSTOMER ANSWERED] Call status is in-progress - marking customer as connected');
      setParticipants(prev => {
        console.log('📊 [UPDATING CUSTOMER TO CONNECTED] prev participants:', prev);
        return prev.map(p => 
          p.role === 'customer' ? { ...p, status: 'connected' } : p
        );
      });
    }
    
    // Clear participants and recording state when call ends
    const endedStatuses = ['completed', 'failed', 'canceled', 'busy', 'no-answer', 'voicemail'];
    if (callStatus && endedStatuses.includes(callStatus)) {
      setParticipants([]);
      setKnownSids({ customerCallSid: null, agentCallSid: null });
      setIsRecording(false);
      setActiveRecordingSid(null);
    }
  }, [callStatus]);

  // Initialize participants and known SIDs when call starts
  useEffect(() => {
    if (conferenceName && currentCallSid && isCalling) {
      // Store customer CallSid for matching
      setKnownSids(prev => ({
        ...prev,
        customerCallSid: currentCallSid
      }));
      
      // Initialize with customer participant (from the call we initiated)
      setParticipants(prev => {
        if (prev.length === 0) {
          return [{
            callSid: currentCallSid,
            role: 'customer',
            status: 'waiting', // Waiting for conference join
            muted: false,
            hold: false
          }];
        }
        return prev;
      });
    }
    
    // Clear when no longer calling
    if (!conferenceName && !isCalling) {
      setParticipants([]);
      setKnownSids({ customerCallSid: null, agentCallSid: null });
    }
  }, [conferenceName, currentCallSid, isCalling]);

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

  // Leave only this agent from conference (do not force customer call hangup).
  const handleLeaveCall = () => {
    try {
      if (webCallInterfaceRef.current?.hangUp) {
        webCallInterfaceRef.current.hangUp();
      }
      endCall();
    } catch (err) {
      console.error('Error leaving call:', err);
      endCall();
    }
  };

  useEffect(() => {
    const canManageParticipants =
      (isWebCallConnected || isConnected) &&
      displayCallStatus === 'in-progress';
    if (canManageParticipants) {
      loadAvailableAgents();
    }
  }, [displayCallStatus, isConnected, isWebCallConnected, loadAvailableAgents]);

  // In-app call invitation handling (invited agent joins conference through app, not phone)
  useEffect(() => {
    const handleNewNotification = (event) => {
      const notification = event?.detail?.notification;
      if (!notification || notification.type !== 'call_participant_invite') return;
      if (!notification.conferenceName) return;

      // Do not interrupt if this user is already in another active call.
      if (showWebInterface || currentCallSid || isConnected || isWebCallConnected) {
        return;
      }

      startCall({
        callSid: notification.callSid || `invite-${Date.now()}`,
        conferenceName: notification.conferenceName,
        customerName: notification.customerName || 'Live Call',
        phoneNumber: null,
      });
      setAddParticipantSuccess('');
      setAddParticipantError('');
    };

    window.addEventListener('newNotificationArrived', handleNewNotification);
    return () => {
      window.removeEventListener('newNotificationArrived', handleNewNotification);
    };
  }, [startCall, showWebInterface, currentCallSid, isConnected, isWebCallConnected]);

  if (!showWebInterface || !conferenceName) {
    return null;
  }

  const durationToShow = finalDuration || callTimer;
  const displayError = error || callError;

  return (
    <div
      className={`fixed bottom-4 right-4 z-[9999] transition-all duration-300 ${
        isMinimized ? 'w-64' : 'w-[28rem] max-h-[calc(100vh-2rem)]'
      }`}
    >
      <div className="bg-white rounded-lg shadow-2xl border-2 border-blue-200 backdrop-blur-sm overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
        {/* Header with minimize button and call status */}
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="flex-shrink-0">
              {displayCallStatus === 'in-progress' ? (
                <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
              ) : displayCallStatus === 'ringing' ? (
                // Customer's phone is ringing
                <div className="w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
              ) : displayCallStatus === 'queued' ? (
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
                {(displayCallStatus || (isWebCallConnected || isConnected)) && (
                  <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    displayCallStatus === 'in-progress' ? 'bg-green-500/30 text-green-100' :
                    displayCallStatus === 'ringing' ? 'bg-yellow-500/30 text-yellow-100' :
                    displayCallStatus === 'queued' ? 'bg-gray-500/30 text-gray-100' :
                    displayCallStatus === 'completed' ? 'bg-gray-500/30 text-gray-100' :
                    'bg-red-500/30 text-red-100'
                  }`}>
                    {/* 
                      Outbound call status flow:
                      - "Queued": Call initiated, customer phone not ringing yet
                      - "Ringing": Customer's phone is ringing
                      - "In Progress": Customer answered, call active
                      - "Completed": Call ended (by customer or agent)
                    */}
                    {displayCallStatus === 'in-progress' ? 'In Progress' :
                     displayCallStatus === 'ringing' ? 'Ringing' :
                     displayCallStatus === 'queued' ? 'Queued' :
                     displayCallStatus === 'completed' ? 'Completed' :
                     displayCallStatus && !['in-progress', 'ringing', 'queued', 'completed'].includes(displayCallStatus) ? displayCallStatus :
                     !displayCallStatus && (isWebCallConnected || isConnected) ? 'Connecting' : ''}
                  </div>
                )}
                {/* Timer in Header - only show when in-progress */}
                {displayCallStatus === 'in-progress' && (
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

        {/* Main content - only show when not minimized - scrollable on small viewports */}
        {!isMinimized && (
          <div className="p-4 overflow-y-auto flex-1 min-h-0">
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

            {/* Connected State Info - only when customer actually joined (real in-progress moment) */}
            {(isWebCallConnected || isConnected) && displayCallStatus === 'in-progress' && (
              <div className="flex items-center gap-3 py-2 px-3 rounded-lg border mb-3 bg-green-50 border-green-200">
                <div className="w-3 h-3 rounded-full animate-pulse bg-green-500"></div>
                <div className="text-sm font-semibold text-green-700">
                  Call Connected
                </div>
              </div>
            )}

            {/* Create Sale - when on call, open Add Sale with landline pre-filled (hidden when already on add-sale page) */}
            {!isOnSalePage && (isWebCallConnected || isConnected) && displayCallStatus === 'in-progress' && callMetadata?.phoneNumber && (
              <button
                onClick={() => {
                  const params = new URLSearchParams();
                  params.set('fromCall', '1');
                  params.set('landline', callMetadata.phoneNumber);
                  if (callMetadata.customerName && callMetadata.customerName !== 'Quick Dial' && callMetadata.customerName !== 'Call Log') {
                    params.set('firstName', callMetadata.customerName);
                  }
                  router.push(`/add-sale?${params.toString()}`);
                }}
                className="w-full px-4 py-2 font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 mb-3 bg-blue-600 hover:bg-blue-700 text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create Sale
              </button>
            )}

            {/* Participants Status */}
            {conferenceName && (participants.length > 0 || isCalling) && (
              <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div className="text-xs font-semibold text-gray-700 mb-2">Participants</div>
                <div className="space-y-2">
                  {participants.map((p, idx) => {
                    const statusConfig = {
                      connected: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200', label: 'Connected' },
                      connecting: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200', label: 'Connecting' },
                      ringing: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200', label: 'Ringing' },
                      waiting: { bg: 'bg-gray-100', text: 'text-gray-600', border: 'border-gray-200', label: 'Waiting' },
                      left: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200', label: 'Left' }
                    };
                    const derivedStatus = p.status || 'waiting';
                    const config = statusConfig[derivedStatus] || statusConfig.waiting;
                    const isCurrentAgent = p.callSid && p.callSid === knownSids.agentCallSid;
                    const roleLabel =
                      p.role === 'customer'
                        ? (callMetadata?.customerName || callMetadata?.phoneNumber || 'Customer')
                        : p.role === 'agent'
                        ? (isCurrentAgent ? (user?.firstName || user?.name || 'You') : 'Agent')
                        : 'Participant';

                    return (
                      <div key={p.callSid || `${p.role || 'participant'}-${idx}`} className="flex items-center justify-between text-xs text-gray-700">
                        <div className="flex items-center gap-1.5 truncate">
                          {p.speaking && (
                            <span className="flex items-center" title="Speaking">
                              <svg className="w-3.5 h-3.5 text-green-500 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V22h-2v-6.07z"/>
                              </svg>
                            </span>
                          )}
                          <span className="font-medium capitalize">{p.role || 'participant'}:</span>
                          <span>{roleLabel}</span>
                          {isCurrentAgent && <span className="text-[10px] text-blue-600">(you)</span>}
                        </div>
                        <span className={`text-[11px] px-2 py-0.5 rounded border ${config.bg} ${config.text} ${config.border}`}>
                          {config.label}
                        </span>
                      </div>
                    );
                  })}
                  
                  {/* Mute indicator for customer if connected */}
                  {customerParticipant?.status === 'connected' && customerParticipant?.muted && (
                    <div className="text-[10px] text-orange-600 pl-2">
                      Customer is muted
                    </div>
                  )}
                  
                  {/* Hold indicator */}
                  {customerParticipant?.hold && (
                    <div className="text-[10px] text-yellow-600 pl-2">
                      Customer is on hold
                    </div>
                  )}
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

            {/* Record/Stop Recording Button */}
            {(isWebCallConnected || isConnected) && displayCallStatus === 'in-progress' && (
              <button
                onClick={toggleRecording}
                disabled={recordingControlLoading}
                className={`w-full px-4 py-2 font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 mb-3 ${
                  isRecording 
                    ? 'bg-red-600 hover:bg-red-700 text-white' 
                    : 'bg-gray-600 hover:bg-gray-700 text-white disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
              >
                {recordingControlLoading ? (
                  <span className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></span>
                ) : isRecording ? (
                  <>
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                    <span>Stop Recording</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="6" />
                    </svg>
                    <span>Start Recording</span>
                  </>
                )}
              </button>
            )}

            {/* Recording indicator */}
            {isRecording && (isWebCallConnected || isConnected) && (
              <div className="flex items-center justify-center gap-2 text-xs text-red-600 bg-red-50 p-2 rounded mb-3">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span>Recording in progress</span>
              </div>
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

            {/* Add Internal Participant (Warm transfer only) */}
            {(isWebCallConnected || isConnected) && displayCallStatus === 'in-progress' && (
              <div className="mb-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-xs font-semibold text-slate-700 mb-2">Add Internal Participant</div>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    disabled={isLoadingAgents || isAddingParticipant}
                  >
                    <option value="">Select agent</option>
                    {availableAgents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {`${(agent.status || 'offline').toLowerCase() === 'online' ? '🟢' : (agent.status || 'offline').toLowerCase() === 'away' ? '🟡' : '🔴'} ${agent.name}`}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleAddParticipant}
                    disabled={!selectedAgentId || isAddingParticipant || isLoadingAgents}
                    className="px-3 py-2 text-sm font-medium rounded bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isAddingParticipant ? 'Adding...' : 'Add'}
                  </button>
                </div>
                {isLoadingAgents && (
                  <div className="mt-2 text-[11px] text-slate-600">Loading internal agents...</div>
                )}
                {addParticipantError && (
                  <div className="mt-2 text-[11px] text-red-600">{addParticipantError}</div>
                )}
                {addParticipantSuccess && (
                  <div className="mt-2 text-[11px] text-green-700">{addParticipantSuccess}</div>
                )}
              </div>
            )}

            {/* Keypad - DTMF digits during call */}
            {(isWebCallConnected || isConnected) && displayCallStatus === 'in-progress' && (
              <div className="mb-3">
                <button
                  onClick={() => setShowKeypad(!showKeypad)}
                  className="w-full px-4 py-2 font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 bg-slate-600 hover:bg-slate-700 text-white mb-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  {showKeypad ? 'Hide Keypad' : 'Show Keypad'}
                </button>
                {showKeypad && (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <input
                      type="text"
                      value={keypadDigits}
                      onChange={(e) => setKeypadDigits(e.target.value.replace(/[^0-9*#]/g, ''))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && keypadDigits) {
                          sendKeypadDigits(keypadDigits);
                        }
                      }}
                      placeholder="Enter digits (0-9, *, #)"
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded mb-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setKeypadDigits((prev) => prev + d)}
                          className="py-2 text-lg font-semibold bg-white border border-gray-300 rounded hover:bg-gray-100 active:bg-gray-200 transition-colors"
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => keypadDigits && sendKeypadDigits(keypadDigits)}
                      disabled={!keypadDigits}
                      className="w-full mt-3 px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded transition-colors"
                    >
                      Send (Enter)
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Leave for current agent only (doesn't force-end customer call) */}
            {(isWebCallConnected || isConnected) && displayCallStatus === 'in-progress' && (
              <button
                onClick={handleLeaveCall}
                className="w-full px-4 py-2 font-medium rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mb-3 bg-amber-600 hover:bg-amber-700 text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Leave Call
              </button>
            )}

            {/* Hangup Button - highlight when call ended (shown for single- or multi-agent calls) */}
            {(((isWebCallConnected || isConnected)) || callStatus === 'ringing' || callStatus === 'connecting' || isCalling || isConnecting || callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled') && (
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
          <div className="p-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
            {(callStatus === 'in-progress' || (isWebCallConnected || isConnected)) && (
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
            )}
            {callStatus === 'ringing' && !(isWebCallConnected || isConnected) && (
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse flex-shrink-0"></div>
              )}
              <span className="text-sm font-medium text-gray-700 truncate">
                {callMetadata?.customerName || 'Call'}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Timer in minimized view - only show when in-progress */}
              {callStatus === 'in-progress' && (
                <span className="text-sm font-bold text-green-600 tabular-nums">
                  {formatTimer(durationToShow)}
                </span>
              )}
              {(((isWebCallConnected || isConnected)) || callStatus === 'ringing' || callStatus === 'connecting' || isCalling || isConnecting || callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled') && (
                <button
                  type="button"
                  onClick={handleHangup}
                  title={callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled' ? 'Dismiss' : 'End call'}
                  className={`p-2 rounded-lg transition-colors ${
                    callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled'
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-red-600 hover:bg-red-700 text-white'
                  }`}
                  aria-label={callStatus === 'completed' || callStatus === 'failed' || callStatus === 'canceled' ? 'Dismiss call panel' : 'End call'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                  </svg>
                </button>
              )}
            </div>
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
