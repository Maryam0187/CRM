'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add 'payment_info' to the status enum in sales table
    await queryInterface.changeColumn('sales', 'status', {
      type: Sequelize.ENUM('lead', 'voicemail', 'hang-up', 'no_response', 'appointment', 'active', 'payment_info', 'pending', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'lead'
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove 'payment_info' from the status enum in sales table
    await queryInterface.changeColumn('sales', 'status', {
      type: Sequelize.ENUM('lead', 'voicemail', 'hang-up', 'no_response', 'appointment', 'active', 'pending', 'completed', 'cancelled'),
      allowNull: false,
      defaultValue: 'lead'
    });
  }
};
