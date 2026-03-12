import { NextResponse } from 'next/server';
import { getClient, getWebhookUrl, validatePhoneNumber } from '../../../../lib/twilio';
import sequelizeDb from '../../../../lib/sequelize-db';
import { SupervisorAgentService } from '../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import { isSupervisor } from '../../../../lib/roleUtils';
import { Op } from 'sequelize';

export async function POST(request) {
  let phoneNumber = null;
  let formattedNumber = null;
  
  try {
    // Validate JWT token
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const user = authResult.user;
    const body = await request.json();
    
    const {
      customerId,
      saleId,
      agentId = user.id,
      phoneNumber: phoneNum,
      callPurpose = 'follow_up',
      customMessage
    } = body;
    
    phoneNumber = phoneNum;
    
    // Validate required fields
    if (!agentId || !phoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Agent ID and phone number are required' },
        { status: 400 }
      );
    }

    // Get agent information
    const agent = await sequelizeDb.User.findByPk(parseInt(agentId), {
      attributes: ['id', 'firstName', 'lastName']
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, message: 'Agent not found' },
        { status: 404 }
      );
    }

    // Validate and format phone number
    formattedNumber = validatePhoneNumber(phoneNumber);
    if (!formattedNumber) {
      return NextResponse.json(
        { success: false, message: `Invalid phone number format: ${phoneNumber}` },
        { status: 400 }
      );
    }

    // OUTBOUND FLOW:
    // 1. Call customer with TwiML that joins conference
    // 2. Agent joins same conference via Voice SDK
    // 3. Both are connected in the conference

    // Update agent status to busy (agent is starting an outbound attempt)
    await agent.update({ 
      callStatus: 'busy',
      lastCallTime: new Date(),
      totalCalls: (agent.totalCalls || 0) + 1
    });

    const conferenceName = `call-${parseInt(agentId, 10)}`;

    const fromNumber = validatePhoneNumber(process.env.TWILIO_PHONE_NUMBER);
    if (!fromNumber) {
      return NextResponse.json(
        { success: false, message: 'TWILIO_PHONE_NUMBER is not set or invalid' },
        { status: 500 }
      );
    }

    const client = getClient();

    // Status callback for call status updates
    const statusCallbackUrl = new URL(getWebhookUrl('/api/twilio/call-status-callback'));
    statusCallbackUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    statusCallbackUrl.searchParams.set('direction', 'outbound-api');
    statusCallbackUrl.searchParams.set('callPurpose', String(callPurpose));
    statusCallbackUrl.searchParams.set('conferenceName', conferenceName);
    statusCallbackUrl.searchParams.set('customerPhone', formattedNumber);
    if (customerId) statusCallbackUrl.searchParams.set('customerId', String(customerId));
    if (saleId) statusCallbackUrl.searchParams.set('saleId', String(saleId));

    const timeout = parseInt(process.env.TWILIO_OUTBOUND_RING_TIMEOUT || '30', 10);

    // TwiML URL: Customer joins conference directly
    const twimlUrl = new URL(getWebhookUrl('/api/twilio/voice-response'));
    twimlUrl.searchParams.set('agentId', String(parseInt(agentId, 10)));
    twimlUrl.searchParams.set('conferenceName', conferenceName);

    // Place call to customer - they join conference via TwiML
    const call = await client.calls.create({
      to: formattedNumber,
      from: fromNumber,
      url: twimlUrl.toString(),
      method: 'POST',
      timeout,
      statusCallback: statusCallbackUrl.toString(),
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    console.log('📞 [CALL INITIATE]', { callSid: call.sid, conferenceName, to: formattedNumber });

    // Create call log immediately
    try {
      await sequelizeDb.CallLog.create({
        callSid: call.sid,
        customerCallSid: call.sid,
        conferenceName: conferenceName,
        agentId: parseInt(agentId, 10),
        customerId: customerId ? parseInt(customerId, 10) : null,
        saleId: saleId ? parseInt(saleId, 10) : null,
        direction: 'outbound',
        fromNumber: fromNumber,
        toNumber: formattedNumber,
        status: 'queued',
        callPurpose: callPurpose || 'follow_up',
        twilioData: {
          customerCallSid: call.sid,
          conferenceName: conferenceName,
          initiatedAt: new Date().toISOString()
        }
      });
    } catch (dbError) {
      // Log but don't fail the call if DB save fails
      console.error('❌ [CALL INITIATE] Failed to create initial call log:', dbError.message);
    }

    // Return call info for agent
    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        conferenceName,
        to: formattedNumber,
        agentId: parseInt(agentId, 10),
        customerId: customerId || null,
        saleId: saleId || null,
        callPurpose,
        direction: 'outbound',
        message: 'Outbound call started. Agent should join conference via Twilio Voice SDK.'
      },
      message: 'Call initiated successfully'
    });

  } catch (error) {
    console.error('❌ Error initiating call:', error);
    
    const errorCode = error.code;
    const errorMessage = error.message || 'Failed to initiate call';
    const errorStatus = error.status || 500;
    
    let userMessage = errorMessage;
    
    if (errorMessage.includes('Account not allowed to call')) {
      userMessage = `Account not allowed to call ${formattedNumber || phoneNumber}. Please verify the number in Twilio Console.`;
    } else if (errorCode === 21211) {
      userMessage = `Invalid phone number format: ${formattedNumber || phoneNumber}`;
    } else if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
      userMessage = 'Insufficient account balance. Please add credits to your Twilio account.';
    }
    
    return NextResponse.json(
      { 
        success: false, 
        message: userMessage,
        error: errorMessage,
        code: errorCode,
        status: errorStatus
      },
      { status: errorStatus }
    );
  }
}

