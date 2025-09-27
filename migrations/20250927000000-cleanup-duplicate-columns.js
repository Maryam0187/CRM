'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if duplicate columns exist and remove them
    const tableDescription = await queryInterface.describeTable('sales');
    
    // Remove duplicate appointment columns (keep the original snake_case versions)
    if (tableDescription.appointmentDate) {
      await queryInterface.removeColumn('sales', 'appointmentDate');
    }
    
    if (tableDescription.appointmentTime) {
      await queryInterface.removeColumn('sales', 'appointmentTime');
    }
    
    // Note: breakdown and notes columns are original columns and should NOT be removed
    // Only remove if there are duplicate columns with different names
    
    // Remove currentStage and salesFlow columns (not needed)
    if (tableDescription.currentStage) {
      await queryInterface.removeColumn('sales', 'currentStage');
    }
    
    if (tableDescription.salesFlow) {
      await queryInterface.removeColumn('sales', 'salesFlow');
    }
    
    if (tableDescription.current_stage) {
      await queryInterface.removeColumn('sales', 'current_stage');
    }
    
    if (tableDescription.sales_flow) {
      await queryInterface.removeColumn('sales', 'sales_flow');
    }
  },

  async down(queryInterface, Sequelize) {
    // Re-add the duplicate columns if needed for rollback
    await queryInterface.addColumn('sales', 'appointmentDate', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Appointment date if applicable'
    });
    
    await queryInterface.addColumn('sales', 'appointmentTime', {
      type: Sequelize.TIME,
      allowNull: true,
      comment: 'Appointment time if applicable'
    });
    
    await queryInterface.addColumn('sales', 'breakdown', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Breakdown of the sale details'
    });
    
    await queryInterface.addColumn('sales', 'note', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Additional notes for the sale'
    });
    
    await queryInterface.addColumn('sales', 'currentStage', {
      type: Sequelize.STRING,
      allowNull: true,
      defaultValue: 'lead_call',
      comment: 'Current stage in the sales process'
    });
    
    await queryInterface.addColumn('sales', 'salesFlow', {
      type: Sequelize.ENUM('direct', 'appointment'),
      allowNull: true,
      defaultValue: 'direct',
      comment: 'Type of sales flow: direct or appointment'
    });
  }
};
