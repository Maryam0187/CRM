'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add conference_name column
    await queryInterface.addColumn('call_logs', 'conference_name', {
      type: Sequelize.STRING(100),
      allowNull: true,
      comment: 'Conference name (e.g., call-{agentId})'
    });

    // Add conference_sid column
    await queryInterface.addColumn('call_logs', 'conference_sid', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Twilio Conference SID (CF...)'
    });

    // Add customer_call_sid column
    await queryInterface.addColumn('call_logs', 'customer_call_sid', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Twilio CallSid for customer PSTN leg (CA...)'
    });

    // Add agent_call_sid column
    await queryInterface.addColumn('call_logs', 'agent_call_sid', {
      type: Sequelize.STRING(50),
      allowNull: true,
      comment: 'Twilio CallSid for agent Voice SDK leg (CA...)'
    });

    // Add index on conference_name for faster lookups
    await queryInterface.addIndex('call_logs', ['conference_name'], {
      name: 'idx_call_logs_conference_name'
    });

    // Add index on customer_call_sid for faster lookups
    await queryInterface.addIndex('call_logs', ['customer_call_sid'], {
      name: 'idx_call_logs_customer_call_sid'
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex('call_logs', 'idx_call_logs_conference_name');
    await queryInterface.removeIndex('call_logs', 'idx_call_logs_customer_call_sid');

    // Remove columns
    await queryInterface.removeColumn('call_logs', 'agent_call_sid');
    await queryInterface.removeColumn('call_logs', 'customer_call_sid');
    await queryInterface.removeColumn('call_logs', 'conference_sid');
    await queryInterface.removeColumn('call_logs', 'conference_name');
  }
};

