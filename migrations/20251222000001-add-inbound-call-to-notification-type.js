'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'inbound_call' to the notification type ENUM for MySQL
    // MySQL allows modifying ENUM columns by redefining the entire ENUM
    await queryInterface.sequelize.query(`
      ALTER TABLE notifications 
      MODIFY COLUMN type ENUM('sale_completed', 'sale_status_updated', 'sale_created', 'custom', 'inbound_call') NOT NULL;
    `);
  },

  async down(queryInterface, Sequelize) {
    // Remove 'inbound_call' from the ENUM by redefining without it
    // Note: This will fail if there are existing rows with 'inbound_call' type
    // You may need to update those rows first
    await queryInterface.sequelize.query(`
      ALTER TABLE notifications 
      MODIFY COLUMN type ENUM('sale_completed', 'sale_status_updated', 'sale_created', 'custom') NOT NULL;
    `);
  }
};

