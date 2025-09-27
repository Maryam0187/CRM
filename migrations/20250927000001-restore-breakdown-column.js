'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if breakdown column exists
    const tableDescription = await queryInterface.describeTable('sales');
    
    // Add breakdown column back if it doesn't exist
    if (!tableDescription.breakdown) {
      await queryInterface.addColumn('sales', 'breakdown', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Breakdown of the sale details'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove breakdown column if needed for rollback
    const tableDescription = await queryInterface.describeTable('sales');
    if (tableDescription.breakdown) {
      await queryInterface.removeColumn('sales', 'breakdown');
    }
  }
};
