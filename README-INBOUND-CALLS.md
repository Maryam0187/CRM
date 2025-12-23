# Inbound Call Callbacks & Missed Call Detection

Complete guide to how inbound calls and callbacks are handled in the CRM system, including missed call detection.

---

## Table of Contents

1. [Overview](#overview)
2. [Inbound Call Callbacks](#inbound-call-callbacks)
3. [Missed Call Detection](#missed-call-detection)
4. [Complete Flow Diagram](#complete-flow-diagram)
5. [Configuration](#configuration)
6. [Testing](#testing)
7. [Key Files](#key-files)

---

## Overview

When a customer calls your Twilio phone number, the system handles multiple types of callbacks:

1. **Initial Call Webhook** - When the call first arrives
2. **Status Callbacks** - As the call status changes (ringing, in-progress, completed, etc.)
3. **Recording Callbacks** - When call recordings are available (if enabled)
4. **Dial Status Callbacks** - When agent dialing completes

The system also automatically detects **missed calls** when a call ends without an agent joining.

---

## Inbound Call Callbacks

### 1. Initial Inbound Call Webhook

#### Location
**File**: `app/api/twilio/voice-response/route.js`

#### Entry Point
- **Route**: `/api/twilio/voice-response`
- **Methods**: `GET` and `POST`
- **Twilio Configuration**: Set in your Twilio Phone Number's "A call comes in" webhook

#### Flow

1. **Detection** (lines 29-36):
   ```javascript
   const direction = formData.get('Direction'); // 'inbound' or 'outbound-dial'
   const callerNumber = formData.get('From');
   const calledNumber = formData.get('To');
   
   // If this is an inbound call
   if (!agentId && (direction === 'inbound' || (!direction && callerNumber && calledNumber))) {
     return await handleInboundCall(formData, callerNumber, calledNumber);
   }
   ```

2. **handleInboundCall Function** (lines 125-442):
   - Creates a unique conference name: `inbound-{callSid}`
   - Matches caller to customer by phone number
   - Finds the last sale agent for the customer
   - Notifies all admins via database notifications and Socket.IO
   - Notifies the last sale agent (if available and not already an admin)
   - Creates a CallLog entry
   - Returns TwiML to place caller in conference

#### Key Actions

- **Customer Matching** (lines 148-209):
  - Normalizes phone numbers for matching
  - Searches customers by phone or landline
  - Finds last sale and associated agent

- **Notifications** (lines 211-340):
  - Creates database notifications for all admins
  - Sends real-time Socket.IO notifications with:
    - `conferenceName` - for joining the call
    - `callSid` - unique call identifier
    - `callerNumber` - customer's phone number
    - `customerId` - matched customer ID
    - `saleId` - last sale ID (if found)

- **Call Log Creation** (lines 375-400):
  - Creates CallLog entry with status 'ringing'
  - Assigns agent (last sale agent or first available admin)
  - Stores conference name in `twilioData`

- **TwiML Response** (lines 405-411):
  - Places caller in conference room
  - Plays hold message
  - Waits for agent to join

---

### 2. Call Status Callbacks

#### Location
**File**: `app/api/twilio/call-status-callback/route.js`

#### Entry Point
- **Route**: `/api/twilio/call-status-callback`
- **Method**: `POST`
- **Twilio Configuration**: Set in your Twilio Phone Number's "Call status changes" webhook

#### Status Flow

The callback receives status updates as the call progresses:

1. **Status Mapping** (lines 57-67):
   ```javascript
   const statusMap = {
     'initiated': 'queued',
     'queued': 'queued',
     'ringing': 'ringing',
     'in-progress': 'in-progress',
     'completed': 'completed',
     'busy': 'busy',
     'failed': 'failed',
     'no-answer': 'no-answer',
     'canceled': 'canceled'
   };
   ```

2. **Call Log Update** (lines 88-116):
   - Updates CallLog status in database
   - Stores Twilio metadata (duration, timestamps, etc.)
   - Verifies update succeeded

3. **Special Status Handling**:
   - **Voicemail Detection** (lines 119-155):
     - Detects AMD (Answering Machine Detection) result
     - Marks call as 'voicemail'
     - Auto-hangs up after 30 seconds
   
   - **No-Answer** (lines 158-173):
     - Immediately disconnects the call

4. **Agent Status Management** (lines 175-221):
   - Sets agent to 'busy' when call becomes 'in-progress'
   - Resets to 'available' when call ends (if no other active calls)
   - Updates agent's total call time

5. **Real-Time Updates** (lines 252-306):
   - Sends Socket.IO events to:
     - Specific agent: `sendCallStatusToAgent()`
     - Supervisors: `sendCallStatusToSupervisors()`
     - Call room: `sendCallStatusToRoom()`
     - All users: `sendCallStatusUpdate()` (broadcast)

#### Socket Events Sent

The status callback broadcasts to all connected users:
```javascript
{
  callSid,
  status: 'ringing' | 'in-progress' | 'completed' | etc.,
  duration,
  direction: 'inbound',
  from,
  to,
  customerId,
  saleId,
  agentId,
  ...
}
```

---

### 3. Recording Callbacks (Optional)

#### Location
**File**: `app/api/twilio/recording-callback/route.js`

#### Entry Point
- **Route**: `/api/twilio/recording-callback`
- **Method**: `POST`
- **Note**: Currently recording is disabled in the system

#### Purpose
- Receives recording URLs when calls are recorded
- Receives transcription data
- Updates CallLog with recording information

---

### 4. Dial Status Callbacks

#### Location
**File**: `app/api/twilio/dial-status/route.js`

#### Entry Point
- **Route**: `/api/twilio/dial-status`
- **Method**: `POST`

#### Purpose
- Handles status when `<Dial>` verb completes
- Statuses: `completed`, `answered`, `busy`, `no-answer`, `failed`, `canceled`
- Used for outbound calls when dialing agents

---

## Frontend: Receiving and Displaying Inbound Calls

### 1. Socket.IO Listener

**Files**:
- `components/InboundCallDialogManager.js` (lines 13-60)
- `components/NotificationBell.js` (lines 60-103)

**How it works**:
```javascript
socket.on('notification', (notification) => {
  if (notification.conferenceName || notification.type === 'inbound_call') {
    showInboundCall(formattedNotification);
  }
});
```

### 2. InboundCallContext

**File**: `contexts/InboundCallContext.js`

- Manages active call state
- Handles minimized calls
- Provides `showInboundCall()`, `closeInboundCall()`, `minimizeInboundCall()` functions

### 3. InboundCallDialog Component

**File**: `components/InboundCallDialog.js`

**Features**:
- Displays call information (customer name, phone number)
- Shows real-time call status (ringing, in-progress, completed, missed)
- "Join Call" button to connect agent to conference
- "View Sale" button to navigate to customer's sale
- Auto-closes when call ends
- Listens to Socket.IO status updates

**Status Tracking** (lines 54-102):
- Listens to `callStatusUpdate` events
- Periodically checks call status as fallback
- Updates UI based on call state

**Join Call Action** (lines 138-164):
```javascript
startCall({
  callSid: notification.callSid,
  conferenceName: notification.conferenceName,
  customerId: notification.customerId,
  saleId: notification.saleId,
  phoneNumber: notification.callerNumber,
  customerName: notification.customerName
});
```

---

## Missed Call Detection

### Overview

**Missed calls are detected on the frontend**, not in the backend database. The system determines a call is "missed" by tracking whether the call ever reached the `in-progress` state before ending.

### Detection Logic

#### Location
**File**: `components/InboundCallDialog.js`  
**Function**: `updateCallStatusFromData()` (lines 24-51)

#### How It Works

A call is considered **"missed"** when:

1. **Call ends** with one of these statuses:
   - `completed`
   - `failed`
   - `canceled`
   - `busy`
   - `no-answer`

2. **AND** the call was **never** `in-progress` (agent never joined)

3. **AND** it's not already marked as `completed` or `missed`

#### Code Implementation

```javascript
// Helper function to update call status from status data
const updateCallStatusFromData = useCallback((statusData) => {
  if (!statusData?.status) return;
  
  const newStatus = statusData.status;
  setCallStatus(prevStatus => {
    // If call is in-progress, update status
    if (newStatus === 'in-progress') {
      return 'in-progress';
    }
    
    // If call ended after joining (was in-progress), mark as completed
    if (['completed', 'failed', 'canceled'].includes(newStatus) && prevStatus === 'in-progress') {
      return 'completed';
    }
    
    // If call ended and was never in-progress (was ringing or initial state), mark as missed
    // This handles cases where customer ends call before agent joins
    if (['completed', 'failed', 'canceled', 'busy', 'no-answer'].includes(newStatus)) {
      // If it was never in-progress, it's a missed call
      if (prevStatus !== 'in-progress' && prevStatus !== 'completed' && prevStatus !== 'missed') {
        return 'missed';  // ✅ THIS IS WHERE MISSED IS DETECTED
      }
    }
    
    return prevStatus;
  });
}, []);
```

### Call Status Flow Examples

#### Scenario 1: Missed Call
```
1. Call arrives → Status: 'ringing'
2. Agent sees notification but doesn't click "Join Call"
3. Customer hangs up → Status: 'completed'
4. Frontend detects: prevStatus was 'ringing' (not 'in-progress')
5. Result: Call marked as 'missed' ✅
```

#### Scenario 2: Completed Call
```
1. Call arrives → Status: 'ringing'
2. Agent clicks "Join Call" → Status: 'in-progress'
3. Call ends → Status: 'completed'
4. Frontend detects: prevStatus was 'in-progress'
5. Result: Call marked as 'completed' ✅
```

#### Scenario 3: Customer Hangs Up Before Agent Joins
```
1. Call arrives → Status: 'ringing'
2. Customer hangs up immediately → Status: 'completed'
3. Frontend detects: prevStatus was 'ringing' (not 'in-progress')
4. Result: Call marked as 'missed' ✅
```

### Database Status vs UI Status

#### Database (CallLog Model)

The database **does NOT** have a "missed" status. The `status` field in `CallLog` only supports:

```javascript
status: {
  type: DataTypes.ENUM(
    'queued', 
    'ringing', 
    'in-progress', 
    'completed', 
    'busy', 
    'failed', 
    'no-answer', 
    'canceled'
  )
}
```

**Note**: "missed" is **not** a database status. It's a **UI-only concept**.

#### UI Status

The frontend component (`InboundCallDialog`) maintains its own status state:

```javascript
const [callStatus, setCallStatus] = useState('ringing'); 
// Possible values: 'ringing', 'in-progress', 'completed', 'missed'
```

The UI status is derived from:
- Real-time Socket.IO status updates
- Call status history (tracking if call was ever `in-progress`)

### Real-Time Status Updates

#### How Status Updates Are Received

The system has **three layers** of status checking:

1. **Real-Time Socket.IO Events** (primary) - lines 54-78:
   ```javascript
   const handleCallStatusUpdate = (event) => {
     const { callStatusData } = event.detail;
     if (callStatusData?.callSid === notification.callSid) {
       updateCallStatusFromData(callStatusData);
     }
   };
   window.addEventListener('callStatusUpdate', handleCallStatusUpdate);
   ```

2. **Initial Status Check on Mount** (catches already-ended calls) - lines 69-73:
   ```javascript
   // Check initial status when component mounts
   const initialStatus = getCallStatus(notification.callSid);
   if (initialStatus) {
     updateCallStatusFromData(initialStatus);
   }
   ```
   **This catches calls that already ended before dialog opened!**

3. **Periodic Status Check** (fallback) - lines 81-102:
   - Fallback mechanism that checks status every 2 seconds
   - Uses `getCallStatus()` from SocketContext

#### Complete Status Update Flow

1. **Backend Status Updates** ✅
   - Location: `app/api/twilio/call-status-callback/route.js`
   - Backend receives status from Twilio
   - Updates CallLog in database
   - Broadcasts to all users via Socket.IO:
     ```javascript
     socketManager.sendCallStatusUpdate(callSid, callStatusData);
     ```

2. **Socket.IO Broadcasting** ✅
   - Location: `lib/socket.js` (line 541-558)
   - Broadcasts to ALL connected users:
     ```javascript
     this.io.emit('call_status_update', callStatusData);
     ```

3. **Frontend Socket Context** ✅
   - Location: `contexts/SocketContext.js` (line 271-292)
   - Receives Socket.IO events
   - Updates internal state Map
   - Dispatches window event for components:
     ```javascript
     const callStatusEvent = new CustomEvent('callStatusUpdate', {
       detail: { callStatusData: data }
     });
     window.dispatchEvent(callStatusEvent);
     ```

4. **InboundCallDialog Detection** ✅
   - Location: `components/InboundCallDialog.js`
   - Listens to window events
   - Checks initial status on mount
   - Periodic fallback check
   - Applies detection logic

### Visual Indicators

The UI shows different states based on call status:

```javascript
const statusColors = {
  ringing: 'bg-yellow-50 border-yellow-400',
  'in-progress': 'bg-green-50 border-green-400',
  missed: 'bg-red-50 border-red-400',        // Red for missed
  completed: 'bg-gray-50 border-gray-400'
};

const statusIcons = {
  ringing: '📞',
  'in-progress': '✅',
  missed: '❌',                               // X icon for missed
  completed: '✓'
};

const statusText = {
  ringing: 'Incoming Call',
  'in-progress': 'Call Active',
  missed: 'Missed Call',                       // "Missed Call" text
  completed: 'Call Ended'
};
```

### Auto-Close Behavior

When a call is marked as missed or completed, the dialog auto-closes after 3 seconds:

```javascript
useEffect(() => {
  if (callStatus === 'completed' || callStatus === 'missed') {
    const autoCloseTimer = setTimeout(() => {
      onClose();
    }, 3000);
    
    return () => {
      clearTimeout(autoCloseTimer);
    };
  }
}, [callStatus, onClose]);
```

### Edge Cases & Solutions

#### Edge Case 1: Very Fast Call End
**Issue**: Call ends in < 1 second, before any status updates are received.

**Solution**: ✅ **HANDLED**
- Initial status check on mount catches this
- Periodic 2-second check is fallback
- Socket.IO events are real-time

#### Edge Case 2: Dialog Opens After Call Ended
**Issue**: Agent opens dialog after call already completed.

**Solution**: ✅ **HANDLED**
- `getCallStatus()` on mount retrieves latest status
- If status is 'completed' and never was 'in-progress', marks as 'missed'

#### Edge Case 3: Multiple Status Updates
**Issue**: Multiple status updates arrive out of order.

**Solution**: ✅ **HANDLED**
- `setCallStatus` uses functional update: `prevStatus => ...`
- Always checks current state before updating
- Prevents race conditions

#### Edge Case 4: Socket.IO Disconnection
**Issue**: Socket.IO disconnects, missing status updates.

**Solution**: ✅ **HANDLED**
- Periodic 2-second check as fallback
- `getCallStatus()` retrieves from SocketContext's internal Map
- Map is updated even if window events are missed

---

## Complete Flow Diagram

```
1. Customer calls Twilio number
   ↓
2. Twilio sends POST to /api/twilio/voice-response
   ↓
3. handleInboundCall() executes:
   - Matches customer
   - Creates conference
   - Creates CallLog (status: 'ringing')
   - Notifies admins/agents via:
     * Database notifications
     * Socket.IO events
   - Returns TwiML (places caller in conference)
   ↓
4. Frontend receives Socket.IO notification
   ↓
5. InboundCallDialog displays to agents
   ↓
6. Agent clicks "Join Call" (or doesn't)
   ↓
7. If agent joins: Agent joins conference via Voice SDK
   ↓
8. Twilio sends status callbacks to /api/twilio/call-status-callback:
   - 'ringing' → CallLog updated
   - 'in-progress' → Agent status set to 'busy' (if agent joined)
   - 'completed' → Agent status reset to 'available'
   ↓
9. Backend broadcasts status via Socket.IO to all users
   ↓
10. Frontend receives status updates via Socket.IO
    ↓
11. InboundCallDialog updates UI in real-time
    ↓
12. If call ended without being 'in-progress' → Marked as 'missed'
    ↓
13. UI shows appropriate status (missed/completed)
    ↓
14. Dialog auto-closes after 3 seconds
```

---

## Configuration

### Twilio Phone Number Settings

1. **"A call comes in"**:
   - URL: `https://your-domain.com/api/twilio/voice-response`
   - Method: `HTTP POST`

2. **"Call status changes"**:
   - URL: `https://your-domain.com/api/twilio/call-status-callback`
   - Method: `HTTP POST`

### Environment Variables

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_APP_SID` (for Voice SDK)

---

## Testing

### Testing Callbacks

You can test callbacks using curl:

```bash
# Test voice-response endpoint
curl -X POST https://your-domain.com/api/twilio/voice-response \
  -d "CallSid=CA123" \
  -d "Direction=inbound" \
  -d "From=+1234567890" \
  -d "To=+0987654321"

# Test status callback
curl -X POST https://your-domain.com/api/twilio/call-status-callback \
  -d "CallSid=CA123" \
  -d "CallStatus=ringing" \
  -d "Direction=inbound" \
  -d "From=+1234567890" \
  -d "To=+0987654321"
```

### Testing Missed Call Detection

#### Test 1: Normal Missed Call
1. Make inbound call
2. Don't click "Join Call"
3. Hang up from caller side
4. **Expected**: Dialog shows "Missed Call" (red border, ❌ icon)

#### Test 2: Very Fast Hangup
1. Make inbound call
2. Hang up immediately (< 1 second)
3. **Expected**: Dialog shows "Missed Call" when it opens

#### Test 3: Completed Call
1. Make inbound call
2. Click "Join Call"
3. Talk briefly
4. Hang up
5. **Expected**: Dialog shows "Call Ended" (gray border, ✓ icon)

#### Test 4: Check Console Logs
Look for these logs:
```
📞 Call status update received: completed
📞 Real-time call status update received: completed
📞 Updated call status map: ...
```

---

## Key Files

| File | Purpose |
|------|---------|
| `app/api/twilio/voice-response/route.js` | Initial inbound call webhook handler |
| `app/api/twilio/call-status-callback/route.js` | Status change callbacks |
| `app/api/twilio/recording-callback/route.js` | Recording callbacks (if enabled) |
| `app/api/twilio/dial-status/route.js` | Dial verb status callbacks |
| `components/InboundCallDialog.js` | UI component for displaying inbound calls & missed call detection |
| `components/InboundCallDialogManager.js` | Manages dialog lifecycle |
| `contexts/InboundCallContext.js` | React context for inbound call state |
| `contexts/SocketContext.js` | Socket.IO connection and status tracking |
| `lib/socket.js` | Socket.IO manager for real-time updates |
| `models/CallLog.js` | Database model (does NOT include "missed" status) |

---

## Important Notes

1. **Conference Names**: Each inbound call gets a unique conference name based on `callSid`
2. **Agent Assignment**: System assigns agent based on:
   - Last sale agent (if available)
   - First available admin
   - Fallback to any active agent
3. **Real-Time Updates**: All status changes are broadcast via Socket.IO to all connected users
4. **Call Log**: Every inbound call creates a CallLog entry with status tracking
5. **Notifications**: Both database and Socket.IO notifications are sent for redundancy
6. **Missed Call Detection**: Frontend-only, based on whether call was ever `in-progress`
7. **Three-Layer Status Checking**: Real-time events, initial check, and periodic fallback ensure reliable detection

---

## Summary

### Inbound Call Callbacks
- ✅ Initial webhook creates conference and notifies agents
- ✅ Status callbacks update database and broadcast to all users
- ✅ Real-time updates via Socket.IO
- ✅ Frontend displays calls in InboundCallDialog

### Missed Call Detection
- ✅ Detected on frontend when call ends without being `in-progress`
- ✅ Three layers of status checking ensure reliability
- ✅ Visual indicators (red border, ❌ icon) for missed calls
- ✅ Auto-closes dialog after 3 seconds
- ✅ Handles all edge cases (fast hangup, late dialog open, etc.)

The system is designed to be robust and handle all scenarios reliably.

