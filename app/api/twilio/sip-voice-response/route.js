import { NextResponse } from 'next/server';
import sequelizeDb from '../../../../lib/sequelize-db';

// Handle SIP inbound calls and route to agent extensions
export async function GET(request) {
  return handleSipVoiceResponse(request);
}

export async function POST(request) {
  return handleSipVoiceResponse(request);
}

async function handleSipVoiceResponse(request) {
  try {
    const url = new URL(request.url);
    let agentId = url.searchParams.get('agentId');
    let extension = url.searchParams.get('extension');
    
    // Try to get from POST data
    if (!agentId && request.method === 'POST') {
      try {
        const formData = await request.formData();
        agentId = formData.get('agentId') || formData.get('AgentId');
        extension = formData.get('extension') || formData.get('Extension');
      } catch (e) {
        // Ignore
      }
    }
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    // If we have agentId, route to that agent's extension
    if (agentId) {
      try {
        console.log(`📞 SIP Voice response - Looking for agent ID: ${agentId}`);
        
        // Get agent with SIP extension
        const agent = await sequelizeDb.User.findByPk(parseInt(agentId), {
          attributes: ['id', 'firstName', 'lastName', 'extension', 'sipUsername', 'sipDomain', 'callStatus']
        });
        
        if (!agent) {
          throw new Error('Agent not found');
        }
        
        // Check if agent has SIP extension
        if (!agent.extension || !agent.sipUsername) {
          throw new Error('Agent does not have SIP extension configured');
        }
        
        // Get SIP domain
        const sipDomain = agent.sipDomain || process.env.TWILIO_SIP_DOMAIN || process.env.TWILIO_SIP_DEFAULT_DOMAIN;
        if (!sipDomain) {
          throw new Error('SIP domain not configured');
        }
        
        // Build SIP URI
        const agentSipUri = `sip:${agent.sipUsername}@${sipDomain}`;
        
        console.log(`📞 Routing to agent extension: ${agent.extension} (${agentSipUri})`);
        
        // Dial agent via SIP Domain
        twiml += `\n  <Dial timeout="30" timeLimit="3600" answerOnMedia="false" record="false">`;
        twiml += `\n    <Sip>${agentSipUri}</Sip>`;
        twiml += `\n  </Dial>`;
        
      } catch (error) {
        console.error('❌ Error in SIP voice response:', error);
        twiml += `\n  <Say voice="alice">We're sorry, we're unable to connect you at this time.</Say>`;
      }
    } 
    // If we have extension directly, route to that extension
    else if (extension) {
      try {
        console.log(`📞 SIP Voice response - Routing to extension: ${extension}`);
        
        // Get SIP domain from environment
        const sipDomain = process.env.TWILIO_SIP_DOMAIN || process.env.TWILIO_SIP_DEFAULT_DOMAIN;
        if (!sipDomain) {
          throw new Error('SIP domain not configured');
        }
        
        // Build SIP URI
        const extensionSipUri = `sip:${extension}@${sipDomain}`;
        
        console.log(`📞 Routing to extension: ${extensionSipUri}`);
        
        // Dial extension via SIP Domain
        twiml += `\n  <Dial timeout="30" timeLimit="3600" answerOnMedia="false" record="false">`;
        twiml += `\n    <Sip>${extensionSipUri}</Sip>`;
        twiml += `\n  </Dial>`;
        
      } catch (error) {
        console.error('❌ Error in SIP voice response:', error);
        twiml += `\n  <Say voice="alice">We're sorry, we're unable to connect you at this time.</Say>`;
      }
    } 
    // Fallback: route to available agent or queue
    else {
      try {
        console.log(`📞 SIP Voice response - No agent specified, finding available agent`);
        
        // Find available agent (simple round-robin or longest-idle)
        const availableAgent = await sequelizeDb.User.findOne({
          where: {
            callStatus: 'available',
            extension: { [sequelizeDb.Sequelize.Op.ne]: null }
          },
          order: [['last_call_time', 'ASC NULLS FIRST']], // Longest idle first
          attributes: ['id', 'extension', 'sipUsername', 'sipDomain']
        });
        
        if (availableAgent) {
          const sipDomain = availableAgent.sipDomain || process.env.TWILIO_SIP_DOMAIN || process.env.TWILIO_SIP_DEFAULT_DOMAIN;
          const agentSipUri = `sip:${availableAgent.sipUsername}@${sipDomain}`;
          
          console.log(`📞 Routing to available agent: ${availableAgent.extension} (${agentSipUri})`);
          
          twiml += `\n  <Dial timeout="30" timeLimit="3600" answerOnMedia="false" record="false">`;
          twiml += `\n    <Sip>${agentSipUri}</Sip>`;
          twiml += `\n  </Dial>`;
        } else {
          // No available agents
          twiml += `\n  <Say voice="alice">We're sorry, all agents are currently busy. Please try again later.</Say>`;
        }
      } catch (error) {
        console.error('❌ Error finding available agent:', error);
        twiml += `\n  <Say voice="alice">We're sorry, we're unable to connect you at this time.</Say>`;
      }
    }
    
    twiml += `\n  <Hangup/>
</Response>`;

    console.log('🎙️ SIP Voice response TwiML:', twiml);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('🎙️ Error in SIP voice response:', error);
    
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

