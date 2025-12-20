import twilio from 'twilio';

// Initialize Twilio client
export const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.');
  }
  
  return twilio(accountSid, authToken);
};

// Test Twilio client for development
export const getTestTwilioClient = () => {
  const accountSid = process.env.TWILIO_TEST_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_TEST_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    throw new Error('Twilio test credentials not configured.');
  }
  
  return twilio(accountSid, authToken);
};

// Get the appropriate client based on environment
export const getClient = () => {
  const isTestMode = process.env.NODE_ENV === 'development' || process.env.TWILIO_TEST_MODE === 'true';
  return isTestMode ? getTestTwilioClient() : getTwilioClient();
};

// Normalize phone number for storage (remove +1 prefix for US numbers, keep just digits)
// This ensures consistent storage format for matching
export const normalizePhoneForStorage = (phoneNumber) => {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters
  const digitsOnly = phoneNumber.toString().trim().replace(/\D/g, '');
  
  if (!digitsOnly || digitsOnly.length < 10) return null;
  
  // For US numbers: if it starts with 1 and has 11 digits, remove the leading 1
  // This normalizes +12345678901, 12345678901, and 2345678901 all to 2345678901
  if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return digitsOnly.substring(1); // Return 10 digits without country code
  }
  
  // For other formats, return as is (but cleaned)
  return digitsOnly;
};

// Normalize phone number for matching (same as storage normalization)
export const normalizePhoneForMatching = normalizePhoneForStorage;

// Validate phone number format (for Twilio calls - keeps +1 for international format)
export const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return null;
  
  // Remove all non-digit characters except +
  const cleaned = phoneNumber.toString().trim();
  
  // If already in international format with +, return as is (after cleaning)
  if (cleaned.startsWith('+')) {
    // Remove any spaces or dashes, keep only + and digits
    const formatted = '+' + cleaned.substring(1).replace(/\D/g, '');
    if (formatted.length >= 10) { // Minimum valid phone length
      return formatted;
    }
  }
  
  // Remove all non-digit characters
  const digitsOnly = cleaned.replace(/\D/g, '');
  
  // Check if it's a valid US phone number (10 or 11 digits)
  if (digitsOnly.length === 10) {
    return `+1${digitsOnly}`;
  } else if (digitsOnly.length === 11 && digitsOnly.startsWith('1')) {
    return `+${digitsOnly}`;
  } else if (digitsOnly.length >= 10) {
    // For other countries, try to format if it looks valid
    // If it starts with country code, add +
    if (digitsOnly.length >= 10 && digitsOnly.length <= 15) {
      return `+${digitsOnly}`;
    }
  }
  
  return null;
};

// Generate TwiML for outbound calls with speech-to-text
export const generateCallTwiML = (options = {}) => {
  const {
    sayMessage = 'Hello, this is a call from your CRM system.',
    recordCall = false,
    transcribeCall = false,
    maxRecordingLength = 300,
    recordingCallback = '/api/twilio/recording-callback',
    hangupMessage = 'Thank you for your time. Goodbye!'
  } = options;

  let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';
  
  // Add greeting message
  twiml += `  <Say voice="alice">${sayMessage}</Say>\n`;
  
  // Add recording with transcription if enabled
  if (recordCall) {
    const recordOptions = [
      `maxLength="${maxRecordingLength}"`,
      `action="${recordingCallback}"`,
      'playBeep="true"',
      `recordingStatusCallback="${recordingCallback}"`
    ];
    
    if (transcribeCall) {
      recordOptions.push('transcribe="true"');
      recordOptions.push(`transcribeCallback="${recordingCallback}"`);
    }
    
    twiml += `  <Record ${recordOptions.join(' ')}/>\n`;
  }
  
  // Add hangup message
  twiml += `  <Say voice="alice">${hangupMessage}</Say>\n`;
  twiml += '</Response>';
  
  return twiml;
};

// Generate TwiML for inbound calls
export const generateInboundTwiML = (options = {}) => {
  const {
    greeting = 'Thank you for calling. Please hold while we connect you to an agent.',
    recordCall = false,
    maxRecordingLength = 300,
    recordingCallback = '/api/twilio/recording-callback'
  } = options;

  let twiml = '<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n';
  
  twiml += `  <Say voice="alice">${greeting}</Say>\n`;
  
  if (recordCall) {
    twiml += `  <Record maxLength="${maxRecordingLength}" action="${recordingCallback}" playBeep="true" recordingStatusCallback="${recordingCallback}"/>\n`;
  }
  
  twiml += '</Response>';
  
  return twiml;
};

// Get webhook URL
export const getWebhookUrl = (endpoint) => {
  // Priority order for webhook base URL:
  // 1. TWILIO_WEBHOOK_BASE_URL (explicitly set)
  // 2. RAILWAY_STATIC_URL (Railway static URL)
  // 3. RAILWAY_PUBLIC_DOMAIN (Railway public domain)
  // 4. NEXT_PUBLIC_APP_URL (Next.js public URL)
  // 5. VERCEL_URL (Vercel deployment URL)
  // 6. localhost fallback for development
  const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || 
                  process.env.RAILWAY_STATIC_URL || 
                  process.env.RAILWAY_PUBLIC_DOMAIN || 
                  process.env.NEXT_PUBLIC_APP_URL || 
                  process.env.VERCEL_URL || 
                  'http://localhost:3000';
  
  // Ensure the URL has the correct protocol
  const url = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
  const fullUrl = `${url}${endpoint}`;
  
  // Debug logging for webhook URLs
  console.log('🔗 Webhook URL generated:', {
    baseUrl,
    endpoint,
    fullUrl,
    env: {
      TWILIO_WEBHOOK_BASE_URL: process.env.TWILIO_WEBHOOK_BASE_URL,
      RAILWAY_STATIC_URL: process.env.RAILWAY_STATIC_URL,
      RAILWAY_PUBLIC_DOMAIN: process.env.RAILWAY_PUBLIC_DOMAIN,
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      VERCEL_URL: process.env.VERCEL_URL
    }
  });
  
  return fullUrl;
};

// Format call duration for display
export const formatCallDuration = (seconds) => {
  if (!seconds) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Get call status display text
export const getCallStatusDisplay = (status) => {
  const statusMap = {
    'queued': 'Queued',
    'ringing': 'Ringing',
    'in-progress': 'In Progress',
    'completed': 'Completed',
    'busy': 'Busy',
    'failed': 'Failed',
    'no-answer': 'No Answer',
    'canceled': 'Canceled'
  };
  
  return statusMap[status] || status;
};

// Check if call is active
export const isCallActive = (status) => {
  return ['queued', 'ringing', 'in-progress'].includes(status);
};

// Get call purpose display text
export const getCallPurposeDisplay = (purpose) => {
  const purposeMap = {
    'follow_up': 'Follow Up',
    'cold_call': 'Cold Call',
    'support': 'Support',
    'sales': 'Sales',
    'appointment': 'Appointment',
    'other': 'Other'
  };
  
  return purposeMap[purpose] || purpose;
};
