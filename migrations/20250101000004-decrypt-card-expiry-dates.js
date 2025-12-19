'use strict';

const { decryptSensitiveData, isEncrypted } = require('../lib/sensitive-data');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up (queryInterface, Sequelize) {
    // Get all cards with potentially encrypted expiry dates
    const [results] = await queryInterface.sequelize.query(
      "SELECT id, expiry_date FROM cards WHERE expiry_date IS NOT NULL"
    );

    // results is an array of rows
    const cards = results || [];

    // Decrypt expiry dates that are encrypted
    for (const card of cards) {
      if (card && card.expiry_date && isEncrypted(card.expiry_date)) {
        try {
          const decrypted = decryptSensitiveData(card.expiry_date);
          await queryInterface.sequelize.query(
            `UPDATE cards SET expiry_date = :decrypted WHERE id = :id`,
            {
              replacements: { decrypted, id: card.id }
            }
          );
        } catch (error) {
          console.error(`Error decrypting expiry_date for card ${card.id}:`, error);
        }
      }
    }
  },

  async down (queryInterface, Sequelize) {
    // This migration cannot be reversed as we don't want to re-encrypt expiry dates
    // If needed, expiry dates would need to be re-encrypted manually
    console.log('Cannot reverse expiry date decryption migration');
  }
};

