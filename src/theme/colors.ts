export const Colors = {
  primary: '#2563eb',
  primaryLight: '#3b82f6',
  primaryDark: '#1d4ed8',

  background: '#f5f7fb',
  surface: '#ffffff',
  surfaceSecondary: '#f1f5f9',

  text: '#0f172a',
  textSecondary: '#64748b',
  textTertiary: '#94a3b8',
  textInverse: '#ffffff',

  border: '#e2e8f0',
  borderLight: 'rgba(148,163,184,0.18)',

  success: '#22c55e',
  successLight: '#dcfce7',
  error: '#ef4444',
  errorLight: '#fef2f2',
  warning: '#f59e0b',
  warningLight: '#fef3c7',

  matchFT: '#22c55e',
  matchLive: '#ef4444',
  matchUpcoming: '#64748b',
  matchPostponed: '#f59e0b',

  tabActive: '#2563eb',
  tabInactive: '#94a3b8',

  skeleton: '#e2e8f0',

  shadow: 'rgba(15,23,42,0.08)',
  shadowDark: 'rgba(15,23,42,0.15)',

  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

export type ColorKey = keyof typeof Colors;
