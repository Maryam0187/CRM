// API client utility with automatic authentication headers
import { getUserSession } from './auth';

/**
 * Make an authenticated API request
 * @param {string} url - API endpoint URL
 * @param {object} options - Fetch options
 * @returns {Promise<Response>} - Fetch response
 */
export const authenticatedFetch = async (url, options = {}) => {
  const user = getUserSession();
  
  // Prepare headers
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  // Add authentication headers if user is logged in
  if (user) {
    headers['x-user-id'] = user.id.toString();
    headers['x-user-role'] = user.role;
  }
  
  // Make the request with authentication headers
  return fetch(url, {
    ...options,
    headers
  });
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
