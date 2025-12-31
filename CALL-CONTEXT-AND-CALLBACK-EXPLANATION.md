# CallContext.js and Call-Status-Callback Route Explanation

This document explains how `CallContext.js` (frontend) and `call-status-callback` route (backend) work together to manage call state in the CRM system.

---

## Overview

The system uses a **two-part architecture**:
1. **Backend (`call-status-callback` route)**: Receives status updates from Twilio, processes them, and broadcasts via Socket.IO
2. **Frontend (`CallContext.js`)**: Manages call state in React, receives updates via Socket.IO, and controls UI/timer

---

## Part 1: Call-Status-Callback Route (Backend)

**File:** `/app/api/twilio/call-status-callback/route.js`  
**Type:** POST webhook endpoint (called by Twilio)

### Purpose
Receives real-time status updates from Twilio whenever a call status changes and processes them.

### Flow

```
Twilio Call Status Changes
    ↓
Twilio sends POST to /api/twilio/call-status-callback
    ↓
Route processes callback
    ↓
Updates database (CallLog)
    ↓
Broadcasts via Socket.IO
    ↓
Frontend receives update
```

### Key Responsibilities

#### 1. **Filter Callbacks** (Lines 35-56)
```javascript
// Filter out client calls (agent's browser connection)
if (from && from.startsWith('client:')) {
  return NextResponse.json({ success: false, message: 'Client call ignored' }, { status: 200 });
}

// Filter out non-customer call legs for outbound calls
if (callLog.direction === 'outbound' && direction && !direction.includes('outbound')) {
  return NextResponse.json({ success: false, message: 'Non-customer leg ignored' }, { status: 200 });
}
```
**Why:** Only process callbacks from the customer call leg, not agent's browser connection or conference legs.

#### 2. **Derive Correct Status** (Lines 58-105)
```javascript
if (callStatus === 'ringing') {
  derivedStatus = 'ringing';
} else if (callStatus === 'in-progress') {
  // Verify customer actually answered
  const hasAnswerTime = answerTime || existingAnswerTime;
  if (hasAnswerTime || answeredBy === 'human' || hasDuration) {
    derivedStatus = 'in-progress'; // Customer answered
  } else {
    derivedStatus = 'ringing'; // Still ringing
  }
} else if (callStatus === 'completed') {
  if (callDuration > 0) {
    derivedStatus = 'completed'; // Call was answered
  } else {
    derivedStatus = 'no-answer'; // Missed call
  }
}
```
**Why:** Twilio sometimes reports 'in-progress' before customer answers. This logic ensures accurate status by checking `answerTime`, `answeredBy`, and `duration`.

#### 3. **Update Database** (Lines 130-149)
```javascript
const updateData = {
  status: mappedStatus,
  duration: duration ? parseInt(duration) : null,
  twilioData: twilioDataUpdate,
  updatedAt: new Date()
};
await callLog.update(updateData);
```
**Why:** Persist call status and duration in the database for call history.

#### 4. **Handle Special Cases** (Lines 151-186)
- **Voicemail Detection**: If `answeredBy === 'machine'`, mark as voicemail and auto-hangup after 30 seconds
- **No-Answer**: If `callStatus === 'no-answer'`, disconnect immediately

#### 5. **Update Agent Status** (Lines 188-212)
```javascript
if (callStatus === 'in-progress' && agent.callStatus !== 'busy') {
  await agent.update({ callStatus: 'busy' });
} else if (['completed', 'failed', ...].includes(callStatus)) {
  // Check if agent has other active calls
  const activeCalls = await sequelizeDb.CallLog.count({...});
  if (activeCalls === 0) {
    await agent.update({ callStatus: 'available' });
  }
}
```
**Why:** Keep agent status synchronized (busy when on call, available when done).

#### 6. **Broadcast via Socket.IO** (Lines 239-263)
```javascript
const callStatusData = {
  callSid,
  status: mappedStatus,
  duration: duration ? parseInt(duration) : null,
  // ... other fields
};

socketManager.sendCallStatusToAgent(callLog.agentId, callSid, callStatusData);
socketManager.sendCallStatusToSupervisors(callSid, callStatusData);
socketManager.sendCallStatusToRoom(`call_${callSid}`, callSid, callStatusData);
socketManager.sendCallStatusUpdate(callSid, callStatusData);
```
**Why:** Send real-time updates to frontend via Socket.IO so UI updates immediately.

