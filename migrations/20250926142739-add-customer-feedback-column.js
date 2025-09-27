'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'customer_feedback', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Customer feedback or notes about the interaction'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('customers', 'customer_feedback');
  }
};
