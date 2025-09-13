#!/bin/bash

echo "🚀 Starting CRM Docker Setup..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "❌ docker-compose is not installed. Please install docker-compose first."
    exit 1
fi

# Create .env.local if it doesn't exist
if [ ! -f .env.local ]; then
    echo "📝 Creating .env.local file..."
    cp env.example .env.local
    echo "✅ .env.local created. Please review and update the configuration if needed."
fi

# Start the services
echo "🐳 Starting Docker services..."
docker-compose up -d

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check if services are running
echo "🔍 Checking service status..."
docker-compose ps

echo ""
echo "✅ CRM Docker Setup Complete!"
echo ""
echo "🌐 Access your application:"
echo "   Frontend: http://localhost:3000"
echo "   Adminer:  http://localhost:8080"
echo ""
echo "🗄️  Database credentials:"
echo "   Server:   localhost:3306"
echo "   Database: crm_db"
echo "   Username: root"
echo "   Password: password"
echo ""
echo "📊 Adminer credentials:"
echo "   System:   MySQL"
echo "   Server:   db"
echo "   Username: root"
echo "   Password: password"
echo "   Database: crm_db"
echo ""
echo "🔧 Useful commands:"
echo "   View logs:     docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart:       docker-compose restart"
echo ""
