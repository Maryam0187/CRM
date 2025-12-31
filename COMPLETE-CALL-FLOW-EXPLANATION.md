# Complete Call Flow: Agent Clicks Call Button → Customer Answers → Call Completed

This document explains the complete step-by-step flow of an outbound call from the moment the agent clicks the call button until the call is completed.

---

## Overview

The call system uses a **conference-based architecture** where:
1. Agent initiates call via frontend
2. Backend creates Twilio call to customer
3. Customer is placed in a Twilio conference
4. Agent joins the same conference via browser (Twilio Voice SDK)
5. Both parties communicate through the conference
6. Status updates flow via Twilio webhooks → Backend → Socket.IO → Frontend

---

## Step-by-Step Flow

### **STEP 1: Agent Clicks Call Button**

**File:** `components/CallButton.js`

```javascript
// User clicks the call button
handleCall() {
  await initiateCall({
    customerId,
    saleId,
    phoneNumber,
    customerName,
    agentId: user.id,
    callPurpose: 'follow_up'
  });
}
```

**What happens:**
- `CallButton` component calls `initiateCall()` from `CallContext`
- Passes customer info, phone number, and agent ID

**State changes:**
- None yet (just button click)

---

### **STEP 2: Frontend Calls Initiate API**

**File:** `contexts/CallContext.js` → `initiateCall()`

```javascript
const response = await apiClient.post('/api/calls/initiate', {
  customerId,
  saleId,
  agentId,
  phoneNumber,
  callPurpose,
  customMessage: `Hello ${customerName || 'there'}...`
});

const result = await response.json();
const callSid = result.data?.callSid;
const conferenceName = result.data?.conferenceName;
```

**What happens:**
- Frontend sends POST request to `/api/calls/initiate`
- Includes all call metadata (customer, agent, phone number)

**State changes:**
- `isCalling = true`
- `error = null`
- Waiting for API response

---

### **STEP 3: Backend Creates Twilio Call**

**File:** `app/api/calls/initiate/route.js`

```javascript
// Generate conference name
const conferenceName = `call-${agentId}`;

// Create Twilio call
const call = await client.calls.create({
  url: `${webhookUrl}/api/twilio/voice-response?agentId=${agentId}&conferenceName=${conferenceName}`,
  to: formattedNumber,  // Customer's phone
  from: twilioPhoneNumber,
  statusCallback: `${webhookUrl}/api/twilio/call-status-callback`,
  statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
});

// Create call log in database
const callLog = await sequelizeDb.CallLog.create({
  callSid: call.sid,
  customerId,
  saleId,
  agentId,
  direction: 'outbound',
  fromNumber: twilioPhoneNumber,
  toNumber: formattedNumber,
  status: 'queued',
  callPurpose,
  twilioData: { callSid: call.sid, conferenceName, ... }
});
```

**What happens:**
1. Backend generates unique conference name: `call-{agentId}`
2. Creates Twilio call to customer's phone number
3. Sets webhook URL to `/api/twilio/voice-response` (handles call routing)
4. Sets status callback URL to `/api/twilio/call-status-callback`
5. Creates `CallLog` entry in database with status `'queued'`
6. Updates agent's call count
7. Returns `callSid` and `conferenceName` to frontend

**Database:**
- `CallLog` created with:
  - `callSid`: Twilio Call SID
  - `status`: `'queued'`
  - `conferenceName`: `'call-{agentId}'`

**Twilio:**
- Call created with status `'queued'`
- Twilio sends callback to `/api/twilio/call-status-callback` with status `'initiated'`

---

### **STEP 4: Frontend Receives Call Info**

**File:** `contexts/CallContext.js` → `initiateCall()`

```javascript
if (result?.success) {
  const callSid = result.data?.callSid;
  const conferenceName = result.data?.conferenceName;
  
  startCall({
    callSid,
    conferenceName,
    customerId,
    saleId,
    phoneNumber,
    customerName
  });
}
```

**What happens:**
- Frontend receives `callSid` and `conferenceName`
- Calls `startCall()` to initialize call state

**State changes:**
- `currentCallSid = callSid`
- `conferenceName = 'call-{agentId}'`
- `callMetadata = { customerId, saleId, phoneNumber, customerName }`
- `showWebInterface = true`
- `isCalling = true`
- `callStatus = null` (waiting for Twilio status)

