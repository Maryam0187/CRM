// API client utility with automatic JWT authentication
import { clearUserSession } from './auth';

/**
 * Get access token from localStorage
 */
const getAccessToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('accessToken');
  }
  return null;
};

/**
 * Get refresh token from localStorage
 */
const getRefreshToken = () => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('refreshToken');
  }
  return null;
};

/**
 * Refresh access token using refresh token
 */
const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken();
  
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
      // Store new access token
      if (typeof window !== 'undefined') {
        localStorage.setItem('accessToken', data.accessToken);
      }
      return data.accessToken;
    } else {
      throw new Error(data.error || 'Token refresh failed');
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    throw error;
  }
};

/**
 * Handle token expiration by logging out the user
 */
const handleTokenExpiration = () => {
  console.log('🔒 Token expired, logging out user...');
  
  // Clear user session
  clearUserSession();
  
  // Clear tokens from localStorage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
  }
  
  // Redirect to login page
  if (typeof window !== 'undefined') {
    window.location.href = '/signin';
  }
};

/**
 * Make an authenticated API request with JWT token
 * @param {string} url - API endpoint URL
 * @param {object} options - Fetch options
 * @param {boolean} isRetry - Whether this is a retry after token refresh
 * @returns {Promise<Response>} - Fetch response
 */
export const authenticatedFetch = async (url, options = {}, isRetry = false) => {
  const accessToken = getAccessToken();
  
  // If no access token, check if refresh token is available
  if (!accessToken) {
    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      console.log('🔒 No access token and no refresh token found, redirecting to sign-in page');
      handleTokenExpiration();
      return new Response(JSON.stringify({ error: 'No access token' }), { status: 401 });
    }
    
    // If refresh token exists, attempt to refresh access token
    console.log('🔒 No access token but refresh token available, attempting to refresh...');
    try {
      const newAccessToken = await refreshAccessToken();
      console.log('✅ Access token refreshed successfully');
      
      // Retry the original request with the new token
      return authenticatedFetch(url, options, true);
    } catch (refreshError) {
      console.error('❌ Token refresh failed:', refreshError);
      console.log('🔒 Refresh token expired or invalid, logging out user');
      handleTokenExpiration();
      return new Response(JSON.stringify({ error: 'Token refresh failed' }), { status: 401 });
    }
  }
  
  // Prepare headers with JWT authentication
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    ...options.headers
  };
  
  // Make the request with JWT authentication
  const response = await fetch(url, {
    ...options,
    headers
  });
  
  // Handle token expiration (401 Unauthorized)
  if (response.status === 401) {
    const responseData = await response.json().catch(() => ({}));
    
    // Check if it's an authentication error - trigger refresh on any 401 from protected routes
    // Skip refresh endpoint itself to avoid infinite loops
    const isAuthError = responseData.error && (
      responseData.error.includes('Invalid or missing JWT token') ||
      responseData.error.includes('Unauthorized') ||
      responseData.error.toLowerCase().includes('jwt') ||
      responseData.error.toLowerCase().includes('token')
    );
    
    // Trigger refresh on any 401 from protected routes (not refresh endpoint, not already a retry)
    if (!isRetry && !url.includes('/api/auth/refresh') && (isAuthError || response.status === 401)) {
      // Check if refresh token is available before attempting refresh
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        console.log('🔒 No refresh token available, logging out user');
        handleTokenExpiration();
        return response;
      }
      
      console.log('🔒 JWT token expired or invalid (401), attempting to refresh...');
      
      try {
        // Try to refresh the access token
        const newAccessToken = await refreshAccessToken();
        console.log('✅ Access token refreshed successfully');
        
        // Retry the original request with the new token
        return authenticatedFetch(url, options, true);
        
      } catch (refreshError) {
        console.error('❌ Token refresh failed:', refreshError);
        console.log('🔒 Refresh token expired or invalid, logging out user');
        handleTokenExpiration();
        return response;
      }
    } else if (isRetry || url.includes('/api/auth/refresh')) {
      // If this is already a retry or refresh endpoint failed, logout user
      console.log('🔒 Token refresh already attempted or refresh endpoint failed, logging out user');
      handleTokenExpiration();
      return response;
    }
  }
  
  return response;
};

/**
 * Helper functions for common HTTP methods
 */
export const apiClient = {
  get: (url, options = {}) => authenticatedFetch(url, { method: 'GET', ...options }),
  
  post: (url, data, options = {}) => authenticatedFetch(url, {
    method: 'POST',
    body: JSON.stringify(data),
    ...options
  }),
  
  put: (url, data, options = {}) => authenticatedFetch(url, {
    method: 'PUT',
    body: JSON.stringify(data),
    ...options
  }),
  
  delete: (url, options = {}) => authenticatedFetch(url, { method: 'DELETE', ...options })
};

// Export default for convenience
export default apiClient;
