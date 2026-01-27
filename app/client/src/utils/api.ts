const API_BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('token');
}

// APIエラークラス（エラー種別を識別可能にする）
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'エラーが発生しました' }));
    const errorMessage = errorData.error || 'エラーが発生しました';

    // 401 Unauthorized: トークン無効・期限切れ
    if (response.status === 401) {
      localStorage.removeItem('token');
      // カスタムイベントを発火してReact状態を同期
      window.dispatchEvent(new CustomEvent('auth:logout'));
    }

    throw new ApiError(errorMessage, response.status);
  }

  return response.json();
}

// 認証API
export const auth = {
  register: (data: { email: string; password: string; name: string }) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>(
      '/auth/register',
      { method: 'POST', body: JSON.stringify(data) }
    ),
  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: { id: string; email: string; name: string } }>(
      '/auth/login',
      { method: 'POST', body: JSON.stringify(data) }
    ),
  me: () => request<{ id: string; email: string; name: string }>('/auth/me'),
  deleteAccount: (password: string) =>
    request<{ message: string }>('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    }),
};

// プロジェクトAPI
export const projects = {
  list: () => request<any[]>('/projects'),
  create: (data: { name: string }) =>
    request<any>('/projects', { method: 'POST', body: JSON.stringify(data) }),
  get: (projectId: string) => request<any>(`/projects/${projectId}`),
};

// メンバーAPI
export const members = {
  list: (projectId: string) => request<any[]>(`/projects/${projectId}/members`),
  add: (projectId: string, data: { email: string; role: string }) =>
    request<any>(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  update: (projectId: string, userId: string, data: { role: string }) =>
    request<any>(`/projects/${projectId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  remove: (projectId: string, userId: string) =>
    request<any>(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE',
    }),
};

// KPI API
export const kpi = {
  getMaster: () => request<any[]>('/kpi-master'),
  addKpi: (data: {
    id: string;
    agent: string;
    category: string;
    name: string;
    unit: string;
    default_target: number;
    benchmark_min: number;
    benchmark_max: number;
    level: number;
    parent_kpi_id: string | null;
    description: string;
  }) =>
    request<any>('/kpi-master', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateKpi: (kpiId: string, data: any) =>
    request<any>(`/kpi-master/${kpiId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteKpi: (kpiId: string) =>
    request<any>(`/kpi-master/${kpiId}`, {
      method: 'DELETE',
    }),
  getTargets: (projectId: string, year: number) =>
    request<any[]>(`/projects/${projectId}/targets?year=${year}`),
  setTargets: (projectId: string, targets: any[]) =>
    request<any>(`/projects/${projectId}/targets`, {
      method: 'POST',
      body: JSON.stringify({ targets }),
    }),
  getActuals: (projectId: string, year: number, month?: number) => {
    let url = `/projects/${projectId}/actuals?year=${year}`;
    if (month) url += `&month=${month}`;
    return request<any[]>(url);
  },
  setActuals: (projectId: string, actuals: any[]) =>
    request<any>(`/projects/${projectId}/actuals`, {
      method: 'POST',
      body: JSON.stringify({ actuals }),
    }),
  getSummary: (projectId: string, year: number, month: number) =>
    request<any>(`/projects/${projectId}/summary?year=${year}&month=${month}`),
};

// エクスポート/インポートAPI
export const dataIO = {
  export: (projectId: string) => request<any>(`/projects/${projectId}/export`),
  import: (projectId: string, data: any) =>
    request<any>(`/projects/${projectId}/import`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
