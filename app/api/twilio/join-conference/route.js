import { NextResponse } from 'next/server';
import { getWebhookUrl } from '../../../../lib/twilio';

export async function GET(request) {
  return handleJoinConference(request);
}

export async function POST(request) {
  return handleJoinConference(request);
}

async function handleJoinConference(request) {
  try {
    const url = new URL(request.url);
    
    // When using Twilio Client SDK with a TwiML App, parameters can come from:
    // 1. Query parameters (GET request or POST with query string)
    // 2. Form data (POST request with form-urlencoded body)
    let conferenceName = url.searchParams.get('To') || url.searchParams.get('Called');
    
    // If not in query params, try form data (POST request)
    if (!conferenceName && request.method === 'POST') {
      try {
        // Try to parse as form data
        const contentType = request.headers.get('content-type') || '';
        
        if (contentType.includes('application/x-www-form-urlencoded')) {
          const formData = await request.formData();
          conferenceName = formData.get('To') || formData.get('Called');
          
          // Log all form data for debugging
          const allFormData = {};
          for (const [key, value] of formData.entries()) {
            allFormData[key] = value;
          }
          console.log('📞 All form data received:', allFormData);
        } else {
          // Try to read as text and parse manually
          const text = await request.text();
          console.log('📞 Raw POST body:', text);
          
          // Parse URL-encoded form data manually
          const params = new URLSearchParams(text);
          conferenceName = params.get('To') || params.get('Called');
        }
        
        console.log('📞 Conference name from POST data:', conferenceName);
      } catch (e) {
        console.error('📞 Could not parse POST data:', e.message);
      }
    }

    console.log('📞 Join Conference - Received parameters:', {
      method: request.method,
      url: request.url,
      To: conferenceName,
      allQueryParams: Object.fromEntries(url.searchParams.entries()),
      contentType: request.headers.get('content-type')
    });

    if (!conferenceName) {
      console.error('❌ Join Conference: Missing conference name. Available params:', Object.fromEntries(url.searchParams.entries()));
      return new NextResponse(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">Error: Conference name missing.</Say><Hangup/></Response>`,
        { headers: { 'Content-Type': 'text/xml' }, status: 400 }
      );
    }

    // Recording is DISABLED - no calls will be recorded
    console.log(`📞 Agent joining conference via web: ${conferenceName}`);

    // Escape conference name to prevent XML injection
    const safeConferenceName = conferenceName.replace(/[<>&"']/g, '');

    // Agent joining conference - agent should start the conference when they join
    // startConferenceOnEnter="true" means agent starts the conference (customer is already waiting)
    // This prevents hold music from playing during the active call
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial record="false" answerOnMedia="false">
    <Conference startConferenceOnEnter="true" endConferenceOnExit="true" beep="false" maxParticipants="2" muted="false">${safeConferenceName}</Conference>
  </Dial>
</Response>`;

    console.log('📞 Join Conference TwiML generated:', twiml);

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    });
  } catch (error) {
    console.error('❌ Error in join conference TwiML:', error);
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Unable to connect to conference.</Say>
  <Hangup/>
</Response>`;
    return new NextResponse(fallbackTwiml, {
      headers: { 'Content-Type': 'text/xml' },
      status: 500
    });
  }
}

