import { create } from 'zustand';

export interface User {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: string;
  stationId: string | null;
  skills: string[];
}

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

const API_BASE = '/api';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: localStorage.getItem('gtk_token'),
  isLoading: true,

  login: async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(err.error || 'Login failed');
    }

    const data = await res.json();
    localStorage.setItem('gtk_token', data.token);
    set({ user: data.user, token: data.token, isLoading: false });
  },

  logout: async () => {
    const token = get().token;
    if (token) {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem('gtk_token');
    set({ user: null, token: null, isLoading: false });
  },

  checkAuth: async () => {
    const token = get().token;
    if (!token) {
      set({ isLoading: false });
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Unauthorized');
      const data = await res.json();
      set({ user: data.user, isLoading: false });
    } catch {
      localStorage.removeItem('gtk_token');
      set({ user: null, token: null, isLoading: false });
    }
  },
}));
