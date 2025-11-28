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

  // Load Twilio Voice SDK 2.x
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if Twilio is already loaded
    if (window.Twilio) {
      setTwilioLoaded(true);
      return;
    }

    // Load Twilio Voice SDK 2.x
    const script = document.createElement('script');
    script.src = 'https://sdk.twilio.com/js/client/releases/2.0.0/twilio.min.js';
    script.async = true;
    script.onload = () => {
      if (window.Twilio) {
        setTwilioLoaded(true);
      } else {
        setError('Failed to load Twilio SDK');
      }
    };
    script.onerror = () => {
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

        // Initialize Twilio Device with SDK 2.x
        const { Device } = window.Twilio;
        const twilioDevice = new Device(token, {
          logLevel: 1, // 0: off, 1: error, 2: warn, 3: info, 4: debug
          codecPreferences: ['opus', 'pcmu'],
        });

        twilioDevice.on('registered', () => {
          console.log('Twilio Device registered');
          setDevice(twilioDevice);
          setError(null);
          // Auto-join conference when device is registered
          if (conferenceName) {
            joinConference(twilioDevice);
          }
        });

        twilioDevice.on('error', (err) => {
          console.error('Twilio Device error:', err);
          setError(`Device error: ${err.message}`);
          setIsConnecting(false);
        });

        twilioDevice.on('incoming', (connection) => {
          console.log('Incoming call:', connection);
          // For outbound calls, we won't receive incoming calls
        });

        // Register the device
        twilioDevice.register();
        
        setDevice(twilioDevice);

      } catch (err) {
        console.error('Failed to set up Twilio Device:', err);
        setError(err.message);
      }
    };

    setupTwilioDevice();

    return () => {
      if (device) {
        device.unregister();
        device.destroy();
      }
    };
  }, [twilioLoaded, conferenceName, user]);

  const joinConference = async (deviceInstance = device) => {
    if (!deviceInstance || !conferenceName) {
      setError('Device not ready or conference name missing');
      return;
    }
    if (isConnected) {
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log(`Attempting to join conference: ${conferenceName}`);
      
      // Use TwiML App to connect to conference
      const params = {
        To: conferenceName
      };

      const connection = await deviceInstance.connect({ params });
      activeConnection.current = connection;

      connection.on('accept', () => {
        console.log('Call accepted - connected to conference');
        setIsConnected(true);
        setIsConnecting(false);
        onCallConnected && onCallConnected(connection);
      });

      connection.on('disconnect', () => {
        console.log('Call disconnected');
        setIsConnected(false);
        setIsConnecting(false);
        activeConnection.current = null;
        onCallDisconnected && onCallDisconnected();
      });

      connection.on('error', (err) => {
        console.error('Connection error:', err);
        setError(`Connection error: ${err.message}`);
        setIsConnected(false);
        setIsConnecting(false);
      });

    } catch (err) {
      console.error('Error joining conference:', err);
      setError(err.message || 'Failed to join conference');
      setIsConnecting(false);
    }
  };

  const hangUp = () => {
    if (activeConnection.current) {
      console.log('Hanging up call');
      activeConnection.current.disconnect();
    }
    if (device) {
      device.unregister();
      setIsConnected(false);
      setIsConnecting(false);
    }
  };

  if (!conferenceName) {
    return null;
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
          onClick={() => joinConference()}
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

