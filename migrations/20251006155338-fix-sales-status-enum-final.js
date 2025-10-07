'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Import the sales statuses enum
    const { SALES_STATUS_ARRAY, DEFAULT_SALES_STATUS } = require('../lib/salesStatuses');
    
    // Update the sales status ENUM to include all current statuses
    await queryInterface.changeColumn('sales', 'status', {
      type: Sequelize.ENUM(...SALES_STATUS_ARRAY),
      defaultValue: DEFAULT_SALES_STATUS
    });
  },

  async down (queryInterface, Sequelize) {
    // Revert to previous enum values (with close status)
    await queryInterface.changeColumn('sales', 'status', {
      type: Sequelize.ENUM('lead', 'voicemail', 'hang-up', 'no_response', 'appointment', 'active', 'payment_info', 'cancelled', 'sale-done', 'verification', 'process', 'charged', 'declined', 'chargeback', 'lead-call', 'close', 'ready-for-payment'),
      defaultValue: 'lead'
    });
  }
};
