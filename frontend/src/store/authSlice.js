import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  user: null,
  accessToken: null,
  isLoading: false,
  error: null
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action) {
      state.user = action.payload.user;
      state.accessToken = action.payload.accessToken;
      state.error = null;
    },
    logout(state) {
      state.user = null;
      state.accessToken = null;
      state.isLoading = false;
      state.error = null;
    },
    setLoading(state, action) {
      state.isLoading = action.payload;
    },
    setError(state, action) {
      state.error = action.payload;
    }
  }
});

export const { setCredentials, logout, setLoading, setError } = authSlice.actions;

export default authSlice.reducer;
