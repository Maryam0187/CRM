'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getUserSession, clearUserSession, isAuthenticated } from '../lib/auth';

function isAccessTokenExpired(token, bufferSeconds = 60) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp && payload.exp * 1000 < Date.now() + bufferSeconds * 1000;
  } catch {
    return true;
  }
}
import { getUserLocation, checkGeolocationPermission } from '../lib/geolocation';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const userSession = getUserSession();
      if (userSession && isAuthenticated() && typeof window !== 'undefined') {
        const storedAccessToken = localStorage.getItem('accessToken');
        const storedRefreshToken = localStorage.getItem('refreshToken');
        setUser(userSession);
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);

        // Proactively refresh access token on load if it's expired (avoids 401 on first requests after refresh)
        if (storedRefreshToken && isAccessTokenExpired(storedAccessToken)) {
          try {
            const res = await fetch('/api/auth/refresh', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ refreshToken: storedRefreshToken })
            });
            const data = await res.json();
            if (data.success && data.accessToken) {
              localStorage.setItem('accessToken', data.accessToken);
              setAccessToken(data.accessToken);
            }
          } catch {
            // Ignore - first API call will trigger refresh flow
          }
        }
      }
      setLoading(false);
    };
    init();
  }, []);

  const login = (userData, accessToken = null, refreshTokenValue = null) => {
    console.log('🔍 AuthContext - Login called with:', { 
      userData: userData ? 'exists' : 'missing', 
      accessToken: accessToken ? 'exists' : 'missing', 
      refreshTokenValue: refreshTokenValue ? 'exists' : 'missing' 
    });
    
    setUser(userData);
    if (accessToken) {
      setAccessToken(accessToken);
      // Store access token in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', accessToken);
        console.log('🔍 AuthContext - Access token stored in localStorage');
      }
    }
    if (refreshTokenValue) {
      setRefreshToken(refreshTokenValue);
      // Store refresh token in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('refreshToken', refreshTokenValue);
        console.log('🔍 AuthContext - Refresh token stored in localStorage');
      }
    }
  };

  const logout = async () => {
    // Call logout API to update server-side status and log activity
    try {
      const token = accessToken || (typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null);
      if (token) {
        // Try to get location and permission status (non-blocking)
        let location = null;
        let permissionStatus = 'not_set';
        
        try {
          permissionStatus = await checkGeolocationPermission();
          if (permissionStatus === 'granted' || permissionStatus === 'prompt') {
                 try {
                   location = await getUserLocation({ timeout: 3000, enableHighAccuracy: true, maximumAge: 0 });
              if (location) {
                permissionStatus = 'granted';
              }
            } catch (locationError) {
              console.warn('Could not get location for logout:', locationError.message);
              if (locationError.message.includes('denied')) {
                permissionStatus = 'denied';
              }
            }
          }
        } catch (error) {
          console.warn('Could not check location permission for logout:', error.message);
        }

        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            location: location ? {
              latitude: location.latitude,
              longitude: location.longitude,
              accuracy: location.accuracy
            } : null,
            locationPermission: permissionStatus
          })
        }).catch(error => {
          // Don't block logout if API call fails
          console.error('Logout API call failed:', error);
        });
      }
    } catch (error) {
      // Don't block logout if API call fails
      console.error('Error calling logout API:', error);
    }

    // Clear local state
    clearUserSession();
    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    // Clear tokens from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
    }
  };

  const refreshAccessToken = async () => {
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken })
      });

      const data = await response.json();

      if (data.success) {
        setAccessToken(data.accessToken);
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', data.accessToken);
        }
        console.log('✅ AuthContext - Access token refreshed successfully');
        return data.accessToken;
      } else {
        throw new Error(data.error || 'Token refresh failed');
      }
    } catch (error) {
      console.error('❌ AuthContext - Token refresh error:', error);
      // If refresh fails, logout user
      logout();
      throw error;
    }
  };

  const updateUser = (updatedData) => {
    if (user) {
      const newUserData = { ...user, ...updatedData };
      setUser(newUserData);
      // Update localStorage as well
      if (typeof window !== 'undefined') {
        localStorage.setItem('user', JSON.stringify(newUserData));
      }
    }
  };

  const value = {
    user,
    accessToken,
    refreshToken,
    login,
    logout,
    refreshAccessToken,
    updateUser,
    loading,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
