#!/usr/bin/env node

/**
 * Database initialization script for Railway
 * Creates tables and seeds data
 */

const { testConnection, syncDatabase } = require('../lib/sequelize-db.js');

async function initializeDatabase() {
  console.log('🚀 Initializing database...');
  
  try {
    // Test connection
    console.log('🔍 Testing database connection...');
    const connected = await testConnection();
    
    if (!connected) {
      console.error('❌ Database connection failed');
      process.exit(1);
    }
    
    console.log('✅ Database connection successful');
    
    // Sync database (create tables)
    console.log('📊 Creating database tables...');
    const synced = await syncDatabase();
    
    if (!synced) {
      console.error('❌ Database sync failed');
      process.exit(1);
    }
    
    console.log('✅ Database tables created successfully');
    
    // Run migrations as backup
    console.log('🔄 Running migrations as backup...');
    const { execSync } = require('child_process');
    try {
      execSync('npx sequelize-cli db:migrate', { stdio: 'inherit' });
      console.log('✅ Migrations completed');
    } catch (error) {
      console.log('⚠️  Migrations failed, but tables already exist');
    }
    
    // Run seeding
    console.log('🌱 Seeding database...');
    try {
      execSync('npx sequelize-cli db:seed:all', { stdio: 'inherit' });
      console.log('✅ Database seeded successfully');
    } catch (error) {
      console.log('⚠️  Seeding failed, but continuing...');
    }
    
    console.log('✅ Database initialization completed');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