**UI changes:**
- Call interface appears
- Shows "Connecting..." or "Initializing call..."

---

### **STEP 5: Twilio Routes Call to Voice Response**

**File:** `app/api/twilio/voice-response/route.js`

```javascript
// Twilio requests TwiML from this route
const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while we connect you.</Say>
  <Dial record="false" timeout="60" timeLimit="3600">
    <Conference startConferenceOnEnter="false" endConferenceOnExit="true" beep="false" maxParticipants="2">${conferenceName}</Conference>
  </Dial>
</Response>`;
```

**What happens:**
1. Twilio calls customer's phone
2. When customer's phone starts ringing, Twilio requests TwiML from `/api/twilio/voice-response`
3. Route returns TwiML that places customer in conference
4. `startConferenceOnEnter="false"` means conference waits for BOTH participants

**Twilio callbacks:**
- Status changes to `'ringing'` → callback to `/api/twilio/call-status-callback`

---

### **STEP 6: Twilio Sends 'ringing' Status Callback**

**File:** `app/api/twilio/call-status-callback/route.js`

```javascript
// Twilio sends POST with callStatus='ringing'
const derivedStatus = 'ringing';  // For 'ringing' status

// Update call log
await callLog.update({
  status: 'ringing',
  twilioData: { ...existingData, callStatus: 'ringing', ... }
});

// Broadcast via Socket.IO
socketManager.sendCallStatusUpdate(callSid, {
  callSid,
  status: 'ringing',
  ...
});
```

**What happens:**
1. Twilio sends POST to `/api/twilio/call-status-callback` with `callStatus='ringing'`
2. Backend derives status as `'ringing'`
3. Updates `CallLog` in database: `status = 'ringing'`
4. Broadcasts status update via Socket.IO to all connected clients

**Database:**
- `CallLog.status = 'ringing'`

**Socket.IO:**
- Event: `call_status_update`
- Data: `{ callSid, status: 'ringing', ... }`

---

### **STEP 7: Frontend Receives 'ringing' Status**

**File:** `components/GlobalWebCallInterface.js` → `handleStatusUpdate()`

```javascript
window.addEventListener('callStatusUpdate', (event) => {
  const { callStatusData } = event.detail;
  if (callStatusData?.callSid === currentCallSid) {
    updateCallStatus(callStatusData.status);  // 'ringing'
  }
});
```

**File:** `contexts/CallContext.js` → `updateCallStatus()`

```javascript
const updateCallStatus = (status) => {
  if (status === 'ringing') {
    setCallStatus('ringing');
    // Timer NOT started yet (only starts on 'in-progress')
  }
};
```

**What happens:**
1. `SocketContext` receives Socket.IO event
2. Dispatches custom DOM event: `callStatusUpdate`
3. `GlobalWebCallInterface` listens to event
4. Calls `CallContext.updateCallStatus('ringing')`
5. State updates: `callStatus = 'ringing'`

**State changes:**
- `callStatus = 'ringing'`

**UI changes:**
- Shows "Ringing..." or "Calling {customerName}..."
- Timer still shows 00:00 (not started yet)

---

### **STEP 8: Agent Joins Conference (Browser)**

**File:** `components/GlobalWebCallInterface.js` → `joinConference()`

```javascript
// Agent clicks "Join Call" or auto-joins
const call = await device.connect({
  params: {
    To: conferenceName,  // 'call-{agentId}'
    From: `client:agent-${user.id}`
  }
});

activeConnection.current = call;

