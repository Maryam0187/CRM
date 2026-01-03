# Conference Participant Status Guide

This guide explains how to get participant status from Twilio conferences.

## Participant Status Values

Twilio participant status can be one of:
- **`queued`** - Participant is queued to join the conference
- **`connecting`** - Participant is connecting to the conference
- **`ringing`** - Participant's phone is ringing
- **`connected`** - Participant is connected to the conference (actively in call)
- **`complete`** - Participant has left the conference
- **`failed`** - Participant connection failed

---

## API Endpoints

### 1. Get All Participants in a Conference

**GET** `/api/twilio/conference-participants?conferenceName=call-1`

**Query Parameters:**
- `conferenceName` (required if no conferenceSid) - Conference friendly name (e.g., `call-1`)
- `conferenceSid` (optional) - Conference SID (if provided, conferenceName is ignored)

**Response:**
```json
{
  "success": true,
  "conference": {
    "sid": "CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "friendlyName": "call-1",
    "status": "in-progress",
    "participantsCount": 2
  },
  "participants": [
    {
      "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "status": "connected",
      "muted": false,
      "hold": false,
      "conferenceSid": "CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "dateCreated": "2025-01-01T12:00:00Z",
      "dateUpdated": "2025-01-01T12:00:00Z"
    },
    {
      "callSid": "CAyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy",
      "status": "connected",
      "muted": false,
      "hold": false,
      "conferenceSid": "CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "dateCreated": "2025-01-01T12:00:05Z",
      "dateUpdated": "2025-01-01T12:00:05Z"
    }
  ],
  "count": 2
}
```

### 2. Get Participant Status by Call SID

**POST** `/api/twilio/conference-participants`

**Body:**
```json
{
  "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Response:**
```json
{
  "success": true,
  "participant": {
    "callSid": "CAxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "status": "connected",
    "muted": false,
    "hold": false,
    "conferenceSid": "CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "dateCreated": "2025-01-01T12:00:00Z",
    "dateUpdated": "2025-01-01T12:00:00Z"
  },
  "conference": {
    "sid": "CFxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "friendlyName": "call-1",
    "status": "in-progress"
  }
}
```

---

## Usage Examples

### Frontend (React/Next.js)

```javascript
// Get all participants in a conference
async function getConferenceParticipants(conferenceName) {
  try {
    const response = await fetch(
      `/api/twilio/conference-participants?conferenceName=${conferenceName}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Participants:', data.participants);
      // Filter by status
      const connectedParticipants = data.participants.filter(
        p => p.status === 'connected'
      );
      console.log('Connected:', connectedParticipants);
    }
  } catch (error) {
    console.error('Error fetching participants:', error);
  }
}

// Get participant status by call SID
async function getParticipantStatus(callSid) {
  try {
    const response = await fetch('/api/twilio/conference-participants', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ callSid })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Participant status:', data.participant.status);
      // Status: queued, connecting, ringing, connected, complete, failed
    }
  } catch (error) {
    console.error('Error fetching participant status:', error);
  }
}

// Poll participant status (useful for real-time updates)
function pollParticipantStatus(callSid, interval = 2000) {
  const intervalId = setInterval(async () => {
    const status = await getParticipantStatus(callSid);
    
    if (status === 'connected') {
      console.log('Participant is connected!');
    } else if (status === 'complete' || status === 'failed') {
      clearInterval(intervalId);
      console.log('Participant left or failed');
    }
  }, interval);
  
  return intervalId; // Return so you can clear it later
}
```

### Backend (Server-side)

```javascript
import { getConferenceParticipants, getParticipantStatus } from '../../lib/twilio';

// Get all participants
async function checkConferenceStatus(conferenceName) {
  const participants = await getConferenceParticipants(conferenceName);
  
  participants.forEach(participant => {
    console.log(`Call ${participant.callSid}: ${participant.status}`);
    
    switch (participant.status) {
      case 'queued':
        console.log('  → Waiting to join');
        break;
      case 'connecting':
        console.log('  → Connecting...');
        break;
      case 'ringing':
        console.log('  → Phone is ringing');
        break;
      case 'connected':
        console.log('  → Connected and active');
        break;
      case 'complete':
        console.log('  → Left the conference');
        break;
      case 'failed':
        console.log('  → Connection failed');
        break;
    }
  });
  
  return participants;
}

// Get specific participant status
async function checkParticipant(callSid) {
  const participant = await getParticipantStatus(callSid);
  
  if (participant) {
    console.log(`Status: ${participant.status}`);
    console.log(`Muted: ${participant.muted}`);
    console.log(`On Hold: ${participant.hold}`);
    return participant;
  } else {
    console.log('Participant not found in any active conference');
    return null;
  }
}
```

---

## Status Flow

Typical participant status flow:

```
queued → connecting → ringing → connected → complete
                                    ↓
                                 failed (if error)
```

### Status Meanings:

1. **`queued`** - Participant is waiting to join (rare, usually happens very quickly)
2. **`connecting`** - Twilio is establishing the connection
3. **`ringing`** - For phone participants, their phone is ringing
4. **`connected`** - Participant is actively in the conference (can hear/talk)
5. **`complete`** - Participant has left the conference
6. **`failed`** - Connection failed (network error, invalid number, etc.)

---

## Use Cases

### 1. Check if Agent is Connected

```javascript
async function isAgentConnected(conferenceName, agentCallSid) {
  const participants = await getConferenceParticipants(conferenceName);
  const agent = participants.find(p => p.callSid === agentCallSid);
  return agent?.status === 'connected';
}
```

### 2. Monitor Call Quality

```javascript
async function monitorCallQuality(conferenceName) {
  const participants = await getConferenceParticipants(conferenceName);
  
  const stats = {
    total: participants.length,
    connected: participants.filter(p => p.status === 'connected').length,
    failed: participants.filter(p => p.status === 'failed').length,
    muted: participants.filter(p => p.muted).length,
    onHold: participants.filter(p => p.hold).length
  };
  
  return stats;
}
```

### 3. Real-time Status Updates

```javascript
// In your component
useEffect(() => {
  if (!conferenceName) return;
  
  const interval = setInterval(async () => {
    const participants = await getConferenceParticipants(conferenceName);
    setParticipants(participants);
    
    // Check if all participants are connected
    const allConnected = participants.every(p => p.status === 'connected');
    if (allConnected && participants.length >= 2) {
      console.log('Call is fully connected!');
    }
  }, 2000); // Poll every 2 seconds
  
  return () => clearInterval(interval);
}, [conferenceName]);
```

---

## Integration with Call Status Callback

You can combine participant status with call status callbacks:

```javascript
// In call-status-callback route
import { getParticipantStatus } from '../../../../lib/twilio';

export async function POST(request) {
  // ... existing code ...
  
  // Get participant status for agent leg
  if (agentCallSid) {
    const participant = await getParticipantStatus(agentCallSid);
    
    if (participant) {
      statusData.agentParticipantStatus = participant.status;
      statusData.agentMuted = participant.muted;
      statusData.agentOnHold = participant.hold;
    }
  }
  
  // Broadcast with participant info
  broadcastCallStatus(callSid, statusData, agentId);
}
```

---

## Notes

- Participant status is separate from call status
- A call can be `in-progress` but a participant might be `ringing` (not yet `connected`)
- Use participant status to know if someone is actually in the conference
- Status updates are real-time but you may need to poll for updates
- Consider using Socket.IO for real-time participant status updates instead of polling

