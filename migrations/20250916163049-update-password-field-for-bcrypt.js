'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Update password field to accommodate bcrypt hashes (60 characters)
    // but keep it at 255 for future flexibility
    await queryInterface.changeColumn('users', 'password', {
      type: Sequelize.STRING(255),
      allowNull: false
    });
  },

  async down (queryInterface, Sequelize) {
    // Revert password field back to original length
    await queryInterface.changeColumn('users', 'password', {
      type: Sequelize.STRING(255),
      allowNull: false
    });
  }
};
