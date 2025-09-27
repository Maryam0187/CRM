'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add 'non_prospect' to the status enum
    await queryInterface.changeColumn('customers', 'status', {
      type: Sequelize.ENUM('active', 'inactive', 'prospect', 'non_prospect'),
      defaultValue: 'prospect'
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove 'non_prospect' from the status enum
    await queryInterface.changeColumn('customers', 'status', {
      type: Sequelize.ENUM('active', 'inactive', 'prospect'),
      defaultValue: 'prospect'
    });
  }
};
