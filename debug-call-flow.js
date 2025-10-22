#!/usr/bin/env node

/**
 * Debug script to test call flow and webhook configuration
 */

const { getWebhookUrl } = require('./lib/twilio');

console.log('🔍 Debugging Call Flow Configuration');
console.log('=====================================');

// Test webhook URL generation
console.log('\n📡 Webhook URL Tests:');
console.log('Status Callback:', getWebhookUrl('/api/twilio/call-status-callback'));
console.log('Recording Callback:', getWebhookUrl('/api/twilio/recording-callback'));

// Test environment variables
console.log('\n🌍 Environment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('TWILIO_WEBHOOK_BASE_URL:', process.env.TWILIO_WEBHOOK_BASE_URL);
console.log('RAILWAY_STATIC_URL:', process.env.RAILWAY_STATIC_URL);
console.log('RAILWAY_PUBLIC_DOMAIN:', process.env.RAILWAY_PUBLIC_DOMAIN);
console.log('NEXT_PUBLIC_APP_URL:', process.env.NEXT_PUBLIC_APP_URL);
console.log('VERCEL_URL:', process.env.VERCEL_URL);

// Test webhook accessibility
console.log('\n🔗 Testing Webhook Endpoints:');

const testWebhook = async (url, name) => {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'CallSid=test123&CallStatus=completed&From=%2B15005550006&To=%2B15005550006'
    });
    
    const result = await response.text();
    console.log(`✅ ${name}: ${response.status} - ${result.substring(0, 100)}...`);
  } catch (error) {
    console.log(`❌ ${name}: ${error.message}`);
  }
};

// Test both webhook endpoints
const statusUrl = getWebhookUrl('/api/twilio/call-status-callback');
const recordingUrl = getWebhookUrl('/api/twilio/recording-callback');

testWebhook(statusUrl, 'Status Callback');
testWebhook(recordingUrl, 'Recording Callback');

console.log('\n🎯 Recommendations:');
console.log('1. Check Railway logs for webhook URL generation');
console.log('2. Verify TWILIO_WEBHOOK_BASE_URL is set correctly');
console.log('3. Test actual call initiation from your CRM app');
console.log('4. Check Twilio Console for webhook delivery status');