---

## Part 2: CallContext.js (Frontend)

**File:** `/contexts/CallContext.js`  
**Type:** React Context Provider

### Purpose
Manages call state in the frontend, receives updates from backend via Socket.IO, and controls UI/timer.

### Key State Variables

```javascript
const [isCalling, setIsCalling] = useState(false);           // Is call being initiated?
const [currentCallSid, setCurrentCallSid] = useState(null);   // Current call SID
const [conferenceName, setConferenceName] = useState(null);   // Conference name
const [callStatus, setCallStatus] = useState(null);           // Current status (ringing, in-progress, etc.)
const [callTimer, setCallTimer] = useState(0);                // Timer in seconds
const [isMuted, setIsMuted] = useState(false);               // Mute state
```

### Key Functions

#### 1. **startCall()** (Lines 79-101)
```javascript
const startCall = useCallback((callData) => {
  setIsCalling(true);
  setCurrentCallSid(callData.callSid);
  setConferenceName(callData.conferenceName);
  setCallMetadata({...});
  setShowWebInterface(true);
  setCallStatus(null); // Wait for Twilio to report actual status
}, []);
```
**Purpose:** Initialize call state when a call starts. Sets status to `null` initially and waits for Twilio callbacks.

#### 2. **updateCallStatus()** (Lines 150-202)
```javascript
const updateCallStatus = useCallback((status) => {
  const currentStatus = callStatusRef.current;
  
  // Prevent duplicate updates
  if (currentStatus === status) {
    return;
  }
  
  // Don't go backwards from in-progress to ringing
  if (currentStatus === 'in-progress' && status === 'ringing') {
    return;
  }
  
  // Update status
  setCallStatus(status);
  
  // Start timer ONLY when customer picks up
  if (status === 'in-progress' && !timerIntervalRef.current) {
    startTimer();
  }
  
  // Stop timer when call ends
  if (status === 'completed' || status === 'failed' || ...) {
    stopTimer();
  }
}, [callTimer, startTimer, stopTimer]);
```
**Purpose:** Update call status and manage timer. Called when status updates arrive from backend via Socket.IO.

**Key Logic:**
- Prevents duplicate status updates
- Prevents going backwards (in-progress → ringing)
- Starts timer only when status becomes 'in-progress' (customer answered)
- Stops timer when call ends

#### 3. **startTimer()** (Lines 52-61)
```javascript
const startTimer = useCallback(() => {
  if (timerIntervalRef.current) {
    clearInterval(timerIntervalRef.current);
  }
  setCallTimer(0);
  timerIntervalRef.current = setInterval(() => {
    setCallTimer(prev => prev + 1);
  }, 1000);
}, []);
```
**Purpose:** Start a 1-second interval that increments `callTimer` to show call duration.

#### 4. **endCall()** (Lines 112-147)
```javascript
const endCall = useCallback(() => {
  // Clear pending timeouts
  if (pendingInProgressTimeoutRef.current) {
    clearTimeout(pendingInProgressTimeoutRef.current);
  }
  
  // Preserve timer if call was in-progress
  if (callTimer > 0 && callStatus === 'in-progress') {
    setFinalDuration(callTimer);
  }
  
  // Stop timer and reset state
  stopTimer();
  setIsCalling(false);
  setIsWebCallConnected(false);
  setCurrentCallSid(null);
  setCallStatus(null);
  // ... reset other state
}, [callTimer, callStatus, stopTimer, resetTimer]);
```
**Purpose:** Clean up call state when call ends.

---

## How They Work Together

### Complete Flow Example: Outbound Call

