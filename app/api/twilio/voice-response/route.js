import { NextResponse } from 'next/server';
import { getWebhookUrl, validatePhoneNumber, getClient, normalizePhoneForMatching } from '../../../../lib/twilio';
import sequelizeDb from '../../../../lib/sequelize-db';
import { Op } from 'sequelize';
import NotificationManager from '../../../../lib/notificationService';
import socketManager from '../../../../lib/socket';

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
    
    // For POST requests, also check form data
    let formData = null;
    if (request.method === 'POST') {
      try {
        formData = await request.formData();
        agentId = agentId || formData.get('agentId');
        
        // Get call direction from Twilio
        const direction = formData.get('Direction'); // 'inbound' or 'outbound-dial'
        const callerNumber = formData.get('From');
        const calledNumber = formData.get('To');
        
        // If this is an inbound call (no agentId and direction is inbound)
        if (!agentId && (direction === 'inbound' || (!direction && callerNumber && calledNumber))) {
          return await handleInboundCall(formData, callerNumber, calledNumber);
        }
      } catch (e) {
        console.error('Error parsing form data:', e);
      }
    }
    
    // Call recording is DISABLED - no calls will be recorded
    const recordingEnabled = false;
    
    
    let twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>`;
    
    if (agentId) {
      try {
        console.log(`📞 Voice response - Looking for agent ID: ${agentId}`);
        
        // Get agent information
        const agent = await sequelizeDb.User.findByPk(parseInt(agentId), {
          attributes: ['id', 'firstName', 'lastName', 'phone']
        });
        
        console.log(`📞 Agent lookup result:`, {
          found: !!agent,
          agentId: agent?.id,
          name: agent ? `${agent.firstName} ${agent.lastName}` : 'N/A'
        });
        
        // Use conference for Voice SDK (agent joins via browser)
        const conferenceName = `call-${agentId}`;
        console.log(`📞 Routing to conference: ${conferenceName}`);
        
        // Place customer in conference room
        // Agent should already be connected via Voice SDK (connected immediately when call initiated)
        // Recording is DISABLED
        // Optimize for immediate connection - no waitUrl, no beep, connect instantly
        // answerOnMedia="false" = connect immediately when answered, don't wait for media
        // startConferenceOnEnter="true" = conference already started by agent (first participant)
        twiml += `\n  <Dial record="false" timeout="30" timeLimit="3600" answerOnMedia="false" hangupOnStar="false">`;
        twiml += `\n    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" waitUrl="" waitMethod="POST" maxParticipants="2" muted="false" trim="do-not-trim">${conferenceName}</Conference>`;
        twiml += `\n  </Dial>`;
        
        // If agent has phone, we could call them separately to join the conference
        // But with Voice SDK, agent joins via browser, so this is optional
        if (agent && agent.phone) {
          const agentPhone = validatePhoneNumber(agent.phone);
          if (agentPhone) {
            console.log(`📞 Agent phone available: ${agentPhone} - can be called separately if needed`);
          }
        } else {
          console.log(`📞 Agent ${agentId} will join via Voice SDK to conference: ${conferenceName}`);
        }
        // No Hangup here - let the call continue in the conference
      } catch (error) {
        console.error('❌ Error in voice response:', error);
        twiml += `\n  <Say voice="alice">We're sorry, we're unable to connect you at this time.</Say>`;
        twiml += `\n  <Hangup/>`;
      }
    } else {
      // Fallback: automated message (no recording)
      twiml += `\n  <Say voice="alice">Hello, this is a call from your CRM system.</Say>`;
      twiml += `\n  <Say voice="alice">Thank you for your time. Have a great day!</Say>`;
      twiml += `\n  <Hangup/>`;
    }
    
    twiml += `\n</Response>`;

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

