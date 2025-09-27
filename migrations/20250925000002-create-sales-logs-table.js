'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('sales_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      saleId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'sales',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      agentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      customerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      bankId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'banks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      cardId: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'cards',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      action: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Action taken: hangup, voicemail, no_response, lead_call, second_call, customer_agree, payment_info, process, verification, charge, approved, decline, chargeback, appointment, done, close'
      },
      status: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Current status of the sale'
      },
      currentSaleData: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Current sale data at the time of action'
      },
      previousSaleData: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Previous sale data for comparison'
      },
      breakdown: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Breakdown of the sale details'
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Additional notes for the action'
      },
      appointmentDate: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Appointment date if applicable'
      },
      appointmentTime: {
        type: Sequelize.TIME,
        allowNull: true,
        comment: 'Appointment time if applicable'
      },
      timestamp: {
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

    // Add indexes for better performance
    await queryInterface.addIndex('sales_logs', ['saleId']);
    await queryInterface.addIndex('sales_logs', ['agentId']);
    await queryInterface.addIndex('sales_logs', ['customerId']);
    await queryInterface.addIndex('sales_logs', ['action']);
    await queryInterface.addIndex('sales_logs', ['timestamp']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('sales_logs');
  }
};
