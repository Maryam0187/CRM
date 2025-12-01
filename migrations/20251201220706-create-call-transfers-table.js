'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('call_transfers', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      call_sid: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'Twilio Call SID of the original call'
      },
      call_log_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'call_logs',
          key: 'id'
        },
        onDelete: 'SET NULL'
      },
      from_agent_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'CASCADE',
        comment: 'Agent who initiated the transfer'
      },
      to_agent_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onDelete: 'SET NULL',
        comment: 'Agent receiving the transfer (if transferred to agent)'
      },
      transfer_to: {
        type: Sequelize.STRING(20),
        allowNull: true,
        comment: 'Phone number or agent identifier for transfer destination'
      },
      transfer_type: {
        type: Sequelize.ENUM('blind', 'warm'),
        allowNull: false,
        defaultValue: 'blind',
        comment: 'blind = agent leaves, warm = agent stays in call'
      },
      transfer_status: {
        type: Sequelize.ENUM('initiated', 'in_progress', 'completed', 'failed', 'canceled'),
        allowNull: false,
        defaultValue: 'initiated',
        comment: 'Status of the transfer'
      },
      conference_sid: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Twilio Conference SID (for warm transfers)'
      },
      transferred_call_sid: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Call SID of the transferred call leg'
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Error message if transfer failed'
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the transfer was completed'
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

    // Add indexes
    await queryInterface.addIndex('call_transfers', ['call_sid'], {
      name: 'call_transfers_call_sid_idx'
    });
    await queryInterface.addIndex('call_transfers', ['call_log_id'], {
      name: 'call_transfers_call_log_id_idx'
    });
    await queryInterface.addIndex('call_transfers', ['from_agent_id'], {
      name: 'call_transfers_from_agent_id_idx'
    });
    await queryInterface.addIndex('call_transfers', ['to_agent_id'], {
      name: 'call_transfers_to_agent_id_idx'
    });
    await queryInterface.addIndex('call_transfers', ['transfer_status'], {
      name: 'call_transfers_transfer_status_idx'
    });
    await queryInterface.addIndex('call_transfers', ['conference_sid'], {
      name: 'call_transfers_conference_sid_idx'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('call_transfers');
  }
};

