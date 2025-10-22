# Railway Deployment Guide for CRM

This guide will help you deploy your CRM application to Railway and fix the call queuing issue.

## 🚀 Quick Fix for Call Queuing Issue

The main issue causing calls to get stuck in "queued" status is incorrect webhook URL configuration. Here's how to fix it:

### 1. Set Railway Environment Variables

In your Railway dashboard, go to your project → Variables tab and add these environment variables:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Webhook Configuration (IMPORTANT!)
TWILIO_WEBHOOK_BASE_URL=https://your-app-name.railway.app

# Database Configuration
DATABASE_URL=mysql://username:password@host:port/database_name

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h

# Encryption
ENCRYPTION_KEY=your_32_character_encryption_key_here

# App Configuration
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-app-name.railway.app
```

### 2. Get Your Railway App URL

1. Go to your Railway project dashboard
2. Click on your service
3. Go to the "Settings" tab
4. Copy the "Public Domain" URL (it looks like `https://your-app-name.railway.app`)
5. Set this as your `TWILIO_WEBHOOK_BASE_URL` environment variable

### 3. Verify Webhook URLs

After deployment, your webhook URLs should be:
- **Status Callback**: `https://your-app-name.railway.app/api/twilio/call-status-callback`
- **Recording Callback**: `https://your-app-name.railway.app/api/twilio/recording-callback`

## 🔧 Troubleshooting Call Issues

### Check Call Status
1. Go to your CRM app
2. Navigate to the call logs or sales section
3. Look for calls stuck in "queued" status
4. Check the browser console for any errors

### Verify Twilio Configuration
1. Log into your Twilio Console
2. Go to Phone Numbers → Manage → Active numbers
3. Click on your Twilio phone number
4. Verify the webhook URLs are set to your Railway app URL

### Test Webhook Endpoints
You can test if your webhook endpoints are accessible:

```bash
# Test status callback endpoint
curl -X POST https://your-app-name.railway.app/api/twilio/call-status-callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test&CallStatus=completed"

# Test recording callback endpoint  
curl -X POST https://your-app-name.railway.app/api/twilio/recording-callback \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=test&RecordingUrl=test"
```

## 📋 Environment Variables Reference

### Required Variables
```env
# Database
DATABASE_URL=mysql://user:pass@host:port/db

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Webhooks (CRITICAL for call functionality)
TWILIO_WEBHOOK_BASE_URL=https://your-app-name.railway.app

# Security
JWT_SECRET=your-secret-key
ENCRYPTION_KEY=your-32-char-key
```

### Optional Variables
```env
# App Configuration
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-app-name.railway.app

# Railway provides these automatically
RAILWAY_STATIC_URL=https://your-app-name.railway.app
RAILWAY_PUBLIC_DOMAIN=your-app-name.railway.app
```

## 🚨 Common Issues and Solutions

### Issue: Calls stuck in "queued" status
**Solution**: Set `TWILIO_WEBHOOK_BASE_URL` to your Railway app URL

### Issue: Webhook timeouts
**Solution**: Ensure your Railway app is running and accessible

### Issue: Database connection errors
**Solution**: Verify `DATABASE_URL` is correctly formatted

### Issue: Twilio authentication errors
**Solution**: Double-check `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN`

## 🔄 Deployment Steps

1. **Set Environment Variables** in Railway dashboard
2. **Deploy your app** (Railway auto-deploys on git push)
3. **Test webhook endpoints** using the curl commands above
4. **Make a test call** from your CRM app
5. **Check call logs** to verify status updates

## 📞 Testing Call Flow

1. Create a test customer in your CRM
2. Initiate a call from the sales interface
3. Check that the call status progresses from "queued" → "ringing" → "completed"
4. Verify call logs are updated with duration and status

## 🆘 Getting Help

If you're still experiencing issues:

1. Check Railway logs: `railway logs`
2. Check Twilio logs in your Twilio Console
3. Test webhook endpoints manually with curl
4. Verify all environment variables are set correctly

The key fix is setting the correct `TWILIO_WEBHOOK_BASE_URL` environment variable to your Railway app URL!
