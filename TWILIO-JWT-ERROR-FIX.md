# 🔧 Fixing Twilio JWT Invalid Error (31204)

## Error Message
```
Twilio Device error: {code: 31204, message: 'JWT is invalid'}
```

## Common Causes

### 1. Missing or Incorrect Twilio Credentials

**Check your environment variables:**
```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
```

**Solution:**
- Verify these are set correctly in your Railway environment variables
- Make sure there are no extra spaces or quotes
- Account SID should start with `AC`
- Auth Token should be 32 characters

### 2. Missing TwiML App SID

**Check:**
```env
TWILIO_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Solution:**
- Create a TwiML App in Twilio Console (see `TWILIO-TWIML-APP-SETUP.md`)
- Copy the TwiML App SID (starts with `AP`)
- Add it to your Railway environment variables
- Restart your application

### 3. Using API Keys (Recommended)

For better security, use Twilio API Keys instead of Auth Token:

1. **Create API Key in Twilio Console:**
   - Go to: https://console.twilio.com/us1/account/keys-credentials/api-keys
   - Click "Create new API Key"
   - Copy the **Key SID** (starts with `SK`) and **Secret**

2. **Add to Environment Variables:**
   ```env
   TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_API_SECRET=your_api_secret_here
   ```

3. **Restart Application**

### 4. Token Generation Issues

**Check server logs:**
- Look for "📞 Twilio token generated" messages
- Verify token is being created successfully
- Check for any error messages

**Common Issues:**
- Token expiration (default is 1 hour)
- Clock skew between server and Twilio
- Invalid identity format

## Step-by-Step Fix

### Step 1: Verify Environment Variables

In Railway Dashboard:
1. Go to your project → Variables
2. Verify these are set:
   - ✅ `TWILIO_ACCOUNT_SID`
   - ✅ `TWILIO_AUTH_TOKEN`
   - ✅ `TWILIO_APP_SID` (required for web calls)
   - ✅ `TWILIO_WEBHOOK_BASE_URL`

### Step 2: Test Token Generation

1. **Check the token endpoint:**
   - URL: `https://crm-production-0339.up.railway.app/api/twilio/token`
   - Method: GET
   - Headers: Include your JWT auth token

2. **Expected Response:**
   ```json
   {
     "success": true,
     "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
     "identity": "agent-1"
   }
   ```

3. **If you get an error:**
   - Check server logs in Railway
   - Verify all environment variables are set
   - Check that credentials are correct

### Step 3: Verify TwiML App

1. **Go to Twilio Console:**
   - Navigate to: Phone Numbers → TwiML → TwiML Apps
   - Find your TwiML App
   - Verify the SID matches `TWILIO_APP_SID` in your env

2. **Check TwiML App Configuration:**
   - Voice URL should be: `https://crm-production-0339.up.railway.app/api/twilio/join-conference`
   - Status Callback should be: `https://crm-production-0339.up.railway.app/api/twilio/call-status-callback`

### Step 4: Restart Application

After making changes:
1. **Restart your Railway service**
2. **Clear browser cache**
3. **Try again**

## Quick Test

1. **Open browser console**
2. **Click "Call" button**
3. **Check for errors:**
   - If you see "JWT is invalid" → Check credentials
   - If you see "Device not initialized" → Check Twilio SDK loading
   - If you see "Conference not found" → Check conference name

## Environment Variables Checklist

```env
# Required
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WEBHOOK_BASE_URL=https://crm-production-0339.up.railway.app

# Optional (but recommended)
TWILIO_API_KEY=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_API_SECRET=your_api_secret_here
```

## Still Not Working?

1. **Check Railway Logs:**
   - Go to Railway Dashboard → Your Service → Logs
   - Look for token generation errors
   - Check for "📞 Twilio token generated" messages

2. **Verify Twilio Account:**
   - Make sure your Twilio account is active (not trial with restrictions)
   - Verify your phone number is purchased (not trial)

3. **Test Token Manually:**
   - Use Postman or curl to test `/api/twilio/token` endpoint
   - Verify the token is valid JSON
   - Check token length (should be ~500-1000 characters)

4. **Check Browser Console:**
   - Look for full error messages
   - Check network tab for token request
   - Verify token is being received

## Additional Resources

- [Twilio Access Tokens Documentation](https://www.twilio.com/docs/iam/access-tokens)
- [Twilio Client SDK Troubleshooting](https://www.twilio.com/docs/voice/client/javascript/errors)
- [Twilio Error Codes](https://www.twilio.com/docs/api/errors)

---

**Note**: The most common cause is missing `TWILIO_APP_SID`. Make sure you've created a TwiML App and added its SID to your environment variables.