// When call is accepted
call.addEventListener('accept', () => {
  setIsConnected(true);
  callConnected();  // Sets isWebCallConnected = true
  // For outbound: DON'T set status to 'in-progress' yet
  // Wait for Twilio to report customer answered
});
```

**What happens:**
1. Agent's browser (Twilio Voice SDK) connects to conference
2. Twilio creates call leg: `client:agent-{id}` → conference
3. When connection established, `onAccept` event fires
4. Sets `isWebCallConnected = true`
5. Agent can now hear (but customer hasn't answered yet)
6. Status remains `'ringing'` (not `'in-progress'` yet)

**State changes:**
- `isWebCallConnected = true`
- `isConnected = true`
- `isCalling = false`
- `callStatus = 'ringing'` (still ringing, customer hasn't answered)

**UI changes:**
- Shows "Ringing..." (customer's phone is still ringing)
- Agent can hear ringback tone or silence
- Timer still 00:00 (not started)

**Important:** Timer does NOT start here because customer hasn't answered yet!

---

### **STEP 9: Customer Answers Phone**

**What happens:**
1. Customer picks up the phone
2. Twilio detects answer
3. Customer is connected to conference
4. Conference starts (both participants now in conference)

**Twilio:**
- Customer call leg status changes to `'answered'`
- Conference becomes active
- Both agent and customer can now hear each other

---

### **STEP 10: Twilio Sends 'in-progress' Status Callback**

**File:** `app/api/twilio/call-status-callback/route.js`

```javascript
// Twilio sends POST with callStatus='in-progress', answerTime='2025-...'
const callStatus = 'in-progress';
const answerTime = formData.get('AnswerTime');  // Now present!
const duration = formData.get('CallDuration');  // Starts counting

// Derive status
function deriveCallStatus(callStatus, callDuration, answerTime, ...) {
  if (callStatus === 'in-progress') {
    if (answerTime || answeredBy === 'human' || duration > 0) {
      return 'in-progress';  // Customer actually answered
    } else {
      return 'ringing';  // Still ringing
    }
  }
}

const derivedStatus = 'in-progress';  // answerTime is present

// Update call log
await callLog.update({
  status: 'in-progress',
  duration: parseInt(duration),
  twilioData: { ...existingData, answerTime, callStatus: 'in-progress', ... }
});

// Broadcast via Socket.IO
socketManager.sendCallStatusUpdate(callSid, {
  callSid,
  status: 'in-progress',
  answerTime,
  duration: parseInt(duration),
  ...
});
```

**What happens:**
1. Twilio sends POST with:
   - `callStatus = 'in-progress'`
   - `answerTime = '2025-12-31T17:00:00.000Z'` (now present!)
   - `duration = '0'` (starts at 0, increments every second)
2. Backend derives status as `'in-progress'` (because `answerTime` is present)
3. Updates `CallLog`:
   - `status = 'in-progress'`
   - `duration = 0` (will be updated on completion)
   - `twilioData.answerTime = '...'`
4. Updates agent status: `agent.callStatus = 'busy'`
5. Broadcasts via Socket.IO

**Database:**
- `CallLog.status = 'in-progress'`
- `CallLog.duration = 0`
- `User.callStatus = 'busy'`

**Socket.IO:**
- Event: `call_status_update`
- Data: `{ callSid, status: 'in-progress', answerTime, duration: 0, ... }`

---

### **STEP 11: Frontend Receives 'in-progress' Status**

**File:** `contexts/CallContext.js` → `updateCallStatus('in-progress')`

```javascript
const updateCallStatus = (status) => {
  if (status === 'in-progress') {
    setCallStatus('in-progress');
    
    // START TIMER - customer answered!
    if (!timerIntervalRef.current) {
      startTimer();  // Starts 1-second interval
    }
  }
};

const startTimer = () => {
  setCallTimer(0);
  timerIntervalRef.current = setInterval(() => {
    setCallTimer(prev => prev + 1);  // Increment every second
  }, 1000);
};
```

**What happens:**
1. Frontend receives Socket.IO event with `status: 'in-progress'`
2. Calls `updateCallStatus('in-progress')`
3. State updates: `callStatus = 'in-progress'`
4. **Timer starts** - begins counting seconds

**State changes:**
- `callStatus = 'in-progress'`
- `callTimer = 0` (starts counting)
- `timerIntervalRef` = interval ID (running every 1 second)

**UI changes:**
- Shows "In Progress" or "Connected"
- Timer starts: `00:01`, `00:02`, `00:03`, ...
- Agent and customer can talk

---

### **STEP 12: Call in Progress**

**What happens:**
- Agent and customer are talking
- Timer increments every second: `00:01`, `00:02`, ..., `01:00`, ...
- Twilio continues to send periodic status callbacks with updated `duration`
- Backend updates `CallLog.duration` periodically

**State:**
- `callStatus = 'in-progress'`
- `callTimer = 45` (example: 45 seconds elapsed)
- `isWebCallConnected = true`
- `isConnected = true`

**UI:**
- Timer: `00:45`
- Mute/unmute button active
- Hang up button active

---

### **STEP 13: Customer or Agent Hangs Up**

**Scenario A: Customer hangs up first**

**What happens:**
1. Customer ends the call
2. Twilio detects hangup
3. Twilio sends callback with `callStatus = 'completed'`, `duration = '120'` (example)

**Scenario B: Agent hangs up first**

**File:** `components/GlobalWebCallInterface.js` → `hangUp()`

```javascript
const hangUp = () => {
  if (activeConnection.current) {
    activeConnection.current.disconnect();  // Disconnect from conference
  }
  disconnectCall('manual');
};

