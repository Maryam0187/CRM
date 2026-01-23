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
  },
});

export const { upsertParticipant, removeParticipant, clearConferenceParticipants } =
  participantsSlice.actions;

export default participantsSlice.reducer;


