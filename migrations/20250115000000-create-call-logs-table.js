'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('call_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      call_sid: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Twilio Call SID'
      },
      customer_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'customers',
          key: 'id'
        },
        comment: 'Customer being called'
      },
      sale_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'sales',
          key: 'id'
        },
        comment: 'Associated sale record'
      },
      agent_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        comment: 'Agent making the call'
      },
      direction: {
        type: Sequelize.ENUM('inbound', 'outbound'),
        allowNull: false,
        defaultValue: 'outbound'
      },
      from_number: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Caller phone number'
      },
      to_number: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Called phone number'
      },
      status: {
        type: Sequelize.ENUM('queued', 'ringing', 'in-progress', 'completed', 'busy', 'failed', 'no-answer', 'canceled'),
        allowNull: false,
        defaultValue: 'queued'
      },
      duration: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Call duration in seconds'
      },
      recording_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'URL to call recording'
      },
      recording_duration: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Recording duration in seconds'
      },
      recording_sid: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Twilio Recording SID'
      },
      transcription_text: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Call transcription if available'
      },
      transcription_sid: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Twilio Transcription SID'
      },
      call_notes: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Agent notes about the call'
      },
      call_purpose: {
        type: Sequelize.ENUM('follow_up', 'cold_call', 'support', 'sales', 'appointment', 'other'),
        allowNull: true,
        defaultValue: 'follow_up'
      },
      twilio_data: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Additional Twilio call data'
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
    await queryInterface.addIndex('call_logs', ['customer_id']);
    await queryInterface.addIndex('call_logs', ['sale_id']);
    await queryInterface.addIndex('call_logs', ['agent_id']);
    await queryInterface.addIndex('call_logs', ['status']);
    await queryInterface.addIndex('call_logs', ['created_at']);
    await queryInterface.addIndex('call_logs', ['direction']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('call_logs');
  }
};

