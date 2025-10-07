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
  PAYMENT_INFO: 'payment_info',
  CANCELLED: 'cancelled',
  SALE_DONE: 'sale-done',
  VERIFICATION: 'verification',
  PROCESS: 'process',
  CHARGED: 'charged',
  DECLINED: 'declined',
  CHARGEBACK: 'chargeback',
  LEAD_CALL: 'lead-call',
  READY_FOR_PAYMENT: 'ready-for-payment'
};

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
  PAYMENT_INFO: [
    SALES_STATUSES.PAYMENT_INFO
  ],
  PROCESSING: [
    SALES_STATUSES.VERIFICATION,
    SALES_STATUSES.PROCESS
  ],
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
  if (STATUS_GROUPS.PAYMENT_INFO.includes(status)) {
    return 'payment-info';
  }
  if (STATUS_GROUPS.READY_FOR_PAYMENT.includes(status)) {
    return 'ready-for-payment';
  }
  if (STATUS_GROUPS.ADMIN_ACTIONS.includes(status)) {
    return 'admin';
  }
  if (STATUS_GROUPS.PROCESSING.includes(status)) {
    return 'third';
  }
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
    [SALES_STATUSES.PAYMENT_INFO]: 'Payment Info',
    [SALES_STATUSES.CANCELLED]: 'Cancelled',
    [SALES_STATUSES.SALE_DONE]: 'Sale Done',
    [SALES_STATUSES.VERIFICATION]: 'Verification',
    [SALES_STATUSES.PROCESS]: 'Process',
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
    [SALES_STATUSES.PAYMENT_INFO]: 'bg-yellow-500',
    [SALES_STATUSES.CANCELLED]: 'bg-red-700',
    [SALES_STATUSES.SALE_DONE]: 'bg-green-600',
    [SALES_STATUSES.VERIFICATION]: 'bg-indigo-600',
    [SALES_STATUSES.PROCESS]: 'bg-yellow-600',
    [SALES_STATUSES.CHARGED]: 'bg-pink-600',
    [SALES_STATUSES.DECLINED]: 'bg-red-600',
    [SALES_STATUSES.CHARGEBACK]: 'bg-red-800',
    [SALES_STATUSES.LEAD_CALL]: 'bg-blue-500',
    [SALES_STATUSES.READY_FOR_PAYMENT]: 'bg-green-600'
  };
  
  return colorClasses[status] || 'bg-gray-500';
};

// CommonJS exports
module.exports = {
  SALES_STATUSES,
  SALES_STATUS_ARRAY,
  DEFAULT_SALES_STATUS,
  STATUS_GROUPS,
  getStepForStatus,
  getStatusDisplayName,
  getStatusColorClass
};

// ES6 exports for frontend components (commented out for CommonJS compatibility)
// export {
//   SALES_STATUSES,
//   SALES_STATUS_ARRAY,
//   DEFAULT_SALES_STATUS,
//   STATUS_GROUPS,
//   getStepForStatus,
//   getStatusDisplayName,
//   getStatusColorClass
// };