// Get call history for a customer or agent
export async function GET(request) {
  try {
    const authResult = await requireJWTAuth(request);
    if (authResult.error) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }
    const currentUser = authResult.user;
    const isAdmin = currentUser?.role === 'admin';

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const agentId = searchParams.get('agentId');
    const saleId = searchParams.get('saleId');
    const state = searchParams.get('state');
    const city = searchParams.get('city');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit')) || 50;
    const offset = parseInt(searchParams.get('offset')) || 0;

    const where = {};
    
    if (customerId) where.customerId = customerId;
    if (agentId) where.agentId = agentId;
    if (saleId) where.saleId = saleId;
    if (state && state.trim()) where.state = { [Op.like]: `%${state.trim()}%` };
    if (city && city.trim()) where.city = { [Op.like]: `%${city.trim()}%` };
    if (status && status.trim()) where.status = status.trim();
    if (startDate || endDate) {
      if (startDate && endDate) {
        where.created_at = { [Op.between]: [new Date(startDate + 'T00:00:00.000Z'), new Date(endDate + 'T23:59:59.999Z')] };
      } else if (startDate) {
        where.created_at = { [Op.gte]: new Date(startDate + 'T00:00:00.000Z') };
      } else {
        where.created_at = { [Op.lte]: new Date(endDate + 'T23:59:59.999Z') };
      }
    }

    const supervisedAgentIds = currentUser.role === 'supervisor'
      ? (await SupervisorAgentService.getSupervisedAgents(currentUser.id)).map((a) => a.id)
      : [];
    const agentIdNum = agentId ? parseInt(agentId, 10) : null;
    const isOwnCalls = agentIdNum === currentUser.id;
    const isSaleContext = !!(saleId || customerId);
    // Call Logs page: when filtering by agentId only, return only current user's logs
    // Sale page: when filtering by saleId/customerId, return sale-related logs (no agent restriction)
    if (!isSaleContext && agentId && !isOwnCalls) {
      return NextResponse.json({
        success: true,
        data: { calls: [], total: 0, limit, offset }
      });
    }

    const calls = await sequelizeDb.CallLog.findAndCountAll({
      where,
      include: [
        {
          model: sequelizeDb.Customer,
          as: 'customer',
          attributes: ['id', 'firstName', 'lastName', 'phone']
        },
        {
          model: sequelizeDb.User,
          as: 'agent',
          attributes: ['id', 'firstName', 'lastName', 'email']
        },
        {
          model: sequelizeDb.Sale,
          as: 'sale',
          attributes: ['id', 'status']
        }
      ],
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    // Include recording data for admin, agent's own calls, or supervisor viewing supervised agent's calls
    const callsData = calls.rows.map((call) => {
      const c = call.toJSON ? call.toJSON() : call;
      const isOwnCall = call.agentId === currentUser.id;
      const isSupervisedCall = isSupervisor(currentUser) && supervisedAgentIds.includes(call.agentId);
      const canSeeRecordingMetadata = isAdmin || isOwnCall || isSupervisedCall;
      if (!canSeeRecordingMetadata) {
        const { recordingUrl, recordings, recordingSid, recordingDuration, ...rest } = c;
        return rest;
      }
      // For non-admin (agent own or supervisor viewing supervised), omit raw Twilio URLs; frontend uses proxy
      if (!isAdmin && c.recordings) {
        const safeRecordings = c.recordings.map((r) => ({
          recordingSid: r.recordingSid,
          recordingDuration: r.recordingDuration,
          createdAt: r.createdAt
        }));
        return { ...c, recordings: safeRecordings, recordingUrl: undefined };
      }
      if (!isAdmin && c.recordingUrl) {
        return {
          ...c,
          recordings: [{ recordingSid: c.recordingSid, recordingDuration: c.recordingDuration, createdAt: c.updated_at }],
          recordingUrl: undefined
        };
      }
      return c;
    });

    return NextResponse.json({
      success: true,
      data: {
        calls: callsData,
        total: calls.count,
        limit,
        offset
      }
    });

  } catch (error) {
    console.error('Error fetching call history:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to fetch call history',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
