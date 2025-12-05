'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'ssn_number_status', {
      type: Sequelize.ENUM('matched', 'not_matched'),
      allowNull: true,
      after: 'ssn_number'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('sales', 'ssn_number_status');
    // Note: ENUM type removal might need manual cleanup in some databases
  }
};

