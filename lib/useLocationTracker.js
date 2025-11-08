'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { getUserLocation, checkGeolocationPermission } from './geolocation';
import apiClient from './apiClient';
import { useAuth } from '../contexts/AuthContext';

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const DEFAULT_CHECK_INTERVAL_MS = parsePositiveNumber(
  process.env.NEXT_PUBLIC_LOCATION_CHECK_INTERVAL_MS,
  15 * 60 * 1000
);

const DEFAULT_ERROR_THRESHOLD = parsePositiveNumber(
  process.env.NEXT_PUBLIC_LOCATION_ERROR_THRESHOLD,
  2
);

/**
 * Hook to track user location changes and update backend
 * @param {Object} options - Configuration options
 * @param {number} options.checkInterval - Interval between location checks in ms
 * @param {boolean} options.enabled - Whether location tracking is enabled
 * @param {number} options.errorThreshold - Consecutive errors before logout
 */
export const useLocationTracker = (options = {}) => {
  const {
    checkInterval = DEFAULT_CHECK_INTERVAL_MS,
    enabled = true,
    errorThreshold = DEFAULT_ERROR_THRESHOLD
  } = options;

  const locationErrorCountRef = useRef(0);
  const isUpdatingRef = useRef(false);
  const locationCheckIntervalRef = useRef(null);
  const router = useRouter();
  const { logout } = useAuth();

  // Cleanup function to clear intervals and logout
  const handleLocationLost = async () => {
    if (locationCheckIntervalRef.current) {
      clearInterval(locationCheckIntervalRef.current);
      locationCheckIntervalRef.current = null;
    }

    try {
      await logout();
      router.push('/signin');
      alert('Your session has been terminated because location access is no longer available. Please enable location services and login again.');
    } catch (logoutError) {
      console.error('Error during logout:', logoutError);
      router.push('/signin');
    }
  };

  // Update location on backend
  const updateLocationOnBackend = async (location) => {
    if (isUpdatingRef.current) {
      console.log('📍 Location update already in progress, skipping...');
      return;
    }

    isUpdatingRef.current = true;

    try {
      const response = await apiClient.put('/api/users/location', {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy
      });

      const data = await response.json();
      
      if (data.success) {
        console.log('✅ Location updated successfully:', {
          latitude: location.latitude.toFixed(6),
          longitude: location.longitude.toFixed(6),
          accuracy: `${Math.round(location.accuracy)}m`
        });
        // Reset error count on successful update
        locationErrorCountRef.current = 0;
      } else {
        console.warn('⚠️ Location update failed:', data.error);
      }
    } catch (error) {
      console.error('❌ Error updating location:', error);
    } finally {
      isUpdatingRef.current = false;
    }
  };

  // Check location periodically
  const checkLocation = async () => {
    if (!enabled || isUpdatingRef.current) {
      return;
    }

    try {
      // First check permission
      const permission = await checkGeolocationPermission();
      
      if (permission === 'denied') {
        console.error('🚨 Location permission denied - logging out user');
        await handleLocationLost();
        return;
      }

      if (permission !== 'granted') {
        console.log('📍 Location permission not granted, skipping check');
        return;
      }

      // Get current location
      const location = await getUserLocation({
        timeout: 10000,
        enableHighAccuracy: true,
        maximumAge: 60000 // Accept cached location up to 1 minute old
      });

      if (location && location.latitude && location.longitude) {
        // Reset error count on success
        locationErrorCountRef.current = 0;
        // Update location on backend
        await updateLocationOnBackend(location);
      }
    } catch (error) {
      locationErrorCountRef.current += 1;
      console.warn(`❌ Location check error (${locationErrorCountRef.current}):`, error.message);

      // Check if this is a permission error or position unavailable
      const isPermissionError = error.message && (
        error.message.includes('denied') || 
        error.message.includes('PERMISSION_DENIED') ||
        error.code === 1
      );

      const isPositionUnavailable = error.message && (
        error.message.includes('unavailable') || 
        error.message.includes('POSITION_UNAVAILABLE') ||
        error.code === 2
      );

      // If permission denied or position unavailable for N consecutive errors, logout
      if ((isPermissionError || isPositionUnavailable) && locationErrorCountRef.current >= errorThreshold) {
        console.error('🚨 Location access lost - logging out user');
        await handleLocationLost();
        return;
      }

      // For timeout errors, don't logout (just retry next time)
      if (error.message && error.message.includes('timeout')) {
        console.log('⏱️ Location timeout - will retry on next check');
        return;
      }
    }
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Check location immediately on mount
    checkLocation();

    // Set up periodic location checks (permission is checked as part of location check)
    locationCheckIntervalRef.current = setInterval(() => {
      checkLocation();
    }, checkInterval);

    // Cleanup on unmount or when disabled
    return () => {
      if (locationCheckIntervalRef.current) {
        clearInterval(locationCheckIntervalRef.current);
        locationCheckIntervalRef.current = null;
      }
      console.log('📍 Location tracking stopped');
    };
  }, [enabled, checkInterval, errorThreshold, logout, router]);

  // Return nothing (this is a side-effect hook)
  return null;
};

