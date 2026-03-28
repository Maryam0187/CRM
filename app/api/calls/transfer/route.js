import { NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { CallTransfer, CallLog, User, Customer } from '../../../../models';
import socketManager from '../../../../lib/socket';

export async function POST(request) {
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const body = await request.json();
    const { callSid, transferTo, transferType = 'warm', agentId, conferenceName: requestedConferenceName } = body;

    if (!callSid) {
      return NextResponse.json(
        { success: false, message: 'Call SID is required' },
        { status: 400 }
      );
    }

    if (!agentId) {
      return NextResponse.json(
        { success: false, message: 'Internal destination agent ID is required' },
        { status: 400 }
      );
    }

    // Enforce internal warm add-participant flow only
    if (transferTo) {
      return NextResponse.json(
        { success: false, message: 'External phone transfer is not allowed for this action' },
        { status: 400 }
      );
    }

    if (transferType !== 'warm') {
      return NextResponse.json(
        { success: false, message: 'Only warm transfer is allowed for add participant' },
        { status: 400 }
      );
    }

    const fromAgentId = authResult.user.id;

    // Find the call log if it exists (match primary, customer, or agent leg SID; then conference name)
    let callLog = null;
    try {
      callLog = await CallLog.findOne({
        where: {
          [Op.or]: [
            { callSid },
            { customerCallSid: callSid },
            { agentCallSid: callSid }
          ]
        },
        order: [['created_at', 'DESC']]
      });
      if (!callLog && requestedConferenceName) {
        callLog = await CallLog.findOne({
          where: { conferenceName: requestedConferenceName },
          order: [['created_at', 'DESC']]
        });
      }
    } catch (err) {
      console.warn('⚠️ Could not find call log:', err.message);
    }

    let toAgentId = null;
    let conferenceSid = null;

    // Determine destination: internal agent only
    try {
      const toAgent = await User.findByPk(agentId, {
        attributes: ['id', 'firstName', 'lastName']
      });

      if (!toAgent) {
        return NextResponse.json(
          { success: false, message: 'Agent not found' },
          { status: 404 }
        );
      }

      toAgentId = toAgent.id;
      console.log(`📞 Inviting internal agent: ${toAgent.firstName} ${toAgent.lastName}`);
    } catch (err) {
      console.error('❌ Error fetching agent:', err);
      return NextResponse.json(
        { success: false, message: 'Failed to fetch agent information' },
        { status: 500 }
      );
    }

    // Create transfer record
    let transferRecord;
    try {
      transferRecord = await CallTransfer.create({
        callSid: callSid,
        callLogId: callLog?.id || null,
        fromAgentId: fromAgentId,
        toAgentId: toAgentId,
        transferTo: null,
        transferType: transferType,
        transferStatus: 'initiated'
      });
    } catch (err) {
      console.error('❌ Error creating transfer record:', err);
      // Continue even if record creation fails
    }

    try {
      if (transferType === 'warm') {
        // Warm transfer: Add new participant to existing conference
        // First, get the conference name from the call
        // The conference name is typically: call-{agentId}
        // We need to find the original agent's conference
        
        // Try to get conference from call's parent call SID or conference
        // For warm transfer, we'll create a new conference or use existing one
        // The original call should be in a conference already
        
        // Get the conference name from the call's context
        // Since calls use conference name like "call-{agentId}", we can extract it
        // Or we can create a new conference for the transfer
        
        // For simplicity, we'll dial the new agent into the same conference
        // The conference name should be available from the original call setup
        // Let's use a pattern: if we know the original agent, use their conference
        
        // Create a call to the destination that joins the conference
        const conferenceName = requestedConferenceName || callLog?.conferenceName || `call-${fromAgentId}`;
        
        // Update transfer record with conference info
        if (transferRecord) {
          await transferRecord.update({
            conferenceSid: conferenceName,
            transferStatus: 'in_progress'
          });
        }

        const [fromAgentUser, hostAgentUser] = await Promise.all([
          User.findByPk(fromAgentId, { attributes: ['id', 'firstName', 'lastName', 'email'] }),
          callLog?.agentId
            ? User.findByPk(callLog.agentId, { attributes: ['id', 'firstName', 'lastName', 'email'] })
            : Promise.resolve(null)
        ]);

        const invitedByName = fromAgentUser
          ? [fromAgentUser.firstName, fromAgentUser.lastName].filter(Boolean).join(' ').trim() ||
            fromAgentUser.email ||
            `Agent #${fromAgentId}`
          : `Agent #${fromAgentId}`;

        let customerPhone = null;
        if (callLog) {
          customerPhone =
            callLog.direction === 'inbound' ? callLog.fromNumber : callLog.toNumber;
        }

        // Match live UI: name often comes from CRM customer, not call_logs.customer_name
        let resolvedCustomerName = callLog?.customerName || null;
        if (!resolvedCustomerName && callLog?.customerId) {
          try {
            const crmCustomer = await Customer.findByPk(callLog.customerId, {
              attributes: ['id', 'firstName', 'lastName', 'company', 'phone', 'landline']
            });
            if (crmCustomer) {
              const full = [crmCustomer.firstName, crmCustomer.lastName]
                .filter(Boolean)
                .join(' ')
                .trim();
              resolvedCustomerName =
                full || crmCustomer.company || crmCustomer.phone || crmCustomer.landline || null;
            }
          } catch (e) {
            console.warn('⚠️ Could not load customer for invite name:', e.message);
          }
        }
        if (!resolvedCustomerName && customerPhone) {
          resolvedCustomerName = customerPhone;
        }

        /** Snapshot for invitee (Twilio + CRM context we have on the server) */
        const participants = [];
        if (callLog) {
          participants.push({
            role: 'customer',
            displayName: resolvedCustomerName || customerPhone || 'Customer',
            phone: customerPhone || null,
            callSid: callLog.customerCallSid || null,
            customerId: callLog.customerId ?? null,
            saleId: callLog.saleId ?? null,
            status: callLog.status || null,
            muted: null,
            hold: null
          });
          const hostDisplay =
            hostAgentUser &&
            [hostAgentUser.firstName, hostAgentUser.lastName].filter(Boolean).join(' ').trim();
          participants.push({
            role: 'agent',
            displayName: hostDisplay || `Agent #${callLog.agentId}`,
            userId: callLog.agentId,
            callSid: callLog.agentCallSid || null,
            isPrimaryHost: Number(callLog.agentId) === Number(fromAgentId),
            status: 'in-conference',
            muted: null,
            hold: null
          });
        }

        const participantSnapshot = {
          conferenceName,
          conferenceSid: callLog?.conferenceSid || null,
          direction: callLog?.direction || null,
          callLogId: callLog?.id ?? null,
          callStatus: callLog?.status || null,
          fromNumber: callLog?.fromNumber || null,
          toNumber: callLog?.toNumber || null,
          participants,
          invitedByName,
          invitedByAgentId: fromAgentId
        };

        // Agent joins via app only: send in-app invite via socket notification.
        const invitationPayload = {
          id: `call-invite-${callSid}-${toAgentId}-${Date.now()}`,
          type: 'call_participant_invite',
          title: 'Call Invitation',
          message: invitedByName
            ? `${invitedByName} invited you to join a live call.`
            : 'You were invited to join a live call.',
          time: new Date().toISOString(),
          isRead: false,
          callSid,
          conferenceName,
          invitedByAgentId: fromAgentId,
          invitedAgentId: toAgentId,
          customerName: resolvedCustomerName || null,
          customerId: callLog?.customerId ?? null,
          saleId: callLog?.saleId ?? null,
          phoneNumber: customerPhone,
          invitedByName,
          mutedByDefault: true,
          participantSnapshot
        };

        const inviteSent = socketManager.isReady()
          ? socketManager.sendNotificationToUser(toAgentId, invitationPayload)
          : false;

        if (!inviteSent) {
          console.warn('⚠️ Invited agent not connected to app socket:', toAgentId);
        }

        return NextResponse.json({
          success: true,
          data: {
            transferId: transferRecord?.id || null,
            callSid,
            transferType: 'warm',
            toAgentId: toAgentId,
            conferenceName: conferenceName,
            invitedViaApp: true,
            inviteSent,
            participantSnapshot,
            message: 'Warm participant invite sent - invited agent can join from app (muted by default)'
          }
        });
      }
    } catch (updateErr) {
      console.error('❌ Error transferring call:', updateErr);
      
      // Update transfer record with error
      if (transferRecord) {
        await transferRecord.update({
          transferStatus: 'failed',
          errorMessage: updateErr.message
        });
      }
      
      throw new Error(`Failed to transfer call: ${updateErr.message}`);
    }

  } catch (error) {
    console.error('Error transferring call:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Failed to transfer call',
        error: error.message
      },
      { status: 500 }
    );
  }
}
