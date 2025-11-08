'use client';

import { useActivityTracker } from '../lib/useActivityTracker';
import { useLocationTracker } from '../lib/useLocationTracker';
import { useAuth } from '../contexts/AuthContext';

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Component that tracks user activity and location, automatically manages status
 * This component should be rendered for authenticated users
 */
export default function ActivityTracker() {
  const { isAuthenticated, user } = useAuth();

  const inactivityTimeout = parsePositiveNumber(
    process.env.NEXT_PUBLIC_ACTIVITY_INACTIVITY_TIMEOUT_MS,
    60 * 1000 // default 60 seconds
  );

  const locationCheckInterval = parsePositiveNumber(
    process.env.NEXT_PUBLIC_LOCATION_CHECK_INTERVAL_MS,
    15 * 60 * 1000 // default 15 minutes
  );

  const locationErrorThreshold = parsePositiveNumber(
    process.env.NEXT_PUBLIC_LOCATION_ERROR_THRESHOLD,
    2 // default threshold
  );

  // Only track activity for authenticated users
  useActivityTracker({
    inactivityTimeout,
    enabled: isAuthenticated
  });

  // Track location changes for authenticated users with location permission
  useLocationTracker({
    checkInterval: locationCheckInterval,
    errorThreshold: locationErrorThreshold,
    enabled: isAuthenticated && user?.location_permission === 'granted'
  });

  // This component doesn't render anything
  return null;
}

