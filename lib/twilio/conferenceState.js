// Shared in-memory conference state.
//
// NOTE:
// - This is process-local memory (resets on server restart / serverless cold start).
// - It's useful for correlating Twilio callback streams in a single runtime.

// Maps conferenceName -> customerCallSid (PSTN customer leg)
export const customerCallSidMap = new Map();

// Maps conferenceName -> agentCallSid (browser/Voice SDK leg)
export const agentCallSidMap = new Map();

// (intentionally no longer keeping a "synthetic in-progress on join" map)


