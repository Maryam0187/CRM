# 🚀 Complete Railway Deployment Guide

## 📋 Overview
This guide covers deploying your CRM application to Railway with MySQL database connectivity.

## 🏗️ Architecture

### Local Development (Docker)
```
┌─────────────────┐    ┌─────────────────┐
│   Next.js App   │───▶│   MySQL Docker  │
│   (Port 3000)   │    │   (Port 3306)   │
└─────────────────┘    └─────────────────┘
```

### Railway Production
```
┌─────────────────┐    ┌─────────────────┐
│   Railway App   │───▶│ Railway MySQL   │
│   (Auto-scaled) │    │ (Managed DB)    │
└─────────────────┘    └─────────────────┘
```

## 🚀 Step-by-Step Deployment

### Step 1: Create Railway Project
1. Go to [Railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your CRM repository

### Step 2: Add MySQL Database
1. In your Railway project dashboard
2. Click "New" → "Database" → "MySQL"
3. Railway automatically creates:
   - Database instance
   - Connection credentials
   - `DATABASE_URL` environment variable

### Step 3: Configure Environment Variables

#### Database Service Variables (Railway Provides):
```bash
MYSQL_DATABASE="railway"
MYSQLUSER="root"
MYSQL_ROOT_PASSWORD="xQrBBebNhzHWOpeNjxINXSTpuGyONqgG"
MYSQLHOST="${{RAILWAY_PRIVATE_DOMAIN}}"
MYSQLPORT="3306"
MYSQL_URL="mysql://root:xQrBBebNhzHWOpeNjxINXSTpuGyONqgG@hopper.proxy.rlwy.net:58283/railway"
```

#### App Service Variables (You Need to Add):
```bash
# Database Connection
DATABASE_URL=mysql://root:xQrBBebNhzHWOpeNjxINXSTpuGyONqgG@hopper.proxy.rlwy.net:58283/railway

# Authentication
NEXTAUTH_URL=https://crm-production-0339.up.railway.app
NEXTAUTH_SECRET=YrxHTYeoZe33bwxERRPBFYC/tJzDc80H0eoFom39vGg=

# Encryption
ENCRYPTION_KEY=nxOziV0b99C65Jvdyv4INX613SWuiZBjY8sNIoOqiis=

# App Configuration
NODE_ENV=production

# Twilio (Replace with your actual credentials)
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
TWILIO_WEBHOOK_BASE_URL=https://crm-production-0339.up.railway.app
```

### Step 4: Add Variables to App Service
1. **Go to your App service** (not database service)
2. **Click "Variables" tab**
3. **Add each variable** from the list above

## 🔧 Configuration Changes Made

### 1. Database Configuration (`config/config.json`)
```json
{
  "production": {
    "use_env_variable": "DATABASE_URL",
    "dialect": "mysql",
    "logging": false,
    "define": {
      "timestamps": true,
      "underscored": false,
      "freezeTableName": true
    },
    "pool": {
      "max": 5,
      "min": 0,
      "acquire": 30000,
      "idle": 10000
    }
  }
}
```

### 2. Database Connection (`lib/db.js`)
```javascript
// Smart configuration detection
const getDbConfig = () => {
  // Railway: Use DATABASE_URL
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1)
    };
  }
  
  // Local Docker: Use individual env vars
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'crm_db'
  };
};
```

## 🔄 Deployment Process

### What Happens When You Deploy:
1. **Railway detects `package.json`**
2. **Runs `npm install`** (installs dependencies)
3. **Runs `npm run build`** (builds your app)
4. **Runs `npm run postbuild`** (database migrations)
5. **Runs `npm start`** (starts your app)

### Database Migration:
```json
{
  "scripts": {
    "postbuild": "npm run db:sync && npm run db:seed"
  }
}
```

This automatically:
- **Creates database tables** (`npx sequelize-cli db:migrate`)
- **Inserts initial data** (`npx sequelize-cli db:seed:all`)

## 🔍 Verification Steps

### 1. Check Railway Logs
1. **Go to your App service**
2. **Click "Logs" tab**
3. **Look for these success messages:**
   ```
   ✅ Database connected successfully
   ✅ Sequelize database connection established successfully
   ✅ Database synchronized successfully
   ```

### 2. Test Your App
1. **Visit:** `https://crm-production-0339.up.railway.app`
2. **Try to sign in**
3. **Check if database operations work**

## 🛠️ Troubleshooting

### Common Issues

#### 1. Database Connection Failed
```bash
# Check DATABASE_URL format
echo $DATABASE_URL
# Should be: mysql://user:pass@host:port/dbname
```

#### 2. Migration Errors
```bash
# Check migration status
npx sequelize-cli db:migrate:status

# Reset if needed (WARNING: Deletes all data)
npx sequelize-cli db:migrate:undo:all
npx sequelize-cli db:migrate
```

#### 3. Environment Variables
```bash
# Verify all required variables are set
railway variables
```

## 🔄 Local vs Production Differences

| Aspect | Local (Docker) | Railway Production |
|--------|----------------|-------------------|
| **Database Host** | `db` (Docker network) | `hopper.proxy.rlwy.net` |
| **Database Name** | `crm_db` | `railway` |
| **Connection String** | `mysql://root:password@db:3306/crm_db` | `mysql://root:xQrBBebNhzHWOpeNjxINXSTpuGyONqgG@hopper.proxy.rlwy.net:58283/railway` |
| **SSL** | No | Yes (automatic) |
| **Scaling** | Single instance | Auto-scaling |
| **Backups** | Manual (Docker volumes) | Automatic (Railway) |

## 📊 Database Operations

### Your App Uses Two Database Layers:

1. **Raw MySQL2** (`lib/db.js`)
   - Direct SQL queries
   - Connection pooling
   - Error handling

2. **Sequelize ORM** (`lib/sequelize-db.js`)
   - Object-relational mapping
   - Model associations
   - Automatic migrations

### Both layers automatically adapt to:
- **Local Docker**: Uses `db` hostname
- **Railway**: Uses `DATABASE_URL` environment variable

## 🚀 Production Optimizations

### Database Connection Pooling
```javascript
// Already configured in your app
pool: {
  max: 5,        // Maximum connections
  min: 0,        // Minimum connections
  acquire: 30000, // Connection timeout
  idle: 10000    // Idle timeout
}
```

### Environment-Specific Settings
- **Development**: Detailed logging, debug mode
- **Production**: Minimal logging, optimized queries
- **Railway**: Automatic SSL, connection pooling

## 🔗 Useful Commands

```bash
# Deploy to Railway
git push origin main

# Check Railway logs
railway logs

# Connect to Railway database
railway connect

# Check environment variables
railway variables

# Restart Railway service
railway restart
```

## 📝 Next Steps After Deployment

1. **Test all functionality** with Railway database
2. **Configure custom domain** (optional)
3. **Set up monitoring** and alerts
4. **Configure backups** (automatic with Railway)
5. **Update Twilio webhooks** to use Railway URL

## 🎯 Summary

Your CRM application is now configured to work seamlessly with both:
- **Local Docker development** (using `docker-compose.yml`)
- **Railway production deployment** (using `DATABASE_URL`)

The database connection automatically adapts based on the environment, ensuring your app works in both scenarios without code changes.

## 🚀 Quick Deployment Checklist

- [ ] Railway project created
- [ ] MySQL database added
- [ ] Environment variables added to app service
- [ ] Code pushed to GitHub
- [ ] Railway deployment successful
- [ ] Database connection verified
- [ ] App functionality tested

**Your CRM is now live on Railway! 🎉**

