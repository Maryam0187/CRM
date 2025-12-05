import { NextResponse } from 'next/server';
import { getWebhookUrl, validatePhoneNumber, getClient } from '../../../../lib/twilio';
import sequelizeDb from '../../../../lib/sequelize-db';

// Handle both GET and POST requests (Twilio can use either)
export async function GET(request) {
  return handleVoiceResponse(request);
}

export async function POST(request) {
  return handleVoiceResponse(request);
}

async function handleVoiceResponse(request) {
  try {
    const url = new URL(request.url);
    let agentId = url.searchParams.get('agentId');
    
    if (!agentId && request.method === 'POST') {
      try {
        const formData = await request.formData();
        agentId = formData.get('agentId');
      } catch (e) {
        // Ignore
      }
    }
    
    // Call recording is DISABLED - no calls will be recorded
    const recordingEnabled = false;
    
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (agentId) {
      try {
        console.log(`📞 Voice response - Looking for agent ID: ${agentId}`);
        
        // Get agent with SIP extension info
        const agent = await sequelizeDb.User.findByPk(parseInt(agentId), {
          attributes: ['id', 'firstName', 'lastName', 'phone', 'extension', 'sipUsername', 'sipDomain']
        });
        
        console.log(`📞 Agent lookup result:`, {
          found: !!agent,
          agentId: agent?.id,
          name: agent ? `${agent.firstName} ${agent.lastName}` : 'N/A',
          hasExtension: !!agent?.extension,
          extension: agent?.extension || 'N/A',
          hasSipUsername: !!agent?.sipUsername
        });
        
        // Check if agent has SIP extension configured
        if (agent && agent.extension && agent.sipUsername) {
          // Route via SIP Domain (for SIP trunking)
          const sipDomain = agent.sipDomain || process.env.TWILIO_SIP_DOMAIN || process.env.TWILIO_SIP_DEFAULT_DOMAIN;
          if (sipDomain) {
            const agentSipUri = `sip:${agent.sipUsername}@${sipDomain}`;
            console.log(`📞 Routing to agent via SIP Domain: ${agent.extension} (${agentSipUri})`);
            
            // Dial agent via SIP Domain
            twiml += `\n  <Dial timeout="30" timeLimit="3600" answerOnMedia="false" record="false">`;
            twiml += `\n    <Sip>${agentSipUri}</Sip>`;
            twiml += `\n  </Dial>`;
          } else {
            throw new Error('SIP domain not configured');
          }
        } else {
          // Fallback to conference (for agents without SIP extension)
          const conferenceName = `call-${agentId}`;
          console.log(`📞 Agent has no SIP extension - using conference: ${conferenceName}`);
          
          // Place customer in conference room
          // Agent should already be connected via web interface (connected immediately when call initiated)
          // Recording is DISABLED
          // Optimize for immediate connection - no waitUrl, no beep, connect instantly
          // answerOnMedia="false" = connect immediately when answered, don't wait for media
          // startConferenceOnEnter="true" = conference already started by agent (first participant)
          twiml += `\n  <Dial record="false" timeout="30" timeLimit="3600" answerOnMedia="false" hangupOnStar="false">`;
          twiml += `\n    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="" waitMethod="POST" maxParticipants="2" muted="false" trim="do-not-trim">${conferenceName}</Conference>`;
          twiml += `\n  </Dial>`;
          
          // If agent has phone, we'll call them separately to join the conference
          // This is handled in the initiate route
          if (agent && agent.phone) {
            const agentPhone = validatePhoneNumber(agent.phone);
            if (agentPhone) {
              console.log(`📞 Agent phone available: ${agentPhone} - will be called separately to join conference`);
            }
          } else {
            console.log(`⚠️ Agent ${agentId} has no phone number - agent must join via web interface to conference: ${conferenceName}`);
          }
        }
      } catch (error) {
        console.error('❌ Error in voice response:', error);
        twiml += `\n  <Say voice="alice">We're sorry, we're unable to connect you at this time.</Say>`;
      }
    } else {
      // Fallback: automated message (no recording)
      twiml += `\n  <Say voice="alice">Hello, this is a call from your CRM system.</Say>`;
      twiml += `\n  <Say voice="alice">Thank you for your time. Have a great day!</Say>`;
    }
    
    twiml += `\n  <Hangup/>
</Response>`;

    console.log('🎙️ Voice response TwiML:', twiml);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
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
