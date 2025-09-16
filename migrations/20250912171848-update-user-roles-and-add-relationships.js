'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Update the role ENUM to include all required roles
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('admin', 'supervisor', 'agent', 'processor', 'verification'),
      defaultValue: 'agent',
      allowNull: false
    });
  },

  async down (queryInterface, Sequelize) {
    // Revert to original roles
    await queryInterface.changeColumn('users', 'role', {
      type: Sequelize.ENUM('admin', 'agent', 'manager'),
      defaultValue: 'agent',
      allowNull: false
    });
  }
};
