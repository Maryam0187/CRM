'use client';

import { useState, useEffect } from 'react';
import { checkGeolocationPermission, getUserLocation } from '../lib/geolocation';
import apiClient from '../lib/apiClient';
import { useAuth } from '../contexts/AuthContext';

/**
 * Location Permission Prompt Component
 * Shows a one-time permission request for location tracking
 */
export default function LocationPermissionPrompt() {
  const { user, isAuthenticated, updateUser } = useAuth();
  const [showPrompt, setShowPrompt] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('unknown');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Only check permission if user is authenticated
    if (isAuthenticated) {
      checkPermissionStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  const checkPermissionStatus = async () => {
    try {
      // Check browser geolocation permission
      const browserStatus = await checkGeolocationPermission();
      setPermissionStatus(browserStatus);

      // Sync browser permission with database
      const dbPermission = user?.location_permission;
      
      // If user changed permission in browser settings, update database
      if (browserStatus === 'granted' && dbPermission !== 'granted') {
        console.log('📍 Browser permission changed to granted, syncing with database');
        await savePermissionToDB('granted');
      } else if (browserStatus === 'denied' && dbPermission !== 'denied') {
        console.log('📍 Browser permission changed to denied, syncing with database');
        await savePermissionToDB('denied');
      }

      // Only show prompt if:
      // 1. User hasn't made a decision yet (not_set or prompt in DB)
      // 2. Browser permission is still 'prompt'
      // 3. User hasn't dismissed it
      if (browserStatus === 'prompt' && (!dbPermission || dbPermission === 'not_set' || dbPermission === 'prompt')) {
        const dismissedKey = 'locationPermissionDismissed';
        const hasBeenDismissed = localStorage.getItem(dismissedKey);
        
        if (!hasBeenDismissed) {
          setShowPrompt(true);
        }
      }
    } catch (error) {
      console.error('Error checking permission status:', error);
    }
  };

  const savePermissionToDB = async (permission) => {
    try {
      await apiClient.put('/api/users/location-permission', { permission });
      console.log(`✅ Location permission (${permission}) saved to database`);
      // Update user state
      updateUser({ location_permission: permission });
    } catch (error) {
      console.error('Failed to save permission to database:', error);
    }
  };

  const handleAllow = async () => {
    setIsLoading(true);
    try {
      // Try to get location to trigger permission prompt
      await getUserLocation({ timeout: 5000 });
      
      // Success - user granted permission
      setPermissionStatus('granted');
      setShowPrompt(false);
      
      // Store in localStorage that we've handled the permission
      localStorage.setItem('locationPermissionDismissed', 'true');
      
      // Save to database
      await savePermissionToDB('granted');
      
      console.log('✅ Location permission granted');
    } catch (error) {
      console.error('Failed to get location:', error);
      
      if (error.message.includes('denied')) {
        setPermissionStatus('denied');
        setShowPrompt(false);
        localStorage.setItem('locationPermissionDismissed', 'true');
        await savePermissionToDB('denied');
      }
      // If it's a timeout or other error, keep showing the prompt
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = async () => {
    setShowPrompt(false);
    localStorage.setItem('locationPermissionDismissed', 'true');
    // Don't save anything to DB for dismiss - user didn't make a decision
  };

  const handleDeny = async () => {
    setPermissionStatus('denied');
    setShowPrompt(false);
    localStorage.setItem('locationPermissionDismissed', 'true');
    await savePermissionToDB('denied');
  };

  // Don't show if already granted/denied or if dismissed
  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 max-w-md bg-white border border-gray-300 rounded-lg shadow-lg z-50 p-6 animate-slide-up">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <div className="ml-4 flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Enable Location Tracking
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Help us improve your experience by allowing location tracking. We'll use this data for attendance monitoring and security purposes only.
          </p>
          <div className="flex space-x-3">
            <button
              onClick={handleAllow}
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Requesting...
                </span>
              ) : (
                'Allow'
              )}
            </button>
            <button
              onClick={handleDeny}
              disabled={isLoading}
              className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50 transition-colors"
            >
              Deny
            </button>
            <button
              onClick={handleDismiss}
              disabled={isLoading}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Dismiss"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            You can change this later in your browser settings
          </p>
        </div>
      </div>
    </div>
  );
}

