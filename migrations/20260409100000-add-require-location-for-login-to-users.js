'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'require_location_for_login', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'When true, user must grant browser location to sign in'
    });

    await queryInterface.sequelize.query('DROP TABLE IF EXISTS app_settings');
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'require_location_for_login');
  }
};
