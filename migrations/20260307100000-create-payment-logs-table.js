'use strict';

/**
 * Create payment_logs table for logging charge/decline/chargeback attempts per payment method.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      payment_type: {
        type: Sequelize.ENUM('card', 'bank', 'cheque_electronic', 'cheque_mail', 'payment_email'),
        allowNull: false
      },
      payment_id: {
        type: Sequelize.INTEGER,
        allowNull: false
      },
      sale_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'sales', key: 'id' }
      },
      action: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'attempt, charged, declined, chargeback'
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });
    await queryInterface.addIndex('payment_logs', ['sale_id']);
    await queryInterface.addIndex('payment_logs', ['payment_type', 'payment_id']);
    await queryInterface.addIndex('payment_logs', ['action']);
    await queryInterface.addIndex('payment_logs', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_logs');
  }
};
