import { NextResponse } from 'next/server';
import { requireJWTAuth } from '../../../../lib/jwtAuth.js';
import twilio from 'twilio';

export async function GET(request) {
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
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioApiKey = process.env.TWILIO_API_KEY;
    const twilioApiSecret = process.env.TWILIO_API_SECRET;

    if (!accountSid || !authToken) {
      return NextResponse.json(
        { error: 'Twilio credentials not configured' },
        { status: 500 }
      );
    }

    // Create access token
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    // Create a unique identity for this agent
    const identity = `agent-${user.id}`;

    // Create access token
    // API Keys are REQUIRED for Client SDK tokens
    // Account SID + Auth Token alone may not work for Client SDK
    let token;
    if (twilioApiKey && twilioApiSecret) {
      // Use API Key/Secret (required for Client SDK)
      token = new AccessToken(
        accountSid,
        twilioApiKey,
        twilioApiSecret,
        { identity: identity, ttl: 3600 }
      );
      console.log('✅ Using API Key/Secret for token generation');
    } else {
      // Fallback: Try using Account SID + Auth Token
      // Note: This may not work for Client SDK - API Keys are recommended
      console.warn('⚠️ API Keys not found - using Account SID + Auth Token (may not work for Client SDK)');
      token = new AccessToken(
        accountSid,
        accountSid,
        authToken,
        { identity: identity, ttl: 3600 }
      );
    }

    // Grant voice permissions
    // TwiML App SID is required for outgoing calls via Client SDK
    const twilioAppSid = process.env.TWILIO_APP_SID;
    
    if (!twilioAppSid) {
      console.warn('⚠️ TWILIO_APP_SID not set - token may not work for outgoing calls');
    }
    
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twilioAppSid || undefined,
      incomingAllow: true
    });

    token.addGrant(voiceGrant);

    // Generate the JWT token
    const jwtToken = token.toJwt();

    // Log token generation (without exposing the full token)
    console.log('📞 Twilio token generated:', {
      accountSid: accountSid?.substring(0, 10) + '...',
      hasApiKey: !!twilioApiKey,
      hasAppSid: !!process.env.TWILIO_APP_SID,
      identity: identity,
      tokenLength: jwtToken.length
    });

    return NextResponse.json({
      success: true,
      token: jwtToken,
      identity: identity
    });

  } catch (error) {
    console.error('Error generating Twilio token:', error);
    return NextResponse.json(
      { error: 'Failed to generate access token', message: error.message },
      { status: 500 }
    );
  }
}

