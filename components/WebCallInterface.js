'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { Device } from '@twilio/voice-sdk';

export default function WebCallInterface({ conferenceName, onCallConnected, onCallDisconnected }) {
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
        const token = await fetchToken();
        if (!token) return;

        console.log('📞 Setting up Twilio Device (SDK 2.x)...');
        
        const twilioDevice = new Device(token, {
          logLevel: 1,
          codecPreferences: ['opus', 'pcmu'],
        });

        twilioDevice.on('registered', () => {
          console.log('✅ Twilio Device registered');
          setDevice(twilioDevice);
          setError(null);
          // Auto-join conference when device is registered
          setTimeout(() => {
            if (conferenceName && !isConnected) {
              console.log('📞 Auto-joining conference:', conferenceName);
              joinConference(twilioDevice);
            }
          }, 500);
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

  const joinConference = (deviceInstance = device) => {
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
      const call = deviceInstance.connect({ params });
      
      if (!call) {
        throw new Error('Failed to create call');
      }

      activeConnection.current = call;

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
        setError(`Call error: ${err.message || err.code || 'Unknown error'}`);
        setIsConnected(false);
        setIsConnecting(false);
      });

      call.on('reject', () => {
        console.error('❌ Call rejected');
        setError('Call was rejected');
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
}
