import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // conferenceName -> callSid -> participant
  byConference: {},
};

function ensureConference(state, conferenceName) {
  if (!conferenceName) return null;
  if (!state.byConference[conferenceName]) state.byConference[conferenceName] = {};
  return state.byConference[conferenceName];
}

const participantsSlice = createSlice({
  name: 'participants',
  initialState,
  reducers: {
    upsertParticipant: (state, action) => {
      const {
        conferenceName,
        callSid,
        role = 'unknown',
        name = null,
        muted = null,
        hold = null,
        joined = null,
        speaking = null,
        timestamp = null,
      } = action.payload || {};

      if (!conferenceName || !callSid) return;
      const conf = ensureConference(state, conferenceName);
      const existing = conf[callSid] || {};
      conf[callSid] = {
        callSid,
        role: role ?? existing.role ?? 'unknown',
        name: name ?? existing.name ?? null,
        muted: muted ?? existing.muted ?? null,
        hold: hold ?? existing.hold ?? null,
        joined: joined ?? existing.joined ?? false,
        speaking: speaking ?? existing.speaking ?? false,
        lastUpdatedAt: timestamp || new Date().toISOString(),
      };
    },

    removeParticipant: (state, action) => {
      const { conferenceName, callSid } = action.payload || {};
      if (!conferenceName || !callSid) return;
      const conf = ensureConference(state, conferenceName);
      if (conf && conf[callSid]) delete conf[callSid];
    },

    clearConferenceParticipants: (state, action) => {
      const { conferenceName } = action.payload || {};
      if (!conferenceName) return;
      delete state.byConference[conferenceName];
    },

    // Ensure only one participant is marked as speaking at a time (per conference)
    setSpeakingExclusive: (state, action) => {
      const { conferenceName, callSid, speaking, timestamp } = action.payload || {};
      if (!conferenceName || !callSid) return;
      const conf = ensureConference(state, conferenceName);
      Object.keys(conf).forEach((sid) => {
        conf[sid] = {
          ...conf[sid],
          speaking: sid === callSid ? !!speaking : false,
          lastUpdatedAt: timestamp || conf[sid]?.lastUpdatedAt || new Date().toISOString(),
        };
      });
      // If the participant isn't yet in map, add it (minimal)
      if (!conf[callSid]) {
        conf[callSid] = {
          callSid,
          role: 'unknown',
          name: null,
          muted: null,
          hold: null,
          joined: false,
          speaking: !!speaking,
          lastUpdatedAt: timestamp || new Date().toISOString(),
        };
      }
    },
  },
});

export const { upsertParticipant, removeParticipant, clearConferenceParticipants, setSpeakingExclusive } =
  participantsSlice.actions;

export default participantsSlice.reducer;


