#!/usr/bin/env node

/**
 * Startup script for Railway deployment
 * Handles database migrations and seeding after the app starts
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('🚀 Starting CRM application...');

// Function to run database migrations
async function runMigrations() {
  try {
    console.log('📊 Running database migrations...');
    execSync('npx sequelize-cli db:migrate', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('✅ Database migrations completed successfully');
  } catch (error) {
    console.error('❌ Database migration failed:', error.message);
    // Don't exit on migration failure - let the app start anyway
    console.log('⚠️  Continuing with app startup despite migration failure');
  }
}

// Function to run database seeding
async function runSeeding() {
  try {
    console.log('🌱 Running database seeding...');
    execSync('npx sequelize-cli db:seed:all', { 
      stdio: 'inherit',
      cwd: process.cwd()
    });
    console.log('✅ Database seeding completed successfully');
  } catch (error) {
    console.error('❌ Database seeding failed:', error.message);
    // Don't exit on seeding failure - let the app start anyway
    console.log('⚠️  Continuing with app startup despite seeding failure');
  }
}

// Main startup function
async function startup() {
  console.log('🔧 Initializing database...');
  
  // Wait a bit for database to be ready
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Run migrations
  await runMigrations();
  
  // Run seeding
  await runSeeding();
  
  console.log('✅ Startup process completed');
}

// Run startup if this script is executed directly
if (require.main === module) {
  startup().catch(console.error);
}

module.exports = { startup, runMigrations, runSeeding };
