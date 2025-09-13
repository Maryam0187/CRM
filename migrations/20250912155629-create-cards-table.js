'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('cards', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      sale_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'sales',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      card_type: {
        type: Sequelize.ENUM('credit', 'debit', 'prepaid', 'gift-card'),
        allowNull: false
      },
      provider: {
        type: Sequelize.ENUM('visa', 'mastercard', 'discover', 'amex'),
        allowNull: false
      },
      customer_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      card_number: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      cvv: {
        type: Sequelize.STRING(4),
        allowNull: false
      },
      expiry_date: {
        type: Sequelize.STRING(7),
        allowNull: false
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'expired'),
        defaultValue: 'active'
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
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('cards');
  }
};
