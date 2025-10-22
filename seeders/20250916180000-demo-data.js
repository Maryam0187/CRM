'use strict';

const bcrypt = require('bcrypt');

module.exports = {
  async up(queryInterface, Sequelize) {
    try {
      // Check if admin user already exists
      const existingAdmin = await queryInterface.rawSelect('users', {
        where: { email: 'admin@crm.com' }
      }, ['id']);
      
      if (existingAdmin) {
        console.log('⚠️  Admin user already exists, skipping seed');
        return;
      }

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
          cnic: null, // Explicitly set to null to avoid unique constraint issues
          phone: null, // Explicitly set to null
          address: null, // Explicitly set to null
          created_at: new Date(),
          updated_at: new Date()
        }
      ], {
        // Skip validation to avoid conflicts with model validations
        validate: false,
        // Skip hooks to avoid password double-hashing
        hooks: false
      });

      console.log('✅ Admin user seeded successfully!');
      console.log('🔐 Login Credentials:');
      console.log('   - Admin: admin@crm.com');
      console.log('   - Password: password123');
      console.log('');
      console.log('👉 Please login as admin and create users through the application.');
    } catch (error) {
      console.error('❌ Seeding failed:', error.message);
      // Don't throw error to allow migration to continue
      console.log('⚠️  Seeding failed, but continuing...');
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove only the admin user
    await queryInterface.bulkDelete('users', { email: 'admin@crm.com' }, {});
    console.log('🗑️ Admin user removed successfully!');
  }
};
