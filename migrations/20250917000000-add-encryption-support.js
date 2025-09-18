'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Update Banks table - change sensitive fields to TEXT to accommodate encrypted data
    await queryInterface.changeColumn('banks', 'account_number', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    await queryInterface.changeColumn('banks', 'routing_number', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    await queryInterface.changeColumn('banks', 'check_number', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    await queryInterface.changeColumn('banks', 'driver_license', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    await queryInterface.changeColumn('banks', 'state_id', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    // Update Cards table - change sensitive fields to TEXT to accommodate encrypted data
    await queryInterface.changeColumn('cards', 'card_number', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    await queryInterface.changeColumn('cards', 'cvv', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    await queryInterface.changeColumn('cards', 'expiry_date', {
      type: Sequelize.TEXT,
      allowNull: false
    });

    // Update Sales table - change sensitive fields to TEXT to accommodate encrypted data
    await queryInterface.changeColumn('sales', 'ssn_number', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    await queryInterface.changeColumn('sales', 'account_number', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    await queryInterface.changeColumn('sales', 'security_answer', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    console.log('✅ Database schema updated to support encryption');
    console.log('⚠️  IMPORTANT: Existing data is still unencrypted!');
    console.log('⚠️  Run the data encryption script after this migration');
  },

  async down(queryInterface, Sequelize) {
    // Revert Banks table changes
    await queryInterface.changeColumn('banks', 'account_number', {
      type: Sequelize.STRING(50),
      allowNull: false
    });

    await queryInterface.changeColumn('banks', 'routing_number', {
      type: Sequelize.STRING(20),
      allowNull: false
    });

    await queryInterface.changeColumn('banks', 'check_number', {
      type: Sequelize.STRING(20),
      allowNull: false
    });

    await queryInterface.changeColumn('banks', 'driver_license', {
      type: Sequelize.STRING(50),
      allowNull: false
    });

    await queryInterface.changeColumn('banks', 'state_id', {
      type: Sequelize.STRING(50),
      allowNull: false
    });

    // Revert Cards table changes
    await queryInterface.changeColumn('cards', 'card_number', {
      type: Sequelize.STRING(20),
      allowNull: false
    });

    await queryInterface.changeColumn('cards', 'cvv', {
      type: Sequelize.STRING(4),
      allowNull: false
    });

    await queryInterface.changeColumn('cards', 'expiry_date', {
      type: Sequelize.STRING(7),
      allowNull: false
    });

    // Revert Sales table changes
    await queryInterface.changeColumn('sales', 'ssn_number', {
      type: Sequelize.STRING(20),
      allowNull: true
    });

    await queryInterface.changeColumn('sales', 'account_number', {
      type: Sequelize.STRING(50),
      allowNull: true
    });

    await queryInterface.changeColumn('sales', 'security_answer', {
      type: Sequelize.TEXT,
      allowNull: true
    });

    console.log('✅ Database schema reverted to original types');
    console.log('⚠️  Note: Any encrypted data will need to be decrypted manually');
  }
};
