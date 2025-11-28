'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';

export default function WebCallInterface({ conferenceName, onCallConnected, onCallDisconnected }) {
  const { user } = useAuth();
  const [device, setDevice] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const activeConnection = useRef(null);
  const [twilioLoaded, setTwilioLoaded] = useState(false);

  // Load Twilio Voice SDK
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if Twilio is already loaded
    if (window.Twilio?.Device) {
      setTwilioLoaded(true);
      return;
    }

    // Load Twilio Voice SDK from CDN
    const script = document.createElement('script');
    script.src = 'https://sdk.twilio.com/js/client/releases/1.14.0/twilio.min.js';
    script.async = true;
    script.onload = () => {
      if (window.Twilio?.Device) {
        setTwilioLoaded(true);
        console.log('✅ Twilio SDK loaded');
      } else {
        console.error('❌ Twilio SDK loaded but Device not found');
        setError('Failed to load Twilio SDK - Device not found');
      }
    };
    script.onerror = () => {
      console.error('❌ Failed to load Twilio SDK script');
      setError('Failed to load Twilio SDK');
    };
    document.body.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

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
    if (!twilioLoaded || !conferenceName || !user) return;

    const setupTwilioDevice = async () => {
      try {
        const token = await fetchToken();
        if (!token) return;

        // Initialize Twilio Device using SDK 1.x API
        if (!window.Twilio || !window.Twilio.Device) {
          throw new Error('Twilio SDK not loaded properly');
        }

        console.log('📞 Setting up Twilio Device...');
        window.Twilio.Device.setup(token, {
          logLevel: 1,
          codecPreferences: ['opus', 'pcmu']
        });

        const twilioDevice = window.Twilio.Device;

        twilioDevice.on('ready', () => {
          console.log('✅ Twilio Device ready');
          setDevice(twilioDevice);
          setError(null);
          // Auto-join conference when device is ready
          setTimeout(() => {
            if (conferenceName && !isConnected) {
              console.log('📞 Auto-joining conference:', conferenceName);
              joinConference();
            }
          }, 500);
        });

        twilioDevice.on('error', (err) => {
          console.error('❌ Twilio Device error:', err);
          setError(`Device error: ${err.message || err.code}`);
          setIsConnecting(false);
        });

        twilioDevice.on('incoming', (connection) => {
          console.log('📞 Incoming call:', connection);
          // For outbound calls, reject incoming calls
          connection.reject();
        });

        twilioDevice.on('offline', () => {
          console.log('📞 Device offline');
          setIsConnected(false);
        });

        twilioDevice.on('tokenWillExpire', async () => {
          console.log('🔄 Token expiring, refreshing...');
          const newToken = await fetchToken();
          if (newToken) {
            twilioDevice.updateToken(newToken);
          }
        });
        
        setDevice(twilioDevice);

      } catch (err) {
        console.error('❌ Failed to set up Twilio Device:', err);
        setError(err.message);
      }
    };

    setupTwilioDevice();

    return () => {
      if (device) {
        try {
          device.disconnectAll();
          device.destroy();
        } catch (e) {
          console.error('Error cleaning up device:', e);
        }
      }
    };
  }, [twilioLoaded, conferenceName, user]);

  const joinConference = () => {
    if (!device || !conferenceName) {
      const errorMsg = `Device not ready or conference name missing. Device: ${!!device}, Conference: ${conferenceName}`;
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
      // The 'To' parameter will be passed to the TwiML App's Voice URL
      const params = {
        To: conferenceName
      };

      console.log('📞 Connecting with params:', params);
      const connection = device.connect(params);
      
      if (!connection) {
        throw new Error('Failed to create connection');
      }

      activeConnection.current = connection;

      connection.on('accept', () => {
        console.log('✅ Call accepted - connected to conference');
        setIsConnected(true);
        setIsConnecting(false);
        onCallConnected && onCallConnected(connection);
      });

      connection.on('disconnect', () => {
        console.log('📞 Call disconnected');
        setIsConnected(false);
        setIsConnecting(false);
        activeConnection.current = null;
        onCallDisconnected && onCallDisconnected();
      });

      connection.on('error', (err) => {
        console.error('❌ Connection error:', err);
        setError(`Connection error: ${err.message || err.code || 'Unknown error'}`);
        setIsConnected(false);
        setIsConnecting(false);
      });

      connection.on('reject', () => {
        console.error('❌ Connection rejected');
        setError('Connection was rejected');
        setIsConnected(false);
        setIsConnecting(false);
      });

    } catch (err) {
      console.error('❌ Error joining conference:', err);
      setError(err.message || 'Failed to join conference');
      setIsConnecting(false);
    }
  };

  const hangUp = () => {
    if (activeConnection.current) {
      console.log('📞 Hanging up call');
      activeConnection.current.disconnect();
    }
    if (device) {
      device.disconnectAll();
      setIsConnected(false);
      setIsConnecting(false);
    }
  };

  console.log('📞 WebCallInterface render - conferenceName:', conferenceName, 'twilioLoaded:', twilioLoaded, 'device:', !!device);

  if (!conferenceName) {
    console.log('⚠️ WebCallInterface: No conference name, returning null');
    return (
      <div className="fixed bottom-4 right-4 bg-yellow-100 border-2 border-yellow-500 rounded-lg p-4 z-50 min-w-[300px]">
        <p className="text-sm text-yellow-800">⚠️ Conference name missing</p>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white shadow-lg rounded-lg p-4 border-2 border-blue-500 z-50 min-w-[300px]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">Web Call</h3>
        {isConnected && (
          <button
            onClick={hangUp}
            className="text-red-600 hover:text-red-700 text-sm font-medium"
          >
            End Call
          </button>
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

      {!isConnected && !isConnecting && !error && twilioLoaded && (
        <button
          onClick={joinConference}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Join Call
        </button>
      )}

      {!twilioLoaded && (
        <div className="text-sm text-gray-500">Loading Twilio SDK...</div>
      )}
    </div>
  );
}
