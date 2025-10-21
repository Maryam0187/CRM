const { Sequelize } = require('sequelize');
const config = require('../config/config.json');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance with smart configuration
let sequelize;

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
  sequelize = new Sequelize(
    dbConfig.database,
    dbConfig.username,
    dbConfig.password,
    {
      host: dbConfig.host,
      port: dbConfig.port,
      dialect: "mysql",
      logging: dbConfig.logging || false,
      define: dbConfig.define || {
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

// Import models
const User = require('./User')(sequelize);
const Customer = require('./Customer')(sequelize);
const Sale = require('./Sale')(sequelize);
const Card = require('./Card')(sequelize);
const Bank = require('./Bank')(sequelize);
const SupervisorAgent = require('./SupervisorAgent')(sequelize);
const RoleAssignment = require('./RoleAssignment')(sequelize);
const Carrier = require('./Carrier')(sequelize);
const Receiver = require('./Receiver')(sequelize);
const SalesLog = require('./SalesLog')(sequelize);
const CallLog = require('./CallLog')(sequelize);

// Define associations
Object.keys(sequelize.models).forEach(modelName => {
  if (sequelize.models[modelName].associate) {
    sequelize.models[modelName].associate(sequelize.models);
  }
});

// Test database connection
const testConnection = async () => {
  try {
    console.log('🔍 Testing database connection...');
    console.log('Environment:', process.env.NODE_ENV);
    console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
    if (process.env.DATABASE_URL) {
      console.log('DATABASE_URL:', process.env.DATABASE_URL.replace(/:[^:]*@/, ':***@')); // Hide password
    }
    
    await sequelize.authenticate();
    console.log('✅ Sequelize database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    console.error('Connection details:', {
      host: sequelize.config.host,
      port: sequelize.config.port,
      database: sequelize.config.database,
      username: sequelize.config.username
    });
    return false;
  }
};

// Sync database (create tables if they don't exist)
const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('✅ Database synchronized successfully.');
    return true;
  } catch (error) {
    console.error('❌ Database synchronization failed:', error);
    return false;
  }
};

module.exports = {
  sequelize,
  Sequelize,
  User,
  Customer,
  Sale,
  Card,
  Bank,
  SupervisorAgent,
  RoleAssignment,
  Carrier,
  Receiver,
  SalesLog,
  CallLog,
  testConnection,
  syncDatabase
};