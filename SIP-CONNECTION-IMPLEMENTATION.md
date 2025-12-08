# SIP Connection Implementation - Complete Guide

## ✅ What Was Implemented

### 1. SipConnectionProvider Component
- **Location**: `components/SipConnection.js`
- **Purpose**: Maintains persistent SIP registration to Twilio SIP Domain using SIP.js library
- **Features**:
  - Automatically registers to SIP domain when agent logs in
  - Uses SIP.js library for WebRTC SIP client
  - Stays registered while agent is active
  - Handles reconnection automatically
  - Disconnects on logout
  - **Cost: $0** (only pay for call minutes)

### 2. API Endpoint
- **Location**: `app/api/agents/sip-password/route.js`
- **Purpose**: Returns decrypted SIP password for authenticated agent
- **Security**: Only returns password for the agent's own account

### 3. Integration
- Added to `app/layout.js` to wrap the entire application
- Available via `useSipConnection()` hook in any component
- Visual status indicator (bottom-right corner)

---

## 🔄 How It Works

### Connection Flow (Outbound Call Center):

1. **Agent logs in** → SipConnectionProvider detects user with SIP config
2. **Gets decrypted password** → Calls `/api/agents/sip-password` API
3. **Registers to SIP domain** → Uses SIP.js UserAgent and Registerer
4. **Stays registered** → Maintains connection while active
5. **Agent initiates outbound call** → Customer answers
6. **Twilio dials agent via SIP** → Agent receives call (already registered)
7. **Call connects** → Agent and customer can talk
8. **Agent logs out** → Unregisters and disconnects

### Why Registration is Needed:

Even for **outbound-only** calls, the agent must be registered to the SIP domain because:

1. Agent clicks "Call" → Twilio calls customer
2. Customer answers → Twilio generates TwiML with `<Dial><Sip>agent@domain</Sip></Dial>`
3. Twilio tries to connect to agent's SIP endpoint
4. **Agent must be registered** to receive this SIP call
5. If not registered → Call fails, customer hears nothing

---

## 📦 Dependencies

### Installed Package:
```bash
npm install sip.js
```

### Required Configuration:
- Agent must have SIP extension configured:
  - `extension` (e.g., "201")
  - `sipUsername` (e.g., "201")
  - `sipDomain` (e.g., "crm-sip.sip.twilio.com")
  - `sipPassword` (encrypted in database)

---

## 🎯 Current Implementation Status

### ✅ Implemented:
- SIP.js library installed
- SIP domain registration on login
- Persistent connection while active
- Automatic reconnection on failure
- Status tracking and visual indicator
- Password decryption API endpoint
- Disconnect on logout
- **Outbound call support** - Agent can receive calls when customer answers

### ⏳ Future Implementation:
- **Inbound call handling** - Will be implemented later
  - Currently: Incoming calls are automatically rejected
  - Future: Will add UI to accept/reject incoming calls
  - Future: Will route inbound calls to available agents

---

## 💻 Code Structure

### Component: `components/SipConnection.js`

```javascript
// Main features:
- useSipConnection() hook - Access connection state
- Automatic registration on login
- SIP.js UserAgent for SIP protocol
- Registerer for domain registration
- Status indicators
```

### API: `app/api/agents/sip-password/route.js`

```javascript
// Returns:
{
  success: true,
  data: {
    sipUsername: "201",
    sipDomain: "crm-sip.sip.twilio.com",
    extension: "201",
    password: "decrypted_password"
  }
}
```

---

## 🔧 Configuration

### Environment Variables:
```env
# Encryption key for SIP passwords (must match the one used to encrypt)
ENCRYPTION_KEY=your_32_character_encryption_key_here

# Twilio SIP Domain (optional - can be set per agent)
TWILIO_SIP_DOMAIN=crm-sip.sip.twilio.com
TWILIO_SIP_DEFAULT_DOMAIN=crm-sip.sip.twilio.com
```

### Agent Setup:
1. Assign extension via Admin Panel (`/admin/users`)
2. Set `sipUsername` (usually same as extension)
3. Set `sipPassword` (will be encrypted automatically)
4. Set `sipDomain` (or use default from env)

---

## 📊 Visual Status Indicators

### Bottom-Right Corner:
- **Green Badge**: "📞 SIP Registered (Ext: 201)" - Ready to receive calls
- **Yellow Badge**: "🔄 Registering..." - Connecting to SIP domain
- **Red Badge**: "❌ SIP Disconnected" - Not connected

### Status States:
- `disconnected` - Not registered
- `connecting` - Registration in progress
- `ready` / `registered` - Successfully registered and ready

---

## 🔄 Connection Lifecycle

