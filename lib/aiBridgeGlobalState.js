/**
 * Shared in-process state for the AI media bridge.
 * Next.js standalone bundles API routes separately from server.js, which would
 * otherwise create duplicate Maps. globalThis keeps one store per Node process.
 */
const GLOBAL_KEY = '__crmAiBridgeState_v1';

function getAiBridgeGlobalState() {
  if (!globalThis[GLOBAL_KEY]) {
    globalThis[GLOBAL_KEY] = {
      activeSessionHooksByCallSid: new Map(),
      pendingManualStartByCallSid: new Set(),
      sessionStateByCallSid: new Map(),
      answeredAtByCallSid: new Map()
    };
  }
  return globalThis[GLOBAL_KEY];
}

module.exports = {
  getAiBridgeGlobalState
};
