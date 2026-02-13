'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'last_seen_at', {
      type: Sequelize.DATE,
      allowNull: true,
      comment: 'Last heartbeat/presence ping; used to infer offline when stale'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('users', 'last_seen_at');
  }
};
