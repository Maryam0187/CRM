// Shared in-memory conference state.
//
// NOTE:
// - This is process-local memory (resets on server restart / serverless cold start).
// - It's useful for correlating Twilio callback streams in a single runtime.

// Maps conferenceName -> customerCallSid (PSTN customer leg)
export const customerCallSidMap = new Map();

// Maps conferenceName -> agentCallSid (browser/Voice SDK leg)
export const agentCallSidMap = new Map();

// Avoid spamming synthetic "in-progress" from conference join
// conferenceName -> Set(participantId)
export const customerJoinBroadcastedMap = new Map();


