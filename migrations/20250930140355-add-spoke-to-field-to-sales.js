'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'spoke_to', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'Name of the person the agent spoke to during the sale'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('sales', 'spoke_to');
  }
};
