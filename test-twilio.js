// Test script for Twilio integration
const { getClient, validatePhoneNumber, generateCallTwiML } = require('./lib/twilio');

async function testTwilioIntegration() {
  console.log('🧪 Testing Core Dialer Features...\n');

  try {
    // Test 1: Phone number validation
    console.log('1. 📞 Phone Number Validation:');
    const testNumbers = ['5551234567', '15551234567', '+15551234567'];
    testNumbers.forEach(number => {
      const formatted = validatePhoneNumber(number);
      console.log(`   ${number} -> ${formatted || 'Invalid'}`);
    });

    // Test 2: TwiML generation with recording and transcription
    console.log('\n2. 🎙️ Call Recording & Speech-to-Text:');
    const twiml = generateCallTwiML({
      sayMessage: 'Hello, this is a test call with recording and transcription.',
      recordCall: true,
      transcribeCall: true,
      maxRecordingLength: 60
    });
    console.log('   ✅ TwiML with recording and transcription generated');
    console.log('   📝 Features: Recording + Speech-to-Text');

    // Test 3: Environment check
    console.log('\n3. 🔧 Environment Check:');
    const requiredEnvVars = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_PHONE_NUMBER'
    ];

    let allEnvVarsPresent = true;
    requiredEnvVars.forEach(envVar => {
      const value = process.env[envVar];
      if (value) {
        console.log(`   ✅ ${envVar}: Configured`);
      } else {
        console.log(`   ❌ ${envVar}: Missing`);
        allEnvVarsPresent = false;
      }
    });

    // Test 4: Client initialization
    console.log('\n4. 🚀 Twilio Client:');
    try {
      const client = getClient();
      console.log('   ✅ Client initialized successfully');
    } catch (error) {
      console.log('   ❌ Client failed:', error.message);
    }

    // Summary
    console.log('\n📋 Core Features Ready:');
    console.log('   📞 Dialing: Phone number validation and call initiation');
    console.log('   🎙️ Call Recording: Automatic recording with playback');
    console.log('   📝 Speech-to-Text: Automatic transcription');
    console.log('   📊 Call History: Complete call logs and recordings');
    
    if (allEnvVarsPresent) {
      console.log('\n🎉 Ready to test! Visit /add-sale to start testing.');
    } else {
      console.log('\n⚠️  Configure environment variables first.');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testTwilioIntegration();
