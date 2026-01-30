'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    await queryInterface.createTable('helplines', {
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
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'User who owns this helpline'
      },
      phone_number: {
        type: Sequelize.STRING(20),
        allowNull: false,
        comment: 'Helpline phone number'
      },
      label: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'User-friendly label/name for the helpline'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'Soft delete flag - false means deleted'
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

    // Add unique index on user_id and phone_number where is_active is true
    // This ensures a user can't have duplicate active helplines with the same number
    await queryInterface.addIndex('helplines', ['user_id', 'phone_number'], {
      unique: true,
      name: 'unique_active_helpline_per_user',
      where: {
        is_active: true
      }
    });

    // Add index on user_id for faster queries
    await queryInterface.addIndex('helplines', ['user_id']);
    
    // Add index on is_active for filtering active helplines
    await queryInterface.addIndex('helplines', ['is_active']);
  },

  async down (queryInterface, Sequelize) {
    await queryInterface.dropTable('helplines');
  }
};