### On Login:
1. Component detects user with SIP config
2. Calls `/api/agents/sip-password` to get decrypted password
3. Creates SIP.js UserAgent with credentials
4. Connects to SIP domain via WebSocket (WSS)
5. Registers to SIP domain
6. Updates agent status to "available"
7. Shows green "SIP Registered" indicator

### While Active:
- Maintains registration (re-registers every hour)
- Monitors connection status
- Handles reconnection on failure
- Updates status in database

### On Logout:
1. Unregisters from SIP domain
2. Stops UserAgent
3. Updates agent status to "offline"
4. Cleans up resources
5. Shows red "SIP Disconnected" indicator

---

## 🧪 Testing

### 1. Test Registration:
```bash
# Login as agent with SIP extension
# Check browser console for:
✅ SIP UserAgent started
✅ Successfully registered to SIP domain!
📞 SIP Registered (Ext: 201)
```

### 2. Test Outbound Call:
1. Agent clicks "Call" button
2. Customer receives call and answers
3. Twilio dials agent via SIP
4. Agent should receive call (already registered)
5. Call connects successfully

### 3. Check Status:
- Visual indicator shows green "SIP Registered"
- Database: `users.call_status = 'available'`
- Browser console: No errors

---

## 💰 Cost

- **SIP Registration**: $0 (free)
- **WebSocket Connection**: $0 (free)
- **Call Minutes**: $0.005/minute (only when calls are active)
- **Total**: Only pay for actual call time

**Example:**
- 10 agents registered 24/7: $0
- 500 calls × 5 min = 2,500 minutes: $12.50/month
- **Per agent per month**: $1.25

---

## 🐛 Troubleshooting

### Issue: "SIP Disconnected" (Red Badge)

**Possible Causes:**
1. Agent doesn't have SIP extension configured
2. SIP password is incorrect or encrypted
3. SIP domain is wrong
4. Network/firewall blocking WebSocket connection

**Solutions:**
- Check agent has `extension`, `sipUsername`, `sipDomain` set
- Verify SIP password in Twilio Console matches database
- Check browser console for errors
- Verify WebSocket connection to `wss://[domain]:443`

### Issue: Registration Fails

**Check:**
- Browser console for SIP.js errors
- Network tab for WebSocket connection
- SIP credentials in Twilio Console
- Firewall/proxy blocking WSS connections

### Issue: Calls Don't Connect

**Check:**
- Agent is registered (green badge)
- SIP credentials are correct
- Voice-response webhook is working
- Twilio SIP Domain is configured correctly

---

## 📝 API Endpoints

### GET `/api/agents/sip-password`
Returns decrypted SIP password for authenticated agent.

**Response:**
```json
{
  "success": true,
  "data": {
    "sipUsername": "201",
    "sipDomain": "crm-sip.sip.twilio.com",
    "extension": "201",
    "password": "decrypted_password"
  }
}
```

### PUT `/api/agents/sip-status`
Updates agent call status.

**Request:**
```json
{
  "agentId": 1,
  "callStatus": "available"
}
```

---

## 🔐 Security

- SIP passwords are encrypted in database
- Decryption happens on backend only
- API endpoint requires JWT authentication
- Agent can only get their own password
- WebSocket uses WSS (secure)

---

## 📚 Technical Details

### SIP.js Library:
- **Version**: Latest (installed via npm)
- **Purpose**: WebRTC SIP client for browser
- **Protocol**: SIP over WebSocket (WSS)
- **Registration**: REGISTER method to SIP domain
- **Call Handling**: INVITE for incoming calls (future)

### Registration Details:
- **Expires**: 3600 seconds (1 hour)
- **Auto-renew**: SIP.js handles re-registration
- **Transport**: WebSocket Secure (WSS)
- **Port**: 443 (standard HTTPS port)

---

## 🚀 Next Steps

### Current (Outbound Only):
- ✅ Agent registration working
- ✅ Outbound calls connect successfully
- ✅ Status tracking implemented

### Future (Inbound Implementation):
- ⏳ Add UI for incoming call notification
- ⏳ Add accept/reject buttons
- ⏳ Route inbound calls to available agents
- ⏳ Handle call queuing for inbound

---

## 📖 Related Documentation

- `README-SIP-TRUNKING.md` - Complete SIP trunking setup guide
- `SIP-EXTENSION-INTEGRATION-FLOW.md` - Integration flow details
- Twilio SIP Domain Docs: https://www.twilio.com/docs/sip-trunking

---

## ✅ Summary

**What Works:**
- ✅ Agents register to SIP domain on login
- ✅ Persistent connection maintained
- ✅ Outbound calls work (agent receives when customer answers)
- ✅ Status tracking and indicators
- ✅ Automatic reconnection

**What's Next:**
- ⏳ Inbound call handling (will be implemented later)
- ⏳ Call queuing for inbound
- ⏳ Advanced call features

**Cost:**
- $0 for registration/connection
- $0.005/minute for call time only
