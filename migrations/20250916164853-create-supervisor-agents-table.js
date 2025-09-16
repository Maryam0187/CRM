'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('supervisor_agents', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      supervisor_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      agent_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      assigned_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
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

    // Add unique constraint for supervisor-agent pair
    await queryInterface.addIndex('supervisor_agents', {
      fields: ['supervisor_id', 'agent_id'],
      unique: true,
      name: 'unique_supervisor_agent'
    });

    // Add indexes for performance
    await queryInterface.addIndex('supervisor_agents', {
      fields: ['supervisor_id'],
      name: 'idx_supervisor_agents_supervisor'
    });

    await queryInterface.addIndex('supervisor_agents', {
      fields: ['agent_id'],
      name: 'idx_supervisor_agents_agent'
    });
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('supervisor_agents');
  }
};
