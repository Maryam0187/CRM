'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_activity_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE',
        comment: 'User who performed the activity'
      },
      activity_type: {
        type: Sequelize.ENUM(
          'login',
          'logout',
          'status_change',
          'worked_on_sale',
          'worked_on_call',
          'attendance',
          'other'
        ),
        allowNull: false,
        comment: 'Type of activity performed'
      },
      activity_description: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'Human-readable description of the activity'
      },
      ip_address: {
        type: Sequelize.STRING(45),
        allowNull: true,
        comment: 'IP address of the user'
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'User agent string from the browser'
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional metadata about the activity (e.g., old value, new value, etc.)'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      }
    });

    // Add indexes for better performance
    await queryInterface.addIndex('user_activity_logs', ['user_id']);
    await queryInterface.addIndex('user_activity_logs', ['activity_type']);
    await queryInterface.addIndex('user_activity_logs', ['created_at']);
    await queryInterface.addIndex('user_activity_logs', ['user_id', 'created_at']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_activity_logs');
  }
};

