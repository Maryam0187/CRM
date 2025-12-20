'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Update ENUM to include 'active' and set default to 'active'
    await queryInterface.sequelize.query(`
      ALTER TABLE cheques_mail 
      MODIFY COLUMN status ENUM('active', 'pending', 'sent', 'received', 'processed') 
      DEFAULT 'active'
    `);
    
    // Update existing 'pending' records to 'active'
    await queryInterface.sequelize.query(`
      UPDATE cheques_mail 
      SET status = 'active' 
      WHERE status = 'pending'
    `);
  },

  async down (queryInterface, Sequelize) {
    // Revert existing 'active' records back to 'pending'
    await queryInterface.sequelize.query(`
      UPDATE cheques_mail 
      SET status = 'pending' 
      WHERE status = 'active'
    `);
    
    // Revert ENUM (remove 'active')
    await queryInterface.sequelize.query(`
      ALTER TABLE cheques_mail 
      MODIFY COLUMN status ENUM('pending', 'sent', 'received', 'processed') 
      DEFAULT 'pending'
    `);
  }
};

