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

    // Use API Key/Secret if available, otherwise use Account SID/Auth Token
    const keySid = twilioApiKey || accountSid;
    const keySecret = twilioApiSecret || authToken;

    // Create access token
    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    // Create a unique identity for this agent
    const identity = `agent-${user.id}`;

    // Create access token
    const token = new AccessToken(
      accountSid,
      keySid,
      keySecret,
      { identity: identity, ttl: 3600 }
    );

    // Grant voice permissions - use join-conference endpoint
    const joinConferenceUrl = `${process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/twilio/join-conference`;
    
    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: process.env.TWILIO_APP_SID || undefined,
      incomingAllow: true
    });

    token.addGrant(voiceGrant);

    return NextResponse.json({
      success: true,
      token: token.toJwt(),
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

