'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add unique constraint for customer based on landline and first_name
    await queryInterface.addConstraint('customers', {
      fields: ['landline', 'first_name'],
      type: 'unique',
      name: 'unique_customer_landline_name',
      where: {
        landline: {
          [Sequelize.Op.ne]: null
        },
        first_name: {
          [Sequelize.Op.ne]: null
        }
      }
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the unique constraint
    await queryInterface.removeConstraint('customers', 'unique_customer_landline_name');
  }
};
