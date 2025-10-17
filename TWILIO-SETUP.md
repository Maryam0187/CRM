# 🔧 Twilio Setup Guide

## 🚨 **Current Error Fix**

Your error: `"From is not a valid phone number: +1234567890"`

**Problem**: You're using a placeholder phone number instead of a real Twilio number.

## 🎯 **Quick Fix (Test Mode)**

### Step 1: Get Twilio Test Credentials
1. Go to [Twilio Console](https://console.twilio.com/)
2. Sign up or log in
3. Find your **Account SID** and **Auth Token** on the dashboard
4. These will look like:
   - Account SID: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Auth Token: `your_32_character_token_here`

### Step 2: Update .env.local
```bash
# Use TEST credentials (safe, no charges)
TWILIO_TEST_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_TEST_AUTH_TOKEN=your_actual_test_auth_token
TWILIO_TEST_PHONE_NUMBER=+15005550006
TWILIO_TEST_MODE=true

# Webhook Configuration
TWILIO_WEBHOOK_BASE_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Other config...
NODE_ENV=development
```

### Step 3: Test
```bash
node test-twilio.js
```

## 🏢 **Production Setup (Real Phone Number)**

### Step 1: Buy a Phone Number
1. In Twilio Console → "Phone Numbers" → "Manage" → "Buy a number"
2. Choose your country and area code
3. Purchase (usually $1-2/month)

### Step 2: Update .env.local
```bash
# Use REAL credentials
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_actual_auth_token
TWILIO_PHONE_NUMBER=+1your_actual_purchased_number
TWILIO_TEST_MODE=false

# Webhook Configuration
TWILIO_WEBHOOK_BASE_URL=https://your-domain.com
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

## 🧪 **Test vs Production**

| Mode | Phone Number | Charges | Real Calls |
|------|-------------|---------|------------|
| **Trial/Test** | `+15005550006` (must be verified) | ❌ None | ✅ Yes (to verified numbers only) |
| **Production** | `+1your_number` | ✅ Yes | ✅ Yes (to any number) |

## ⚠️ **Trial Account Limitations**

- ✅ Can make calls to **verified numbers only**
- ✅ Free calls to verified numbers
- ❌ Cannot call unverified numbers
- ❌ Must verify caller IDs first

## 🚀 **Quick Start (Recommended)**

1. **Create Twilio account** (free)
2. **Use test credentials** (no charges)
3. **Set TWILIO_TEST_MODE=true**
4. **Test your integration**
5. **Switch to production** when ready

## 📞 **Your Current Call Data**

```json
{
  "agentId": 1,
  "callPurpose": "follow_up",
  "customerId": 38,
  "phoneNumber": "500-555-0006",
  "saleId": "59"
}
```

This looks correct! The issue is just the "From" phone number configuration.

## ✅ **After Setup**

Once configured, your calls will work with:
- ✅ **Recording**: Automatic recording
- ✅ **Speech-to-Text**: Automatic transcription  
- ✅ **Call History**: Complete logs
- ✅ **Integration**: Seamless with your CRM

---
**Need help?** Check the Twilio Console dashboard for your credentials!
