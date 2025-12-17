'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'twilio_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Enable/disable Twilio calling functionality for user'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'twilio_enabled');
  }
};

