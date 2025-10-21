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
    
    // Sync database (create tables) - This creates all tables properly
    console.log('📊 Creating database tables with Sequelize sync...');
    await sequelize.sync({ force: false });
    console.log('✅ Database tables created successfully');
    
    // Check if tables exist
    console.log('🔍 Verifying tables exist...');
    const [tables] = await sequelize.query("SHOW TABLES");
    console.log(`📋 Found ${tables.length} tables in database:`);
    tables.forEach((table, index) => {
      const tableName = Object.values(table)[0];
      console.log(`   ${index + 1}. ${tableName}`);
    });
    
    // Skip migrations since Sequelize sync already created the tables
    console.log('✅ Tables created by Sequelize sync - skipping migrations');
    
    // Run seeding only if tables exist
    if (tables.length > 0) {
      console.log('🌱 Seeding database...');
      try {
        execSync(`npx sequelize-cli db:seed:all --env ${env}`, { 
          stdio: 'inherit',
          env: { ...process.env, NODE_ENV: env }
        });
        console.log('✅ Database seeded successfully');
      } catch (error) {
        console.log('⚠️  Seeding failed, but continuing...');
        console.log('   Error:', error.message);
      }
    } else {
      console.log('⚠️  No tables found - skipping seeding');
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
