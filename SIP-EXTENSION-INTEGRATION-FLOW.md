# 📞 SIP Extension Integration Flow

## How SIP Extensions Work When Agent Makes a Call

### Current Flow (SIP Extension-Based) ✅
The `CallButton` component uses `/api/calls/initiate` which now uses SIP Domain routing for cost-effective calling.

---

## 🔄 Complete Call Flow with SIP Extension

### Step 1: Agent Clicks "Call" Button
**Location**: `components/CallButton.js` (line 239)
- Agent clicks call button in CRM
- Frontend calls: `POST /api/calls/initiate`
- Backend automatically uses SIP Domain routing

---

### Step 2: Backend Initiates Call
**Location**: `app/api/calls/initiate/route.js`

**What Happens:**
1. ✅ Validates agent has SIP extension (`extension`, `sipUsername`)
2. ✅ Checks agent availability (`callStatus !== 'busy'`)
3. ✅ Formats customer phone number
4. ✅ Creates Twilio call to customer
5. ✅ Sets webhook: `/api/twilio/voice-response?agentId=X`
6. ✅ Updates agent status to `'busy'`
7. ✅ Creates call log entry

**Key Code:**
```javascript
const agentSipUri = `sip:${agent.sipUsername}@${sipDomain}`;
// Example: sip:201@crm-sip.sip.twilio.com
```

---

### Step 3: Customer Answers Phone
**Location**: `app/api/twilio/voice-response/route.js`

**What Happens:**
1. Twilio calls webhook when customer answers
2. Backend checks if agent has SIP extension
3. **If SIP extension exists:**
   - Generates TwiML: `<Dial><Sip>sip:201@crm-sip.sip.twilio.com</Sip></Dial>`
   - Routes call to agent's SIP extension
4. **If no SIP extension:**
   - Falls back to conference (backward compatible)

**Key Code:**
```javascript
if (agent && agent.extension && agent.sipUsername) {
  const agentSipUri = `sip:${agent.sipUsername}@${sipDomain}`;
  twiml += `<Dial><Sip>${agentSipUri}</Sip></Dial>`;
}
```

---

### Step 4: Agent Receives Call via WebRTC
**Location**: `components/WebCallInterface.js`

**Current Issue**: `WebCallInterface` uses TwiML App (conference method), not SIP Domain.

**What Needs to Happen:**
1. Agent's browser needs to connect to their SIP extension
2. Use Twilio's JavaScript SDK to connect via SIP
3. Agent receives incoming call in browser

**Required Changes:**
- Update `WebCallInterface` to support SIP Domain connections
- Or create new `SipWebCallInterface` component
- Connect agent to: `sip:201@crm-sip.sip.twilio.com`

---

## 🔧 Implementation Steps

### ✅ CallButton Already Uses SIP Endpoint

**File**: `components/CallButton.js`

**Status**: Already updated! The component calls `/api/calls/initiate` which now uses SIP Domain routing.

---

### Option 2: Create SIP WebRTC Component

**New File**: `components/SipWebCallInterface.js`

**Purpose**: Connect agent to SIP Domain via WebRTC

**Key Features:**
- Connect to: `sip:201@crm-sip.sip.twilio.com`
- Authenticate with SIP username/password
- Handle incoming calls
- Support mute, hold, hangup

**Example Code:**
```javascript
import { Device } from '@twilio/voice-sdk';

export default function SipWebCallInterface({ extension, sipUsername, sipPassword, sipDomain }) {
  const [device, setDevice] = useState(null);
  const [call, setCall] = useState(null);
  
  useEffect(() => {
    // Connect to SIP Domain
    const connectToSip = async () => {
      const token = await getSipToken(extension, sipUsername, sipPassword, sipDomain);
      
      const newDevice = new Device(token, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu']
      });
      
      newDevice.on('incoming', (incomingCall) => {
        setCall(incomingCall);
        incomingCall.accept();
      });
      
      newDevice.register();
      setDevice(newDevice);
    };
    
    connectToSip();
    
    return () => {
      if (device) {
        device.destroy();
      }
    };
  }, [extension, sipUsername, sipPassword, sipDomain]);
  
  // ... rest of component ...
}
```

---

## 📋 Current Status

### ✅ What's Working:
1. ✅ Backend API `/api/calls/initiate` - Uses SIP Domain routing
2. ✅ Backend API `/api/twilio/voice-response` - Routes to SIP extension
3. ✅ Database fields - Extension, SIP username, password stored
4. ✅ Admin UI - Can assign extensions to users
5. ✅ Frontend `CallButton` - Uses `/api/calls/initiate` (SIP implementation)

### ⚠️ What Needs Enhancement:
1. ⚠️ `WebCallInterface` - Currently uses TwiML App (conference) as fallback
2. ⚠️ Agent WebRTC connection - Could be optimized to connect directly to SIP Domain

---

## 🎯 Recommended Solution

### ✅ Phase 1: Complete (SIP Implementation)
1. ✅ `CallButton` calls `/api/calls/initiate` (SIP implementation)
2. ✅ `WebCallInterface` uses conference as fallback for agent connection
3. **Result**: Customer → SIP Domain → Agent Extension (cost-effective)
4. **Agent**: Connects via conference (works, but could be optimized)

### Phase 2: Full SIP Integration (Optional Enhancement)
1. Create `SipWebCallInterface` component
2. Connect agent directly to SIP Domain
3. **Result**: Both customer and agent use SIP Domain (fully cost-effective)

---

## 🔍 How to Test

### Test SIP Extension Flow:
1. Assign extension `201` to an agent
2. Agent clicks "Call" button
3. Check browser console for API call
4. Verify call routes to `sip:201@crm-sip.sip.twilio.com`
5. Agent should receive call in browser

### Verify in Twilio Console:
- Check call logs show SIP Domain routing
- Verify call costs are $0.005/min (single-leg)
- Confirm agent extension receives call

---

## 📝 Summary

**Current State:**
- ✅ Backend fully supports SIP extensions
- ✅ Routing logic works correctly
- ❌ Frontend still uses old conference method
- ❌ Agent WebRTC not connected to SIP Domain

**Next Steps:**
1. Update `CallButton.js` to use `/api/calls/initiate-sip`
2. Create SIP WebRTC component for agent connection
3. Test end-to-end flow

**Result:**
- Cost-effective calling ($0.005/min)
- Extension-based routing
- Browser-only (no installation)
- Full call center features

