import { NextResponse } from 'next/server';
import { getClient, validatePhoneNumber, getWebhookUrl } from '../../../../lib/twilio';
import sequelizeDb from '../../../../lib/sequelize-db';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import crypto from 'crypto';

// Helper to encrypt SIP password (not used here but kept for consistency)
function encryptSipPassword(password) {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-key-32-chars-long!!', 'utf8');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

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

    // Get agent with SIP extension
    const agent = await sequelizeDb.User.findByPk(parseInt(agentId), {
      attributes: ['id', 'firstName', 'lastName', 'extension', 'sipUsername', 'sipDomain', 'callStatus']
    });

    if (!agent) {
      return NextResponse.json(
        { success: false, message: 'Agent not found' },
        { status: 404 }
      );
    }

    // Check if agent has SIP extension configured
    if (!agent.extension || !agent.sipUsername) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Agent does not have SIP extension configured. Please assign an extension first.' 
        },
        { status: 400 }
      );
    }

    // Check if agent is available
    if (agent.callStatus === 'busy') {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Agent is currently busy on another call' 
        },
        { status: 409 }
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

    // Get Twilio client
    const client = getClient();
    
    // Get Twilio phone number from environment
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioPhoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Twilio phone number not configured' },
        { status: 500 }
      );
    }

    // Get SIP domain from agent or environment
    const sipDomain = agent.sipDomain || process.env.TWILIO_SIP_DOMAIN || process.env.TWILIO_SIP_DEFAULT_DOMAIN;
    if (!sipDomain) {
      return NextResponse.json(
        { success: false, message: 'SIP domain not configured' },
        { status: 500 }
      );
    }

    // Build SIP URI for agent extension
    const agentSipUri = `sip:${agent.sipUsername}@${sipDomain}`;
    
    const statusCallbackUrl = getWebhookUrl('/api/twilio/call-status-callback');
    const voiceUrl = `${getWebhookUrl('/api/twilio/voice-response')}?agentId=${agentId}`;

    console.log('📞 SIP Call Initiation:', {
      agentId: agent.id,
      extension: agent.extension,
      sipUri: agentSipUri,
      customerPhone: formattedNumber,
      sipDomain: sipDomain
    });

    // Create call: Customer → Twilio → SIP Domain → Agent Extension
    const callOptions = {
      url: voiceUrl,
      to: formattedNumber,  // Customer phone number
      from: twilioPhoneNumber,
      statusCallback: statusCallbackUrl,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      // Route agent via SIP Domain
      // We'll dial the customer first, then connect to agent via SIP in the voice response
      answerOnMedia: false
    };

    const call = await client.calls.create(callOptions);
    
    console.log('✅ SIP Call created successfully:', {
      callSid: call.sid,
      status: call.status,
      to: call.to,
      from: call.from
    });

    // Update agent status to busy
    await agent.update({ 
      callStatus: 'busy',
      lastCallTime: new Date(),
      totalCalls: (agent.totalCalls || 0) + 1
    });

    // Create call log entry
    const callLog = await sequelizeDb.CallLog.create({
      callSid: call.sid,
      customerId: customerId || null,
      saleId: saleId || null,
      agentId,
      direction: 'outbound',
      fromNumber: twilioPhoneNumber,
      toNumber: formattedNumber,
      status: 'queued',
      callPurpose,
      twilioData: {
        callSid: call.sid,
        accountSid: call.accountSid,
        to: call.to,
        from: call.from,
        status: call.status,
        direction: call.direction,
        sipUri: agentSipUri,
        extension: agent.extension
      }
    });

    // Return SIP connection info for agent
    return NextResponse.json({
      success: true,
      data: {
        callSid: call.sid,
        status: call.status,
        to: call.to,
        from: call.from,
        callLogId: callLog.id,
        extension: agent.extension,
        sipUri: agentSipUri,
        sipDomain: sipDomain,
        message: 'Call initiated - agent should connect via SIP extension'
      },
      message: 'Call initiated successfully via SIP trunking'
    });

  } catch (error) {
    console.error('❌ Error initiating SIP call:', error);
    
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
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');
    const agentId = searchParams.get('agentId');
    const saleId = searchParams.get('saleId');
    const limit = parseInt(searchParams.get('limit')) || 50;
    const offset = parseInt(searchParams.get('offset')) || 0;

    const where = {};
    
    if (customerId) where.customerId = customerId;
    if (agentId) where.agentId = agentId;
    if (saleId) where.saleId = saleId;

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

    return NextResponse.json({
      success: true,
      data: {
        calls: calls.rows,
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
