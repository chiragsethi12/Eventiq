import axios from 'axios';
import { logout, setCredentials } from '../store/authSlice';
import { store } from '../store';

const baseURL = import.meta.env.VITE_API_URL;

const refreshClient = axios.create({
  baseURL,
  withCredentials: true
});

export const api = axios.create({
  baseURL,
  withCredentials: true
});

let refreshPromise = null;

const getRedirectTarget = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

const redirectToLogin = () => {
  const redirectTarget = encodeURIComponent(getRedirectTarget());

  if (!window.location.pathname.startsWith('/login')) {
    window.location.replace(`/login?redirect=${redirectTarget}`);
  }
};

export const requestTokenRefresh = async () => {
  const response = await refreshClient.post('/auth/refresh');
  return response.data?.data;
};

api.interceptors.request.use((config) => {
  const accessToken = store.getState().auth.accessToken;

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retry ||
      originalRequest.url === '/auth/refresh'
    ) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      refreshPromise ??= requestTokenRefresh().finally(() => {
        refreshPromise = null;
      });

      const authData = await refreshPromise;

      store.dispatch(
        setCredentials({
          user: authData.user,
          accessToken: authData.accessToken
        })
      );

      originalRequest.headers.Authorization = `Bearer ${authData.accessToken}`;

      return api(originalRequest);
    } catch (refreshError) {
      store.dispatch(logout());
      redirectToLogin();
      return Promise.reject(refreshError);
    }
  }
);
