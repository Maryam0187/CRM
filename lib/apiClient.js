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

// Single in-flight refresh promise so concurrent 401s don't each trigger a refresh
let refreshPromise = null;

/**
 * Refresh access token using refresh token.
 * If a refresh is already in progress, waits for that and returns the same new token.
 */
const refreshAccessToken = async () => {
  const refreshToken = getRefreshToken();

  if (!refreshToken) {
    throw new Error('No refresh token available');
  }

  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
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
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
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
  
  // Prepare headers with JWT authentication (Authorization last so caller cannot overwrite it)
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
    'Authorization': `Bearer ${accessToken}`
  };
  
  // Make the request with JWT authentication
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers
    });
  } catch (fetchError) {
    // Handle network errors (AbortError, Failed to fetch, TypeError, etc.)
    // Don't redirect on network errors - let the caller handle them
    const errorName = fetchError?.name || '';
    const errorMessage = fetchError?.message || String(fetchError) || '';
    const errorString = errorMessage.toLowerCase();
    
    const isNetworkError = 
      errorName === 'AbortError' ||
      errorName === 'TypeError' ||
      errorName === 'NetworkError' ||
      errorMessage === 'Failed to fetch' ||
      errorString.includes('failed to fetch') ||
      errorString.includes('fetch') ||
      errorString.includes('network') ||
      errorString.includes('networkerror');
    
    if (isNetworkError) {
      // Network errors are expected - log as warning, not error
      console.warn('⚠️ Network error in apiClient (will be handled by caller):', fetchError?.message || fetchError);
      // Re-throw network errors so they can be handled by the caller
      throw fetchError;
    }
    // For other fetch errors, re-throw them
    throw fetchError;
  }
  
  // Handle token expiration (401 Unauthorized)
  // Clone before reading body so we can return a readable response to the caller if we return this 401
  if (response.status === 401) {
    const responseClone = response.clone();
    const responseData = await response.json().catch(() => ({}));

    // Check if it's an authentication error - trigger refresh on any 401 from protected routes
    // Skip refresh endpoint itself to avoid infinite loops
    const isAuthError = responseData.error && (
      responseData.error.includes('Invalid or missing JWT token') ||
      responseData.error.includes('Unauthorized') ||
      (typeof responseData.error === 'string' && (
        responseData.error.toLowerCase().includes('jwt') ||
        responseData.error.toLowerCase().includes('token')
      ))
    );

    // Trigger refresh on any 401 from protected routes (not refresh endpoint, not already a retry)
    if (!isRetry && !url.includes('/api/auth/refresh') && (isAuthError || response.status === 401)) {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        console.log('🔒 No refresh token available, logging out user');
        handleTokenExpiration();
        return responseClone;
      }

      console.log('🔒 JWT token expired or invalid (401), attempting to refresh...');

      try {
        const newAccessToken = await refreshAccessToken();
        console.log('✅ Access token refreshed successfully');

        return authenticatedFetch(url, options, true);
      } catch (refreshError) {
        console.error('❌ Token refresh failed:', refreshError);
        console.log('🔒 Refresh token expired or invalid, logging out user');
        handleTokenExpiration();
        return responseClone;
      }
    } else if (isRetry || url.includes('/api/auth/refresh')) {
      console.log('🔒 Token refresh already attempted or refresh endpoint failed, logging out user');
      handleTokenExpiration();
      return responseClone;
    }

    return responseClone;
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