async function handleInboundCall(formData, callerNumber, calledNumber) {
  try {
    const callSid = formData.get('CallSid');
    console.log('📞 Inbound call received:', {
      callSid,
      callerNumber,
      calledNumber,
      timestamp: new Date().toISOString()
    });

    // Create unique conference name for this inbound call
    // Use callSid to ensure uniqueness
    const conferenceName = `inbound-${callSid.substring(0, 20)}`;
    console.log(`📞 Created conference for inbound call: ${conferenceName}`);

    // Try to find customer by phone number
    let customerId = null;
    let customer = null;
    let lastSaleAgentId = null;
    let lastSaleAgent = null;
    let lastSaleId = null;
    let lastSale = null;
    
    try {
      // Normalize phone number for search (remove +1 prefix for US numbers)
      const normalizedCallerNumber = normalizePhoneForMatching(callerNumber);
      console.log(`🔍 Searching for customer with normalized number: ${normalizedCallerNumber} (original: ${callerNumber})`);
      
      if (normalizedCallerNumber) {
        // Search using normalized number - need to normalize database values too
        // Get all customers and filter in memory to handle normalization
        const allCustomers = await sequelizeDb.Customer.findAll({
          attributes: ['id', 'firstName', 'lastName', 'phone', 'landline']
        });
        
        // Find customer by matching normalized phone numbers
        customer = allCustomers.find(c => {
          const normalizedPhone = normalizePhoneForMatching(c.phone);
          const normalizedLandline = normalizePhoneForMatching(c.landline);
          const phoneMatch = normalizedPhone && normalizedPhone === normalizedCallerNumber;
          const landlineMatch = normalizedLandline && normalizedLandline === normalizedCallerNumber;
          
          if (phoneMatch || landlineMatch) {
            console.log(`✅ Found customer match: ID ${c.id}, Phone: ${c.phone}, Landline: ${c.landline}`);
          }
          
          return phoneMatch || landlineMatch;
        });
      } else {
        console.log(`⚠️ Could not normalize caller number: ${callerNumber}`);
      }
      
      if (customer) {
        customerId = customer.id;
        console.log(`✅ Matched inbound call to customer ID: ${customerId} (${customer.firstName} ${customer.lastName})`);
        
        // Find the last sale for this customer to get the agent and sale ID
        lastSale = await sequelizeDb.Sale.findOne({
          where: {
            customerId: customerId
          },
          order: [['created_at', 'DESC']],
          include: [
            {
              model: sequelizeDb.User,
              as: 'agent',
              attributes: ['id', 'firstName', 'lastName', 'email', 'callStatus', 'isActive']
            }
          ]
        });
        
        if (lastSale) {
          lastSaleId = lastSale.id;
          if (lastSale.agent) {
            lastSaleAgentId = lastSale.agent.id;
            lastSaleAgent = lastSale.agent;
            console.log(`✅ Found last sale: ID ${lastSaleId}, Agent: ${lastSaleAgent.firstName} ${lastSaleAgent.lastName} (ID: ${lastSaleAgentId}, Status: ${lastSaleAgent.callStatus})`);
          }
        }
      } else {
        console.log(`ℹ️ No customer found for caller number: ${callerNumber}`);
      }
    } catch (err) {
      console.warn('⚠️ Error matching caller to customer:', err.message);
    }

    // Get all admin users
    const admins = await NotificationManager.getAdmins();
    console.log(`📧 Found ${admins.length} admin(s) to notify`);

    // Prepare notification data - only use first name, not last name
    const customerName = customer 
      ? customer.firstName 
      : `Unknown (${callerNumber})`;
    
    const notificationTitle = '📞 Inbound Call Received';
    
    // Build notification message with last sale info if available
    let notificationMessage = `Inbound call from ${callerNumber}`;
    
    if (customerId && customer) {
      // Add customer first name and last sale date if last sale exists
      if (lastSale) {
        const lastSaleDate = lastSale.created_at 
          ? new Date(lastSale.created_at).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            })
          : null;
        
        if (lastSaleDate) {
          notificationMessage = `Inbound call from ${callerNumber} - ${customerName} (Last sale: ${lastSaleDate})`;
        } else {
          notificationMessage = `Inbound call from ${callerNumber} - ${customerName}`;
        }
      } else {
        notificationMessage = `Inbound call from ${callerNumber} - ${customerName}`;
      }
    }

    // Always notify all admins with conference name and last sale link
    const adminNotifications = [];
    for (const admin of admins) {
      try {
        const notification = await NotificationManager.notifyUser(admin.id, {
          type: 'custom',
          title: notificationTitle,
          message: notificationMessage,
          isRead: false,
          relatedId: customerId || null,
          relatedType: customerId ? 'customer' : 'call',
          route: customerId ? `/customers/${customerId}` : '/customers'
        });
        
        adminNotifications.push(notification);
        
        // Send real-time notification via socket with conference info
        try {
          const socketNotification = {
            id: notification.notification?.id || notification.id,
            userId: admin.id,
            type: 'custom',
            title: notificationTitle,
            message: notificationMessage,
            isRead: false,
            relatedId: customerId || null,
            relatedType: customerId ? 'customer' : 'call',
            route: customerId ? `/customers/${customerId}` : '/customers',
            conferenceName: conferenceName, // Include conference name for joining
            callSid: callSid,
            callerNumber: callerNumber,
            customerId: customerId,
            customerName: customer ? customer.firstName : customerName, // Only first name
            lastSaleId: lastSaleId, // Include last sale ID for link
            createdAt: new Date(),
            time: new Date()
          };
          socketManager.sendNotificationToUser(admin.id, socketNotification);
        } catch (socketError) {
          console.warn('⚠️ Could not send socket notification to admin:', socketError.message);
        }
      } catch (notifyError) {
        console.error(`❌ Failed to notify admin ${admin.id}:`, notifyError);
      }
    }

    // Check if last sale agent is available
    // Also check if agent is already an admin to avoid duplicate notifications
    let agentAvailable = false;
    if (lastSaleAgentId && lastSaleAgent) {
      // Check if agent is available (not busy and active)
      agentAvailable = lastSaleAgent.callStatus === 'available' && lastSaleAgent.isActive;
      
      // Check if agent is already in admins list to avoid duplicate notification
      const isAgentAlsoAdmin = admins.some(admin => admin.id === lastSaleAgentId);
      
      if (agentAvailable && !isAgentAlsoAdmin) {
        console.log(`✅ Last sale agent is available, notifying agent ${lastSaleAgentId}`);
        
        // Notify the last sale agent with conference name and last sale link
        try {
          // Build agent notification message with last sale date (only first name, no last name)
          const agentCustomerName = customer ? customer.firstName : `Unknown (${callerNumber})`;
          let agentMessage = `Inbound call from ${callerNumber} - ${agentCustomerName}`;
          if (lastSale && lastSale.created_at) {
            const lastSaleDate = new Date(lastSale.created_at).toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'short', 
              day: 'numeric' 
            });
            agentMessage = `Inbound call from ${callerNumber} - ${agentCustomerName} (Last sale: ${lastSaleDate})`;
          }
          
          const agentNotification = await NotificationManager.notifyUser(lastSaleAgentId, {
            type: 'custom',
            title: notificationTitle,
            message: agentMessage,
            isRead: false,
            relatedId: customerId,
            relatedType: 'customer',
            route: `/customers/${customerId}`
          });
          
          // Send real-time notification via socket with conference info
          try {
            const socketNotification = {
              id: agentNotification.notification?.id || agentNotification.id,
              userId: lastSaleAgentId,
              type: 'custom',
              title: notificationTitle,
              message: agentMessage,
              isRead: false,
              relatedId: customerId,
              relatedType: 'customer',
              route: `/customers/${customerId}`,
              conferenceName: conferenceName, // Include conference name for joining
              callSid: callSid,
              callerNumber: callerNumber,
              customerId: customerId,
              customerName: agentCustomerName,
              lastSaleId: lastSaleId, // Include last sale ID for link
              createdAt: new Date(),
              time: new Date()
            };
            socketManager.sendNotificationToUser(lastSaleAgentId, socketNotification);
          } catch (socketError) {
            console.warn('⚠️ Could not send socket notification to agent:', socketError.message);
          }
        } catch (notifyError) {
          console.error(`❌ Failed to notify agent ${lastSaleAgentId}:`, notifyError);
        }
      } else if (isAgentAlsoAdmin) {
        console.log(`ℹ️ Last sale agent ${lastSaleAgentId} is also an admin, already notified`);
      } else {
        console.log(`⚠️ Last sale agent ${lastSaleAgentId} is not available (Status: ${lastSaleAgent.callStatus}, Active: ${lastSaleAgent.isActive})`);
      }
    }

    // Create call log entry for inbound call
    let callLog = null;
    try {
      callLog = await sequelizeDb.CallLog.create({
        callSid: callSid,
        customerId: customerId,
        agentId: lastSaleAgentId || null, // Set to last sale agent if found, otherwise null
        direction: 'inbound',
        fromNumber: callerNumber,
        toNumber: calledNumber,
        status: 'ringing',
        callPurpose: 'support', // Default purpose for inbound calls
        twilioData: {
          conferenceName: conferenceName // Store conference name in call log
        }
      });
      console.log(`✅ Call log created for inbound call: ${callLog.id}`);
    } catch (logError) {
      console.error('❌ Failed to create call log:', logError);
    }

    // Generate TwiML to place caller in conference
    // Allow up to 5 participants (caller + multiple agents/admins)
    // startConferenceOnEnter="true" means conference starts when caller enters
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling. Please hold while we connect you with an agent.</Say>
  <Dial record="false" timeout="60" timeLimit="3600" answerOnMedia="false" hangupOnStar="false">
    <Conference startConferenceOnEnter="true" endConferenceOnExit="false" beep="false" waitUrl="" waitMethod="POST" maxParticipants="5" muted="false" trim="do-not-trim">${conferenceName}</Conference>
  </Dial>
</Response>`;

    console.log('📞 Inbound call handled:', {
      callSid,
      conferenceName,
      customerId,
      customerName,
      lastSaleId,
      lastSaleAgentId,
      agentAvailable,
      adminsNotified: admins.length,
      agentNotified: agentAvailable ? 1 : 0
    });

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });

  } catch (error) {
    console.error('❌ Error handling inbound call:', error);
    
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
