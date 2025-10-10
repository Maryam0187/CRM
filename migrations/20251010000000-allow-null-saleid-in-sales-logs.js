'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Allow saleId to be null in sales_logs table
    // This enables logging for non-prospect customers who don't have sales
    await queryInterface.changeColumn('sales_logs', 'saleId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      field: 'sale_id',
      references: {
        model: 'sales',
        key: 'id'
      }
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert: Make saleId required again
    await queryInterface.changeColumn('sales_logs', 'saleId', {
      type: Sequelize.INTEGER,
      allowNull: false,
      field: 'sale_id',
      references: {
        model: 'sales',
        key: 'id'
      }
    });
  }
};

