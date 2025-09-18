// Server-side authentication utilities
import { User } from '../models';

/**
 * Get user from request headers (for API routes)
 * This assumes the client sends user info in headers
 */
export const getUserFromRequest = async (request) => {
  try {
    // Try to get user info from headers first
    let userId = request.headers.get('x-user-id');
    let userRole = request.headers.get('x-user-role');
    
    // If no headers, user is not authenticated
    if (!userId) {
      return null;
    }

    // Verify user exists and is active
    const user = await User.findByPk(userId, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive']
    });

    if (!user || !user.isActive) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
      is_active: user.isActive
    };
  } catch (error) {
    console.error('Error getting user from request:', error);
    return null;
  }
};

/**
 * Check if user is admin
 */
export const isAdmin = (user) => {
  return user && user.role === 'admin';
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (user) => {
  return user && user.is_active;
};

/**
 * Middleware to check authentication
 */
export const requireAuth = async (request) => {
  const user = await getUserFromRequest(request);
  if (!user) {
    return { error: 'Unauthorized', status: 401 };
  }
  return { user };
};

/**
 * Middleware to check admin access
 */
export const requireAdmin = async (request) => {
  const authResult = await requireAuth(request);
  if (authResult.error) {
    return authResult;
  }

  if (!isAdmin(authResult.user)) {
    return { error: 'Forbidden - Admin access required', status: 403 };
  }

  return { user: authResult.user };
};
