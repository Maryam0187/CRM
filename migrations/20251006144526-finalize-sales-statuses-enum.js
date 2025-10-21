'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Import the sales statuses enum
    const { SALES_STATUS_ARRAY, DEFAULT_SALES_STATUS } = require('../lib/salesStatuses');
    
    // Ensure the sales status ENUM is up to date with our centralized enum
    await queryInterface.changeColumn('sales', 'status', {
      type: Sequelize.ENUM(...SALES_STATUS_ARRAY),
      defaultValue: DEFAULT_SALES_STATUS
    });
  },

  async down (queryInterface, Sequelize) {
    // Revert to a basic set of statuses (this is a safety fallback)
    await queryInterface.changeColumn('sales', 'status', {
      type: Sequelize.ENUM('lead', 'voicemail', 'hang-up', 'no_response', 'appointment', 'active', 'payment_info', 'cancelled', 'sale-done', 'verification', 'process', 'charged', 'declined', 'chargeback', 'lead-call', 'close', 'ready-for-payment'),
      defaultValue: 'lead'
    });
  }
};
