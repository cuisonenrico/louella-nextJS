import type { APIRequestContext, APIResponse } from '@playwright/test';

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const BASE = '/api/v1';

/** Setup and cross-checks only — never the action under test. */
export class Api {
  private constructor(
    private readonly request: APIRequestContext,
    private readonly creds: { email: string; password: string },
    private token: string,
  ) {}

  static async login(request: APIRequestContext, creds: { email: string; password: string }): Promise<Api> {
    return new Api(request, creds, await Api.fetchToken(request, creds));
  }

  private static async fetchToken(request: APIRequestContext, creds: { email: string; password: string }) {
    const res = await request.post(`${BASE}/auth/login`, { data: creds });
    if (!res.ok()) throw new Error(`login ${creds.email} → ${res.status()}: ${await res.text()}`);
    return ((await res.json()) as { accessToken: string }).accessToken;
  }

  async raw(
    method: Method,
    path: string,
    data?: unknown,
    params?: Record<string, string | number>,
  ): Promise<APIResponse> {
    const send = () =>
      this.request.fetch(`${BASE}${path}`, {
        method,
        data,
        params,
        headers: { Authorization: `Bearer ${this.token}` },
      });
    let res = await send();
    if (res.status() === 401) {
      this.token = await Api.fetchToken(this.request, this.creds);
      res = await send();
    }
    return res;
  }

  private async json<T>(
    method: Method,
    path: string,
    data?: unknown,
    params?: Record<string, string | number>,
  ): Promise<T> {
    const res = await this.raw(method, path, data, params);
    if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()}: ${await res.text()}`);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  get<T>(path: string, params?: Record<string, string | number>) {
    return this.json<T>('GET', path, undefined, params);
  }
  post<T>(path: string, data?: unknown) {
    return this.json<T>('POST', path, data);
  }
  patch<T>(path: string, data?: unknown) {
    return this.json<T>('PATCH', path, data);
  }
  put<T>(path: string, data?: unknown) {
    return this.json<T>('PUT', path, data);
  }
}
