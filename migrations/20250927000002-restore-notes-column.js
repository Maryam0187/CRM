'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if notes column exists
    const tableDescription = await queryInterface.describeTable('sales');
    
    // Add notes column back if it doesn't exist
    if (!tableDescription.notes) {
      await queryInterface.addColumn('sales', 'notes', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Additional notes for the sale'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove notes column if needed for rollback
    const tableDescription = await queryInterface.describeTable('sales');
    if (tableDescription.notes) {
      await queryInterface.removeColumn('sales', 'notes');
    }
  }
};
