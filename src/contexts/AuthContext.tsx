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

interface AuthState {
  user: User | null;
  permissions: string[];
  accessToken: string | null;
  isLoading: boolean;
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
  });

  // On mount: the access token only ever lives in memory, so a reload always
  // starts empty. Silently exchange the HttpOnly refresh cookie for a new
  // access token, then verify it with /auth/me — which now returns the
  // effective permissions alongside the profile, since the server resolves them
  // during authentication anyway. That folds what used to be two requests into
  // one on every page load.
  useEffect(() => {
    refreshAccessToken()
      .then((token) =>
        authApi.me().then(({ data }) => {
          const { permissions = [], ...user } = data;
          setState({ user, permissions, accessToken: token, isLoading: false });
        })
      )
      .catch(() => {
        setAccessToken(null);
        setState({ user: null, permissions: [], accessToken: null, isLoading: false });
      });
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
    });
    return { permissions: permData.features };
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      setAccessToken(null);
      setState({ user: null, permissions: [], accessToken: null, isLoading: false });
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
