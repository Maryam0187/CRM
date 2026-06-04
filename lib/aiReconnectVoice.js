const { getClient, getWebhookUrl } = require('./twilio');
const { getAiAgentVersion } = require('./aiCalling');

/**
 * Re-apply AI voice TwiML on an in-progress call so Twilio reconnects the media stream.
 */
function buildAiVoiceRedirectUrl(callLog) {
  const twilioData = callLog?.twilioData || {};
  const url = new URL(getWebhookUrl('/api/twilio/ai/voice'));
  url.searchParams.set('direction', 'outbound-api');
  if (callLog?.agentId) url.searchParams.set('agentId', String(callLog.agentId));
  if (callLog?.customerId) url.searchParams.set('customerId', String(callLog.customerId));
  if (callLog?.saleId) url.searchParams.set('saleId', String(callLog.saleId));
  url.searchParams.set('aiAgentVersion', twilioData.aiAgentVersion || getAiAgentVersion());
  url.searchParams.set('supervisedAi', twilioData.supervisedAi ? 'true' : 'false');
  url.searchParams.set('source', twilioData.source || 'ai_supervised');
  if (twilioData.campaignLabel) {
    url.searchParams.set('campaignLabel', String(twilioData.campaignLabel));
  }
  return url.toString();
}

async function reconnectCallToAiVoice(callLog) {
  const callSid = callLog?.callSid || callLog?.customerCallSid;
  if (!callSid) {
    return { ok: false, message: 'Missing call SID on call log' };
  }

  const client = getClient();
  let call;
  try {
    call = await client.calls(String(callSid)).fetch();
  } catch (err) {
    return { ok: false, message: `Cannot fetch call: ${err.message}` };
  }

  const terminal = ['completed', 'canceled', 'failed', 'busy', 'no-answer'];
  if (terminal.includes(call.status)) {
    return { ok: false, message: `Call already ended (${call.status})` };
  }

  const voiceUrl = buildAiVoiceRedirectUrl(callLog);
  await client.calls(String(callSid)).update({
    url: voiceUrl,
    method: 'POST'
  });

  console.log('[AI RECONNECT] Redirected call to AI voice TwiML', {
    callSid: String(callSid).substring(0, 14),
    voiceUrl: voiceUrl.substring(0, 80)
  });

  return { ok: true, message: 'Reconnecting AI media stream', callSid: String(callSid) };
}

module.exports = {
  buildAiVoiceRedirectUrl,
  reconnectCallToAiVoice
};
