const { UserActivityLog } = require('../models');

/**
 * Utility service for logging user activities
 */
class UserActivityLogger {
  /**
   * Log a user activity
   * @param {Object} options - Activity log options
   * @param {number} options.userId - ID of the user performing the activity
   * @param {string} options.activityType - Type of activity (login, logout, status_change, etc.)
   * @param {string} [options.description] - Human-readable description of the activity
   * @param {string} [options.ipAddress] - IP address of the user
   * @param {string} [options.userAgent] - User agent string
   * @param {Object} [options.metadata] - Additional metadata (e.g., old value, new value)
   */
  static async logActivity({
    userId,
    activityType,
    description = null,
    ipAddress = null,
    userAgent = null,
    metadata = null
  }) {
    try {
      if (!userId || !activityType) {
        console.error('UserActivityLogger: userId and activityType are required');
        return null;
      }

      const logEntry = await UserActivityLog.create({
        userId,
        activityType,
        activityDescription: description,
        ipAddress,
        userAgent,
        metadata: metadata || null
      });

      console.log(`📝 Activity logged: ${activityType} by user ${userId}`);
      return logEntry;
    } catch (error) {
      // Log error but don't throw - we don't want to break the main flow
      console.error('UserActivityLogger: Failed to log activity:', error);
      return null;
    }
  }

  /**
   * Log user login activity
   */
  static async logLogin(userId, ipAddress = null, userAgent = null) {
    return await this.logActivity({
      userId,
      activityType: 'login',
      description: 'User logged in',
      ipAddress,
      userAgent
    });
  }

  /**
   * Log user logout activity
   */
  static async logLogout(userId, ipAddress = null, userAgent = null) {
    return await this.logActivity({
      userId,
      activityType: 'logout',
      description: 'User logged out',
      ipAddress,
      userAgent
    });
  }

  /**
   * Log status change activity
   */
  static async logStatusChange(userId, oldStatus, newStatus, ipAddress = null, userAgent = null) {
    return await this.logActivity({
      userId,
      activityType: 'status_change',
      description: `Status changed from ${oldStatus} to ${newStatus}`,
      ipAddress,
      userAgent,
      metadata: {
        oldStatus,
        newStatus
      }
    });
  }

  /**
   * Log worked on sale activity (any action related to sale and customer)
   */
  static async logWorkedOnSale(userId, description, metadata = null, ipAddress = null, userAgent = null) {
    return await this.logActivity({
      userId,
      activityType: 'worked_on_sale',
      description: description || 'Worked on sale/customer',
      ipAddress,
      userAgent,
      metadata
    });
  }

  /**
   * Log worked on call activity (any action of calls)
   */
  static async logWorkedOnCall(userId, description, metadata = null, ipAddress = null, userAgent = null) {
    return await this.logActivity({
      userId,
      activityType: 'worked_on_call',
      description: description || 'Worked on call',
      ipAddress,
      userAgent,
      metadata
    });
  }

  /**
   * Log attendance activity
   */
  static async logAttendance(userId, description = null, metadata = null, ipAddress = null, userAgent = null) {
    return await this.logActivity({
      userId,
      activityType: 'attendance',
      description: description || 'Attendance recorded',
      ipAddress,
      userAgent,
      metadata
    });
  }

