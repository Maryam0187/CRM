'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'cnic', {
      type: Sequelize.STRING(15),
      allowNull: true,
      unique: true,
      comment: 'CNIC number (13 digits)'
    });

    await queryInterface.addColumn('users', 'phone', {
      type: Sequelize.STRING(15),
      allowNull: true,
      comment: 'Phone number'
    });

    await queryInterface.addColumn('users', 'address', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'User address'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'address');
    await queryInterface.removeColumn('users', 'phone');
    await queryInterface.removeColumn('users', 'cnic');
  }
};
