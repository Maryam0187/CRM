const twilio = require('twilio');

// Initialize Twilio client
const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.');
  }
  
  return twilio(accountSid, authToken);
};

// Test Twilio client for development
const getTestTwilioClient = () => {
  const accountSid = process.env.TWILIO_TEST_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_TEST_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    throw new Error('Twilio test credentials not configured.');
  }
  
  return twilio(accountSid, authToken);
};

// Get the appropriate client based on environment
const getClient = () => {
  const isTestMode = process.env.NODE_ENV === 'development' || process.env.TWILIO_TEST_MODE === 'true';
  return isTestMode ? getTestTwilioClient() : getTwilioClient();
};

// Validate phone number format
const validatePhoneNumber = (phoneNumber) => {
  // Remove all non-digit characters
  const cleaned = phoneNumber.replace(/\D/g, '');
  
  // Check if it's a valid US phone number (10 or 11 digits)
  if (cleaned.length === 10) {
    return `+1${cleaned}`;
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`;
  } else if (phoneNumber.startsWith('+')) {
    return phoneNumber;
  }
  
  return null;
};

// Generate TwiML for outbound calls with speech-to-text
const generateCallTwiML = (options = {}) => {
  const {
    sayMessage = 'Hello, this is a call from your CRM system.',
    recordCall = true,
    transcribeCall = true,
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
const generateInboundTwiML = (options = {}) => {
  const {
    greeting = 'Thank you for calling. Please hold while we connect you to an agent.',
    recordCall = true,
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
const getWebhookUrl = (endpoint) => {
  const baseUrl = process.env.TWILIO_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  return `${baseUrl}${endpoint}`;
};

// Format call duration for display
const formatCallDuration = (seconds) => {
  if (!seconds) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Get call status display text
const getCallStatusDisplay = (status) => {
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
const isCallActive = (status) => {
  return ['queued', 'ringing', 'in-progress'].includes(status);
};

// Get call purpose display text
const getCallPurposeDisplay = (purpose) => {
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

module.exports = {
  getTwilioClient,
  getTestTwilioClient,
  getClient,
  validatePhoneNumber,
  generateCallTwiML,
  generateInboundTwiML,
  getWebhookUrl,
  formatCallDuration,
  getCallStatusDisplay,
  isCallActive,
  getCallPurposeDisplay
};
