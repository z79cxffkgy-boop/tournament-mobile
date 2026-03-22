import * as SecureStore from 'expo-secure-store';

// .env の EXPO_PUBLIC_API_URL を使用（Expo の環境変数は EXPO_PUBLIC_ プレフィクス必須）
// フォールバックとして localhost を使用
const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

const TOKEN_KEY_HOST = 'tf_access_token';
const TOKEN_KEY_GUEST = 'tf_guest_token';

export async function getToken(): Promise<string | null> {
  const host = await SecureStore.getItemAsync(TOKEN_KEY_HOST);
  if (host) return host;
  return SecureStore.getItemAsync(TOKEN_KEY_GUEST);
}

export async function setHostToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY_HOST, token);
}

export async function setGuestToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY_GUEST, token);
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY_HOST);
  await SecureStore.deleteItemAsync(TOKEN_KEY_GUEST);
}

export async function getHostToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY_HOST);
}

export async function getGuestToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY_GUEST);
}

type FetchOptions = RequestInit & { skipAuth?: boolean };

export async function apiFetch<T = any>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { skipAuth, ...init } = options;
  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(init.headers || {});

  if (!skipAuth) {
    const token = await getToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  if (
    init.body &&
    typeof init.body === 'string' &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401 && !skipAuth) {
    // Token expired – caller should handle re-auth
    throw new AuthError('Session expired');
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ApiError(response.status, text || response.statusText);
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  return response.text() as unknown as T;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export function getSSEUrl(tournamentId: number): string {
  return `${API_BASE_URL}/tournaments/${tournamentId}/sse`;
}

export { API_BASE_URL };
