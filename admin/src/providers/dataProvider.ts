import type { DataProvider } from '@refinedev/core';

const API_URL = '/api/v1/admin';

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${url}`, { ...options, headers });
  return response;
}

export const dataProvider: DataProvider = {
  getList: async ({ resource, pagination, filters }) => {
    const { current = 1, pageSize = 20 } = pagination || {};
    const query: Record<string, string> = { page: String(current), pageSize: String(pageSize) };

    if (filters && filters.length > 0) {
      filters.forEach(f => {
        if ('field' in f && f.value) {
          query[f.field as string] = String(f.value);
        }
      });
    }

    const queryString = new URLSearchParams(query).toString();
    const response = await fetchWithAuth(`/${resource}?${queryString}`);
    const data = await response.json();
    return { data: data.items || [], total: data.total || 0 };
  },

  getOne: async ({ resource, id }) => {
    const response = await fetchWithAuth(`/${resource}/${id}`);
    const data = await response.json();
    return { data };
  },

  create: async ({ resource, variables }) => {
    const response = await fetchWithAuth(`/${resource}`, {
      method: 'POST',
      body: JSON.stringify(variables),
    });
    const data = await response.json();
    return { data };
  },

  update: async ({ resource, id, variables }) => {
    const response = await fetchWithAuth(`/${resource}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(variables),
    });
    const data = await response.json();
    return { data };
  },

  deleteOne: async ({ resource, id }) => {
    await fetchWithAuth(`/${resource}/${id}`, { method: 'DELETE' });
    return { data: { id } as any };
  },

  getApiUrl: () => API_URL,
};
