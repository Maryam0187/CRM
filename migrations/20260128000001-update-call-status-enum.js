'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // MySQL requires recreating the ENUM to add new values
    // Add 'initiated' and 'voicemail' to the status enum
    await queryInterface.changeColumn('call_logs', 'status', {
      type: Sequelize.ENUM('initiated', 'queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled', 'voicemail'),
      allowNull: false,
      defaultValue: 'queued'
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert to original ENUM (note: this will fail if any rows have 'initiated' or 'voicemail' status)
    await queryInterface.changeColumn('call_logs', 'status', {
      type: Sequelize.ENUM('queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'),
      allowNull: false,
      defaultValue: 'queued'
    });
  }
};

