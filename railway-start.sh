#!/bin/bash

# Railway startup script
echo "🚀 Starting CRM application on Railway..."

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Test database connection first
echo "🔍 Testing database connection..."
node -e "
const { testConnection } = require('./lib/sequelize-db.js');
testConnection().then(success => {
  if (success) {
    console.log('✅ Database connection successful');
    process.exit(0);
  } else {
    console.log('❌ Database connection failed');
    process.exit(1);
  }
}).catch(err => {
  console.error('❌ Database connection error:', err);
  process.exit(1);
});
"

# Run database migrations
echo "📊 Running database migrations..."
npx sequelize-cli db:migrate || {
  echo "⚠️  Migration failed, trying to create tables with Sequelize sync..."
  node -e "
  const { syncDatabase } = require('./lib/sequelize-db.js');
  syncDatabase().then(success => {
    if (success) {
      console.log('✅ Database tables created successfully');
    } else {
      console.log('❌ Database table creation failed');
    }
  }).catch(err => {
    console.error('❌ Database sync error:', err);
  });
  "
}

# Run database seeding
echo "🌱 Running database seeding..."
npx sequelize-cli db:seed:all || echo "⚠️  Seeding failed, continuing..."

# Start the application
echo "🎯 Starting Next.js application..."
npm start
