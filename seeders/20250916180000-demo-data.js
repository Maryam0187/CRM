'use strict';

const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Only insert the admin user for initial login
    // Password: password123
    const hashedPassword = await bcrypt.hash('password123', 12);

    await queryInterface.bulkInsert('users', [
      {
        email: 'admin@crm.com',
        password: hashedPassword,
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});

    console.log('✅ Admin user seeded successfully!');
    console.log('🔐 Login Credentials:');
    console.log('   - Admin: admin@crm.com');
    console.log('   - Password: password123');
    console.log('');
    console.log('👉 Please login as admin and create users through the application.');
  },

  async down(queryInterface, Sequelize) {
    // Remove only the admin user
    await queryInterface.bulkDelete('users', { email: 'admin@crm.com' }, {});
    console.log('🗑️ Admin user removed successfully!');
  }
};
