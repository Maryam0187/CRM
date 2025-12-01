import { NextResponse } from 'next/server';
import { getClient, validatePhoneNumber, getWebhookUrl } from '../../../../lib/twilio';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { CallTransfer, CallLog, User } from '../../../../models';

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
    const { callSid, transferTo, transferType = 'blind', agentId } = body;

    if (!callSid) {
      return NextResponse.json(
        { success: false, message: 'Call SID is required' },
        { status: 400 }
      );
    }

    if (!transferTo && !agentId) {
      return NextResponse.json(
        { success: false, message: 'Transfer destination (phone number or agent ID) is required' },
        { status: 400 }
      );
    }

    // Validate transfer type
    if (!['blind', 'warm'].includes(transferType)) {
      return NextResponse.json(
        { success: false, message: 'Transfer type must be "blind" or "warm"' },
        { status: 400 }
      );
    }

    const fromAgentId = authResult.user.id;
    const client = getClient();
    const baseUrl = getWebhookUrl('');

    // Fetch the call to check its current status
    let call;
    try {
      call = await client.calls(callSid).fetch();
      console.log('📞 Current call status:', call.status);
    } catch (fetchErr) {
      console.error('❌ Error fetching call:', fetchErr);
      return NextResponse.json(
        { success: false, message: 'Call not found or inaccessible' },
        { status: 404 }
      );
    }

    // Check if call is in a transferable state
    if (call.status !== 'in-progress' && call.status !== 'ringing') {
      return NextResponse.json(
        { success: false, message: `Call cannot be transferred. Current status: ${call.status}` },
        { status: 400 }
      );
    }

    // Find the call log if it exists
    let callLog = null;
    try {
      callLog = await CallLog.findOne({
        where: { callSid: callSid }
      });
    } catch (err) {
      console.warn('⚠️ Could not find call log:', err.message);
    }

    let toAgentId = null;
    let destinationPhone = null;
    let conferenceSid = null;

    // Determine destination: agent ID or phone number
    if (agentId) {
      // Transfer to agent by user ID
      try {
        const toAgent = await User.findByPk(agentId, {
          attributes: ['id', 'firstName', 'lastName', 'phone']
        });

        if (!toAgent) {
          return NextResponse.json(
            { success: false, message: 'Agent not found' },
            { status: 404 }
          );
        }

        if (!toAgent.phone) {
          return NextResponse.json(
            { success: false, message: 'Agent does not have a phone number configured' },
            { status: 400 }
          );
        }

        toAgentId = toAgent.id;
        destinationPhone = validatePhoneNumber(toAgent.phone);
        
        if (!destinationPhone) {
          return NextResponse.json(
            { success: false, message: 'Agent phone number is invalid' },
            { status: 400 }
          );
        }

        console.log(`📞 Transferring to agent: ${toAgent.firstName} ${toAgent.lastName} (${destinationPhone})`);
      } catch (err) {
        console.error('❌ Error fetching agent:', err);
        return NextResponse.json(
          { success: false, message: 'Failed to fetch agent information' },
          { status: 500 }
        );
      }
    } else {
      // Transfer to phone number
      destinationPhone = validatePhoneNumber(transferTo);
      if (!destinationPhone) {
        return NextResponse.json(
          { success: false, message: 'Invalid phone number format' },
          { status: 400 }
        );
      }
    }

    // Create transfer record
    let transferRecord;
    try {
      transferRecord = await CallTransfer.create({
        callSid: callSid,
        callLogId: callLog?.id || null,
        fromAgentId: fromAgentId,
        toAgentId: toAgentId,
        transferTo: destinationPhone,
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
        const conferenceName = `call-${fromAgentId}`; // Use original agent's conference
        
        // Update transfer record with conference info
        if (transferRecord) {
          await transferRecord.update({
            conferenceSid: conferenceName,
            transferStatus: 'in_progress'
          });
        }

        // Create a call to the destination agent/phone to join the conference
        const warmTransferUrl = `${baseUrl}/api/twilio/warm-transfer-voice?conference=${encodeURIComponent(conferenceName)}`;
        
        const transferredCall = await client.calls.create({
          to: destinationPhone,
          from: call.from, // Use the same Twilio number
          url: warmTransferUrl,
          method: 'POST',
          statusCallback: `${baseUrl}/api/twilio/call-status-callback`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          statusCallbackMethod: 'POST'
        });

        console.log('📞 Warm transfer call created:', {
          callSid: transferredCall.sid,
          to: destinationPhone,
          conference: conferenceName
        });

        // Update transfer record with transferred call SID
        if (transferRecord) {
          await transferRecord.update({
            transferredCallSid: transferredCall.sid
          });
        }

        return NextResponse.json({
          success: true,
          data: {
            transferId: transferRecord?.id || null,
            callSid: call.sid,
            transferredCallSid: transferredCall.sid,
            transferType: 'warm',
            transferTo: destinationPhone,
            toAgentId: toAgentId,
            conferenceName: conferenceName,
            message: 'Warm transfer initiated - agent will remain in call'
          }
        });

      } else {
        // Blind transfer: Redirect the call to new destination
        const transferUrl = `${baseUrl}/api/twilio/transfer-voice-response?to=${encodeURIComponent(destinationPhone)}`;
        
        const updatedCall = await client.calls(callSid).update({
          url: transferUrl,
          method: 'POST'
        });

        // Update transfer record
        if (transferRecord) {
          await transferRecord.update({
            transferStatus: 'in_progress'
          });
        }

        console.log('📞 Blind transfer completed:', {
          callSid: updatedCall.sid,
          status: updatedCall.status,
          transferTo: destinationPhone
        });

        return NextResponse.json({
          success: true,
          data: {
            transferId: transferRecord?.id || null,
            callSid: updatedCall.sid,
            status: updatedCall.status,
            transferType: 'blind',
            transferTo: destinationPhone,
            toAgentId: toAgentId,
            message: 'Blind transfer initiated - call redirected to destination'
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
