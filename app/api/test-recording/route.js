import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../lib/twilio';

export async function GET() {
  try {
    const recordingCallbackUrl = getWebhookUrl('/api/twilio/recording-callback');
    
    return NextResponse.json({
      success: true,
      recordingCallbackUrl,
      message: 'Recording callback URL generated successfully'
    });
  } catch (error) {
    console.error('Error generating recording callback URL:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        message: 'Failed to generate recording callback URL',
        error: error.message 
      },
      { status: 500 }
    );
  }
}
