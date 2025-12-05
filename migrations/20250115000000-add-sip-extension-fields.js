'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add extension field
    await queryInterface.addColumn('users', 'extension', {
      type: Sequelize.STRING(20),
      allowNull: true,
      unique: true,
      comment: 'SIP extension number (e.g., 201, 202, 203)'
    });

    // Add SIP username field
    await queryInterface.addColumn('users', 'sip_username', {
      type: Sequelize.STRING(100),
      allowNull: true,
      unique: true,
      comment: 'SIP username (usually same as extension)'
    });

    // Add SIP password field (encrypted)
    await queryInterface.addColumn('users', 'sip_password', {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: 'Encrypted SIP password'
    });

    // Add SIP domain field
    await queryInterface.addColumn('users', 'sip_domain', {
      type: Sequelize.STRING(255),
      allowNull: true,
      comment: 'SIP domain URL (e.g., crm-sip.sip.us1.twilio.com)'
    });

    // Add call status field
    await queryInterface.addColumn('users', 'call_status', {
      type: Sequelize.ENUM('available', 'busy', 'away', 'offline'),
      allowNull: true,
      defaultValue: 'offline',
      comment: 'Agent call status for routing'
    });

    // Add last call time
    await queryInterface.addColumn('users', 'last_call_time', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Timestamp of last call'
    });

    // Add total calls count
    await queryInterface.addColumn('users', 'total_calls', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: 'Total number of calls made by agent'
    });

    // Add total call time (in seconds)
    await queryInterface.addColumn('users', 'total_call_time', {
      type: Sequelize.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: 'Total call time in seconds'
    });

    // Create index on extension for faster lookups
    await queryInterface.addIndex('users', ['extension'], {
      name: 'idx_users_extension',
      unique: true
    });

    // Create index on sip_username for faster lookups
    await queryInterface.addIndex('users', ['sip_username'], {
      name: 'idx_users_sip_username',
      unique: true
    });

    // Create index on call_status for routing queries
    await queryInterface.addIndex('users', ['call_status'], {
      name: 'idx_users_call_status'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes
    await queryInterface.removeIndex('users', 'idx_users_call_status');
    await queryInterface.removeIndex('users', 'idx_users_sip_username');
    await queryInterface.removeIndex('users', 'idx_users_extension');

    // Remove columns
    await queryInterface.removeColumn('users', 'total_call_time');
    await queryInterface.removeColumn('users', 'total_calls');
    await queryInterface.removeColumn('users', 'last_call_time');
    await queryInterface.removeColumn('users', 'call_status');
    await queryInterface.removeColumn('users', 'sip_domain');
    await queryInterface.removeColumn('users', 'sip_password');
    await queryInterface.removeColumn('users', 'sip_username');
    await queryInterface.removeColumn('users', 'extension');
  }
};

