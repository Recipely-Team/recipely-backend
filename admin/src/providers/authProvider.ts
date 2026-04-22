import type { AuthProvider } from '@refinedev/core';

export const authProvider: AuthProvider = {
  login: async ({ email, password }: { email: string; password: string }) => {
    const response = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      return { success: true, redirectTo: '/admin/' };
    }

    return { success: false, error: { name: 'Invalid credentials', message: 'Invalid credentials' } };
  },

  logout: async () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    return { success: true, redirectTo: '/admin/login' };
  },

  check: async () => {
    const token = localStorage.getItem('token');
    if (token) {
      return { authenticated: true };
    }
    return { authenticated: false, redirectTo: '/admin/login' };
  },

  onError: async (error) => {
    if (error?.statusCode === 401) {
      return { logout: true, redirectTo: '/admin/login' };
    }
    return { error };
  },

  getIdentity: async () => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr);
    }
    return null;
  },

  getPermissions: async () => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      return user.role;
    }
    return null;
  },
};
