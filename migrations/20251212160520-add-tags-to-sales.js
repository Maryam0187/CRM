'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Add tags field to sales table
    await queryInterface.addColumn('sales', 'tags', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Tags for active sales (e.g., verification, process)'
    });
  },

  async down (queryInterface, Sequelize) {
    // Remove tags field
    await queryInterface.removeColumn('sales', 'tags');
  }
};
