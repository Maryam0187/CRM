# WebCallInterface - All Statuses and Event Handlers

## Component Overview

**File:** `components/WebCallInterface.js`
**Type:** React functional component with `forwardRef`
**Purpose:** Manages Twilio Voice SDK device and call connections

---

## Call Statuses (handled in `hangUp()` function)

### 1. **Connected States** → Uses `call.disconnect()`
- `'open'` - Call is open/connected
- `'answered'` - Call has been answered
- `'connected'` - Call is connected

**Action:** Directly disconnects the call using `call.disconnect()`

### 2. **Initiating States** → Uses `device.disconnectAll()`
- `'ringing'` - Call is ringing
- `'pending'` - Call is pending
- `'connecting'` - Call is connecting

**Action:** Cancels the call using `device.disconnectAll()`

### 3. **Other/Unknown States** → Uses `device.disconnectAll()`
- Any other status value
- `null` or `undefined`

**Action:** Falls back to `device.disconnectAll()`

---

## Device Events (listened to via `device.on()`)

### Device Lifecycle Events:
1. **`'registered'`** - Device successfully registered with Twilio
   - Sets device state
   - Auto-joins conference if `conferenceName` provided

2. **`'unregistered'`** - Device unregistered
   - Logs event (for monitoring)

3. **`'offline'`** - Device went offline
   - Logs event (for monitoring)

4. **`'destroyed'`** - Device destroyed
   - Restores original console functions after 2s delay

5. **`'error'`** - Device error occurred
   - Sets error state
   - Sets `isConnecting` to false

6. **`'incoming'`** - Incoming call received
   - Automatically rejects (not used for outbound calls)

7. **`'tokenWillExpire'`** - Token about to expire
   - Fetches new token
   - Updates device with new token

---

## Call Events (listened to via `call.addEventListener()` or `call.on()`)

### Call Connection Events:
1. **`'accept'`** - Call accepted/connected
   - Sets `isConnected = true`
   - Sets `isConnecting = false`
   - Captures local media stream for mute functionality
   - Calls `onCallConnected()` callback

2. **`'disconnect'`** - Call disconnected
   - Sets `isConnected = false`
   - Sets `isConnecting = false`
   - Clears `activeConnection`
   - Waits 300ms before cleanup (allows SDK to finish sending Insights events)
   - Unregisters device after delay
   - Calls `onCallDisconnected()` callback

3. **`'cancel'`** - Call canceled (customer declined/no answer)
   - Sets `isConnected = false`
   - Sets `isConnecting = false`
   - Clears `activeConnection`
   - Calls `onCallDisconnected()` callback

4. **`'error'`** - Call error occurred
   - Checks error codes:
     - `31603` → "Call was declined by customer or Twilio"
     - `31005` → "Connection error. Please check your internet connection"
     - Other → Shows error message with code
   - Sets `isConnected = false`
   - Sets `isConnecting = false`
   - Clears `activeConnection`
   - Calls `onCallDisconnected()` callback

5. **`'reject'`** - Call rejected
   - Sets error: "Call was rejected. Please check TwiML App Voice URL configuration."
   - Sets `isConnected = false`
   - Sets `isConnecting = false`
   - Clears `activeConnection`
   - Calls `onCallDisconnected()` callback

---

## Component State Variables

### React State:
- `device` - Twilio Device instance
- `isConnected` - Boolean: call is connected
- `isConnecting` - Boolean: call is connecting
- `error` - String: error message
- `isMuted` - Boolean: call is muted

### Refs:
- `activeConnection` - Current Call object
- `localMediaStream` - Local audio stream (for mute functionality)
- `isCleaningUp` - Boolean: cleanup in progress (prevents double-cleanup)

---

## Exposed Methods (via `useImperativeHandle`)

These methods can be called from parent component via ref:

1. **`hangUp()`** - Hang up the call
   - Checks call status and disconnects appropriately
   - Updates UI state immediately

2. **`mute()`** - Mute the call
   - Tries multiple methods:
     1. SDK's `call.mute(true)`
     2. Local media stream tracks
     3. `getCallStreams()` method
     4. Peer connection directly

3. **`unmute()`** - Unmute the call
   - Tries same methods as mute, but enables tracks

4. **`toggleMute()`** - Toggle mute state

5. **`isMuted()`** - Get current mute state (function)

6. **`getMutedState()`** - Get current mute state (alias)

---

## Props

1. **`conferenceName`** (string, required)
   - Twilio conference name to join
   - Component returns `null` if not provided

2. **`onCallConnected`** (function, optional)
   - Callback fired when call connects
   - Receives `call` object as parameter

3. **`onCallDisconnected`** (function, optional)
   - Callback fired when call disconnects
   - Called in: disconnect, cancel, error, reject events

---

## Status Flow Diagram

```
Call Initiation
    ↓
'connecting' / 'pending'
    ↓
'ringing'
    ↓
'accept' event
    ↓
'open' / 'answered' / 'connected'
    ↓
Call Active (mute/unmute available)
    ↓
User clicks hang up
    ↓
'disconnect' event
    ↓
Device cleanup (after 300ms delay)
```

---

## Error Handling

### All event handlers are wrapped in try-catch:
- Errors are logged but don't crash the app
- State is reset even if errors occur
- Callbacks are safely called with error handling

### Global Error Handling:
- Unhandled promise rejection handler
- Filters out Twilio Insights errors
- Prevents crashes from SDK internal errors

---

## Cleanup Timing

### Why 300ms delay?
- SDK needs time to send Insights events to Twilio
- DTLS transport needs to close properly
- Prevents race conditions between disconnect and cleanup
- Reduces crashes from premature device destruction

---

## Key Implementation Details

1. **Status Checking:**
   - Handles both `call.status()` (function) and `call.status` (property)
   - Falls back to `call._status` if needed

2. **Disconnect Strategy:**
   - Connected calls: `call.disconnect()`
   - Ringing/connecting: `device.disconnectAll()`
   - Fallback: `device.disconnectAll()`

3. **Mute Strategy:**
   - Multiple fallback methods for maximum compatibility
   - Works across different browser/device combinations

4. **No Backend API Call:**
   - SDK handles disconnect automatically
   - Backend receives status via call-status-callback webhook
   - Prevents double-hangup race conditions

