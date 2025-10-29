// Route authentication utilities for consistent JWT validation
import { requireJWTAuth, requireJWTAdmin, requireJWTSupervisor } from './jwtAuth.js';

/**
 * Wrapper for routes that require JWT authentication
 * @param {Function} handler - The route handler function
 * @param {Object} options - Authentication options
 * @param {string} options.role - Required role ('admin', 'supervisor', or null for any authenticated user)
 * @returns {Function} - Wrapped route handler with authentication
 */
export const withAuth = (handler, options = {}) => {
  return async (request, ...args) => {
    try {
      let authResult;
      
      // Choose the appropriate authentication middleware based on role requirement
      if (options.role === 'admin') {
        authResult = await requireJWTAdmin(request);
      } else if (options.role === 'supervisor') {
        authResult = await requireJWTSupervisor(request);
      } else {
        authResult = await requireJWTAuth(request);
      }
      
      // If authentication failed, return error response
      if (authResult.error) {
        return new Response(
          JSON.stringify({ error: authResult.error }),
          { 
            status: authResult.status,
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }
      
      // Add user to request object for use in handler
      request.user = authResult.user;
      
      // Call the original handler with authenticated request
      return await handler(request, ...args);
      
    } catch (error) {
      console.error('Authentication wrapper error:', error);
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  };
};

/**
 * Helper function to add JWT authentication to a route handler
 * @param {Function} handler - The route handler function
 * @param {string} role - Required role ('admin', 'supervisor', or null for any authenticated user)
 * @returns {Function} - Wrapped route handler
 */
export const requireAuth = (handler, role = null) => {
  return withAuth(handler, { role });
};

/**
 * Helper function for admin-only routes
 * @param {Function} handler - The route handler function
 * @returns {Function} - Wrapped route handler
 */
export const requireAdmin = (handler) => {
  return withAuth(handler, { role: 'admin' });
};

/**
 * Helper function for supervisor+ routes (supervisor or admin)
 * @param {Function} handler - The route handler function
 * @returns {Function} - Wrapped route handler
 */
export const requireSupervisor = (handler) => {
  return withAuth(handler, { role: 'supervisor' });
};

/**
 * Manual JWT validation for routes that need custom logic
 * @param {Request} request - The incoming request
 * @param {string} role - Required role ('admin', 'supervisor', or null for any authenticated user)
 * @returns {Object} - { user, error, status } or { error, status }
 */
export const validateAuth = async (request, role = null) => {
  try {
    let authResult;
    
    if (role === 'admin') {
      authResult = await requireJWTAdmin(request);
    } else if (role === 'supervisor') {
      authResult = await requireJWTSupervisor(request);
    } else {
      authResult = await requireJWTAuth(request);
    }
    
    return authResult;
  } catch (error) {
    console.error('Auth validation error:', error);
    return { error: 'Authentication failed', status: 500 };
  }
};

/**
 * Check if a route should be protected
 * @param {string} pathname - The API route path
 * @returns {boolean} - Whether the route should be protected
 */
export const shouldProtectRoute = (pathname) => {
  // List of routes that should NOT be protected
  const publicRoutes = [
    '/api/auth/signin',
    '/api/auth/refresh',
    '/api/test-auth',
    '/api/test-db',
    '/api/test-sequelize',
    '/api/test-voice',
    '/api/test-recording',
    '/api/deployment-info',
    '/api/socket/health',
    '/api/twilio/voice-response',
    '/api/twilio/call-status-callback',
    '/api/twilio/recording-callback'
  ];
  
  // Check if the pathname matches any public route
  return !publicRoutes.some(route => pathname.startsWith(route));
};

/**
 * Get the required role for a specific route
 * @param {string} pathname - The API route path
 * @returns {string|null} - Required role or null for any authenticated user
 */
export const getRequiredRole = (pathname) => {
  // Admin-only routes
  const adminRoutes = [
    '/api/users',
    '/api/roles',
    '/api/supervisors',
    '/api/supervisor-agents',
    '/api/role-assignments'
  ];
  
  // Supervisor+ routes (supervisor or admin)
  const supervisorRoutes = [
    '/api/sales-logs/stats',
    '/api/dashboard' // Dashboard might need supervisor+ access
  ];
  
  if (adminRoutes.some(route => pathname.startsWith(route))) {
    return 'admin';
  }
  
  if (supervisorRoutes.some(route => pathname.startsWith(route))) {
    return 'supervisor';
  }
  
  // Default to any authenticated user
  return null;
};
