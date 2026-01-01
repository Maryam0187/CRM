#!/usr/bin/env node

/**
 * Emergency Admin Password Reset Script
 * 
 * This script resets the admin password using Sequelize hooks,
 * which ensures the password is properly hashed.
 * 
 * Usage: node scripts/reset-admin-password.js
 * 
 * You will be prompted to enter the new password interactively,
 * or you can set it via environment variable: NEW_ADMIN_PASSWORD
 */

const readline = require('readline');
const { User, sequelize } = require('../models');

// Create readline interface for password input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function resetAdminPassword() {
  let newPassword;

  try {
    // Check if password is provided via environment variable
    if (process.env.NEW_ADMIN_PASSWORD) {
      newPassword = process.env.NEW_ADMIN_PASSWORD;
      console.log('ℹ️  Using password from NEW_ADMIN_PASSWORD environment variable');
    } else {
      // Prompt for new password
      console.log('🔐 Admin Password Reset Tool');
      console.log('═══════════════════════════════\n');
      
      newPassword = await question('Enter new password for admin@crm.com (min 6 characters): ');
      
      if (!newPassword || newPassword.trim().length < 6) {
        console.error('❌ Error: Password must be at least 6 characters long');
        process.exit(1);
      }

      // Confirm password
      const confirmPassword = await question('Confirm password: ');
      
      if (newPassword !== confirmPassword) {
        console.error('❌ Error: Passwords do not match');
        process.exit(1);
      }
      
      newPassword = newPassword.trim();
    }

    // Connect to database
    console.log('\n🔗 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connection established\n');

    // Find admin user
    console.log('🔍 Looking for admin user...');
    const admin = await User.findOne({ 
      where: { email: 'admin@crm.com' } 
    });

    if (!admin) {
      console.error('❌ Error: Admin user (admin@crm.com) not found in database');
      console.error('   Please check that the user exists or create it first.');
      process.exit(1);
    }

    console.log(`✅ Found admin user (ID: ${admin.id})\n`);

    // Display current password status (first 10 chars of hash for verification)
    const currentPasswordPreview = admin.password ? 
      admin.password.substring(0, 10) + '...' : 
      '(empty)';
    const isHashed = admin.password && admin.password.startsWith('$2');
    
    console.log('📊 Current password status:');
    console.log(`   - Preview: ${currentPasswordPreview}`);
    console.log(`   - Is hashed: ${isHashed ? 'Yes ✅' : 'No ⚠️ (plain text detected)'}\n`);

    // Update password - Sequelize hooks will automatically hash it
    console.log('🔄 Resetting password...');
    await admin.update({ password: newPassword });
    await admin.reload(); // Reload to get updated data
    
    console.log('✅ Admin password reset successfully!\n');
    
    console.log('═══════════════════════════════');
    console.log('📧 Login Credentials:');
    console.log('   Email: admin@crm.com');
    console.log('   Password: ' + newPassword);
    console.log('═══════════════════════════════\n');
    
    console.log('⚠️  IMPORTANT:');
    console.log('   1. Log in immediately and change this password through the application');
    console.log('   2. Do not share this password');
    console.log('   3. Consider using a strong, unique password\n');
    
  } catch (error) {
    console.error('\n❌ Error resetting password:');
    console.error(error.message);
    
    if (error.name === 'SequelizeConnectionError') {
      console.error('\n💡 Tip: Make sure your database is running and DATABASE_URL is set correctly');
    } else if (error.name === 'SequelizeDatabaseError') {
      console.error('\n💡 Tip: Check database connection settings and permissions');
    }
    
    process.exit(1);
  } finally {
    // Close readline interface
    rl.close();
    
    // Close database connection
    if (sequelize) {
      await sequelize.close();
      console.log('🔌 Database connection closed');
    }
  }
}

// Run if called directly
if (require.main === module) {
  resetAdminPassword();
}

module.exports = { resetAdminPassword };

