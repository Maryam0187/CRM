'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add the new combined datetime column
    await queryInterface.addColumn('sales', 'appointment_datetime', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Combined appointment date and time in UTC'
    });

    // Add the new combined datetime column to sales_logs as well
    await queryInterface.addColumn('sales_logs', 'appointment_datetime', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Combined appointment date and time in UTC'
    });

    // Remove the old separate columns from sales table
    await queryInterface.removeColumn('sales', 'appointment_date');
    await queryInterface.removeColumn('sales', 'appointment_time');

    // Remove the old separate columns from sales_logs table
    await queryInterface.removeColumn('sales_logs', 'appointmentDate');
    await queryInterface.removeColumn('sales_logs', 'appointmentTime');
  },

  async down(queryInterface, Sequelize) {
    // Re-add the old separate columns to sales table
    await queryInterface.addColumn('sales', 'appointment_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
      comment: 'Appointment date'
    });
    
    await queryInterface.addColumn('sales', 'appointment_time', {
      type: Sequelize.TIME,
      allowNull: true,
      comment: 'Appointment time'
    });

    // Re-add the old separate columns to sales_logs table
    await queryInterface.addColumn('sales_logs', 'appointmentDate', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Appointment date if applicable'
    });
    
    await queryInterface.addColumn('sales_logs', 'appointmentTime', {
      type: Sequelize.TIME,
      allowNull: true,
      comment: 'Appointment time if applicable'
    });

    // Remove the new combined datetime columns
    await queryInterface.removeColumn('sales', 'appointment_datetime');
    await queryInterface.removeColumn('sales_logs', 'appointment_datetime');
  }
};
