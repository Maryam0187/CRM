'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';

export default function WebCallInterface({ conferenceName, onCallEnd }) {
  const { user } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const deviceRef = useRef(null);
  const callRef = useRef(null);
  const [twilioLoaded, setTwilioLoaded] = useState(false);

  useEffect(() => {
    // Load Twilio Client SDK
    if (typeof window !== 'undefined' && !window.Twilio) {
      const script = document.createElement('script');
      script.src = 'https://sdk.twilio.com/js/client/releases/1.14.0/twilio.min.js';
      script.onload = () => {
        setTwilioLoaded(true);
      };
      script.onerror = () => {
        setError('Failed to load Twilio SDK');
      };
      document.body.appendChild(script);
    } else if (window.Twilio) {
      setTwilioLoaded(true);
    }

    return () => {
      // Cleanup on unmount
      if (callRef.current) {
        callRef.current.disconnect();
      }
      if (deviceRef.current) {
        deviceRef.current.destroy();
      }
    };
  }, []);

  useEffect(() => {
    if (twilioLoaded && conferenceName && !isConnected && !isConnecting) {
      connectToConference();
    }
  }, [twilioLoaded, conferenceName]);

  const connectToConference = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Get Twilio access token
      const tokenResponse = await apiClient.get('/api/twilio/token');
      const tokenData = await tokenResponse.json();

      if (!tokenData.success || !tokenData.token) {
        throw new Error('Failed to get access token');
      }

      // Initialize Twilio Device
      const device = new Twilio.Device(tokenData.token, {
        logLevel: 1
      });

      deviceRef.current = device;

      // Set up event handlers
      device.on('ready', () => {
        console.log('Twilio Device ready');
        joinConference();
      });

      device.on('error', (error) => {
        console.error('Twilio Device error:', error);
        setError(`Connection error: ${error.message}`);
        setIsConnecting(false);
      });

      device.on('offline', () => {
        console.log('Twilio Device offline');
        setIsConnected(false);
      });

    } catch (err) {
      console.error('Error connecting to conference:', err);
      setError(err.message || 'Failed to connect');
      setIsConnecting(false);
    }
  };

  const joinConference = () => {
    try {
      if (!deviceRef.current) {
        throw new Error('Device not initialized');
      }

      // Connect directly to conference using conference: prefix
      // This requires the TwiML App to be configured properly
      const params = {
        To: `conference:${conferenceName}`
      };

      const call = deviceRef.current.connect({ params });
      callRef.current = call;

      call.on('accept', () => {
        console.log('Call accepted - connected to conference');
        setIsConnected(true);
        setIsConnecting(false);
      });

      call.on('disconnect', () => {
        console.log('Call disconnected');
        setIsConnected(false);
        if (onCallEnd) {
          onCallEnd();
        }
      });

      call.on('error', (error) => {
        console.error('Call error:', error);
        setError(`Call error: ${error.message}`);
        setIsConnected(false);
        setIsConnecting(false);
      });

    } catch (err) {
      console.error('Error joining conference:', err);
      setError(err.message || 'Failed to join conference');
      setIsConnecting(false);
    }
  };

  const disconnectCall = () => {
    if (callRef.current) {
      callRef.current.disconnect();
      callRef.current = null;
    }
    if (deviceRef.current) {
      deviceRef.current.destroy();
      deviceRef.current = null;
    }
    setIsConnected(false);
    if (onCallEnd) {
      onCallEnd();
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
            onClick={disconnectCall}
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

      {!isConnected && !isConnecting && !error && (
        <button
          onClick={connectToConference}
          className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Join Call
        </button>
      )}
    </div>
  );
}

