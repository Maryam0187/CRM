'use client';

import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { UserAgent, Registerer } from 'sip.js';

// Create context for SIP connection
const SipConnectionContext = createContext();

export function useSipConnection() {
  const context = useContext(SipConnectionContext);
  if (!context) {
    throw new Error('useSipConnection must be used within SipConnectionProvider');
  }
  return context;
}

/**
 * SIP Connection Provider Component
 * Maintains persistent SIP registration to Twilio SIP Domain using SIP.js
 * 
 * Features:
 * - Registers to SIP domain when agent logs in (required for outbound calls)
 * - Stays registered while active
 * - Disconnects on logout
 * - Cost: $0 (only pay for call minutes)
 * 
 * Note: This is primarily for OUTBOUND call center use.
 * - Inbound calls are rejected for now (will be implemented later)
 * - Agent registration ensures they can receive calls when customers answer outbound calls
 */
export function SipConnectionProvider({ children }) {
  const { user } = useAuth();
  const [isRegistered, setIsRegistered] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  
  const userAgent = useRef(null);
  const registerer = useRef(null);
  const reconnectTimeout = useRef(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  // Check if agent has SIP configuration
  const hasSipConfig = () => {
    return user && user.extension && user.sipUsername && user.sipDomain;
  };

  // Get decrypted SIP password from API
  const getSipPassword = async () => {
    if (!user || !user.id) {
      return null;
    }

    try {
      const response = await apiClient.get('/api/agents/sip-password');
      const data = await response.json();
      
      if (data.success && data.data) {
        return data.data.password;
      }
      
      return null;
    } catch (err) {
      console.error('Error getting SIP password:', err);
      return null;
    }
  };

  // Connect to SIP domain using SIP.js
  const connectToSip = async () => {
    if (isConnecting || isRegistered) {
      console.log('⚠️ Already connecting or registered');
      return;
    }

    if (!hasSipConfig()) {
      setError('SIP extension not configured. Please contact administrator.');
      return;
    }

    setIsConnecting(true);
    setError(null);
    reconnectAttempts.current = 0;

    try {
      console.log('📞 Connecting to SIP domain using SIP.js...');
      console.log('📞 Extension:', user.extension);
      console.log('📞 SIP Username:', user.sipUsername);
      console.log('📞 SIP Domain:', user.sipDomain);

      // Get decrypted SIP password from API
      const password = await getSipPassword();
      if (!password) {
        throw new Error('SIP password not available. Please contact administrator.');
      }

      // Build SIP URI and WebSocket server
      const sipDomain = user.sipDomain;
      const sipUri = `sip:${user.sipUsername}@${sipDomain}`;
      const server = `wss://${sipDomain}:443`; // Twilio SIP Domain WebSocket endpoint

      console.log('📞 SIP URI:', sipUri);
      console.log('📞 Server:', server);

      // Create SIP.js UserAgent
      const userAgentOptions = {
        uri: UserAgent.makeURI(sipUri),
        transportOptions: {
          server: server,
          connectionTimeout: 30,
          maxReconnectionAttempts: 10,
          reconnectionTimeout: 4
        },
        authorizationUsername: user.sipUsername,
        authorizationPassword: password,
        displayName: `${user.firstName} ${user.lastName}`,
        logLevel: 'warn', // 'debug' for more logs, 'warn' for less
        delegate: {
          onInvite: (invitation) => {
            console.log('📞 Incoming call received via SIP!');
            handleIncomingCall(invitation);
          }
        }
      };

      const ua = new UserAgent(userAgentOptions);
      userAgent.current = ua;

      // Handle UserAgent events
      ua.onConnect = () => {
        console.log('✅ SIP UserAgent connected');
      };

      ua.onDisconnect = (error) => {
        console.log('⚠️ SIP UserAgent disconnected', error);
        setIsRegistered(false);
        if (error) {
          handleReconnect();
        }
      };

      ua.onMessage = (message) => {
        console.log('📨 SIP message received:', message);
      };

      // Start the UserAgent
      await ua.start();
      console.log('✅ SIP UserAgent started');

      // Create Registerer and register
      const registererOptions = {
        expires: 3600, // 1 hour
        registrar: UserAgent.makeURI(`sip:${sipDomain}`)
      };

      const reg = new Registerer(ua, registererOptions);
      registerer.current = reg;

      // Handle registration state changes
      reg.stateChange.addListener((newState) => {
        console.log('📞 Registration state:', newState);
        const stateString = newState.toString();
        
        if (stateString.includes('Registered') || stateString === 'Registered') {
          setIsRegistered(true);
          setIsConnecting(false);
          setError(null);
          reconnectAttempts.current = 0;
          console.log('✅ Successfully registered to SIP domain!');
          
          // Update agent status in database
          updateAgentStatus('available');
        } else if (stateString.includes('Unregistered') || stateString === 'Unregistered') {
          setIsRegistered(false);
          console.log('⚠️ Unregistered from SIP domain');
        } else if (stateString.includes('Terminated') || stateString === 'Terminated') {
          setIsRegistered(false);
          handleReconnect();
        }
      });

      // Register to SIP domain
      await reg.register();
      console.log('📞 Registration request sent');

    } catch (err) {
      console.error('❌ Error connecting to SIP:', err);
      setError(err.message || 'Failed to connect to SIP domain');
      setIsConnecting(false);
      setIsRegistered(false);
      handleReconnect();
    }
  };

  // Handle incoming call (for future inbound implementation)
  // Note: Inbound calls will be implemented later - for now just log
  const handleIncomingCall = async (invitation) => {
    console.log('📞 Incoming SIP call received (inbound not yet implemented):', invitation);
    
    // Reject incoming calls for now since this is primarily an outbound call center
    // Inbound implementation will be added later
    try {
      await invitation.reject();
      console.log('⚠️ Incoming call rejected - inbound calls not yet implemented');
    } catch (err) {
      console.error('❌ Error rejecting call:', err);
    }
  };

  // Update agent status in database
  const updateAgentStatus = async (status) => {
    if (!user || !user.id) return;

    try {
      await apiClient.put(`/api/agents/sip-status`, {
        agentId: user.id,
        callStatus: status
      });
    } catch (err) {
      console.error('Error updating agent status:', err);
    }
  };

  // Handle reconnection
  const handleReconnect = () => {
    if (reconnectAttempts.current >= maxReconnectAttempts) {
      setError('Failed to connect after multiple attempts. Please refresh the page.');
      return;
    }

    reconnectAttempts.current++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
    
    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
    
    reconnectTimeout.current = setTimeout(() => {
      if (user && hasSipConfig() && !isRegistered) {
        connectToSip();
      }
    }, delay);
  };

  // Disconnect from SIP
  const disconnectFromSip = async () => {
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    // Unregister
    if (registerer.current) {
      try {
        await registerer.current.unregister();
        console.log('✅ Unregistered from SIP domain');
      } catch (err) {
        console.error('Error unregistering:', err);
      }
      registerer.current = null;
    }

    // Stop UserAgent
    if (userAgent.current) {
      try {
        await userAgent.current.stop();
        console.log('✅ SIP UserAgent stopped');
      } catch (err) {
        console.error('Error stopping UserAgent:', err);
      }
      userAgent.current = null;
    }

    // Update agent status
    await updateAgentStatus('offline');

    setIsRegistered(false);
    setIsConnecting(false);
    setError(null);
    reconnectAttempts.current = 0;
    
    console.log('✅ Disconnected from SIP domain');
  };


  // Initialize when user logs in
  useEffect(() => {
    if (user && hasSipConfig()) {
      console.log('👤 User logged in with SIP config, connecting to SIP domain...');
      connectToSip();
    } else {
      console.log('⚠️ User not configured for SIP, skipping connection');
      setIsRegistered(false);
    }

    return () => {
      disconnectFromSip();
    };
  }, [user?.id, user?.extension, user?.sipUsername]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromSip();
    };
  }, []);

  const value = {
    isRegistered,
    isConnecting,
    error,
    hasSipConfig: hasSipConfig(),
    connect: connectToSip,
    disconnect: disconnectFromSip,
    reconnect: () => {
      disconnectFromSip();
      setTimeout(connectToSip, 1000);
    }
  };

  return (
    <SipConnectionContext.Provider value={value}>
      {children}
      {/* Connection status indicator */}
      {user && hasSipConfig() && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className={`px-3 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 ${
            isRegistered
              ? 'bg-green-500 text-white' 
              : isConnecting
                ? 'bg-yellow-500 text-white' 
                : 'bg-red-500 text-white'
          }`}>
            {isRegistered ? (
              <>
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span>📞 SIP Registered (Ext: {user.extension})</span>
              </>
            ) : isConnecting ? (
              <>
                <div className="w-2 h-2 bg-white rounded-full animate-spin"></div>
                <span>🔄 Registering...</span>
              </>
            ) : (
              <>
                <div className="w-2 h-2 bg-white rounded-full"></div>
                <span>❌ SIP Disconnected</span>
              </>
            )}
          </div>
        </div>
      )}
    </SipConnectionContext.Provider>
  );
}

export default SipConnectionProvider;
