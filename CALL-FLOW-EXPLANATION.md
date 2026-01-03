# Complete Call Flow Explanation - Agent & Customer Call Legs

## Overview

In a Twilio conference-based call, there are **multiple call legs** that each send status callbacks independently. Understanding this is crucial to getting correct status updates.

---

## Call Legs in a Conference Call

### 1. **Customer Leg** (Phone Call)
- **From**: Twilio phone number (`+18778389242`)
- **To**: Customer phone number (`+17208288325`)
- **Direction**: `outbound-api` (for outbound calls)
- **Status Callbacks**: Sent to `/api/twilio/call-status-callback?agentId=X&...`
- **What it represents**: The actual phone call to the customer

### 2. **Agent Leg** (Browser Connection)
- **From**: `client:agent-{id}` (e.g., `client:agent-1`)
- **To**: Conference name (e.g., `call-1`)
- **Direction**: `inbound` (agent is connecting to conference)
- **Status Callbacks**: Also sent to `/api/twilio/call-status-callback` (but we filter these out)
- **What it represents**: Agent's browser connection via Voice SDK

### 3. **Conference** (Meeting Room)
- **Name**: `call-{agentId}` (e.g., `call-1`)
- **Participants**: Customer + Agent
- **Status**: Active when both participants are present

---

## Outbound Call Flow (Step by Step)

### **STEP 1: Agent Initiates Call**
**File**: `app/api/calls/initiate/route.js`

```javascript
// Agent clicks "Call" button
POST /api/calls/initiate
{
  customerId: 123,
  phoneNumber: "+17208288325",
  agentId: 1
}
```

**What happens:**
1. Backend creates Twilio call to customer
2. Sets `statusCallback` URL: `/api/twilio/call-status-callback?agentId=1&customerId=123&...`
3. Sets `statusCallbackEvent`: `['initiated', 'queued', 'ringing', 'answered', 'completed']`
4. Returns `callSid` and `conferenceName` to frontend

**Twilio creates:**
- **Customer Leg**: `CAaed579908ff73f8bbcb4cc827a668869` (customer call SID)

---

### **STEP 2: Customer Phone Starts Ringing**
**Twilio sends callback to**: `/api/twilio/call-status-callback?agentId=1&...`

**Callback data:**
```javascript
{
  CallSid: 'CAaed579908ff73f8bbcb4cc827a668869',  // Customer leg SID
  CallStatus: 'ringing',
  From: '+18778389242',  // Twilio phone number
  To: '+17208288325',    // Customer phone number
  Direction: 'outbound-api',
  AnswerTime: null,      // Not answered yet
  CallDuration: '0'      // No duration yet
}
```

**Our code processes:**
1. ✅ Identifies as customer leg (phone numbers, not `client:`)
2. ✅ Derives status: `'ringing'`
3. ✅ Broadcasts to frontend: `status: 'ringing'`
4. ⏭️ Skips database save (only save when call ends)

**Frontend shows**: "Ringing..." or "Calling {customerName}..."

---

### **STEP 3: Agent Joins Conference (Browser)**
**File**: `components/GlobalWebCallInterface.js`

```javascript
// Agent's browser connects via Voice SDK
device.connect({
  params: {
    To: 'call-1',           // Conference name
    From: 'client:agent-1'  // Agent identifier
  }
});
```

