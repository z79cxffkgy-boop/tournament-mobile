import { createContext, useContext } from 'react';

export type UserRole = 'host' | 'captain' | 'guest' | null;

export interface AuthUser {
  role: UserRole;
  displayName: string | null;
  hostId: number | null;
  tournamentId: number | null;
  tournamentName: string | null;
  tournamentSlug: string | null;
  teamId: number | null;
  teamName: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (token: string, isHost: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthState>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
