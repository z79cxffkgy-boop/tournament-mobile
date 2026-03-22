import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { getToken, getSSEUrl } from '../api/client';

// React Native には EventSource が無いため polyfill を使用
// @ts-ignore
import { EventSourcePolyfill } from 'event-source-polyfill';

export interface TournamentSignal {
  type: string;
  [key: string]: any;
}

type SignalHandler = (signal: TournamentSignal) => void;

/**
 * SSE hook with robust reconnection handling.
 *
 * The "Cannot open, already sending" error comes from EventSourcePolyfill's
 * internal reconnection trying to reuse an XHR that is still in SENDING state.
 * To fix this, we:
 * 1. Disable the polyfill's heartbeat timeout (set very high) so it doesn't
 *    trigger internal reconnections on its own
 * 2. Handle reconnection ourselves with proper cleanup
 * 3. Wrap everything in try-catch to suppress the polyfill's thrown errors
 */
export function useSSE(
  tournamentId: number | null | undefined,
  onSignal: SignalHandler,
) {
  const esRef = useRef<any>(null);
  const handlerRef = useRef(onSignal);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  handlerRef.current = onSignal;

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const closeConnection = useCallback(() => {
    clearRetryTimer();
    if (esRef.current) {
      try {
        // Remove all listeners before closing to prevent error callbacks
        esRef.current.onopen = null;
        esRef.current.onmessage = null;
        esRef.current.onerror = null;
        esRef.current.close();
      } catch {
        // Suppress any errors during close
      }
      esRef.current = null;
    }
  }, [clearRetryTimer]);

  const connect = useCallback(async () => {
    if (!tournamentId || !mountedRef.current) return;

    // Always close existing first
    closeConnection();

    try {
      const token = await getToken();
      if (!mountedRef.current) return;

      const url = `${getSSEUrl(tournamentId)}${token ? `?token=${token}` : ''}`;

      const es = new EventSourcePolyfill(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        // Set very high heartbeat timeout to prevent the polyfill from
        // triggering internal reconnection (which causes "Cannot open, already sending")
        heartbeatTimeout: 300000, // 5 minutes
      });

      esRef.current = es;

      es.onopen = () => {
        // Connection established successfully
      };

      es.onmessage = (event: any) => {
        try {
          const data = JSON.parse(event.data);
          if (mountedRef.current) {
            handlerRef.current(data);
          }
        } catch {
          // ignore non-JSON (heartbeat pings)
        }
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        // Close this broken connection completely
        closeConnection();
        // Schedule our own reconnection after a delay
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            connect();
          }
        }, 5000);
      };
    } catch {
      if (!mountedRef.current) return;
      // Schedule retry on connection failure
      retryTimerRef.current = setTimeout(() => {
        if (mountedRef.current) {
          connect();
        }
      }, 10000);
    }
  }, [tournamentId, closeConnection]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    // Reconnect when app comes back to foreground
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active' && mountedRef.current) {
        connect();
      } else if (state === 'background') {
        closeConnection();
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);

    return () => {
      mountedRef.current = false;
      closeConnection();
      sub.remove();
    };
  }, [connect, closeConnection]);
}
