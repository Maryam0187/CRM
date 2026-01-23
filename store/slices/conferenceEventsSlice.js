import { createSlice } from '@reduxjs/toolkit';

const MAX_EVENTS_PER_CONFERENCE = 50;

const initialState = {
  // conferenceName -> [{event, eventRaw, callSid, participantRole, participantName, ...}]
  byConference: {},
};

const conferenceEventsSlice = createSlice({
  name: 'conferenceEvents',
  initialState,
  reducers: {
    addConferenceEvent: (state, action) => {
      const { conferenceName } = action.payload || {};
      if (!conferenceName) return;
      if (!state.byConference[conferenceName]) state.byConference[conferenceName] = [];
      state.byConference[conferenceName].unshift(action.payload);
      state.byConference[conferenceName] = state.byConference[conferenceName].slice(0, MAX_EVENTS_PER_CONFERENCE);
    },
    clearConferenceEvents: (state, action) => {
      const { conferenceName } = action.payload || {};
      if (!conferenceName) return;
      delete state.byConference[conferenceName];
    },
  },
});

export const { addConferenceEvent, clearConferenceEvents } = conferenceEventsSlice.actions;
export default conferenceEventsSlice.reducer;


