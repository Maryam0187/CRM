import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../lib/twilio';

/**
 * Handle TwiML App webhook for agents joining conference via web browser
 * This is called when an agent connects via Twilio Voice SDK (web browser)
 * The 'To' parameter contains the conference name
 */
export async function GET(request) {
  return handleJoinConference(request);
}

export async function POST(request) {
  return handleJoinConference(request);
}

async function handleJoinConference(request) {
  try {
    console.log('📞 Join conference request received');
    
    let formData = null;
    let conferenceName = null;
    
    // Get conference name from URL query parameter or form data
    try {
      const url = new URL(request.url);
      conferenceName = url.searchParams.get('To') || url.searchParams.get('conference');
    } catch (urlError) {
      console.warn('⚠️ Error parsing URL:', urlError);
    }
    
    // For POST requests, also check form data
    if (request.method === 'POST') {
      try {
        formData = await request.formData();
        conferenceName = conferenceName || formData.get('To') || formData.get('conference');
        
        console.log('📞 Join conference form data:', {
          To: formData.get('To'),
          From: formData.get('From'),
          CallSid: formData.get('CallSid'),
          conferenceName
        });
      } catch (e) {
        console.error('❌ Error parsing form data:', e);
      }
    }
    
    // If no conference name, use a default or return error
    if (!conferenceName) {
      console.warn('⚠️ No conference name provided in join-conference request');
      // Return TwiML that will hang up gracefully
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Conference not found. Please try again.</Say>
  <Hangup/>
</Response>`;
      
      return new NextResponse(errorTwiml, {
        headers: { 'Content-Type': 'text/xml' }
      });
    }
    
    // Escape conference name to prevent XML injection
    const safeConferenceName = conferenceName.replace(/[<>&"']/g, '');
    
    console.log('📞 Joining conference:', safeConferenceName);

    // Get conference callback URL for tracking conference events
    const conferenceCallbackUrl = getWebhookUrl('/api/twilio/call-status-callback');
    
    // Generate TwiML to join the conference
    // This is used when agent connects via web browser (Twilio Voice SDK)
    //
    // NOTE:
    // `answerOnBridge` mainly affects <Dial><Number>/<Client> bridging behavior (e.g. transfers).
    // For <Dial><Conference>, it does NOT change our "customer answered" logic (that comes from the PSTN leg CallStatus).
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="false" 
  timeout="30" 
  timeLimit="3600" 
  answerOnMedia="false"
  answerOnBridge="true">
    <Conference 
    startConferenceOnEnter="true" 
    endConferenceOnExit="true"  
    maxParticipants="10" 
    muted="false" 
    statusCallback="${conferenceCallbackUrl}" 
    statusCallbackMethod="POST" 
    statusCallbackEvent="start end join leave mute hold speaker">${safeConferenceName}</Conference>
  </Dial>
</Response>`;

    console.log('🎙️ Join conference TwiML generated:', {
      conferenceName: safeConferenceName,
      twimlLength: twiml.length
    });

    return new NextResponse(twiml, {
      headers: { 
        'Content-Type': 'text/xml',
        'Cache-Control': 'no-cache'
      }
    });
    
  } catch (error) {
    console.error('❌ Error in join-conference:', error);
    
    // Fallback TwiML
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">We're sorry, we're unable to connect you to the conference at this time. Please try again later.</Say>
  <Hangup/>
</Response>`;

    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  }
}

