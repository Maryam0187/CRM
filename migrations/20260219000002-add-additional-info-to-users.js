'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'additional_info', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Additional information for the user'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'additional_info');
  }
};
