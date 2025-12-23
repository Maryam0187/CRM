'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add new_package field to sales table
    await queryInterface.addColumn('sales', 'new_package', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'New package information for the sale'
    });

    // Add additional_info field to sales table
    await queryInterface.addColumn('sales', 'additional_info', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Additional information for the sale'
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove additional_info field
    await queryInterface.removeColumn('sales', 'additional_info');
    
    // Remove new_package field
    await queryInterface.removeColumn('sales', 'new_package');
  }
};

