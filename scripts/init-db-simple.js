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
    // Force production environment for Railway
    const env = process.env.DATABASE_URL ? 'production' : (process.env.NODE_ENV || 'development');
    console.log(`🔧 Using environment: ${env}`);
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
      execSync(`npx sequelize-cli db:migrate --env ${env}`, { 
        stdio: 'inherit',
        env: { ...process.env, NODE_ENV: env }
      });
      console.log('✅ Migrations completed');
    } catch (error) {
      console.log('⚠️  Migrations failed, but tables already exist');
    }
    
    // Check if admin user exists before seeding
    // This prevents resetting admin password on every deployment
    console.log('🔍 Checking if admin user exists...');
    let shouldSeed = false;
    try {
      const [adminCheck] = await sequelize.query(
        "SELECT id FROM users WHERE email = 'admin@crm.com' LIMIT 1",
        { type: Sequelize.QueryTypes.SELECT }
      );
      
      if (!adminCheck) {
        console.log('ℹ️  Admin user not found - will run seeders (first deployment)');
        shouldSeed = true;
      } else {
        console.log('✅ Admin user already exists - skipping seeders to preserve data');
        shouldSeed = false;
      }
    } catch (error) {
      // If users table doesn't exist yet, we should seed
      console.log('ℹ️  Could not check for admin user (table may not exist yet) - will run seeders');
      shouldSeed = true;
    }
    
    // Only run seeding if admin doesn't exist (first deployment) or if explicitly enabled
    if (shouldSeed || process.env.RUN_SEEDERS === 'true') {
      console.log('🌱 Seeding database...');
      try {
        execSync(`npx sequelize-cli db:seed:all --env ${env}`, { 
          stdio: 'inherit',
          env: { ...process.env, NODE_ENV: env }
        });
        console.log('✅ Database seeded successfully');
      } catch (error) {
        console.log('⚠️  Seeding failed, but continuing...');
      }
    } else {
      console.log('⏭️  Skipping seeders (admin exists and RUN_SEEDERS not set)');
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
