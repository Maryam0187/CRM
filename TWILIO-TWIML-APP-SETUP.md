# 📞 TwiML App Setup Guide

This guide will help you set up a TwiML App in Twilio Console so agents can join calls via web interface without their phone ringing.

## 🎯 What is a TwiML App?

A TwiML App is a configuration in Twilio that tells Twilio what to do when a call is made from the Twilio Client SDK (web browser). It points to a URL that returns TwiML instructions.

## 📋 Step-by-Step Setup

### Step 1: Get Your Webhook URL

First, determine your webhook base URL:

- **Local Development**: `http://localhost:3000`
- **Production**: `https://crm-production-0339.up.railway.app`

### Step 2: Create TwiML App in Twilio Console

1. **Log in to Twilio Console**
   - Go to: https://console.twilio.com/
   - Sign in with your Twilio account

2. **Navigate to TwiML Apps**
   - Click on **"Phone Numbers"** in the left sidebar
   - Click on **"TwiML"** → **"TwiML Apps"**
   - Or go directly to: https://console.twilio.com/us1/develop/runtime/twiml-apps

3. **Create New TwiML App**
   - Click the **"+"** button or **"Create new TwiML App"**
   - Fill in the form:

   **Friendly Name**: `CRM Web Calls` (or any name you prefer)

   **Voice Configuration**:
   - **A CALL COMES IN**: 
     - Select: **"Webhook"**
     - URL: `https://crm-production-0339.up.railway.app/api/twilio/join-conference`
     - Method: **POST** (or GET, both work)
   
   - **CALL STATUS CHANGES**:
     - URL: `https://crm-production-0339.up.railway.app/api/twilio/call-status-callback`
     - Method: **POST**

4. **Save the TwiML App**
   - Click **"Save"** or **"Create"**
   - **Copy the TwiML App SID** (starts with `AP...`)
   - Example: `APxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### Step 3: Add to Environment Variables

Add the TwiML App SID to your `.env` or `.env.local` file:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# TwiML App SID (for web interface calling)
TWILIO_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Webhook Base URL (for TwiML App webhooks)
TWILIO_WEBHOOK_BASE_URL=https://crm-production-0339.up.railway.app
# Or for local development:
# TWILIO_WEBHOOK_BASE_URL=http://localhost:3000
```

### Step 4: Update Your Code (Already Done)

The code is already set up to use the TwiML App SID. Just make sure:

1. ✅ `TWILIO_APP_SID` is in your environment variables
2. ✅ `TWILIO_WEBHOOK_BASE_URL` is set correctly
3. ✅ Your webhook endpoints are accessible (not behind firewall)

### Step 5: Test the Setup

1. **Start your application**
2. **Click "Call" on a customer**
3. **Web interface should appear** with "Join Call" button
4. **Click "Join Call"** - agent should connect via browser
5. **Customer and agent can talk** through the conference

## 🔍 Troubleshooting

### Issue: "Failed to get access token"
- **Check**: `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` are correct
- **Check**: Token API endpoint is accessible: `/api/twilio/token`

### Issue: "Device not initialized"
- **Check**: Twilio Client SDK is loading (check browser console)
- **Check**: Access token is being generated successfully

### Issue: "Conference room not found"
- **Check**: Conference name is being passed correctly
- **Check**: Voice response endpoint is creating the conference

### Issue: "Unable to connect to conference"
- **Check**: TwiML App SID is set in environment variables
- **Check**: TwiML App webhook URL is correct and accessible
- **Check**: Join-conference endpoint is working: `/api/twilio/join-conference`

### Issue: Webhook URL not accessible
- **For local development**: Use ngrok or similar tunnel service
- **For production**: Ensure your domain is publicly accessible
- **Check**: Webhook URL returns valid TwiML XML

## 🌐 Using ngrok for Local Development

If testing locally, you need to expose your local server:

1. **Install ngrok**: https://ngrok.com/download
2. **Start your app**: `npm run dev`
3. **Start ngrok**: `ngrok http 3000`
4. **Copy the ngrok URL**: e.g., `https://abc123.ngrok.io`
5. **Use in TwiML App**: Set webhook URL to `https://abc123.ngrok.io/api/twilio/join-conference`
6. **Update environment**: `TWILIO_WEBHOOK_BASE_URL=https://abc123.ngrok.io`

## 📝 TwiML App Configuration Summary

```
Friendly Name: CRM Web Calls
Voice URL: https://crm-production-0339.up.railway.app/api/twilio/join-conference
Voice Method: POST
Status Callback URL: https://crm-production-0339.up.railway.app/api/twilio/call-status-callback
Status Callback Method: POST
```

## ✅ Verification Checklist

- [ ] TwiML App created in Twilio Console
- [ ] TwiML App SID copied and added to `.env`
- [ ] Webhook URLs are publicly accessible
- [ ] `TWILIO_WEBHOOK_BASE_URL` is set correctly
- [ ] `TWILIO_APP_SID` is in environment variables
- [ ] Application restarted after adding environment variables
- [ ] Tested call initiation and web interface appears
- [ ] Agent can join call via web interface

## 🎯 What Happens After Setup

1. **Agent clicks "Call"** → Customer receives call
2. **Customer answers** → Put in conference room
3. **Web interface appears** → Agent sees "Join Call" button
4. **Agent clicks "Join Call"** → Connects via browser (no phone ring!)
5. **Both connected** → Can talk through conference

## 📚 Additional Resources

- [Twilio TwiML Apps Documentation](https://www.twilio.com/docs/voice/twiml-apps)
- [Twilio Client SDK Documentation](https://www.twilio.com/docs/voice/client)
- [Twilio Conference API](https://www.twilio.com/docs/voice/api/conference-resource)

---

**Note**: After setting up the TwiML App, restart your application so it picks up the new `TWILIO_APP_SID` environment variable.

