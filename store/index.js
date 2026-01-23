import { configureStore } from '@reduxjs/toolkit';
import notificationReducer from './slices/notificationSlice';
import participantsReducer from './slices/participantsSlice';
import conferenceEventsReducer from './slices/conferenceEventsSlice';

export const store = configureStore({
  reducer: {
    notifications: notificationReducer,
    participants: participantsReducer,
    conferenceEvents: conferenceEventsReducer,
  },
});


// If using plain JS, these type definitions should be converted to JSDoc comments:

/**
 * @typedef {ReturnType<typeof store.getState>} RootState
 */
/**
 * @typedef {typeof store.dispatch} AppDispatch
 */

