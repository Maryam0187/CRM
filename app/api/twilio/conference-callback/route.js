import { NextResponse } from 'next/server';
import socketManager from '../../../../lib/socket';

/**
 * Handle Conference Status Callbacks from Twilio
 * This receives events when conference participants join, leave, mute, hold, etc.
 * 
 * Events received:
 * - start: Conference started
 * - end: Conference ended
 * - join: Participant joined
 * - leave: Participant left
 * - mute: Participant muted/unmuted
 * - hold: Participant put on hold
 * - speaker: Speaker changed
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    
    // Extract conference callback data
    const conferenceSid = formData.get('ConferenceSid');
    const conferenceName = formData.get('FriendlyName');
    const conferenceStatus = formData.get('Status'); // 'in-progress', 'completed'
    const conferenceEvent = formData.get('StatusCallbackEvent'); // start, end, join, leave, mute, hold, speaker
    const sequenceNumber = formData.get('SequenceNumber');
    
    // Participant information (if applicable)
    const callSid = formData.get('CallSid'); // Participant's call SID
    const participantCallSid = formData.get('ParticipantCallSid'); // Same as CallSid for this callback
    const muted = formData.get('Muted'); // 'true' or 'false'
    const hold = formData.get('Hold'); // 'true' or 'false'
    
    // Conference metadata
    const accountSid = formData.get('AccountSid');
    const timestamp = formData.get('Timestamp');
    
    console.log('📞 Conference callback received:', {
      conferenceSid: conferenceSid?.substring(0, 15) + '...',
      conferenceName,
      conferenceStatus,
      conferenceEvent,
      sequenceNumber,
      callSid: callSid?.substring(0, 15) + '...',
      muted,
      hold,
      timestamp
    });
    
    // Handle different conference events
    switch (conferenceEvent) {
      case 'start':
        console.log('🎉 Conference started:', {
          conferenceName,
          conferenceSid: conferenceSid?.substring(0, 15) + '...'
        });
        // Broadcast conference started event
        if (conferenceName) {
          socketManager.sendConferenceEvent(conferenceName, {
            event: 'start',
            conferenceSid,
            conferenceName,
            timestamp
          });
        }
        break;
        
      case 'end':
        console.log('🏁 Conference ended:', {
          conferenceName,
          conferenceSid: conferenceSid?.substring(0, 15) + '...'
        });
        // Broadcast conference ended event
        if (conferenceName) {
          socketManager.sendConferenceEvent(conferenceName, {
            event: 'end',
            conferenceSid,
            conferenceName,
            timestamp
          });
        }
        break;
        
      case 'join':
        console.log('👤 Participant joined conference:', {
          conferenceName,
          callSid: callSid?.substring(0, 15) + '...',
          muted,
          hold
        });
        // Broadcast participant joined event
        if (conferenceName && callSid) {
          socketManager.sendConferenceEvent(conferenceName, {
            event: 'join',
            conferenceSid,
            conferenceName,
            callSid,
            muted: muted === 'true',
            hold: hold === 'true',
            timestamp
          });
          
          // Also send participant update
          socketManager.sendParticipantUpdate(
            callSid,
            conferenceName,
            [{
              callSid,
              status: 'connected',
              muted: muted === 'true',
              hold: hold === 'true'
            }],
            null // agentId will be resolved from conferenceName if needed
          );
        }
        break;
        
      case 'leave':
        console.log('👋 Participant left conference:', {
          conferenceName,
          callSid: callSid?.substring(0, 15) + '...'
        });
        // Broadcast participant left event
        if (conferenceName && callSid) {
          socketManager.sendConferenceEvent(conferenceName, {
            event: 'leave',
            conferenceSid,
            conferenceName,
            callSid,
            timestamp
          });
        }
        break;
        
      case 'mute':
        console.log('🔇 Participant mute status changed:', {
          conferenceName,
          callSid: callSid?.substring(0, 15) + '...',
          muted: muted === 'true'
        });
        // Broadcast mute status change
        if (conferenceName && callSid) {
          socketManager.sendConferenceEvent(conferenceName, {
            event: 'mute',
            conferenceSid,
            conferenceName,
            callSid,
            muted: muted === 'true',
            timestamp
          });
          
          // Send participant update with new mute status
          socketManager.sendParticipantUpdate(
            callSid,
            conferenceName,
            [{
              callSid,
              status: 'connected',
              muted: muted === 'true',
              hold: hold === 'true'
            }],
            null
          );
        }
        break;
        
      case 'hold':
        console.log('⏸️ Participant hold status changed:', {
          conferenceName,
          callSid: callSid?.substring(0, 15) + '...',
          hold: hold === 'true'
        });
        // Broadcast hold status change
        if (conferenceName && callSid) {
          socketManager.sendConferenceEvent(conferenceName, {
            event: 'hold',
            conferenceSid,
            conferenceName,
            callSid,
            hold: hold === 'true',
            timestamp
          });
          
          // Send participant update with new hold status
          socketManager.sendParticipantUpdate(
            callSid,
            conferenceName,
            [{
              callSid,
              status: 'connected',
              muted: muted === 'true',
              hold: hold === 'true'
            }],
            null
          );
        }
        break;
        
      case 'speaker':
        console.log('🎤 Speaker changed:', {
          conferenceName,
          callSid: callSid?.substring(0, 15) + '...'
        });
        // Broadcast speaker change
        if (conferenceName && callSid) {
          socketManager.sendConferenceEvent(conferenceName, {
            event: 'speaker',
            conferenceSid,
            conferenceName,
            callSid,
            timestamp
          });
        }
        break;
        
      default:
        console.log('ℹ️ Unknown conference event:', conferenceEvent);
    }
    
    // Return empty TwiML response (conference callbacks don't need TwiML)
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' }
    });
    
  } catch (error) {
    console.error('❌ Error processing conference callback:', error);
    
    // Still return valid TwiML response
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
      status: 200
    });
  }
}

// Handle GET requests (for testing)
export async function GET(request) {
  return NextResponse.json({
    success: true,
    message: 'Conference callback endpoint is active',
    timestamp: new Date().toISOString()
  }, { status: 200 });
}
