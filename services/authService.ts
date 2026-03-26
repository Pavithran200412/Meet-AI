import { User } from '../types';

export interface AuthResponse {
    message: string;
    token: string;
    user: {
        id: string;
        name: string;
        email: string;
        role: 'user' | 'admin';
    };
}

export const authService = {
    // Get token from localStorage
    getToken: () => localStorage.getItem('meet_ai_token'),

    // Save token to localStorage
    setToken: (token: string) => localStorage.setItem('meet_ai_token', token),

    // Remove token
    removeToken: () => localStorage.removeItem('meet_ai_token'),

    // Signup
    signup: async (name: string, email: string, password: string): Promise<AuthResponse> => {
        const API_BASE = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${API_BASE}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Signup failed');

        authService.setToken(data.token);
        return data;
    },

    // Login
    login: async (email: string, password: string): Promise<AuthResponse> => {
        const API_BASE = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Login failed');

        authService.setToken(data.token);
        return data;
    },

    // Google Login
    googleLogin: async (credential: string): Promise<AuthResponse> => {
        const API_BASE = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${API_BASE}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Google login failed');

        authService.setToken(data.token);
        return data;
    },

    // Get current user (if token exists)
    getCurrentUser: async (): Promise<any | null> => {
        const token = authService.getToken();
        if (!token) return null;

        try {
            const API_BASE = import.meta.env.VITE_API_URL || '';
            const res = await fetch(`${API_BASE}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!res.ok) {
                // Token might be expired or invalid
                if (res.status === 401) authService.removeToken();
                return null;
            }

            return await res.json();
        } catch (e) {
            console.error('Error fetching current user:', e);
            return null;
        }
    },

    // Admin: Get all users
    getUsersList: async () => {
        const token = authService.getToken();
        if (!token) throw new Error('Not authenticated');

        const API_BASE = import.meta.env.VITE_API_URL || '';
        const res = await fetch(`${API_BASE}/api/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to fetch users');

        return data;
    }
};
