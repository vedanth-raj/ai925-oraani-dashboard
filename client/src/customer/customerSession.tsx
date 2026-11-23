import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { portalApi, CUSTOMER_TOKEN_KEY, getCustomerToken, type CustomerAccount } from '../api';
import { usePresence } from './usePresence';

interface CustomerSessionState {
  ready: boolean;
  token: string | null;
  account: CustomerAccount | null;
  signIn: (identifier: string, password: string, rememberMe?: boolean) => Promise<void>;
  signInWithOtp: (destination: string, otp: string, rememberMe?: boolean) => Promise<void>;
  signInWithFirebase: (idToken: string, rememberMe?: boolean) => Promise<void>;
  register: (form: FormData) => Promise<void>;
  refresh: () => Promise<CustomerAccount | null>;
  signOut: () => void;
}

const CustomerSessionContext = createContext<CustomerSessionState | null>(null);

// Remember me → localStorage (survives closing the browser); otherwise sessionStorage (this browser session only)
function storeToken(token: string | null, rememberMe = false) {
  try {
    localStorage.removeItem(CUSTOMER_TOKEN_KEY);
    sessionStorage.removeItem(CUSTOMER_TOKEN_KEY);
    if (token) (rememberMe ? localStorage : sessionStorage).setItem(CUSTOMER_TOKEN_KEY, token);
  } catch {
    // storage unavailable (private mode): session lasts for this page only
  }
}

export function CustomerSessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [account, setAccount] = useState<CustomerAccount | null>(null);

  const signOut = useCallback(() => {
    storeToken(null);
    setToken(null);
    setAccount(null);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await portalApi.me();
      setAccount(res.account);
      return res.account;
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) signOut();
      return null;
    }
  }, [signOut]);

  useEffect(() => {
    const saved = getCustomerToken();
    if (!saved) {
      setReady(true);
      return;
    }
    setToken(saved);
    refresh().finally(() => setReady(true));
  }, [refresh]);

  // Heartbeat (green dot for administrators) and last location while signed in
  usePresence(Boolean(token && account));

  const signIn = useCallback(async (identifier: string, password: string, rememberMe = false) => {
    const res = await portalApi.login(identifier, password);
    storeToken(res.token, rememberMe);
    setToken(res.token);
    setAccount(res.account);
  }, []);

  const signInWithOtp = useCallback(async (destination: string, otp: string, rememberMe = false) => {
    const res = await portalApi.loginWithOtp({ destination, otp });
    storeToken(res.token, rememberMe);
    setToken(res.token);
    setAccount(res.account);
  }, []);

  const signInWithFirebase = useCallback(async (idToken: string, rememberMe = false) => {
    const res = await portalApi.loginWithFirebase(idToken);
    storeToken(res.token, rememberMe);
    setToken(res.token);
    setAccount(res.account);
  }, []);

  const register = useCallback(async (form: FormData) => {
    const res = await portalApi.register(form);
    storeToken(res.token);
    setToken(res.token);
    setAccount(res.account);
  }, []);

  return (
    <CustomerSessionContext.Provider value={{ ready, token, account, signIn, signInWithOtp, signInWithFirebase, register, refresh, signOut }}>
      {children}
    </CustomerSessionContext.Provider>
  );
}

export function useCustomerSession(): CustomerSessionState {
  const ctx = useContext(CustomerSessionContext);
  if (!ctx) throw new Error('useCustomerSession must be used inside CustomerSessionProvider');
  return ctx;
}
