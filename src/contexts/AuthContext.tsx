'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User } from '@/types';
import { authApi, usersApi } from '@/lib/apiServices';
import { refreshAccessToken } from '@/lib/api';
import { setAccessToken } from '@/lib/tokenStore';

/**
 * Whether this browser holds a session cookie at all.
 *
 * Reads the non-sensitive `has_session` flag the server sets alongside the
 * HttpOnly refresh cookie — the refresh token itself is deliberately
 * unreadable, so this is the only way the client can tell.
 */
function hasSessionCookie(): boolean {
  if (typeof document === 'undefined') return false;
  return /(?:^|;\s*)has_session=1(?:;|$)/.test(document.cookie);
}

/** A 401 is a real answer: this session is over. Anything else may be transient. */
function isDefinitiveAuthFailure(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 401;
}

/**
 * Exchange the refresh cookie for an access token, retrying transient faults.
 *
 * Rate limiting (`429`), a cold lambda and a dropped connection are all
 * recoverable, but the bootstrap used to treat every failure as "signed out" —
 * so one throttled request, on a shared office IP where the 10/min budget is
 * pooled, silently logged the user out. Only a 401 ends the session now.
 */
async function bootstrapSession(attempt = 0): Promise<string> {
  try {
    return await refreshAccessToken();
  } catch (err) {
    if (isDefinitiveAuthFailure(err) || attempt >= 2) throw err;
    await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    return bootstrapSession(attempt + 1);
  }
}

interface AuthState {
  user: User | null;
  permissions: string[];
  accessToken: string | null;
  isLoading: boolean;
  /**
   * Set when the session could not be established for a reason that is *not*
   * "you are signed out" — the server was unreachable, or rate-limited the
   * request. Distinguishing this matters: treating it as a sign-out threw
   * people to the login screen over a transient blip, and they had a perfectly
   * valid session the whole time.
   */
  authError: string | null;
}

interface AuthContextValue extends AuthState {
  /** Resolves with the permissions granted, so callers can route accordingly. */
  login: (email: string, password: string) => Promise<{ permissions: string[] }>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    permissions: [],
    accessToken: null,
    isLoading: true,
    authError: null,
  });

  // On mount: the access token only ever lives in memory, so a reload always
  // starts empty. Silently exchange the HttpOnly refresh cookie for a new
  // access token, then verify it with /auth/me — which now returns the
  // effective permissions alongside the profile, since the server resolves them
  // during authentication anyway. That folds what used to be two requests into
  // one on every page load.
  useEffect(() => {
    let cancelled = false;

    const signedOut = () => {
      if (cancelled) return;
      setAccessToken(null);
      setState({ user: null, permissions: [], accessToken: null, isLoading: false, authError: null });
    };

    const unreachable = (err: unknown) => {
      if (cancelled) return;
      setAccessToken(null);
      const status = (err as { response?: { status?: number } })?.response?.status;
      setState({
        user: null,
        permissions: [],
        accessToken: null,
        isLoading: false,
        authError:
          status === 429
            ? 'The server is busy right now.'
            : 'Could not reach the server.',
      });
    };

    // No session cookie here means nobody is signed in on this browser. Skip
    // the round trip entirely rather than firing a refresh that can only 401.
    if (!hasSessionCookie()) {
      signedOut();
      return;
    }

    bootstrapSession()
      .then((token) =>
        authApi.me().then(({ data }) => {
          if (cancelled) return;
          const { permissions = [], ...user } = data;
          setState({ user, permissions, accessToken: token, isLoading: false, authError: null });
        })
      )
      .catch((err) => (isDefinitiveAuthFailure(err) ? signedOut() : unreachable(err)));

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    setAccessToken(data.accessToken);
    // The login response predates feature permissions and is consumed by the
    // Flutter client too, so its shape is left alone; permissions come from a
    // follow-up call that costs no database query server-side.
    const { data: permData } = await usersApi.myPermissions();
    setState({
      user: data.user,
      permissions: permData.features,
      accessToken: data.accessToken,
      isLoading: false,
      authError: null,
    });
    return { permissions: permData.features };
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setState({ user: null, permissions: [], accessToken: null, isLoading: false, authError: null });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: !!state.user,
      login,
      logout,
    }),
    [state, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
