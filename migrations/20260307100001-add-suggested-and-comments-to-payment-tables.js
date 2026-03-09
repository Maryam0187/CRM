'use strict';

/**
 * Add comments (JSON) to cards, banks, cheques_electronic, cheques_mail, payment_emails.
 * comments: JSON array of { id, userId, userName, text, createdAt } like notes.
 */
const TABLES = [
  'cards',
  'banks',
  'cheques_electronic',
  'cheques_mail',
  'payment_emails'
];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of TABLES) {
      const [colComments] = await queryInterface.sequelize.query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'comments'`,
        { replacements: [table] }
      );
      if (!colComments || colComments.length === 0) {
        await queryInterface.addColumn(table, 'comments', {
          type: Sequelize.JSON,
          allowNull: true,
          defaultValue: []
        });
      }
    }
  },

  async down(queryInterface) {
    for (const table of TABLES) {
      try {
        await queryInterface.removeColumn(table, 'comments');
      } catch (_) {}
    }
  }
};
