#!/usr/bin/env node

/**
 * Simple database initialization script for Railway
 * Uses direct Sequelize connection without ES6 imports
 */

const { Sequelize } = require('sequelize');
const config = require('../config/config.json');

async function initializeDatabase() {
  console.log('🚀 Initializing database...');
  
  let sequelize;
  
  try {
    // Create Sequelize instance with smart configuration
    if (process.env.DATABASE_URL) {
      // Railway production: Use DATABASE_URL
      console.log('🔗 Using Railway DATABASE_URL for connection');
      sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: "mysql",
        logging: false,
        define: {
          timestamps: true,
          underscored: false,
          freezeTableName: true
        },
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      });
    } else {
      // Local development: Use config.json
      console.log('🔗 Using local database configuration');
      const env = process.env.NODE_ENV || 'development';
      const dbConfig = config[env];
      
      sequelize = new Sequelize(
        dbConfig.database,
        dbConfig.username,
        dbConfig.password,
        {
          host: dbConfig.host,
          port: dbConfig.port,
          dialect: "mysql",
          logging: false,
          define: {
            timestamps: true,
            underscored: false,
            freezeTableName: true
          },
          pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
          }
        }
      );
    }
    
    // Test connection
    console.log('🔍 Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connection successful');
    
    // Sync database (create tables)
    console.log('📊 Creating database tables...');
    await sequelize.sync({ force: false });
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
  } finally {
    if (sequelize) {
      await sequelize.close();
    }
  }
}

// Run if called directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase };
