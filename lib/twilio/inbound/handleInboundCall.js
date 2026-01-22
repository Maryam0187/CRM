import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { getWebhookUrl, normalizePhoneForMatching } from '../../twilio';
import sequelizeDb from '../../sequelize-db';
import NotificationManager from '../../notificationService';
import socketManager from '../../socket';

/**
 * Inbound call handling is intentionally isolated from outbound to avoid regressions.
 * This generates TwiML that places the caller into an inbound conference and notifies agents/admins.
 *
 * NOTE: Inbound callbacks are sent to `/api/twilio/inbound/call-status-callback` so inbound changes do not
 * affect outbound call status logic.
 */
export async function handleInboundCall(formData, callerNumber, calledNumber) {
  try {
    const callSid = formData.get('CallSid');

    // Create unique conference name for this inbound call (stable + unique)
    const conferenceName = `inbound-${callSid.substring(0, 20)}`;

    // Try to find customer by phone number
    let customerId = null;
    let customer = null;
    let lastSaleAgentId = null;
    let lastSaleAgent = null;
    let lastSaleId = null;
    let lastSale = null;

    try {
      const normalizedCallerNumber = normalizePhoneForMatching(callerNumber);

      if (normalizedCallerNumber) {
        const allCustomers = await sequelizeDb.Customer.findAll({
          attributes: ['id', 'firstName', 'lastName', 'phone', 'landline']
        });

        customer = allCustomers.find(c => {
          const normalizedPhone = normalizePhoneForMatching(c.phone);
          const normalizedLandline = normalizePhoneForMatching(c.landline);
          return (normalizedPhone && normalizedPhone === normalizedCallerNumber) ||
                 (normalizedLandline && normalizedLandline === normalizedCallerNumber);
        });
      }

      if (customer) {
        customerId = customer.id;
        lastSale = await sequelizeDb.Sale.findOne({
          where: { customerId },
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
          }
        }
      }
    } catch {
      // Inbound matching is best-effort; don't fail the call if matching fails.
    }

    // Get all admin users
    const admins = await NotificationManager.getAdmins();

    // Prepare notification data - only use first name
    const customerName = customer ? customer.firstName : `Unknown (${callerNumber})`;
    const notificationTitle = '📞 Inbound Call Received';
    const notificationMessage =
      customerId && customer ? `Inbound call from ${customerName}` : `Inbound call from ${callerNumber}`;

    // Notify all admins
    for (const admin of admins) {
      try {
        const notification = await NotificationManager.notifyUser(admin.id, {
          type: 'inbound_call',
          title: notificationTitle,
          message: notificationMessage,
          isRead: false,
          relatedId: lastSaleId || customerId || null,
          relatedType: lastSaleId ? 'sale' : (customerId ? 'customer' : 'call'),
          route: customerId ? `/customers/${customerId}` : '/customers'
        });

        // Real-time notification via socket with conference info
        try {
          const socketNotification = {
            id: notification.notification?.id || notification.id,
            userId: admin.id,
            type: 'inbound_call',
            title: notificationTitle,
            message: notificationMessage,
            isRead: false,
            relatedId: lastSaleId || customerId || null,
            relatedType: lastSaleId ? 'sale' : (customerId ? 'customer' : 'call'),
            route: customerId ? `/customers/${customerId}` : '/customers',
            conferenceName,
            callSid,
            callerNumber,
            customerId,
            customerName,
            saleId: lastSaleId || null,
            createdAt: new Date(),
            time: new Date()
          };
          socketManager.sendNotificationToUser(admin.id, socketNotification);
        } catch {
          // ignore socket notification failure
        }
      } catch {
        // ignore per-admin notification failures
      }
    }

    // Notify last sale agent (if available and not already an admin)
    let agentAvailable = false;
    if (lastSaleAgentId && lastSaleAgent) {
      agentAvailable = lastSaleAgent.callStatus === 'available' && lastSaleAgent.isActive;
      const isAgentAlsoAdmin = admins.some(admin => admin.id === lastSaleAgentId);

      if (agentAvailable && !isAgentAlsoAdmin) {
        try {
          const agentCustomerName = customer ? customer.firstName : `Unknown (${callerNumber})`;
          const agentMessage =
            customerId && customer ? `Inbound call from ${agentCustomerName}` : `Inbound call from ${callerNumber}`;

          const agentNotification = await NotificationManager.notifyUser(lastSaleAgentId, {
            type: 'inbound_call',
            title: notificationTitle,
            message: agentMessage,
            isRead: false,
            relatedId: lastSaleId || customerId || null,
            relatedType: lastSaleId ? 'sale' : 'customer',
            route: customerId ? `/customers/${customerId}` : '/customers'
          });

          try {
            const socketNotification = {
              id: agentNotification.notification?.id || agentNotification.id,
              userId: lastSaleAgentId,
              type: 'inbound_call',
              title: notificationTitle,
              message: agentMessage,
              isRead: false,
              relatedId: lastSaleId || customerId || null,
              relatedType: lastSaleId ? 'sale' : (customerId ? 'customer' : 'call'),
              route: customerId ? `/customers/${customerId}` : '/customers',
              conferenceName,
              callSid,
              callerNumber,
              customerId,
              customerName: agentCustomerName,
              saleId: lastSaleId || null,
              createdAt: new Date(),
              time: new Date()
            };
            socketManager.sendNotificationToUser(lastSaleAgentId, socketNotification);
          } catch {
            // ignore socket notification failure
          }
        } catch {
          // ignore agent notification failure
        }
      }
    }

    // Assign agent for inbound call metadata (prefer last sale agent, then available admins, then any active agent)
    let assignedAgentId = lastSaleAgentId;
    if (!assignedAgentId) {
      const availableAdmin = admins.find(admin => admin.isActive && (admin.callStatus === 'available' || !admin.callStatus));
      if (availableAdmin) {
        assignedAgentId = availableAdmin.id;
      } else {
        const fallbackAgent = await sequelizeDb.User.findOne({
          where: {
            isActive: true,
            role: { [Op.in]: ['agent', 'supervisor', 'admin'] }
          },
          order: [['id', 'ASC']]
        });
        if (fallbackAgent) assignedAgentId = fallbackAgent.id;
        else if (admins.length > 0) assignedAgentId = admins[0].id;
      }
    }

    // Inbound status callback endpoint (separate from outbound)
    const statusCallbackBaseUrl = getWebhookUrl('/api/twilio/inbound/call-status-callback');
    const statusCallbackUrl = new URL(statusCallbackBaseUrl);
    statusCallbackUrl.searchParams.set('direction', 'inbound');
    if (assignedAgentId) statusCallbackUrl.searchParams.set('agentId', assignedAgentId.toString());
    if (customerId) statusCallbackUrl.searchParams.set('customerId', customerId.toString());
    if (lastSaleId) statusCallbackUrl.searchParams.set('saleId', lastSaleId.toString());
    statusCallbackUrl.searchParams.set('callPurpose', 'support');

    // Conference callback endpoint (separate from outbound)
    const conferenceCallbackUrl = getWebhookUrl('/api/twilio/inbound/call-status-callback');

    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling. Please hold while we connect you with an agent.</Say>
  <Dial record="false" timeout="300" timeLimit="3600" answerOnMedia="false" hangupOnStar="false" statusCallback="${statusCallbackUrl.toString()}" statusCallbackEvent="initiated ringing answered completed">
    <Conference startConferenceOnEnter="false" endConferenceOnExit="false" beep="false" maxParticipants="5" muted="false" statusCallback="${conferenceCallbackUrl}" statusCallbackMethod="POST" statusCallbackEvent="start end join leave mute hold speaker">${conferenceName}</Conference>
  </Dial>
</Response>`;

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
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


