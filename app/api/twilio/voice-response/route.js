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
        
        // Get agent's phone number
        const agent = await sequelizeDb.User.findByPk(parseInt(agentId), {
          attributes: ['id', 'firstName', 'lastName', 'phone']
        });
        
        console.log(`📞 Agent lookup result:`, {
          found: !!agent,
          agentId: agent?.id,
          name: agent ? `${agent.firstName} ${agent.lastName}` : 'N/A',
          hasPhone: !!agent?.phone,
          phoneValue: agent?.phone || 'N/A'
        });
        
        // Use conference room so agent can join via web or phone
        const conferenceName = `call-${agentId}`;
        console.log(`📞 Placing customer in conference: ${conferenceName}`);
        
        // Place customer in conference room
        // Agent can join via web interface or we'll call their phone separately
        // Recording is DISABLED
        twiml += `\n  <Dial record="false" timeout="30" timeLimit="3600">`;
        twiml += `\n    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="" waitMethod="POST" maxParticipants="2">${conferenceName}</Conference>`;
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
