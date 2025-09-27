'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('customers', 'state', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    
    await queryInterface.addColumn('customers', 'city', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    
    await queryInterface.addColumn('customers', 'country', {
      type: Sequelize.STRING(100),
      allowNull: true
    });
    
    await queryInterface.addColumn('customers', 'mailing_address', {
      type: Sequelize.TEXT,
      allowNull: true
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('customers', 'state');
    await queryInterface.removeColumn('customers', 'city');
    await queryInterface.removeColumn('customers', 'country');
    await queryInterface.removeColumn('customers', 'mailing_address');
  }
};
