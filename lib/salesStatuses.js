/**
 * Sales Status Enum
 * 
 * This file contains all the available sales statuses used throughout the application.
 * Import this enum in models, components, and migrations to ensure consistency.
 */

const SALES_STATUSES = {
  LEAD: 'lead',
  VOICEMAIL: 'voicemail',
  HANG_UP: 'hang-up',
  NO_RESPONSE: 'no_response',
  APPOINTMENT: 'appointment',
  ACTIVE: 'active',
  // PAYMENT_INFO removed - now a tag on ACTIVE sales
  CANCELLED: 'cancelled',
  SALE_DONE: 'sale-done',
  // VERIFICATION, PROCESS, and PAYMENT_INFO removed - now tags on ACTIVE sales
  CHARGED: 'charged',        // Admin only
  DECLINED: 'declined',      // Admin only
  CHARGEBACK: 'chargeback', // Admin only
  LEAD_CALL: 'lead-call',
  READY_FOR_PAYMENT: 'ready-for-payment'
};

/**
 * Tags that can be applied to ACTIVE sales
 * Tags can be combined (verification, process, and payment-info can exist together)
 */
const SALE_TAGS = {
  VERIFICATION: 'verification',
  PROCESS: 'process',
  PAYMENT_INFO: 'payment-info'
};

/**
 * Array of all possible tags
 */
const SALE_TAGS_ARRAY = Object.values(SALE_TAGS);

/**
 * Array of all sales statuses for use in Sequelize ENUM definitions
 */
const SALES_STATUS_ARRAY = Object.values(SALES_STATUSES);

/**
 * Default sales status
 */
const DEFAULT_SALES_STATUS = SALES_STATUSES.LEAD;

/**
 * Status groups for different workflow steps
 */
const STATUS_GROUPS = {
  INITIAL_CONTACT: [
    SALES_STATUSES.LEAD,
    SALES_STATUSES.HANG_UP,
    SALES_STATUSES.VOICEMAIL,
    SALES_STATUSES.NO_RESPONSE,
    SALES_STATUSES.APPOINTMENT
  ],
  LEAD_CALL: [
    SALES_STATUSES.LEAD_CALL
  ],
  // PAYMENT_INFO group removed - payment-info is now a tag on ACTIVE sales
  // PROCESSING group removed - verification and process are now tags on ACTIVE sales
  READY_FOR_PAYMENT: [
    SALES_STATUSES.READY_FOR_PAYMENT
  ],
  ADMIN_ACTIONS: [
    SALES_STATUSES.CHARGED,
    SALES_STATUSES.DECLINED,
    SALES_STATUSES.CHARGEBACK
  ],
  ACTIVE_ENGAGEMENT: [
    SALES_STATUSES.ACTIVE,
    SALES_STATUSES.SALE_DONE,
    SALES_STATUSES.CANCELLED
  ],
  // Sale-done appears in both first step (as action) and second step (as status)
  FIRST_STEP_ACTIONS: [
    SALES_STATUSES.LEAD,
    SALES_STATUSES.HANG_UP,
    SALES_STATUSES.VOICEMAIL,
    SALES_STATUSES.NO_RESPONSE,
    SALES_STATUSES.APPOINTMENT,
    SALES_STATUSES.SALE_DONE
  ]
};

/**
 * Get the workflow step for a given status
 * @param {string} status - The sales status
 * @returns {string} The workflow step
 */
const getStepForStatus = (status) => {
  if (!status || status === 'new') {
    return 'first'; // New sales should start at first step
  }
  
  // Special case: CANCELLED status should show lead call buttons
  if (status === SALES_STATUSES.CANCELLED) {
    return 'lead-call';
  }
  
  if (STATUS_GROUPS.INITIAL_CONTACT.includes(status)) {
    return 'first';
  }
  if (STATUS_GROUPS.LEAD_CALL.includes(status)) {
    return 'lead-call';
  }
  // PAYMENT_INFO step removed - payment-info is now a tag on ACTIVE sales
  if (STATUS_GROUPS.READY_FOR_PAYMENT.includes(status)) {
    return 'ready-for-payment';
  }
  if (STATUS_GROUPS.ADMIN_ACTIONS.includes(status)) {
    return 'admin';
  }
  // PROCESSING step removed - verification/process are tags on ACTIVE sales
  if (STATUS_GROUPS.ACTIVE_ENGAGEMENT.includes(status)) {
    return 'second'; // Active engagement step
  }
  return 'second'; // Default to active engagement
};

/**
 * Get display name for a status
 * @param {string} status - The sales status
 * @returns {string} The display name
 */
const getStatusDisplayName = (status) => {
  const displayNames = {
    [SALES_STATUSES.LEAD]: 'Lead',
    [SALES_STATUSES.VOICEMAIL]: 'Voicemail',
    [SALES_STATUSES.HANG_UP]: 'Hang Up',
    [SALES_STATUSES.NO_RESPONSE]: 'No Response',
    [SALES_STATUSES.APPOINTMENT]: 'Appointment',
    [SALES_STATUSES.ACTIVE]: 'Active',
    // PAYMENT_INFO removed - now a tag
    [SALES_STATUSES.CANCELLED]: 'Cancelled',
    [SALES_STATUSES.SALE_DONE]: 'Sale Done',
    // VERIFICATION and PROCESS removed - now tags
    [SALES_STATUSES.CHARGED]: 'Charged',
    [SALES_STATUSES.DECLINED]: 'Declined',
    [SALES_STATUSES.CHARGEBACK]: 'Chargeback',
    [SALES_STATUSES.LEAD_CALL]: 'Lead Call',
    [SALES_STATUSES.READY_FOR_PAYMENT]: 'Ready for Payment'
  };
  
  return displayNames[status] || status;
};

