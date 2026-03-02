'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('call_logs', 'recordings', {
      type: Sequelize.JSON,
      allowNull: true,
      comment: 'Array of recordings: [{ recordingSid, recordingUrl, recordingDuration, createdAt }]'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('call_logs', 'recordings');
  }
};
