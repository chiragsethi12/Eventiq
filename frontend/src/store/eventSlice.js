import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { api } from '../services/api';

const initialState = {
  events: [],
  currentEvent: null,
  isLoading: false,
  error: null,
  pagination: {
    cursor: null,
    hasMore: true
  }
};

const dedupeById = (events) => {
  const seen = new Map();

  events.forEach((event) => {
    if (event?._id) {
      seen.set(event._id, event);
    }
  });

  return [...seen.values()];
};

const buildEventParams = ({ city, category, dateFrom, dateTo, cursor, limit }) => {
  const params = {};

  if (city) {
    params.city = city;
  }

  if (category && category !== 'all') {
    params.category = category;
  }

  if (dateFrom) {
    params.dateFrom = dateFrom;
  }

  if (dateTo) {
    params.dateTo = dateTo;
  }

  if (cursor) {
    params.cursor = cursor;
  }

  if (limit) {
    params.limit = limit;
  }

  return params;
};

export const fetchEvents = createAsyncThunk(
  'event/fetchEvents',
  async (filters = {}, { rejectWithValue }) => {
    try {
      const { data } = await api.get('/api/v1/events', {
        params: buildEventParams(filters)
      });

      return {
        events: data?.data?.events || [],
        cursor: data?.data?.nextCursor || null,
        append: Boolean(filters.append)
      };
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.response?.data?.error || error.message || 'Unable to load events'
      );
    }
  }
);

export const fetchEventById = createAsyncThunk(
  'event/fetchEventById',
  async (id, { rejectWithValue }) => {
    try {
      const { data } = await api.get(`/api/v1/events/${id}`);
      return data?.data?.event || null;
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || error.response?.data?.error || error.message || 'Unable to load event'
      );
    }
  }
);

const eventSlice = createSlice({
  name: 'event',
  initialState,
  reducers: {
    clearCurrentEvent(state) {
      state.currentEvent = null;
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.pending, (state, action) => {
        state.isLoading = true;
        state.error = null;

        if (!action.meta.arg?.append) {
          state.pagination.cursor = null;
          state.pagination.hasMore = true;
        }
      })
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.events = action.payload.append
          ? dedupeById([...state.events, ...action.payload.events])
          : action.payload.events;
        state.pagination.cursor = action.payload.cursor;
        state.pagination.hasMore = Boolean(action.payload.cursor);
      })
      .addCase(fetchEvents.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || action.error.message || 'Unable to load events';

        if (!action.meta.arg?.append) {
          state.events = [];
          state.pagination.cursor = null;
          state.pagination.hasMore = false;
        }
      })
      .addCase(fetchEventById.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchEventById.fulfilled, (state, action) => {
        state.isLoading = false;
        state.error = null;
        state.currentEvent = action.payload;
      })
      .addCase(fetchEventById.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || action.error.message || 'Unable to load event';
        state.currentEvent = null;
      });
  }
});

export const { clearCurrentEvent } = eventSlice.actions;

export default eventSlice.reducer;
