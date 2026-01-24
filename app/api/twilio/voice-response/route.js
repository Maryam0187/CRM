import { NextResponse } from 'next/server';
import { getWebhookUrl, validatePhoneNumber } from '../../../../lib/twilio';
import sequelizeDb from '../../../../lib/sequelize-db';
import { handleInboundCall } from '../../../../lib/twilio/inbound/handleInboundCall';

// Handle both GET and POST requests (Twilio can use either)
export async function GET(request) {
  console.log('📞 GET request to voice-response');
  console.log('📞 GET request URL:', request.url);
  console.log('📞 GET request headers:', Object.fromEntries(request.headers.entries()));
  return handleVoiceResponse(request);
}

export async function POST(request) {
  console.log('📞 POST request to voice-response');
  console.log('📞 POST request URL:', request.url);
  try {
    const headers = Object.fromEntries(request.headers.entries());
    console.log('📞 POST request headers:', {
      'user-agent': headers['user-agent'],
      'x-forwarded-for': headers['x-forwarded-for'],
      'host': headers['host'],
      'content-type': headers['content-type']
    });
  } catch (e) {
    console.warn('⚠️ Could not log headers:', e);
  }
  return handleVoiceResponse(request);
}

async function handleVoiceResponse(request) {
  try {
    let url;
    let agentId = null;
    let conferenceNameFromUrl = null;
    
    try {
      url = new URL(request.url);
      agentId = url.searchParams.get('agentId');
      conferenceNameFromUrl = url.searchParams.get('conferenceName') || url.searchParams.get('conference');
      console.log('📞 Voice response request received:', {
        method: request.method,
        url: request.url,
        agentIdFromUrl: agentId,
        conferenceNameFromUrl,
        hasUrl: !!url
      });
    } catch (urlError) {
      console.error('❌ Error parsing URL in voice-response:', urlError);
      console.error('❌ Request URL:', request.url);
      // Continue without agentId - will handle as inbound call
    }
    
    // For POST requests, also check form data
    let formData = null;
    if (request.method === 'POST') {
      try {
        formData = await request.formData();
        const agentIdFromForm = formData.get('agentId');
        agentId = agentId || agentIdFromForm;

        // If agentId is not provided, try to extract it from From=client:agent-<id>
        // This is the normal identity format used by the frontend token.
        if (!agentId) {
          const from = formData.get('From') || '';
          const m = String(from).match(/agent-(\d+)/);
          if (m) agentId = m[1];
        }
        
        console.log('📞 Form data parsed:', {
          agentIdFromForm,
          finalAgentId: agentId,
          direction: formData.get('Direction'),
          from: formData.get('From'),
          to: formData.get('To')
        });
        
        // Get call direction from Twilio
        const direction = formData.get('Direction'); // 'inbound' or 'outbound-dial'
        const callerNumber = formData.get('From');
        const calledNumber = formData.get('To');
        
        // If this is an inbound call (no agentId and direction is inbound)
        if (!agentId && (direction === 'inbound' || (!direction && callerNumber && calledNumber))) {
          console.log('📞 Detected inbound call, routing to handleInboundCall');
          return await handleInboundCall(formData, callerNumber, calledNumber);
        }
      } catch (e) {
        console.error('❌ Error parsing form data in voice-response:', e);
        console.error('❌ Error stack:', e.stack);
        // If we can't parse form data, try to continue with what we have
      }
    }
    
    // Call recording is DISABLED - no calls will be recorded
    const recordingEnabled = false;
    
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (agentId) {
      try {
        console.log(`📞 Voice response - Looking for agent ID: ${agentId}`);
        
        // Validate agentId is a number
        const parsedAgentId = parseInt(agentId, 10);
        if (isNaN(parsedAgentId)) {
          throw new Error(`Invalid agentId: ${agentId}`);
        }
        
        // Get agent information
        const agent = await sequelizeDb.User.findByPk(parsedAgentId, {
          attributes: ['id', 'firstName', 'lastName', 'phone']
        });
        
        if (!agent) {
          throw new Error(`Agent ${parsedAgentId} not found in database`);
        }
        
        console.log(`📞 Agent lookup result:`, {
          found: !!agent,
          agentId: agent?.id,
          name: agent ? `${agent.firstName} ${agent.lastName}` : 'N/A'
        });
        
        // SIMPLE FLOW:
        // Always join a conference.
        // - Outbound: customer leg (created via REST API) and agent leg (Voice SDK) both join `call-<agentId>`.
        // - Inbound: agent leg joins `inbound-...` conference.
        const toParamRaw = formData?.get('To') || '';
        const toParam = String(toParamRaw).trim();

        const conferenceName =
          (conferenceNameFromUrl && String(conferenceNameFromUrl).trim()) ||
          (toParam && (toParam.startsWith('inbound-') || toParam.startsWith('call-')) ? toParam : null) ||
          `call-${parsedAgentId}`;

        const safeConferenceName = conferenceName.replace(/[<>&"']/g, '');
        const isInboundConference = safeConferenceName.startsWith('inbound-');
        const conferenceCallbackUrl = getWebhookUrl(
          isInboundConference
            ? '/api/twilio/inbound/call-status-callback'
            : '/api/twilio/call-status-callback'
        );

        twiml += `\n  <Dial record="false" 
        timeout="30" timeLimit="3600" 
        answerOnMedia="false" 
        hangupOnStar="false">`;
        twiml += `\n    <Conference 
        startConferenceOnEnter="true" 
        endConferenceOnExit="true" 
         maxParticipants="10"
          muted="false" 
          statusCallback="${conferenceCallbackUrl}" statusCallbackMethod="POST" 
          statusCallbackEvent="start end join leave mute hold speaker">${safeConferenceName}</Conference>`;
        twiml += `\n  </Dial>`;
        
        // If agent has phone, we could call them separately to join the conference
        // But with Voice SDK, agent joins via browser, so this is optional
        if (agent && agent.phone) {
          const agentPhone = validatePhoneNumber(agent.phone);
          if (agentPhone) {
            console.log(`📞 Agent phone available: ${agentPhone} - can be called separately if needed`);
          }
        } else {
          console.log(`📞 Agent ${parsedAgentId} will join via Voice SDK to conference: ${safeConferenceName}`);
        }
        // No Hangup here - let the call continue in the conference
      } catch (error) {
        console.error('❌ Error in voice response:', error);
        console.error('❌ Error details:', {
          message: error.message,
          stack: error.stack,
          agentId: agentId
        });
        twiml += `\n  <Say voice="alice">We're sorry, we're unable to connect you at this time. Please try again later.</Say>`;
        twiml += `\n  <Hangup/>`;
      }
    } else {
      // Fallback: automated message (no recording)
      twiml += `\n  <Say voice="alice">Hello, this is a call from your CRM system.</Say>`;
      twiml += `\n  <Say voice="alice">Thank you for your time. Have a great day!</Say>`;
      twiml += `\n  <Hangup/>`;
    }
    
    twiml += `\n</Response>`;

    console.log('🎙️ Voice response TwiML generated:', {
      hasAgentId: !!agentId,
      twimlLength: twiml.length,
      twimlPreview: twiml.substring(0, 200) + '...'
    });

    const response = new NextResponse(twiml, {
      headers: { 
        'Content-Type': 'text/xml',
        'Cache-Control': 'no-cache'
      }
    });

    console.log('✅ Returning TwiML response');
    return response;
  } catch (error) {
    console.error('🎙️ Error in voice response:', error);
    
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
