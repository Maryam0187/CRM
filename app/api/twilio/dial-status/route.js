import { NextResponse } from 'next/server';

/**
 * Handle Dial status callbacks from Twilio
 * This is called when a <Dial> verb completes (successfully or with error)
 * 
 * DialStatus values:
 * - completed: Agent answered and call completed normally
 * - answered: Agent answered (but call still in progress)
 * - busy: Agent's line is busy
 * - no-answer: Agent didn't answer within timeout
 * - failed: Dial failed (agent not registered, network error, etc.)
 * - canceled: Dial was canceled
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    
    const dialCallSid = formData.get('DialCallSid'); // The child call SID (agent leg)
    const dialCallStatus = formData.get('DialCallStatus'); // Status of the dial
    const dialCallDuration = formData.get('DialCallDuration'); // Duration if answered
    const callSid = formData.get('CallSid'); // Parent call SID (customer leg)
    const callStatus = formData.get('CallStatus'); // Status of parent call
    const agentId = new URL(request.url).searchParams.get('agentId');
    
    console.log('📞 Dial status callback received:', {
      callSid,
      dialCallSid,
      dialCallStatus,
      dialCallDuration,
      callStatus,
      agentId,
      timestamp: new Date().toISOString()
    });
    
    // Generate TwiML response based on dial status
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (dialCallStatus === 'completed' || dialCallStatus === 'answered') {
      // Agent answered successfully - call is connected
      // No action needed, just let the call continue
      console.log('✅ Agent answered successfully - call connected');
      twiml += `\n  <!-- Call connected successfully -->`;
    } else if (dialCallStatus === 'no-answer' || dialCallStatus === 'failed') {
      // Agent didn't answer or SIP registration failed
      console.log(`⚠️ Dial failed: ${dialCallStatus} - Agent may not be connected to SIP domain`);
      twiml += `\n  <Say voice="alice">We're sorry, the agent is not available at this time. Please try again later.</Say>`;
    } else if (dialCallStatus === 'busy') {
      // Agent is busy on another call
      console.log('⚠️ Agent is busy on another call');
      twiml += `\n  <Say voice="alice">We're sorry, the agent is currently busy. Please try again later.</Say>`;
    } else {
      // Other status (canceled, etc.)
      console.log(`ℹ️ Dial status: ${dialCallStatus}`);
      twiml += `\n  <Say voice="alice">We're sorry, we're unable to connect you at this time.</Say>`;
    }
    
    twiml += `\n  <Hangup/>
</Response>`;
    
    console.log('🎙️ Dial status TwiML response:', twiml);
    
    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
    
  } catch (error) {
    console.error('❌ Error in dial status callback:', error);
    
    // Fallback TwiML
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry, we're unable to connect you at this time. Please try again later.</Say>
  <Hangup/>
</Response>`;
    
    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}

// Also handle GET requests (Twilio can use either)
export async function GET(request) {
  return POST(request);
}

