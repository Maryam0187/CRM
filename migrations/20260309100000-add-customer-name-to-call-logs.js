'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      'call_logs',
      'customer_name',
      {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Customer name when customerId is null (e.g. quick dial)'
      }
    );
    await queryInterface.addColumn(
      'call_logs',
      'state',
      { type: Sequelize.STRING(100), allowNull: true }
    );
    await queryInterface.addColumn(
      'call_logs',
      'city',
      { type: Sequelize.STRING(100), allowNull: true }
    );
    await queryInterface.addColumn(
      'call_logs',
      'country',
      { type: Sequelize.STRING(100), allowNull: true }
    );
    await queryInterface.addColumn(
      'call_logs',
      'zipcode',
      { type: Sequelize.STRING(20), allowNull: true }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('call_logs', 'customer_name');
    await queryInterface.removeColumn('call_logs', 'state');
    await queryInterface.removeColumn('call_logs', 'city');
    await queryInterface.removeColumn('call_logs', 'country');
    await queryInterface.removeColumn('call_logs', 'zipcode');
  }
};
