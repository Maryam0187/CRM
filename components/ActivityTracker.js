'use client';

import { useActivityTracker } from '../lib/useActivityTracker';
import { useAuth } from '../contexts/AuthContext';

/**
 * Component that tracks user activity and automatically manages status
 * This component should be rendered for authenticated users
 */
export default function ActivityTracker() {
  const { isAuthenticated } = useAuth();

  // Only track activity for authenticated users
  useActivityTracker({
    inactivityTimeout: 2 * 30 * 1000, // 30 seconds of inactivity before setting to "away"
    enabled: isAuthenticated
  });

  // This component doesn't render anything
  return null;
}

