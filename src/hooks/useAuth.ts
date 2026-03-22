import { useState, useCallback, useEffect } from 'react';
import {
  apiFetch,
  setHostToken,
  setGuestToken,
  clearTokens,
  getToken,
} from '../api/client';
import type { AuthUser, AuthState } from '../store/auth';

export function useAuthProvider(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchMe = useCallback(async (): Promise<AuthUser | null> => {
    try {
      const token = await getToken();
      if (!token) return null;
      const data = await apiFetch('/auth/me');
      return {
        role: data.role,
        displayName: data.display_name ?? null,
        hostId: data.host_id ?? null,
        tournamentId: data.tournament_id ?? null,
        tournamentName: data.tournament_name ?? null,
        tournamentSlug: data.tournament_slug ?? null,
        teamId: data.team_id ?? null,
        teamName: data.team_name ?? null,
      };
    } catch {
      return null;
    }
  }, []);

  const refreshUser = useCallback(async () => {
    setIsLoading(true);
    const u = await fetchMe();
    setUser(u);
    setIsLoading(false);
  }, [fetchMe]);

  const login = useCallback(
    async (token: string, isHost: boolean) => {
      if (isHost) {
        await setHostToken(token);
      } else {
        await setGuestToken(token);
      }
      await refreshUser();
    },
    [refreshUser],
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    await clearTokens();
    setUser(null);
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    refreshUser,
  };
}
