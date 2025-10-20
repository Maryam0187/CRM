# 🚀 Railway Deployment Guide

## 🎯 **Why Railway for Your CRM Project?**

- ✅ **Perfect for Next.js apps** with MySQL
- ✅ **API routes work** out of the box
- ✅ **Native MySQL database** support - keep your existing structure
- ✅ **Automatic deployments** from GitLab
- ✅ **Free tier available** - $5 credit monthly
- ✅ **Full-stack hosting** - Frontend + Backend + Database in one place
- ✅ **Docker support** - Easy containerization

## 📋 **Step-by-Step Deployment**

### **Step 1: Prepare Your Project**

✅ **You now have separate Dockerfiles for different environments!**

#### **Dockerfile Structure:**
- **`Dockerfile`** - Production optimized (smaller image, built app)
- **`Dockerfile.dev`** - Development with hot reload
- **`docker-compose.yml`** - Development environment
- **`docker-compose.prod.yml`** - Production environment

#### **Production Dockerfile Features:**
- Builds the Next.js application
- Removes dev dependencies to reduce image size
- Starts with `npm start` (production mode)
- Optimized for Railway deployment

2. **Verify package.json has the required scripts**:
```json
{
  "scripts": {
    "start": "next start",
    "build": "next build",
    "dev": "next dev"
  }
}
```

3. **Push your code to GitLab**

### **Step 2: Deploy to Railway**
1. Go to [railway.app](https://railway.app)
2. Sign up with GitLab
3. Click "New Project"
4. Select "Deploy from GitLab repo"
5. Choose your GitLab repository
6. Railway will automatically detect it's a Next.js app

### **Step 3: Add MySQL Database**
1. In your Railway project dashboard
2. Click "New" → "Database" → "MySQL"
3. Railway will create a MySQL database
4. Copy the connection details

### **Step 4: Set Environment Variables in Railway**
```
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_phone_number
TWILIO_WEBHOOK_BASE_URL=https://your-app.railway.app
DATABASE_URL=mysql://username:password@host:port/database
NEXTAUTH_SECRET=your_secret_key
NEXTAUTH_URL=https://your-app.railway.app
NODE_ENV=production
```

## 🗄️ **Database Migration**

### **Export from Local MySQL**
```bash
# Export everything (structure + data)
mysqldump -u root -p crm_db > crm_backup.sql

# Export only structure
mysqldump -u root -p --no-data crm_db > crm_structure.sql

# Export only data
mysqldump -u root -p --no-create-info crm_db > crm_data.sql
```

### **Import to Railway MySQL**
```bash
# Import everything
mysql -h your-railway-host -u root -p railway < crm_backup.sql

# Or import structure first, then data
mysql -h your-railway-host -u root -p railway < crm_structure.sql
mysql -h your-railway-host -u root -p railway < crm_data.sql
```

## 🔧 **Update Your Code for Production**

### **Update TwiML Bin URL**
After deployment, update your TwiML Bin URL to use your production domain:

```javascript
// In app/api/calls/initiate/route.js
const twimlBinUrl = 'https://handler.twilio.com/twiml/YOUR_TWIML_BIN_ID';
```

### **Update Webhook URLs**
Your webhook URLs will automatically work:
```javascript
statusCallback: 'https://your-app.railway.app/api/twilio/call-status-callback'
```

## 🧪 **Testing After Deployment**

1. **Test call initiation**: Make a test call
2. **Check webhook callbacks**: Verify status updates work
3. **Test database**: Ensure data is being saved
4. **Test authentication**: Verify login works

## 🔗 **GitLab Integration Benefits**

- ✅ **Full GitLab support** - Connect your GitLab repository
- ✅ **Automatic deployments** - Deploy on every push to GitLab
- ✅ **Branch deployments** - Deploy different GitLab branches
- ✅ **CI/CD integration** - Works with GitLab CI/CD pipelines
- ✅ **Private repositories** - Support for private GitLab repos
- ✅ **Webhook support** - Automatic builds on GitLab events

## 📊 **Railway Benefits**

| Feature | Railway |
|---------|---------|
| Free Tier | ✅ ($5 credit monthly) |
| MySQL Database | ✅ Native support |
| API Routes | ✅ Full support |
| GitLab Integration | ✅ Automatic deployments |
| Full-Stack Hosting | ✅ Everything in one place |
| Docker Support | ✅ Easy containerization |

## 🚀 **Quick Start Commands**

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Deploy from GitLab
railway up

# Set environment variables
railway variables set TWILIO_ACCOUNT_SID=your_sid
railway variables set TWILIO_AUTH_TOKEN=your_token
# ... etc
```

## 🔍 **Post-Deployment Checklist**

- [ ] App loads correctly
- [ ] Database connection works
- [ ] Twilio calls can be initiated
- [ ] Webhook callbacks work
- [ ] Authentication works
- [ ] All API endpoints respond
- [ ] Environment variables are set
- [ ] SSL certificate is active
