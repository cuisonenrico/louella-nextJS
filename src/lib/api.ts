import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, setAccessToken } from './tokenStore';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';

const api = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
});

// Attach Bearer token from the in-memory store on every request. The token
// is never persisted client-side, so a page reload always starts empty and
// relies on refreshAccessToken() (below) to re-mint one from the HttpOnly cookie.
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Exchanges the HttpOnly refresh cookie for a new access token. Used both by
// the 401 interceptor below and by AuthContext to hydrate a session on load.
export async function refreshAccessToken(): Promise<string> {
  const { data } = await axios.post(
    `${BASE_URL}/auth/refresh`,
    {},
    { withCredentials: true },
  );
  const newAccessToken: string = data.accessToken;
  setAccessToken(newAccessToken);
  return newAccessToken;
}

// Auto-refresh on 401
let isRefreshing = false;
type FailedRequest = {
  resolve: (value: string) => void;
  reject: (reason: unknown) => void;
};
let failedQueue: FailedRequest[] = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newAccessToken = await refreshAccessToken();
        processQueue(null, newAccessToken);
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        setAccessToken(null);
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
