// JWT authentication middleware for API routes
import jwt from 'jsonwebtoken';
import { User, UserSession } from '../models';

/**
 * Verify JWT token and get user
 */
export const verifyJWTToken = async (token) => {
  try {
    if (!token) {
      return null;
    }

    // Remove 'Bearer ' prefix if present
    const cleanToken = token.replace('Bearer ', '');
    
    const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    
    const decoded = jwt.verify(cleanToken, JWT_SECRET);
    
    // Check if it's an access token
    if (decoded.type !== 'access') {
      return null;
    }

    // Get user from database
    const user = await User.findByPk(decoded.userId, {
      attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'isActive']
    });

    if (!user || !user.isActive) {
      return null;
    }

    // Verify session is active (if sessionId exists in token)
    if (decoded.sessionId) {
      const session = await UserSession.findOne({
        where: {
          sessionId: decoded.sessionId,
          userId: user.id,
          isActive: true
        }
      });

      if (!session) {
        // Session has been invalidated
        console.log(`Session ${decoded.sessionId} is not active for user ${user.id}`);
        return null;
      }

      // Check if session has expired
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        // Session expired, mark as inactive
        await session.update({ isActive: false });
        console.log(`Session ${decoded.sessionId} has expired for user ${user.id}`);
        return null;
      }
    }

    return {
      id: user.id,
      email: user.email,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
      is_active: user.isActive,
      sessionId: decoded.sessionId // Include sessionId in return value
    };
  } catch (error) {
    console.error('JWT verification error:', error);
    return null;
  }
};

/**
 * Get user from JWT token in request headers
 */
export const getUserFromJWT = async (request) => {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return null;
    }

    return await verifyJWTToken(token);
  } catch (error) {
    console.error('Error getting user from JWT:', error);
    return null;
  }
};

/**
 * JWT authentication middleware
 */
export const requireJWTAuth = async (request) => {
  const user = await getUserFromJWT(request);
  if (!user) {
    return { error: 'Unauthorized - Invalid or missing JWT token', status: 401 };
  }
  return { user };
};

/**
 * JWT admin authentication middleware
 */
export const requireJWTAdmin = async (request) => {
  const authResult = await requireJWTAuth(request);
  if (authResult.error) {
    return authResult;
  }

  if (authResult.user.role !== 'admin') {
    return { error: 'Forbidden - Admin access required', status: 403 };
  }

  return { user: authResult.user };
};

/**
 * JWT supervisor authentication middleware
 */
export const requireJWTSupervisor = async (request) => {
  const authResult = await requireJWTAuth(request);
  if (authResult.error) {
    return authResult;
  }

  if (!['admin', 'supervisor'].includes(authResult.user.role)) {
    return { error: 'Forbidden - Supervisor access required', status: 403 };
  }

  return { user: authResult.user };
};
