'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { getUserSession, clearUserSession, isAuthenticated } from '../lib/auth';
import { getUserLocation } from '../lib/geolocation';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is logged in on app load
    const userSession = getUserSession();
    if (userSession && isAuthenticated()) {
      setUser(userSession);
      
      // Load tokens from localStorage
      if (typeof window !== 'undefined') {
        const storedAccessToken = localStorage.getItem('accessToken');
        const storedRefreshToken = localStorage.getItem('refreshToken');
        
        if (storedAccessToken) {
          setAccessToken(storedAccessToken);
        }
        if (storedRefreshToken) {
          setRefreshToken(storedRefreshToken);
        }
      }
    }
    setLoading(false);
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
        // Try to get location (non-blocking)
        let location = null;
        try {
          location = await getUserLocation({ timeout: 3000 });
        } catch (locationError) {
          console.warn('Could not get location for logout:', locationError.message);
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
            } : null
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
