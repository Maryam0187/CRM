import { configureStore } from '@reduxjs/toolkit';
import notificationReducer from './slices/notificationSlice';

export const store = configureStore({
  reducer: {
    notifications: notificationReducer,
  },
});


// If using plain JS, these type definitions should be converted to JSDoc comments:

/**
 * @typedef {ReturnType<typeof store.getState>} RootState
 */
/**
 * @typedef {typeof store.dispatch} AppDispatch
 */