/**
 * Get the color class for a status (for UI styling)
 * @param {string} status - The sales status
 * @returns {string} The Tailwind color class
 */
const getStatusColorClass = (status) => {
  const colorClasses = {
    [SALES_STATUSES.LEAD]: 'bg-blue-500',
    [SALES_STATUSES.VOICEMAIL]: 'bg-orange-500',
    [SALES_STATUSES.HANG_UP]: 'bg-red-500',
    [SALES_STATUSES.NO_RESPONSE]: 'bg-gray-500',
    [SALES_STATUSES.APPOINTMENT]: 'bg-purple-500',
    [SALES_STATUSES.ACTIVE]: 'bg-green-500',
    // PAYMENT_INFO removed - now a tag
    [SALES_STATUSES.CANCELLED]: 'bg-red-700',
    [SALES_STATUSES.SALE_DONE]: 'bg-green-600',
    // VERIFICATION and PROCESS removed - now tags
    [SALES_STATUSES.CHARGED]: 'bg-pink-600',
    [SALES_STATUSES.DECLINED]: 'bg-red-600',
    [SALES_STATUSES.CHARGEBACK]: 'bg-red-800',
    [SALES_STATUSES.LEAD_CALL]: 'bg-blue-500',
    [SALES_STATUSES.READY_FOR_PAYMENT]: 'bg-green-600'
  };
  
  return colorClasses[status] || 'bg-gray-500';
};

/**
 * Get badge classes for a status (background and text color for badges)
 * @param {string} status - The sales status
 * @returns {string} The Tailwind badge classes (bg and text colors)
 */
const getStatusBadgeClasses = (status) => {
  const badgeClasses = {
    [SALES_STATUSES.LEAD]: 'bg-blue-100 text-blue-800',
    [SALES_STATUSES.VOICEMAIL]: 'bg-orange-100 text-orange-800',
    [SALES_STATUSES.HANG_UP]: 'bg-red-100 text-red-800',
    [SALES_STATUSES.NO_RESPONSE]: 'bg-gray-100 text-gray-800',
    [SALES_STATUSES.APPOINTMENT]: 'bg-purple-100 text-purple-800',
    [SALES_STATUSES.ACTIVE]: 'bg-green-100 text-green-800',
    // PAYMENT_INFO removed - now a tag
    [SALES_STATUSES.CANCELLED]: 'bg-red-200 text-red-900',
    [SALES_STATUSES.SALE_DONE]: 'bg-green-200 text-green-900',
    // VERIFICATION and PROCESS removed - now tags
    [SALES_STATUSES.CHARGED]: 'bg-pink-100 text-pink-800',
    [SALES_STATUSES.DECLINED]: 'bg-red-100 text-red-800',
    [SALES_STATUSES.CHARGEBACK]: 'bg-red-200 text-red-900',
    [SALES_STATUSES.LEAD_CALL]: 'bg-blue-100 text-blue-800',
    [SALES_STATUSES.READY_FOR_PAYMENT]: 'bg-green-100 text-green-800'
  };
  
  return badgeClasses[status] || 'bg-gray-100 text-gray-800';
};


/**
 * Helper functions for tag management
 */
const hasTag = (tags, tagName) => {
  return Array.isArray(tags) && tags.includes(tagName);
};

const addTag = (currentTags, tagName) => {
  const tags = Array.isArray(currentTags) ? [...currentTags] : [];
  if (!tags.includes(tagName)) {
    tags.push(tagName);
  }
  return tags;
};

const removeTag = (currentTags, tagName) => {
  const tags = Array.isArray(currentTags) ? [...currentTags] : [];
  return tags.filter(t => t !== tagName);
};

const toggleTag = (currentTags, tagName) => {
  const tags = Array.isArray(currentTags) ? [...currentTags] : [];
  if (tags.includes(tagName)) {
    return tags.filter(t => t !== tagName);
  } else {
    return [...tags, tagName];
  }
};

/**
 * Get display name for a tag
 */
const getTagDisplayName = (tag) => {
  const displayNames = {
    [SALE_TAGS.VERIFICATION]: 'Verification',
    [SALE_TAGS.PROCESS]: 'Process',
    [SALE_TAGS.PAYMENT_INFO]: 'Payment Info'
  };
  return displayNames[tag] || tag;
};

/**
 * Get badge classes for a tag
 */
const getTagBadgeClasses = (tag) => {
  const badgeClasses = {
    [SALE_TAGS.VERIFICATION]: 'bg-indigo-100 text-indigo-800',
    [SALE_TAGS.PROCESS]: 'bg-yellow-100 text-yellow-800',
    [SALE_TAGS.PAYMENT_INFO]: 'bg-green-100 text-green-800'
  };
  return badgeClasses[tag] || 'bg-gray-100 text-gray-800';
};

// CommonJS exports
module.exports = {
  SALES_STATUSES,
  SALES_STATUS_ARRAY,
  SALE_TAGS,
  SALE_TAGS_ARRAY,
  DEFAULT_SALES_STATUS,
  STATUS_GROUPS,
  getStepForStatus,
  getStatusDisplayName,
  getStatusColorClass,
  getStatusBadgeClasses,
  // Tag helper functions
  hasTag,
  addTag,
  removeTag,
  toggleTag,
  getTagDisplayName,
  getTagBadgeClasses
};