  /**
   * Get IP address from request (with trust proxy support)
   * This function prioritizes forwarded headers to get the real client IP
   * when behind a proxy/load balancer (Docker, nginx, Cloudflare, etc.)
   */
  static getIpAddress(request) {
    if (!request) return null;
    
    // Helper to check if IP is private
    const isPrivateIP = (ip) => {
      if (!ip) return false;
      const cleanIP = ip.replace(/^::ffff:/, '').replace(/^:ffff:/, '');
      const privateRanges = [
        /^10\./,
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
        /^192\.168\./,
        /^127\./,
        /^169\.254\./,
        /^::1$/,
        /^fc00:/,
        /^fe80:/
      ];
      return privateRanges.some(range => range.test(cleanIP));
    };
    
    // Normalize IPv6-mapped IPv4 addresses
    const normalizeIP = (ip) => {
      if (!ip) return null;
      let normalized = ip.trim();
      // Remove IPv6-mapped IPv4 prefix
      if (normalized.startsWith('::ffff:')) {
        normalized = normalized.substring(7);
      } else if (normalized.startsWith(':ffff:')) {
        normalized = normalized.substring(6);
      }
      // Remove brackets from IPv6 addresses
      normalized = normalized.replace(/^\[|\]$/g, '');
      return normalized;
    };
    
    // Helper to get header value (works with both Next.js Headers and Express request)
    const getHeader = (name) => {
      if (!request.headers) return null;
      // Next.js Web API Headers object
      if (typeof request.headers.get === 'function') {
        return request.headers.get(name);
      }
      // Express-style headers object
      if (request.headers[name]) {
        return request.headers[name];
      }
      // Case-insensitive lookup for Express
      const lowerName = name.toLowerCase();
      for (const key in request.headers) {
        if (key.toLowerCase() === lowerName) {
          return request.headers[key];
        }
      }
      return null;
    };
    
    // Priority 1: CF-Connecting-IP (Cloudflare) - most reliable for Cloudflare
    const cfIp = getHeader('cf-connecting-ip');
    if (cfIp) {
      const normalized = normalizeIP(cfIp);
      if (normalized && !isPrivateIP(normalized)) {
        return normalized;
      }
      if (normalized) {
        return normalized; // Return even if private (might be edge case)
      }
    }
    
    // Priority 2: X-Real-IP (nginx proxy) - trusted single IP
    const realIp = getHeader('x-real-ip');
    if (realIp) {
      const normalized = normalizeIP(realIp);
      if (normalized && !isPrivateIP(normalized)) {
        return normalized;
      }
      if (normalized) {
        return normalized; // Return even if private
      }
    }
    
    // Priority 3: X-Forwarded-For (standard proxy header)
    // This can contain multiple IPs: "client, proxy1, proxy2"
    // When trust proxy is enabled, the first IP is usually the real client
    const forwarded = getHeader('x-forwarded-for');
    if (forwarded) {
      // Split by comma and trim each IP
      const ips = forwarded.split(',').map(ip => normalizeIP(ip.trim()));
      
      // IMPORTANT: In X-Forwarded-For, the chain is: client, proxy1, proxy2, ...
      // The FIRST IP is the original client (when properly configured)
      // However, in Docker without a reverse proxy, we might see: Docker-Gateway-IP
      
      // Strategy: Find the first non-private IP (real client behind proxy)
      for (const ip of ips) {
        if (ip && !isPrivateIP(ip)) {
          // Found a public IP - this is likely the real client
          return ip;
        }
      }
      
      // Special handling for Docker scenarios:
      // If we only see Docker internal IPs (172.18.0.1, etc.), it means:
      // 1. No reverse proxy is forwarding the real client IP
      // 2. The request is coming from within Docker network
      // 3. For localhost access, the client IS the Docker gateway (expected)
      
      // If all IPs are private, return null to indicate we couldn't get the real client IP
      // This will result in "Internal Network" in geolocation (which is correct)
      // Only return the first private IP if we have no other option
      if (ips.length > 0 && ips[0]) {
        // Log a warning in development
        if (process.env.NODE_ENV === 'development') {
          console.warn(`⚠️  Only private IPs found in X-Forwarded-For: ${ips.join(', ')}. Consider using a reverse proxy (nginx) to forward real client IPs.`);
        }
        // Return the first IP (even if private) as fallback
        // This allows tracking, but geolocation will show "Internal Network"
        return ips[0];
      }
    }
    
    // Priority 4: X-Client-IP (some proxies)
    const clientIp = getHeader('x-client-ip');
    if (clientIp) {
      const normalized = normalizeIP(clientIp);
      if (normalized && !isPrivateIP(normalized)) {
        return normalized;
      }
    }
    
    // Priority 5: X-Forwarded (alternative header)
    const forwardedAlt = getHeader('x-forwarded');
    if (forwardedAlt) {
      const normalized = normalizeIP(forwardedAlt);
      if (normalized && !isPrivateIP(normalized)) {
        return normalized;
      }
    }
    
    // Last resort: request.ip (Express-style) or socket address
    if (request.ip) {
      const normalized = normalizeIP(request.ip);
      if (normalized && !isPrivateIP(normalized)) {
        return normalized;
      }
    }
    
    // Final fallback: socket remote address (if available)
    if (request.socket && request.socket.remoteAddress) {
      const normalized = normalizeIP(request.socket.remoteAddress);
      if (normalized) {
        return normalized;
      }
    }
    
    return null;
  }

  /**
   * Get user agent from request
   */
  static getUserAgent(request) {
    if (!request) return null;
    return request.headers.get('user-agent') || null;
  }

  /**
   * Get activity logs for a user
   */
  static async getUserActivityLogs(userId, limit = 100, offset = 0) {
    try {
      const logs = await UserActivityLog.findAll({
        where: { userId },
        order: [['created_at', 'DESC']],
        limit,
        offset
      });
      return logs;
    } catch (error) {
      console.error('UserActivityLogger: Failed to get activity logs:', error);
      return [];
    }
  }

  /**
   * Get activity logs by type
   */
  static async getActivityLogsByType(activityType, limit = 100, offset = 0) {
    try {
      const logs = await UserActivityLog.findAll({
        where: { activityType },
        order: [['created_at', 'DESC']],
        limit,
        offset,
        include: [{ association: 'user', attributes: ['id', 'firstName', 'lastName', 'email'] }]
      });
      return logs;
    } catch (error) {
      console.error('UserActivityLogger: Failed to get activity logs by type:', error);
      return [];
    }
  }
}

module.exports = UserActivityLogger;

