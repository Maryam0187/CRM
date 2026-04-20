'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn(
      'call_logs',
      'call_outcome',
      {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Agent-selected post-call outcome'
      }
    );
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('call_logs', 'call_outcome');
  }
};
