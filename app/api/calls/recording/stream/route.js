import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import sequelizeDb from '../../../../../lib/sequelize-db';

/**
 * GET /api/calls/recording/stream?token=...
 * Streams the Twilio recording after validating the short-lived token.
 * Used by <audio src> so no Bearer header is sent; token is in the URL.
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');
    if (!token) {
      return new NextResponse('Missing token', { status: 400 });
    }

    const secret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
    let decoded;
    try {
      decoded = jwt.verify(token, secret);
    } catch {
      return new NextResponse('Invalid or expired token', { status: 403 });
    }

    const { callLogId, index } = decoded;
    const callLog = await sequelizeDb.CallLog.findByPk(callLogId);
    if (!callLog) {
      return new NextResponse('Call log not found', { status: 404 });
    }

    const recordings = Array.isArray(callLog.recordings) ? callLog.recordings : [];
    const hasSingle = !!callLog.recordingUrl && recordings.length === 0;
    const recordingUrl = index < recordings.length
      ? recordings[index].recordingUrl
      : (hasSingle && index === 0 ? callLog.recordingUrl : null);

    if (!recordingUrl) {
      return new NextResponse('Recording not found', { status: 404 });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      console.error('Twilio credentials not set');
      return new NextResponse('Recording service not configured', { status: 503 });
    }

    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const twilioResponse = await fetch(recordingUrl, {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });

    if (!twilioResponse.ok) {
      console.error('Twilio recording fetch failed:', twilioResponse.status, await twilioResponse.text());
      return new NextResponse('Recording unavailable', { status: 502 });
    }

    const contentType = twilioResponse.headers.get('content-type') || 'audio/wav';
    const contentLength = twilioResponse.headers.get('content-length');
    const acceptRanges = twilioResponse.headers.get('accept-ranges');

    const headers = new Headers();
    headers.set('Content-Type', contentType);
    if (contentLength) headers.set('Content-Length', contentLength);
    if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);

    return new NextResponse(twilioResponse.body, {
      status: 200,
      headers
    });
  } catch (error) {
    console.error('Recording stream error:', error);
    return new NextResponse('Failed to stream recording', { status: 500 });
  }
}
