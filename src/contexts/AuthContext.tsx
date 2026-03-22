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
import { authApi } from '@/lib/apiServices';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
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
    authApi
      .me()
      .then(({ data }) => {
        setState({ user: data, accessToken: token, isLoading: false });
      })
      .catch(() => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        setState({ user: null, accessToken: null, isLoading: false });
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.login(email, password);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setState({ user: data.user, accessToken: data.accessToken, isLoading: false });
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { data } = await authApi.register(email, password);
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setState({ user: data.user, accessToken: data.accessToken, isLoading: false });
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken') ?? undefined;
    try {
      await authApi.logout(refreshToken);
    } finally {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setState({ user: null, accessToken: null, isLoading: false });
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      isAuthenticated: !!state.user,
      login,
      register,
      logout,
    }),
    [state, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
