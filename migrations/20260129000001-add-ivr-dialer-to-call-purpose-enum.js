'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'ivr_dialer' to the call_purpose enum
    await queryInterface.changeColumn('call_logs', 'call_purpose', {
      type: Sequelize.ENUM('follow_up', 'cold_call', 'support', 'sales', 'appointment', 'other', 'ivr_dialer'),
      allowNull: true,
      defaultValue: 'follow_up'
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert to original ENUM (note: this will fail if any rows have 'ivr_dialer' call_purpose)
    await queryInterface.changeColumn('call_logs', 'call_purpose', {
      type: Sequelize.ENUM('follow_up', 'cold_call', 'support', 'sales', 'appointment', 'other'),
      allowNull: true,
      defaultValue: 'follow_up'
    });
  }
};
