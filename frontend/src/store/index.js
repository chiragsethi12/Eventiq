import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import bookingReducer from './bookingSlice';
import eventReducer from './eventSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    booking: bookingReducer,
    event: eventReducer
  }
});
