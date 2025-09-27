'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if columns exist before adding them
    const tableDescription = await queryInterface.describeTable('sales');
    
    // Add new fields to sales table only if they don't exist
    if (!tableDescription.breakdown) {
      await queryInterface.addColumn('sales', 'breakdown', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Breakdown of the sale details'
      });
    }

    if (!tableDescription.note) {
      await queryInterface.addColumn('sales', 'note', {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Additional notes for the sale'
      });
    }

    if (!tableDescription.appointmentDate) {
      await queryInterface.addColumn('sales', 'appointmentDate', {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Appointment date if applicable'
      });
    }

    if (!tableDescription.appointmentTime) {
      await queryInterface.addColumn('sales', 'appointmentTime', {
        type: Sequelize.TIME,
        allowNull: true,
        comment: 'Appointment time if applicable'
      });
    }

    if (!tableDescription.current_stage) {
      await queryInterface.addColumn('sales', 'current_stage', {
        type: Sequelize.STRING,
        allowNull: true,
        defaultValue: 'lead_call',
        comment: 'Current stage in the sales process'
      });
    }

    if (!tableDescription.sales_flow) {
      await queryInterface.addColumn('sales', 'sales_flow', {
        type: Sequelize.ENUM('direct', 'appointment'),
        allowNull: true,
        defaultValue: 'direct',
        comment: 'Type of sales flow: direct or appointment'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the added columns
    await queryInterface.removeColumn('sales', 'breakdown');
    await queryInterface.removeColumn('sales', 'note');
    await queryInterface.removeColumn('sales', 'appointmentDate');
    await queryInterface.removeColumn('sales', 'appointmentTime');
    await queryInterface.removeColumn('sales', 'currentStage');
    await queryInterface.removeColumn('sales', 'salesFlow');
  }
};
