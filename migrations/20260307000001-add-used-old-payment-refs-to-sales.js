'use strict';

/**
 * Add used_old_payment_refs to sales.
 * JSON array of { paymentType, paymentId, originalSaleId } for payments from other sales shown on this sale.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const [cols] = await queryInterface.sequelize.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales' AND COLUMN_NAME = 'used_old_payment_refs'`
    );
    if (!cols || cols.length === 0) {
      await queryInterface.addColumn('sales', 'used_old_payment_refs', {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Payments from other sales used for this sale: [{ paymentType, paymentId, originalSaleId }]'
      });
    }
  },

  async down(queryInterface) {
    try {
      await queryInterface.removeColumn('sales', 'used_old_payment_refs');
    } catch (_) {}
  }
};
