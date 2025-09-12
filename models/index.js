const { Sequelize } = require('sequelize');
const config = require('../config/config.json');

const env = process.env.NODE_ENV || 'development';
const dbConfig = config[env];

// Create Sequelize instance
const sequelize = new Sequelize(
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

// Import models
const User = require('./User')(sequelize);
const Customer = require('./Customer')(sequelize);
const Sale = require('./Sale')(sequelize);
const Card = require('./Card')(sequelize);
const Bank = require('./Bank')(sequelize);
const SupervisorAgent = require('./SupervisorAgent')(sequelize);
const RoleAssignment = require('./RoleAssignment')(sequelize);

// Define associations
Object.keys(sequelize.models).forEach(modelName => {
  if (sequelize.models[modelName].associate) {
    sequelize.models[modelName].associate(sequelize.models);
  }
});

// Test database connection
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Sequelize database connection established successfully.');
    return true;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
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
  testConnection,
  syncDatabase
};