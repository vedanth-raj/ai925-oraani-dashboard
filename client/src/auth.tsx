import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, TOKEN_KEY, USER_KEY } from './api';

export interface User {
  id: string;
  username: string;
  role: 'ADMIN' | 'BUSINESS_ADMIN' | 'SALES_REP';
  full_name: string;
  assigned_region?: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  ready: boolean;
  isAdmin: boolean;
  isBusinessAdmin: boolean;
  isRep: boolean;
  loginPin: (pin: string, role?: string, rememberMe?: boolean) => Promise<void>;
  login: (username: string, passwordOrPin: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check sessionStorage first, then fallback to localStorage if Remember Me was selected
    const savedToken = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
    const savedUser = sessionStorage.getItem(USER_KEY) || localStorage.getItem(USER_KEY);

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        sessionStorage.removeItem(TOKEN_KEY);
        sessionStorage.removeItem(USER_KEY);
      }
    }
    setReady(true);

    // Listen for single-device logout signal from API calls
    const handleSessionInvalidated = (e: any) => {
      setToken(null);
      setUser(null);
      alert(e.detail || 'Your session has expired because this account logged in on another device.');
    };

    window.addEventListener('ai925_session_invalidated', handleSessionInvalidated);
    return () => {
      window.removeEventListener('ai925_session_invalidated', handleSessionInvalidated);
    };
  }, []);

  // Mandatory Location Tracking for Sales Representative
  useEffect(() => {
    if (user?.role === 'SALES_REP') {
      const captureLocation = () => {
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              api.updateLocation({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude
              }).catch(() => {});
            },
            (err) => {
              console.warn('Sales Rep location capture permission notice:', err.message);
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
          );
        }
      };

      captureLocation();
      const interval = setInterval(captureLocation, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [user]);

  const loginPin = useCallback(async (pin: string, role?: string, rememberMe: boolean = false) => {
    const res = await api.loginPin(pin, role);
    if (rememberMe) {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, res.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(res.user));
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    setToken(res.token);
    setUser(res.user);
  }, []);

  const login = useCallback(async (username: string, passwordOrPin: string, rememberMe: boolean = false) => {
    const res = await api.login(username, passwordOrPin);
    if (rememberMe) {
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      sessionStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(USER_KEY);
    } else {
      sessionStorage.setItem(TOKEN_KEY, res.token);
      sessionStorage.setItem(USER_KEY, JSON.stringify(res.user));
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    }
    setToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.getMe();
      if (res && res.user) {
        setUser(res.user);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      }
    } catch {
      // ignore
    }
  }, []);

  const isAdmin = user?.role === 'ADMIN';
  const isBusinessAdmin = user?.role === 'BUSINESS_ADMIN';
  const isRep = user?.role === 'SALES_REP';

  return (
    <AuthContext.Provider
      value={{
        token,
        user,
        ready,
        isAdmin,
        isBusinessAdmin,
        isRep,
        loginPin,
        login,
        logout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
