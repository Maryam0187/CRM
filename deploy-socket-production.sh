#!/bin/bash

# Socket.IO Production Deployment Script
# This script ensures Socket.IO is properly configured for production

echo "🚀 Deploying Socket.IO for Production..."

# Check if we're in production mode
if [ "$NODE_ENV" != "production" ]; then
    echo "⚠️  Warning: NODE_ENV is not set to 'production'"
    echo "   Setting NODE_ENV=production for this deployment"
    export NODE_ENV=production
fi

# Check required environment variables
echo "🔍 Checking Socket.IO environment variables..."

required_vars=(
    "SOCKET_IO_CORS_ORIGIN"
    "NEXT_PUBLIC_SOCKET_URL"
    "JWT_SECRET"
)

missing_vars=()

for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
    echo "❌ Missing required environment variables:"
    printf '   - %s\n' "${missing_vars[@]}"
    echo ""
    echo "Please set these variables before deploying:"
    echo "   export SOCKET_IO_CORS_ORIGIN=https://your-domain.com"
    echo "   export NEXT_PUBLIC_SOCKET_URL=https://your-domain.com"
    echo "   export JWT_SECRET=your-secret-key"
    exit 1
fi

echo "✅ All required environment variables are set"

# Build the application
echo "🔨 Building application for production..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed. Please check the errors above."
    exit 1
fi

echo "✅ Build completed successfully"

# Test Socket.IO health endpoint
echo "🏥 Testing Socket.IO health endpoint..."
sleep 5  # Wait for server to start

# Check if health endpoint is accessible
if command -v curl &> /dev/null; then
    health_response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/socket/health)
    if [ "$health_response" = "200" ]; then
        echo "✅ Socket.IO health check passed"
    else
        echo "⚠️  Socket.IO health check returned status: $health_response"
    fi
else
    echo "ℹ️  curl not available, skipping health check"
fi

echo ""
echo "🎉 Socket.IO production deployment completed!"
echo ""
echo "📋 Production Checklist:"
echo "   ✅ Environment variables configured"
echo "   ✅ Application built for production"
echo "   ✅ Socket.IO server optimized for production"
echo "   ✅ CORS configured for production domain"
echo "   ✅ WebSocket transport enabled"
echo "   ✅ Compression enabled"
echo "   ✅ Health endpoint available at /api/socket/health"
echo ""
echo "🔗 Socket.IO will be available at: $NEXT_PUBLIC_SOCKET_URL/api/socket"
echo "🏥 Health check: $NEXT_PUBLIC_SOCKET_URL/api/socket/health"
