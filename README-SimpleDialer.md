# 📞 Simple Dialer - Core Features

## 🎯 What You Get
- **📞 Dialing**: Make calls to customers
- **🎙️ Call Recording**: Automatic recording with playback
- **📝 Speech-to-Text**: Automatic transcription
- **📊 Call History**: View all calls with recordings
- **🧪 Testing**: Easy testing with test mode

## 🚀 Quick Setup

### 1. Install Twilio
```bash
npm install twilio
```

### 2. Get Twilio Credentials
1. Go to [twilio.com](https://twilio.com) and create account
2. Get your credentials:
   - Account SID: `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
   - Auth Token: `your_auth_token`
   - Phone Number: `+1234567890`

### 3. Configure Environment
Create `.env.local`:
```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Test Mode (for safe testing)
TWILIO_TEST_MODE=true
TWILIO_WEBHOOK_BASE_URL=http://localhost:3000
```

### 4. Run Database Migration
```bash
npm run db:sync
```

### 5. Test the Setup
```bash
node test-twilio.js
```

## 🧪 Testing

### Test Mode (Safe)
- Use test credentials
- Use test number: `+15005550006`
- No real calls or charges
- Perfect for development

### Production Mode
- Use live credentials
- Real phone calls
- Actual charges apply

## 📱 How to Use

### 1. Access AddSale Page
Navigate to `/add-sale` in your browser

### 2. Test Call Features
- **Call Button**: Appears when valid phone number is entered
- **Call History**: Click "View Call History" to see all calls
- **Edit Mode**: Landline becomes read-only, call buttons still work

### 3. Make a Test Call
1. Enter customer name and valid phone number
2. Call button appears automatically
3. Click "Call" to initiate call
4. Recording and transcription will be processed
5. Call history shows automatically after call

## 🔧 Features Explained

### 📞 Dialing
- Validates phone numbers
- Initiates calls via Twilio
- Real-time call status
- Error handling

### 🎙️ Call Recording
- Automatic recording during calls
- Audio playback in call history
- Secure storage of recordings
- Recording duration tracking

### 📝 Speech-to-Text
- Automatic transcription of recordings
- Text display in call history
- Twilio's speech recognition
- Searchable transcriptions

### 📊 Call History
- Complete call logs
- Recording playback
- Transcription display
- Call status and duration
- Customer information

## 🚨 Troubleshooting

### Common Issues

1. **"Twilio credentials not configured"**
   ```bash
   # Check your .env.local file
   TWILIO_ACCOUNT_SID=your_sid
   TWILIO_AUTH_TOKEN=your_token
   TWILIO_PHONE_NUMBER=your_number
   ```

2. **"Invalid phone number format"**
   - Use format: `+1234567890`
   - Include country code
   - Remove spaces and dashes

3. **"Call log not found"**
   ```bash
   # Run database migration
   npm run db:sync
   ```

4. **Webhooks not working**
   - Use ngrok for local testing
   - Update webhook URLs in Twilio console

### Test Commands
```bash
# Test the integration
node test-twilio.js

# Check environment
echo $TWILIO_ACCOUNT_SID

# Start development server
npm run dev
```

## 📋 API Endpoints

### Core Endpoints
- `POST /api/calls/initiate` - Start a call
- `GET /api/calls/initiate` - Get call history
- `POST /api/twilio/call-status-callback` - Handle call updates
- `POST /api/twilio/recording-callback` - Handle recordings

## 🎉 You're Ready!

1. ✅ Set up Twilio account
2. ✅ Configure environment variables
3. ✅ Run database migration
4. ✅ Test with `node test-twilio.js`
5. ✅ Visit `/test-dialer` to start testing

**That's it!** Your simple dialer is ready with all core features.

## 🔄 Next Steps
- Test with real customers
- Set up production environment
- Configure webhook URLs
- Start making calls!

---
*Simple, focused, and ready to test! 🚀*

