'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('sales', 'processing_required', {
      type: Sequelize.BOOLEAN,
      allowNull: true,
      comment: 'Whether processing is required: null (unknown), true, or false'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn('sales', 'processing_required');
  }
};
