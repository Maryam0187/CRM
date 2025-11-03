'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add status field (online, offline, away)
    await queryInterface.addColumn('users', 'status', {
      type: Sequelize.ENUM('online', 'offline', 'away'),
      defaultValue: 'offline',
      allowNull: false,
      comment: 'User status: online, offline, or away (inactive)'
    });

    // Add last login time
    await queryInterface.addColumn('users', 'last_login_time', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Last login timestamp'
    });

    // Add last logout time
    await queryInterface.addColumn('users', 'last_logout_time', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Last logout timestamp'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the columns in reverse order
    await queryInterface.removeColumn('users', 'last_logout_time');
    await queryInterface.removeColumn('users', 'last_login_time');
    
    // Remove the ENUM type for status
    // Note: Removing ENUM requires dropping and recreating the column
    await queryInterface.changeColumn('users', 'status', {
      type: Sequelize.STRING,
      allowNull: true
    });
    await queryInterface.removeColumn('users', 'status');
  }
};

