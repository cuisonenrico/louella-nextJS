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

interface AuthState {
  user: User | null;
  permissions: string[];
  accessToken: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
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

  // On mount: hydrate from localStorage then verify with /auth/me
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    setState((s) => ({ ...s, accessToken: token }));
    Promise.all([authApi.me(), usersApi.myPermissions()])
      .then(([meRes, permRes]) => {
        setState({ user: meRes.data, permissions: permRes.data.features, accessToken: token, isLoading: false });
      })
      .catch(() => {
        localStorage.removeItem('accessToken');
        setState({ user: null, permissions: [], accessToken: null, isLoading: false });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    localStorage.setItem('accessToken', data.accessToken);
    const { data: permData } = await usersApi.myPermissions();
    setState({ user: data.user, permissions: permData.features, accessToken: data.accessToken, isLoading: false });
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      localStorage.removeItem('accessToken');
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
