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

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Helper: fetch and safely parse JSON.
 * If the response isn't JSON (e.g. the server returned HTML because the
 * backend isn't running), throw a descriptive error instead of the
 * cryptic "Unexpected token '<'" message.
 */
async function safeFetchJSON(url: string, init?: RequestInit): Promise<{ res: Response; data: any }> {
    let res: Response;
    try {
        res = await fetch(url, init);
    } catch (networkErr: any) {
        throw new Error(
            'Cannot reach the server. Please make sure the backend is running and try again.'
        );
    }

    const contentType = res.headers.get('content-type') || '';

    // If the response is not JSON, the backend is probably not running and
    // the static file server (e.g. Netlify / Vite) returned the HTML shell.
    if (!contentType.includes('application/json')) {
        throw new Error(
            'Backend server is not reachable. Please ensure the backend (node server/index.js) is running.'
        );
    }

    const data = await res.json();
    return { res, data };
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
        const { res, data } = await safeFetchJSON(`${API_BASE}/api/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });

        if (!res.ok) throw new Error(data.message || 'Signup failed');

        authService.setToken(data.token);
        return data;
    },

    // Login
    login: async (email: string, password: string): Promise<AuthResponse> => {
        const { res, data } = await safeFetchJSON(`${API_BASE}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        if (!res.ok) throw new Error(data.message || 'Login failed');

        authService.setToken(data.token);
        return data;
    },

    // Google Login
    googleLogin: async (credential: string): Promise<AuthResponse> => {
        const { res, data } = await safeFetchJSON(`${API_BASE}/api/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
        });

        if (!res.ok) throw new Error(data.message || 'Google login failed');

        authService.setToken(data.token);
        return data;
    },

    // Get current user (if token exists)
    getCurrentUser: async (): Promise<any | null> => {
        const token = authService.getToken();
        if (!token) return null;

        try {
            const { res, data } = await safeFetchJSON(`${API_BASE}/api/auth/me`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!res.ok) {
                if (res.status === 401) authService.removeToken();
                return null;
            }

            return data;
        } catch (e) {
            console.error('Error fetching current user:', e);
            return null;
        }
    },

    // Admin: Get all users
    getUsersList: async () => {
        const token = authService.getToken();
        if (!token) throw new Error('Not authenticated');

        const { res, data } = await safeFetchJSON(`${API_BASE}/api/admin/users`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        if (!res.ok) throw new Error(data.message || 'Failed to fetch users');

        return data;
    }
};
