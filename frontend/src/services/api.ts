import { getStoredUserId } from './sessionStorage';
import { getStoredAdminPin } from './adminAuth';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let code = 'UNKNOWN_ERROR';
    let message = 'No hemos podido completar la petición.';
    try {
      const data = (await response.json()) as { code?: string; message?: string };
      if (data.code) code = data.code;
      if (data.message) message = data.message;
    } catch {
      // el cuerpo no era JSON: nos quedamos con el mensaje genérico
    }
    throw new ApiError(response.status, code, message);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

function authHeaders(): Headers {
  const headers = new Headers();
  const userId = getStoredUserId();
  if (userId) headers.set('X-User-Id', userId);
  const adminPin = getStoredAdminPin();
  if (adminPin) headers.set('X-Admin-Pin', adminPin);
  return headers;
}

interface RequestOptions {
  method?: string;
  json?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = authHeaders();
  let body: string | undefined;
  if (options.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(options.json);
  }
  const response = await fetch(path, { method: options.method ?? 'GET', headers, body });
  return handleResponse<T>(response);
}

async function requestForm<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(path, { method: 'POST', headers: authHeaders(), body: form });
  return handleResponse<T>(response);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: 'POST', json }),
  postForm: <T>(path: string, form: FormData) => requestForm<T>(path, form),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: 'PATCH', json }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