// This triggers onDisconnect event
call.addEventListener('disconnect', () => {
  setIsConnected(false);
  endCall();  // Cleans up state
});
```

**What happens:**
1. Agent clicks "Hang Up" button
2. `hangUp()` called
3. Disconnects from conference via Voice SDK
4. Twilio detects agent left conference
5. Conference ends (or continues if customer still there)
6. Twilio sends callback with `callStatus = 'completed'`

---

### **STEP 14: Twilio Sends 'completed' Status Callback**

**File:** `app/api/twilio/call-status-callback/route.js`

```javascript
// Twilio sends POST with callStatus='completed', duration='120'
const callStatus = 'completed';
const duration = '120';  // Final duration in seconds

// Derive status
function deriveCallStatus(callStatus, callDuration, ...) {
  if (callStatus === 'completed') {
    if (callDuration > 0) {
      return 'completed';  // Call was answered and completed
    } else {
      return 'no-answer';  // Completed without answer (missed)
    }
  }
}

const derivedStatus = 'completed';  // duration > 0

// Update call log
await callLog.update({
  status: 'completed',
  duration: 120,  // Final duration
  twilioData: { ...existingData, callStatus: 'completed', duration: '120', ... }
});

// Update agent status
if (agent has no other active calls) {
  agent.callStatus = 'available';
  agent.totalCallTime += 120;
}

// Update related records
if (callLog.customerId) {
  Customer.updatedAt = new Date();
}
if (callLog.saleId) {
  Sale.updatedAt = new Date();
}

// Broadcast via Socket.IO
socketManager.sendCallStatusUpdate(callSid, {
  callSid,
  status: 'completed',
  duration: 120,
  ...
});
```

**What happens:**
1. Twilio sends POST with:
   - `callStatus = 'completed'`
   - `duration = '120'` (final duration)
   - `endTime = '2025-12-31T17:02:00.000Z'`
2. Backend derives status as `'completed'` (duration > 0)
3. Updates `CallLog`:
   - `status = 'completed'`
   - `duration = 120`
4. Updates agent:
   - `callStatus = 'available'` (if no other active calls)
   - `totalCallTime += 120`
5. Updates customer/sale `updatedAt`
6. Broadcasts via Socket.IO

**Database:**
- `CallLog.status = 'completed'`
- `CallLog.duration = 120`
- `User.callStatus = 'available'`
- `User.totalCallTime += 120`
- `Customer.updatedAt = now`
- `Sale.updatedAt = now`

---

### **STEP 15: Frontend Receives 'completed' Status**

**File:** `components/GlobalWebCallInterface.js` → `handleStatusUpdate()`

```javascript
const handleStatusUpdate = (event) => {
  const { callStatusData } = event.detail;
  if (callStatusData?.status === 'completed') {
    updateCallStatus('completed');
    disconnectCall('remote_status_update');
    setTimeout(() => endCall(), 500);
  }
};
```

**File:** `contexts/CallContext.js` → `updateCallStatus('completed')`

```javascript
const updateCallStatus = (status) => {
  if (status === 'completed') {
    setCallStatus('completed');
    stopTimer();  // Stop the interval
    setFinalDuration(callTimer);  // Save final duration (e.g., 120)
  }
};
```

**File:** `contexts/CallContext.js` → `endCall()`

```javascript
const endCall = () => {
  stopTimer();
  setIsCalling(false);
  setIsWebCallConnected(false);
  setCurrentCallSid(null);
  setConferenceName(null);
  setCallMetadata(null);
  setCallStatus(null);
  // Hide interface after delay
  setTimeout(() => {
    setShowWebInterface(false);
    resetTimer();
  }, 500);
};
```

**What happens:**
1. Frontend receives Socket.IO event with `status: 'completed'`
2. Calls `updateCallStatus('completed')`
3. State updates: `callStatus = 'completed'`
4. Timer stops
5. Final duration saved: `finalDuration = 120`
6. `disconnectCall()` called (cleanup)
7. `endCall()` called (resets all state)
8. UI hides after 500ms

**State changes:**
- `callStatus = 'completed'`
- `callTimer = 120` (stopped)
- `finalDuration = 120`
- `isWebCallConnected = false`
- `isCalling = false`
- `currentCallSid = null`
- `showWebInterface = false` (after delay)

**UI changes:**
- Shows "Call Ended" briefly
- Displays final duration: "Call duration: 2:00"
- Interface fades out
- Returns to normal view

---

## Complete Flow Summary

```
1. Agent clicks Call Button
   ↓
