'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = [
      { table: 'cards', column: 'added_by_user_id' },
      { table: 'banks', column: 'added_by_user_id' },
      { table: 'cheques_electronic', column: 'added_by_user_id' },
      { table: 'cheques_mail', column: 'added_by_user_id' },
      { table: 'payment_emails', column: 'added_by_user_id' }
    ];

    for (const { table, column } of tables) {
      await queryInterface.addColumn(table, column, {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tables = [
      'cards',
      'banks',
      'cheques_electronic',
      'cheques_mail',
      'payment_emails'
    ];

    for (const table of tables) {
      await queryInterface.removeColumn(table, 'added_by_user_id');
    }
  }
};
