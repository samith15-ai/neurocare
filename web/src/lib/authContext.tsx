import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, UserRole } from '../types';
import { api } from './api';

interface AuthContextType {
  user: User | null;
  role: UserRole | null;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, name: string, role: UserRole) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isLoading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadUser() {
      try {
        const u = await api.getCurrentUser();
        setUser(u);
      } catch (e) {
        console.error('Failed to restore session', e);
      } finally {
        setIsLoading(false);
      }
    }
    loadUser();
  }, []);

  const login = async (email: string, pass: string) => {
    const data = await api.login(email, pass);
    setUser({
      id: data.user_id,
      email,
      full_name: data.full_name,
      role: data.role,
      is_active: true,
    });
  };

  const register = async (email: string, pass: string, name: string, role: UserRole) => {
    await api.register({ email, password: pass, full_name: name, role });
    await login(email, pass);
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role ?? null,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