```
1. Agent clicks "Call" button
   ↓
2. Frontend: CallContext.initiateCall() called
   ↓
3. Frontend: API call to /api/calls/initiate
   ↓
4. Backend: Creates Twilio call, customer phone rings
   ↓
5. Twilio: Sends callback to /api/twilio/call-status-callback (status: 'ringing')
   ↓
6. Backend: Processes callback
   - Derives status: 'ringing'
   - Updates CallLog in database
   - Broadcasts via Socket.IO: { status: 'ringing', callSid: '...' }
   ↓
7. Frontend: SocketContext receives Socket.IO event
   - Dispatches custom event: 'callStatusUpdate'
   ↓
8. Frontend: GlobalWebCallInterface listens to event
   - Calls CallContext.updateCallStatus('ringing')
   ↓
9. Frontend: CallContext updates state
   - setCallStatus('ringing')
   - UI shows "Ringing..." (timer NOT started yet)
   ↓
10. Customer answers phone
    ↓
11. Twilio: Sends callback (status: 'in-progress', answerTime: '2025-...')
    ↓
12. Backend: Processes callback
    - Derives status: 'in-progress' (answerTime present)
    - Updates CallLog
    - Broadcasts via Socket.IO: { status: 'in-progress', ... }
    ↓
13. Frontend: Receives update
    - Calls CallContext.updateCallStatus('in-progress')
    ↓
14. Frontend: CallContext updates state
    - setCallStatus('in-progress')
    - startTimer() called → timer starts counting
    - UI shows "In Progress" with timer
    ↓
15. Customer hangs up
    ↓
16. Twilio: Sends callback (status: 'completed', duration: '120')
    ↓
17. Backend: Processes callback
    - Derives status: 'completed' (duration > 0)
    - Updates CallLog with duration
    - Updates agent status to 'available'
    - Broadcasts via Socket.IO: { status: 'completed', duration: 120 }
    ↓
18. Frontend: Receives update
    - Calls CallContext.updateCallStatus('completed')
    ↓
19. Frontend: CallContext updates state
    - setCallStatus('completed')
    - stopTimer() called
    - setFinalDuration(120)
    - UI shows "Call Ended" with final duration
```

---

## Key Design Decisions

### 1. **Status Derivation in Backend**
**Why:** Twilio sometimes reports 'in-progress' before customer answers. Backend checks `answerTime`, `answeredBy`, and `duration` to ensure accurate status.

**Result:** Frontend receives validated status, no need for complex logic.

### 2. **Timer Starts Only on 'in-progress'**
**Why:** For outbound calls, agent connects to conference before customer answers. Timer should only start when customer picks up.

**Implementation:**
```javascript
// In CallContext.updateCallStatus()
if (status === 'in-progress' && !timerIntervalRef.current) {
  startTimer(); // Only start when customer answers
}
```

### 3. **Prevent Duplicate Updates**
**Why:** Multiple callbacks can arrive with the same status, causing unnecessary re-renders.

**Implementation:**
```javascript
if (currentStatus === status) {
  return; // Skip duplicate
}
```

### 4. **Prevent Backwards Transitions**
**Why:** Status should only move forward (ringing → in-progress → completed), not backwards.

**Implementation:**
```javascript
if (currentStatus === 'in-progress' && status === 'ringing') {
  return; // Don't go backwards
}
```

### 5. **Socket.IO for Real-Time Updates**
**Why:** HTTP polling is inefficient. Socket.IO provides instant updates when status changes.

**Flow:**
- Backend broadcasts via Socket.IO
- Frontend SocketContext receives event
- Dispatches custom DOM event
- Components listen and update

---

## Status States

| Status | Meaning | When It Occurs | Timer Running? |
|--------|---------|----------------|----------------|
| `null` | No call or waiting for status | Call just started | ❌ No |
| `ringing` | Customer's phone is ringing | Outbound: phone ringing<br>Inbound: agent hasn't joined | ❌ No |
| `in-progress` | Customer answered, call active | Customer picked up | ✅ Yes |
| `completed` | Call ended normally | Customer hung up, call had duration | ❌ No (saved) |
| `no-answer` | Customer didn't answer | Call ended without answer | ❌ No |
| `busy` | Customer's line is busy | Busy signal received | ❌ No |
| `failed` | Call failed | Network error, invalid number | ❌ No |
| `canceled` | Call was canceled | Agent canceled before answer | ❌ No |
| `voicemail` | Voicemail detected | AMD detected answering machine | ❌ No |

---

## Summary

**Backend (`call-status-callback`):**
- Receives Twilio webhooks
- Filters and validates status
- Updates database
- Broadcasts via Socket.IO

**Frontend (`CallContext`):**
- Manages call state
- Receives updates via Socket.IO
- Controls timer (starts only when customer answers)
- Updates UI based on status

**Together:** They provide real-time, accurate call status tracking with proper timer management and state synchronization.