**What happens:**
1. Agent's browser connects to conference
2. Twilio creates **Agent Leg**: `CA4d1dcf44189d0b9f59c90fea5bed3c6b` (agent call SID)
3. Agent can now hear (but customer hasn't answered yet)

**Twilio sends callback for Agent Leg:**
```javascript
{
  CallSid: 'CA4d1dcf44189d0b9f59c90fea5bed3c6b',  // Agent leg SID (different!)
  CallStatus: 'in-progress',  // ⚠️ Agent leg is in-progress
  From: 'client:agent-1',     // ⚠️ This identifies it as agent leg
  To: 'call-1',
  Direction: 'inbound',
  AnswerTime: '2025-...',     // Agent answered
  CallDuration: '0'
}
```

**Our code processes:**
1. ❌ Identifies as agent leg (`from` starts with `client:`)
2. ⏭️ **SKIPS processing** - returns early
3. ✅ **No status broadcast** - prevents confusion

**Frontend**: Still shows "Ringing..." (correct!)

---

### **STEP 4: Customer Answers Phone**
**Twilio sends callback for Customer Leg:**
```javascript
{
  CallSid: 'CAaed579908ff73f8bbcb4cc827a668869',  // Customer leg SID
  CallStatus: 'in-progress',  // ✅ Customer answered
  From: '+18778389242',
  To: '+17208288325',
  Direction: 'outbound-api',
  AnswerTime: '2025-12-31T17:00:00.000Z',  // ✅ Now present!
  CallDuration: '0'  // Starts at 0, increments every second
}
```

**Our code processes:**
1. ✅ Identifies as customer leg (phone numbers)
2. ✅ Checks previous status: was `'ringing'` → valid transition
3. ✅ Derives status: `'in-progress'` (valid transition from ringing)
4. ✅ Broadcasts to frontend: `status: 'in-progress'`
5. ⏭️ Skips database save (only save when call ends)

**Frontend shows**: "In Progress" + Timer starts!

---

### **STEP 5: Call in Progress**
**Twilio sends periodic callbacks:**
```javascript
{
  CallSid: 'CAaed579908ff73f8bbcb4cc827a668869',
  CallStatus: 'in-progress',
  CallDuration: '5',  // Increments: 5, 6, 7, ...
  AnswerTime: '2025-...'  // Still present
}
```

**Our code:**
- ✅ Processes customer leg callbacks
- ✅ Broadcasts all status updates
- ⏭️ Skips database save (only save when call ends)

---

### **STEP 6: Call Ends (Customer or Agent Hangs Up)**
**Twilio sends final callback:**
```javascript
{
  CallSid: 'CAaed579908ff73f8bbcb4cc827a668869',
  CallStatus: 'completed',
  CallDuration: '120',  // Final duration in seconds
  AnswerTime: '2025-...',
  HangupCause: 'NORMAL_CLEARING'
}
```

**Our code:**
1. ✅ Identifies as customer leg
2. ✅ Derives status: `'completed'`
3. ✅ **SAVES TO DATABASE** (call ended)
4. ✅ Broadcasts final status
5. ✅ Updates agent status to 'available'

**Frontend**: Shows "Call Ended" + Final duration

---

## Why You're Not Getting Correct Callback Status

### **Problem 1: Multiple Call Legs Sending Callbacks**

Twilio sends callbacks for **EACH call leg**:
- Customer leg callbacks: ✅ We process these
- Agent leg callbacks: ❌ We skip these (correct!)
- Conference leg callbacks: ❌ We skip these (correct!)

**Issue**: If we didn't filter, we'd get:
- Agent leg: `'in-progress'` when agent joins (customer still ringing) ❌
- Customer leg: `'ringing'` when customer phone rings ✅
- Customer leg: `'in-progress'` when customer answers ✅

**Solution**: We filter by checking `from` field:
- `client:agent-{id}` = Agent leg → Skip
- Phone number (`+123...`) = Customer leg → Process

---

### **Problem 2: Status Callback Configuration**

**Outbound calls** (`app/api/calls/initiate/route.js`):
```javascript
statusCallbackEvent: ['initiated', 'queued', 'ringing', 'answered', 'completed']
```

**Inbound calls** (`app/api/twilio/voice-response/route.js`):
```javascript
statusCallbackEvent: "initiated ringing answered completed"
```

**Issue**: We're listening for `'answered'` but Twilio might send `'in-progress'` instead.

**Solution**: Our `deriveCallStatus` function handles both:
- `'answered'` → maps to `'in-progress'`
- `'in-progress'` → maps to `'in-progress'`

---

### **Problem 3: Premature 'in-progress' Status**

Even for customer leg, Twilio can send `'in-progress'` before customer actually answers.

**Solution**: We check:
1. Previous status was `'ringing'` → Valid transition ✅
2. OR `answerTime` is present → Customer answered ✅
3. OR `duration > 0` → Call connected ✅

If none of these, we keep status as `'ringing'`.

---

## Current Filtering Logic

```javascript
// Identify call leg type
const isAgentLeg = from && from.startsWith('client:');
const isPhoneNumber = (num) => num && (num.startsWith('+') || /^\+?[1-9]\d{1,14}$/.test(num.replace(/[^\d+]/g, '')));
const isCustomerLeg = !isAgentLeg && (isPhoneNumber(from) || isPhoneNumber(to));

// Only process customer leg
if (!isCustomerLeg) {
  // Skip agent leg, conference leg, etc.
  return; // Don't process
}
```

---

## Status Derivation Logic

```javascript
function deriveCallStatus(callStatus, callDuration, answerTime, previousStatus) {
  switch (callStatus) {
    case 'ringing':
      return 'ringing';
      
    case 'answered':
    case 'in-progress':
      // Check if valid transition
      const hasAnswerIndicator = callDuration > 0 || (answerTime && answerTime.trim() !== '');
      const wasRinging = previousStatus === 'ringing' || previousStatus === 'queued' || previousStatus === null;
      
      if (hasAnswerIndicator || wasRinging) {
        return 'in-progress'; // ✅ Customer answered
      } else {
        return 'ringing'; // ⏭️ Still ringing
      }
      
    case 'completed':
      return callDuration > 0 ? 'completed' : 'no-answer';
      
    // ... other statuses
  }
}
```

---

## Summary

### **Why Status Might Be Wrong:**

1. **Agent leg callbacks** - We filter these out ✅
2. **Premature 'in-progress'** - We validate with previous status ✅
3. **Missing answerTime** - We check for valid transitions ✅
4. **Multiple callbacks** - We only process customer leg ✅

### **Current Flow:**

1. **Call Initiated** → Status: `'queued'`
2. **Customer Phone Rings** → Status: `'ringing'` (customer leg callback)
3. **Agent Joins** → Status: Still `'ringing'` (agent leg callback skipped)
4. **Customer Answers** → Status: `'in-progress'` (customer leg callback, valid transition)
5. **Call Ends** → Status: `'completed'` (customer leg callback, saved to DB)

### **What We're Doing Right:**

- ✅ Filtering out agent leg callbacks
- ✅ Only processing customer leg callbacks
- ✅ Validating status transitions
- ✅ Broadcasting all statuses in real-time
- ✅ Saving to database only when call ends

---

## Debugging Tips

To see what callbacks you're receiving, check the logs:

```javascript
console.log('📞 Call status callback received:', {
  callSid,
  callStatus,
  from,        // Check this - if starts with 'client:', it's agent leg
  to,          // Check this - if phone number, it's customer leg
  direction,
  answerTime,
  duration
});
```

**Look for:**
- `from: 'client:agent-1'` → Agent leg (should be skipped)
- `from: '+18778389242'` → Customer leg (should be processed)
- `answerTime: null` + `callStatus: 'in-progress'` → Might be premature

