'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Create user_time_sessions table to track individual active/inactive sessions
    await queryInterface.createTable('user_time_sessions', {
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
        comment: 'User ID'
      },
      status: {
        type: Sequelize.ENUM('online', 'offline', 'away'),
        allowNull: false,
        comment: 'Status during this session'
      },
      session_type: {
        type: Sequelize.ENUM('active', 'inactive'),
        allowNull: false,
        comment: 'Type of session: active (online) or inactive (offline/away)'
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false,
        comment: 'Session start time'
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Session end time (null if session is still ongoing)'
      },
      duration_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Duration in seconds (calculated when session ends)'
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Date of the session (for easier daily aggregation)'
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

    // Create user_daily_time_logs table for daily aggregated time
    await queryInterface.createTable('user_daily_time_logs', {
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
        comment: 'User ID'
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Date of the log'
      },
      active_time_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total active time in seconds for the day'
      },
      inactive_time_seconds: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total inactive time in seconds for the day'
      },
      first_active_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'First time user became active on this day'
      },
      last_active_time: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last time user was active on this day'
      },
      login_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Number of login sessions on this day'
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
    await queryInterface.addIndex('user_time_sessions', ['user_id']);
    await queryInterface.addIndex('user_time_sessions', ['date']);
    await queryInterface.addIndex('user_time_sessions', ['user_id', 'date']);
    await queryInterface.addIndex('user_time_sessions', ['session_type']);
    await queryInterface.addIndex('user_time_sessions', ['end_time'], {
      where: { end_time: null }
    }); // Index for ongoing sessions

    await queryInterface.addIndex('user_daily_time_logs', ['user_id']);
    await queryInterface.addIndex('user_daily_time_logs', ['date']);
    await queryInterface.addIndex('user_daily_time_logs', ['user_id', 'date'], {
      unique: true,
      name: 'unique_user_daily_time'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('user_daily_time_logs');
    await queryInterface.dropTable('user_time_sessions');
  }
};

