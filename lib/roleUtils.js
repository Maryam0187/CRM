// Role-based permission utilities

/**
 * Check if user has a specific role
 * @param {Object} user - User object
 * @param {string} role - Role to check
 * @returns {boolean}
 */
export const hasRole = (user, role) => {
  if (!user || !user.role) return false;
  return user.role === role;
};

/**
 * Check if user has any of the specified roles
 * @param {Object} user - User object
 * @param {Array} roles - Array of roles to check
 * @returns {boolean}
 */
export const hasAnyRole = (user, roles) => {
  if (!user || !user.role || !Array.isArray(roles)) return false;
  return roles.includes(user.role);
};

/**
 * Check if user has all of the specified roles
 * @param {Object} user - User object
 * @param {Array} roles - Array of roles to check
 * @returns {boolean}
 */
export const hasAllRoles = (user, roles) => {
  if (!user || !user.role || !Array.isArray(roles)) return false;
  return roles.every(role => user.role === role);
};

/**
 * Check if user is admin
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const isAdmin = (user) => {
  return hasRole(user, 'admin');
};

/**
 * Check if user is supervisor
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const isSupervisor = (user) => {
  return hasRole(user, 'supervisor');
};

/**
 * Check if user is agent
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const isAgent = (user) => {
  return hasRole(user, 'agent');
};

/**
 * Check if user is processor
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const isProcessor = (user) => {
  return hasRole(user, 'processor');
};

/**
 * Check if user is verification
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const isVerification = (user) => {
  return hasRole(user, 'verification');
};

/**
 * Check if user can manage other users
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canManageUsers = (user) => {
  return isAdmin(user) || isSupervisor(user);
};

/**
 * Check if user can view all sales
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canViewAllSales = (user) => {
  return isAdmin(user) || isSupervisor(user);
};

/**
 * Check if user can view specific agent's sales
 * @param {Object} user - User object
 * @param {number} agentId - Agent ID
 * @returns {boolean}
 */
export const canViewAgentSales = (user, agentId) => {
  if (isAdmin(user)) return true;
  if (isSupervisor(user)) {
    // Check if the agent is supervised by this supervisor
    // This would need to be implemented with actual database check
    return true; // For now, supervisors can view all agent sales
  }
  if (isAgent(user)) {
    return user.id === agentId;
  }
  return false;
};

/**
 * Check if user can assign roles
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canAssignRoles = (user) => {
  return isAdmin(user) || isSupervisor(user);
};

/**
 * Check if user can process payments
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canProcessPayments = (user) => {
  return isAdmin(user) || isProcessor(user);
};

/**
 * Check if user can verify data
 * @param {Object} user - User object
 * @returns {boolean}
 */
export const canVerifyData = (user) => {
  return isAdmin(user) || isVerification(user);
};

/**
 * Get user's effective roles (including assigned roles)
 * @param {Object} user - User object
 * @param {Array} assignedRoles - Array of assigned roles
 * @returns {Array} Array of all roles user has
 */
export const getEffectiveRoles = (user, assignedRoles = []) => {
  const roles = [user.role];
  if (assignedRoles && assignedRoles.length > 0) {
    roles.push(...assignedRoles);
  }
  return [...new Set(roles)]; // Remove duplicates
};

/**
 * Check if user has any of the effective roles
 * @param {Object} user - User object
 * @param {Array} roles - Roles to check
 * @param {Array} assignedRoles - Assigned roles
 * @returns {boolean}
 */
export const hasEffectiveRole = (user, roles, assignedRoles = []) => {
  const effectiveRoles = getEffectiveRoles(user, assignedRoles);
  return roles.some(role => effectiveRoles.includes(role));
};

/**
 * Get role hierarchy level (higher number = more permissions)
 * @param {string} role - Role name
 * @returns {number}
 */
export const getRoleLevel = (role) => {
  const levels = {
    'admin': 5,
    'supervisor': 4,
    'verification': 3,
    'processor': 2,
    'agent': 1
  };
  return levels[role] || 0;
};

/**
 * Check if user has higher or equal role level
 * @param {Object} user - User object
 * @param {string} requiredRole - Required role
 * @returns {boolean}
 */
export const hasRoleLevel = (user, requiredRole) => {
  if (!user || !user.role) return false;
  return getRoleLevel(user.role) >= getRoleLevel(requiredRole);
};

/**
 * Get role display name
 * @param {string} role - Role name
 * @returns {string}
 */
export const getRoleDisplayName = (role) => {
  const displayNames = {
    'admin': 'Administrator',
    'supervisor': 'Supervisor',
    'agent': 'Agent',
    'processor': 'Processor',
    'verification': 'Verification Specialist'
  };
  return displayNames[role] || role;
};

/**
 * Get role description
 * @param {string} role - Role name
 * @returns {string}
 */
export const getRoleDescription = (role) => {
  const descriptions = {
    'admin': 'Full system access and user management',
    'supervisor': 'Manages agents and views team performance',
    'agent': 'Makes calls and manages customer relationships',
    'processor': 'Processes payments and financial transactions',
    'verification': 'Verifies customer data and documentation'
  };
  return descriptions[role] || 'No description available';
};
