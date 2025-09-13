'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Remove denormalized customer fields from sales table
    await queryInterface.removeColumn('sales', 'customer_name');
    await queryInterface.removeColumn('sales', 'landline_no');
    await queryInterface.removeColumn('sales', 'cell_no');
    await queryInterface.removeColumn('sales', 'address');
  },

  async down (queryInterface, Sequelize) {
    // Add back the denormalized customer fields
    await queryInterface.addColumn('sales', 'customer_name', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn('sales', 'landline_no', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
    await queryInterface.addColumn('sales', 'cell_no', {
      type: Sequelize.STRING(20),
      allowNull: true
    });
    await queryInterface.addColumn('sales', 'address', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  }
};
