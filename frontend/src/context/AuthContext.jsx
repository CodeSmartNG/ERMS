import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { authApi, tokens } from '@/services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: if we have a token, load the current user
  useEffect(() => {
    (async () => {
      if (!tokens.access) { setLoading(false); return; }
      try {
        const res = await authApi.me();
        setUser(res.data.user);
      } catch {
        tokens.clear();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password);
    tokens.set(res.data.accessToken, res.data.refreshToken);
    setUser(res.data.user);
    return res.data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await authApi.logout(tokens.refresh); } catch { /* best-effort */ }
    
    // Clear tokens only. 
    // We DO NOT clear the offline queue so the agent can see their history
    // when they log back in on the same device.
    tokens.clear();
    setUser(null);
  }, []);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
