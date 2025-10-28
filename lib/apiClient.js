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
 * @returns {Promise<Response>} - Fetch response
 */
export const authenticatedFetch = async (url, options = {}) => {
  const accessToken = getAccessToken();
  
  // If no token, redirect to sign-in page immediately
  if (!accessToken) {
    console.log('🔒 No access token found, redirecting to sign-in page');
    handleTokenExpiration();
    return new Response(JSON.stringify({ error: 'No access token' }), { status: 401 });
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
    
    // Check if it's a token expiration error
    if (responseData.error && responseData.error.includes('Invalid or missing JWT token')) {
      console.log('🔒 JWT token expired or invalid, logging out user');
      handleTokenExpiration();
      return response; // Return the original response
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