2. Frontend → POST /api/calls/initiate
   ↓
3. Backend creates Twilio call + CallLog (status: 'queued')
   ↓
4. Frontend receives callSid, starts call state
   ↓
5. Twilio routes call → /api/twilio/voice-response (places customer in conference)
   ↓
6. Twilio sends callback: status='ringing'
   ↓
7. Backend updates CallLog (status: 'ringing') → Socket.IO → Frontend
   ↓
8. Frontend: callStatus='ringing', UI shows "Ringing..."
   ↓
9. Agent joins conference via browser (Voice SDK)
   ↓
10. Customer answers phone
    ↓
11. Twilio sends callback: status='in-progress', answerTime present
    ↓
12. Backend updates CallLog (status: 'in-progress') → Socket.IO → Frontend
    ↓
13. Frontend: callStatus='in-progress', TIMER STARTS
    ↓
14. Call in progress (talking, timer counting)
    ↓
15. Customer/Agent hangs up
    ↓
16. Twilio sends callback: status='completed', duration=120
    ↓
17. Backend updates CallLog (status: 'completed', duration=120) → Socket.IO → Frontend
    ↓
18. Frontend: callStatus='completed', TIMER STOPS, state reset, UI hidden
```

---

## Key Timing Points

| Event | Timer Status | callStatus | isWebCallConnected |
|-------|--------------|------------|-------------------|
| Agent clicks button | Not started | `null` | `false` |
| Call initiated | Not started | `null` | `false` |
| Customer phone ringing | Not started | `'ringing'` | `false` |
| Agent joins conference | Not started | `'ringing'` | `true` |
| Customer answers | **STARTS** | `'in-progress'` | `true` |
| Call in progress | Counting (1, 2, 3...) | `'in-progress'` | `true` |
| Call ends | **STOPS** | `'completed'` | `false` |

---

## Important Notes

1. **Timer only starts when customer answers** - Not when agent joins conference
2. **Status comes from Twilio callbacks** - Frontend doesn't set status directly
3. **Conference-based architecture** - Both parties join same conference
4. **Real-time updates via Socket.IO** - No polling needed
5. **All calls saved to database** - Including client calls, child calls, parent calls
6. **Status derivation in backend** - Ensures accurate status even if Twilio reports misleading data

---

## Files Involved

- **Frontend:**
  - `components/CallButton.js` - Call button component
  - `contexts/CallContext.js` - Call state management
  - `components/GlobalWebCallInterface.js` - Twilio Voice SDK integration
  - `contexts/SocketContext.js` - Socket.IO connection

- **Backend:**
  - `app/api/calls/initiate/route.js` - Creates Twilio call
  - `app/api/twilio/voice-response/route.js` - Routes customer to conference
  - `app/api/twilio/call-status-callback/route.js` - Processes status updates
  - `lib/socket.js` - Socket.IO server

- **Database:**
  - `models/CallLog.js` - Call log model
  - `models/User.js` - Agent/user model

---

This completes the full call flow from button click to call completion! 🎉

