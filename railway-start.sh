#!/bin/bash

# Railway startup script
echo "🚀 Starting CRM application on Railway..."

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Run database migrations
echo "📊 Running database migrations..."
npx sequelize-cli db:migrate || echo "⚠️  Migration failed, continuing..."

# Run database seeding
echo "🌱 Running database seeding..."
npx sequelize-cli db:seed:all || echo "⚠️  Seeding failed, continuing..."

# Start the application
echo "🎯 Starting Next.js application..."
npm start
