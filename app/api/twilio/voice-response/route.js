import { NextResponse } from 'next/server';
import { getWebhookUrl, validatePhoneNumber } from '../../../../lib/twilio';
import sequelizeDb from '../../../../lib/sequelize-db';
import { handleInboundCall } from '../../../../lib/twilio/inbound/handleInboundCall';
import socketManager from '../../../../lib/socket';
import { Op } from 'sequelize';

// Handle both GET and POST requests (Twilio can use either)
export async function GET(request) {
  console.log('📞 [TwiML voice-response] GET request (customer-leg TwiML)');
  console.log('📞 GET request URL:', request.url);
  console.log('📞 GET request headers:', Object.fromEntries(request.headers.entries()));
  return handleVoiceResponse(request);
}

export async function POST(request) {
  console.log('📞 [TwiML voice-response] POST request (customer-leg TwiML)');
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
      console.log('📞 [TwiML voice-response] request received:', {
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

        // If agentId is still missing, try to infer it from a conference name like `call-<agentId><timestamp>`.
        // This prevents falling into the "Thank you..." fallback when Twilio hits this webhook
        // without our query params (or when proxies strip them).
        // Note: With new format call-<agentId><timestamp>, we can't extract agentId from conference name alone,
        // so we rely on query params. This is just a fallback for old format compatibility.
        if (!agentId) {
          const confRaw = conferenceNameFromUrl || formData.get('conferenceName') || formData.get('conference') || '';
          const toRaw = formData.get('To') || '';
          const candidates = [String(confRaw), String(toRaw)].filter(Boolean);
          for (const c of candidates) {
            // Match old format: call-<agentId> (for backward compatibility)
            const m = c.match(/^call-(\d+)$/);
            if (m) {
              agentId = m[1];
              break;
            }
            // Note: New format call-<agentId><timestamp> requires agentId from query params
            // We can't extract agentId from conference name alone in new format
          }
        }
        
        // Get call direction and identifiers from Twilio
        const direction = formData.get('Direction'); // 'inbound' or 'outbound-dial'
        const callerNumber = formData.get('From');
        const calledNumber = formData.get('To');
        const callSid = formData.get('CallSid'); // This is the CallSid for THIS leg
        
        console.log('📞 [TwiML voice-response] form data parsed:', {
          agentIdFromForm,
          finalAgentId: agentId,
          direction,
          from: callerNumber,
          to: calledNumber,
          callSid: callSid
        });
        
        // CRITICAL: Detect if this is an AGENT leg (from Voice SDK browser)
        // Agent connections have From = "client:agent-<id>" or similar client: prefix
        const isAgentLeg = callerNumber && String(callerNumber).startsWith('client:');
        
        console.log('🔍 [AGENT LEG CHECK] Checking if this is agent leg:', {
          from: callerNumber,
          isAgentLeg,
          callSid: callSid?.substring(0, 15) + '...',
          startsWithClient: callerNumber ? String(callerNumber).startsWith('client:') : false
        });
        
        if (isAgentLeg && callSid) {
          // This is the agent connecting via Voice SDK
          // Extract conference name from "To" field (e.g., "call-1" or "inbound-xxx")
          const confName = calledNumber && (String(calledNumber).startsWith('call-') || String(calledNumber).startsWith('inbound-'))
            ? String(calledNumber).trim()
            : (conferenceNameFromUrl || (agentId ? `call-${agentId}` : null));
          
          if (confName) {
            console.log('🔑 [AGENT LEG DETECTED] Capturing agent CallSid on backend:', {
              agentCallSid: callSid,
              conferenceName: confName,
              from: callerNumber,
              to: calledNumber,
              agentId: agentId
            });
            
            // CRITICAL: Save agent_call_sid to the call log immediately
            // This happens BEFORE conference join, so we have the agent CallSid early
            let customerSid = null;
            try {
              // Find the call log by conference name
              const callLog = await sequelizeDb.CallLog.findOne({
                where: { conferenceName: confName },
                order: [['created_at', 'DESC']]
              });
              
              if (callLog) {
                customerSid = callLog.customerCallSid;
                await callLog.update({ agentCallSid: callSid });
                console.log('💾 [AGENT SID SAVED] Agent CallSid saved to call log:', {
                  callLogId: callLog.id,
                  agentCallSid: callSid,
                  customerCallSid: customerSid,
                  conferenceName: confName
                });
              } else {
                console.log('⚠️ [AGENT SID] No call log found to update (call might not be initiated yet)');
              }
            } catch (dbErr) {
              console.error('❌ [AGENT SID] Failed to save agent CallSid to DB:', dbErr.message);
            }
            
            // Broadcast to frontend via socket so UI can update immediately
            try {
              socketManager.sendConferenceEvent(confName, {
                event: 'agent_sid_captured',
                conferenceName: confName,
                agentCallSid: callSid,
                customerCallSid: customerSid,
                agentId: agentId ? parseInt(agentId, 10) : null,
                from: callerNumber,
                timestamp: new Date().toISOString()
              });
            } catch (socketErr) {
              console.warn('⚠️ Could not broadcast agent SID via socket:', socketErr);
            }
            
            // For agent legs (Voice SDK), return TwiML to join conference
            // Voice SDK requires Dial wrapper even for direct conference connections
            const safeConfName = confName.replace(/[<>&"']/g, '');
            const isInboundConf = safeConfName.startsWith('inbound-');
            const confCallbackUrl = getWebhookUrl(
              isInboundConf
                ? '/api/twilio/inbound/call-status-callback'
                : '/api/twilio/call-status-callback'
            );
            
            // Agent leg: Use Dial with Conference (required for Voice SDK)
            // answerOnBridge not needed here since agent is already connected via WebRTC
            const agentTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="false" timeout="30" timeLimit="3600" hangupOnStar="false">
    <Conference 
      startConferenceOnEnter="false" 
      endConferenceOnExit="true" 
      maxParticipants="10" 
      statusCallback="${confCallbackUrl}" 
      statusCallbackMethod="POST" 
      statusCallbackEvent="start end join leave mute hold speaker"
    >${safeConfName}</Conference>
  </Dial>
</Response>`;
            
            console.log('📞 [AGENT LEG] Returning TwiML for agent to join conference');
            return new NextResponse(agentTwiml, {
              headers: { 
                'Content-Type': 'text/xml',
                'Cache-Control': 'no-cache'
              }
            });
          }
        }
        
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

    // Also try inference from URL params if agentId is still missing (GET requests / stripped form fields).
    if (!agentId) {
      const conf = conferenceNameFromUrl ? String(conferenceNameFromUrl).trim() : '';
      const m = conf.match(/^call-(\d+)$/);
      if (m) agentId = m[1];
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

        // answerOnBridge="false" - Don't answer call until customer actually picks up
        // This prevents customer leg from entering conference during ringing phase
        // answerOnMedia="false" - Don't play any audio/media during ringing phase
        // startConferenceOnEnter="true" - Start conference when first participant enters
        // Since customer only enters after answering (due to answerOnBridge="false"),
        // conference will start when customer answers, not during ringing
        twiml += `\n  <Dial record="false" timeout="30" timeLimit="3600" answerOnBridge="false"  hangupOnStar="false">`;
        twiml += `\n    <Conference 
        startConferenceOnEnter="true" 
        endConferenceOnExit="true" 
        maxParticipants="10" 
        statusCallback="${conferenceCallbackUrl}" 
        statusCallbackMethod="POST" 
        statusCallbackEvent="start end join leave mute hold speaker"
        >${safeConferenceName}</Conference>`;
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
