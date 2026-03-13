'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('call_logs', 'call_source', {
      type: Sequelize.ENUM('lead_dialing', 'quick_dialing', 'call_history', 'sale_page', 'ivr_dialer', 'other'),
      allowNull: true,
      comment: 'Where the call was initiated from'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('call_logs', 'call_source');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_call_logs_call_source";');
  }
};
