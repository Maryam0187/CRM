# Complete Twilio Configuration Guide

## Overview

Your Twilio setup requires **TWO separate configurations**:

1. **TwiML App** - For web browser calls (agents joining via web interface) ✅ **ALREADY CONFIGURED**
2. **Phone Number** - For inbound calls to your phone number ⚠️ **NEEDS UPDATE**

---

## ✅ 1. TwiML App Configuration (Already Set)

**Purpose**: Handles calls from web browser (when agents click "Join Call" in web interface)

**Configuration**:
- **Friendly Name**: CRM Web Calls (or your preferred name)
- **A CALL COMES IN**:
  - URL: `https://crm.itechsoft.net/api/twilio/join-conference`
  - Method: **HTTP POST**
- **CALL STATUS CHANGES** (Optional):
  - URL: `https://crm.itechsoft.net/api/twilio/call-status-callback`
  - Method: **HTTP POST**

**TwiML App SID**: Should be set in your environment variables as `TWILIO_APP_SID`

**Status**: ✅ This is correct!

---

## ⚠️ 2. Phone Number Configuration (Needs Update)

**Purpose**: Handles inbound calls to your Twilio phone number and outbound calls initiated from your app

**Current Configuration** (WRONG):
- **A call comes in**: `https://demo.twilio.com/welcome/voice/` ❌

**Required Configuration**:

### Update Your Phone Number Webhooks

1. Go to **Twilio Console** → **Phone Numbers** → **Manage** → **Active Numbers**
2. Click on your phone number
3. Scroll to **Voice & Fax** section

**Update "A call comes in":**
- **Webhook**: Select "Webhook"
- **URL**: `https://crm.itechsoft.net/api/twilio/voice-response`
- **HTTP**: Select **HTTP POST**
- Click **Save**

**Configure "Call status changes":**
- **URL**: `https://crm.itechsoft.net/api/twilio/call-status-callback`
- **HTTP**: Select **HTTP POST**
- Click **Save**

---

## Complete Configuration Summary

### TwiML App (Web Browser Calls)
```
Friendly Name: CRM Web Calls
├── A CALL COMES IN
│   ├── Webhook
│   ├── URL: https://crm.itechsoft.net/api/twilio/join-conference
│   └── Method: HTTP POST
│
└── CALL STATUS CHANGES (Optional)
    ├── URL: https://crm.itechsoft.net/api/twilio/call-status-callback
    └── Method: HTTP POST
```

### Phone Number (Inbound/Outbound Calls)
```
Phone Number: +1XXXXXXXXXX
├── Voice Configuration
│   ├── Regional Routing: United States (US1) ✅
│   │
│   ├── A call comes in
│   │   ├── Webhook
│   │   ├── URL: https://crm.itechsoft.net/api/twilio/voice-response ⚠️ UPDATE THIS
│   │   └── Method: HTTP POST
│   │
│   ├── Primary handler fails
│   │   └── (Leave empty or set fallback)
│   │
│   └── Call status changes
│       ├── URL: https://crm.itechsoft.net/api/twilio/call-status-callback ⚠️ ADD THIS
│       └── Method: HTTP POST
│
└── Caller Name Lookup: Disabled ✅
```

---

## How They Work Together

### Scenario 1: Agent Initiates Call (Outbound)

1. **Agent clicks "Call"** in web interface
2. **Backend calls Twilio API** → Creates call to customer
3. **Twilio calls customer** → Uses phone number webhook (`/api/twilio/voice-response`)
4. **Customer answers** → Placed in conference room
5. **Agent joins via web** → Uses TwiML App webhook (`/api/twilio/join-conference`)
6. **Both connected** → Can talk through conference

### Scenario 2: Inbound Call (If enabled)

1. **Customer calls your Twilio number**
2. **Twilio receives call** → Uses phone number webhook (`/api/twilio/voice-response`)
3. **Your app routes call** → To available agent or queue
4. **Agent joins** → Via web interface or phone

---

## Environment Variables Required

Make sure these are set in your Railway deployment (or local `.env`):

```env
# Twilio Basic Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX

# TwiML App SID (for web browser calls)
TWILIO_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Webhook Base URL (used by both TwiML App and Phone Number)
TWILIO_WEBHOOK_BASE_URL=https://crm.itechsoft.net

# For local development:
# TWILIO_WEBHOOK_BASE_URL=http://localhost:3000
```

---

## Quick Fix Checklist

- [ ] ✅ TwiML App configured with `/api/twilio/join-conference` (Already done!)
- [ ] ⚠️ Update phone number "A call comes in" webhook to `/api/twilio/voice-response`
- [ ] ⚠️ Add phone number "Call status changes" webhook to `/api/twilio/call-status-callback`
- [ ] Verify `TWILIO_WEBHOOK_BASE_URL` environment variable is set
- [ ] Verify `TWILIO_APP_SID` environment variable is set
- [ ] Test webhook URLs are accessible

---

## Testing Your Configuration

### Test 1: TwiML App Webhook (Already Working)
```bash
curl https://crm.itechsoft.net/api/twilio/join-conference?To=test-conference
```
Should return TwiML XML with Conference instructions.

### Test 2: Phone Number Voice Response Webhook (Need to Update)
```bash
curl https://crm.itechsoft.net/api/twilio/voice-response?agentId=1
```
Should return TwiML XML with Dial/Conference instructions.

### Test 3: Call Status Callback Webhook
```bash
curl -X POST https://crm.itechsoft.net/api/twilio/call-status-callback
```
Should return empty response (200 OK) or handle the webhook.

---

## What Each Endpoint Does

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| `/api/twilio/join-conference` | Agent joins conference via web browser | TwiML App ✅ |
| `/api/twilio/voice-response` | Handle inbound calls to phone number | Phone Number ⚠️ |
| `/api/twilio/call-status-callback` | Receive call status updates | Both (Optional but recommended) |

---

## Common Issues

### Issue: Calls stuck in "queued" status
**Cause**: Phone number webhook pointing to wrong URL  
**Solution**: Update phone number webhook to `/api/twilio/voice-response`

### Issue: Agent can't join via web
**Cause**: TwiML App not configured or wrong URL  
**Solution**: Already configured correctly! ✅

### Issue: Webhooks return 404
**Cause**: Application not deployed or wrong domain  
**Solution**: Verify Railway deployment is active and URLs are correct

---

## Next Steps

1. ✅ **TwiML App is configured correctly** - No action needed
2. ⚠️ **Update phone number webhooks** - Follow steps above
3. 🔄 **Test the configuration** - Make a test call
4. 📋 **Verify environment variables** - Check Railway settings

---

## Summary

Your **TwiML App** is correctly configured with `/api/twilio/join-conference`. 

You just need to **update your phone number webhooks**:
- Change "A call comes in" from demo URL to `/api/twilio/voice-response`
- Add "Call status changes" webhook to `/api/twilio/call-status-callback`

Once both are configured, your calling system will work end-to-end! 🎉

