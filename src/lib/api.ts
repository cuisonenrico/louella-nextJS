import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, setAccessToken } from './tokenStore';

// The API is served by this same Next.js app (src/app/api/v1/[...path]), so the
// default is a same-origin relative path — no origin to configure, no CORS
// preflight, and the auth cookie is first-party in every environment.
// NEXT_PUBLIC_API_URL remains an escape hatch for pointing a local build at a
// deployed API; leave it unset for normal use.
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

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

/** `/auth/login`, `/auth/refresh` and `/auth/logout` — with or without the base URL. */
function isAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return /\/auth\/(login|refresh|logout)\/?(\?|$)/.test(url);
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

    // The auth endpoints are never "an expired session" — they are how a
    // session is established, renewed or ended, and their own 401 is the
    // answer the caller asked for. Running the recovery path on them turned a
    // wrong password into a silent reload that wiped the login form's error
    // message before anyone could read it, and fired a pointless refresh
    // against a 10/min budget on every failed attempt.
    if (isAuthEndpoint(originalRequest?.url)) {
      return Promise.reject(error);
    }

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
        // Only a 401 from the refresh itself means the session is genuinely
        // over. A 429, a 5xx or a dropped connection is transient — bouncing
        // to /login on those threw the user out of a page mid-edit for what
        // was really a blip. Let the caller surface it as an ordinary error.
        const status = (refreshError as AxiosError)?.response?.status;
        if (typeof window !== 'undefined' && status === 401) {
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
