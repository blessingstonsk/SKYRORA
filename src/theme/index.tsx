// SKYRO design tokens. Dark is the default; light is available in Settings.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

const dark = {
  bg: '#06080D',
  surface: '#0E121A',
  surface2: '#161B26',
  surface3: '#1E2430',
  border: '#232A37',
  text: '#F3F6FA',
  muted: '#8D97A9',
  faint: '#5B6578',
  primary: '#2EE6C5',
  primaryText: '#03120F',
  secondary: '#7C6CFF',
  warm: '#FFB547',
  danger: '#FF5C7A',
  success: '#3DDC84',
  info: '#4DA3FF',
  map: '#0B1018',
  mapGrid: '#141B26',
  overlay: 'rgba(3,5,9,0.72)',
};

const light: typeof dark = {
  bg: '#F3F5F9',
  surface: '#FFFFFF',
  surface2: '#EDF0F5',
  surface3: '#E2E7EF',
  border: '#DDE3EC',
  text: '#0A0E15',
  muted: '#5A6475',
  faint: '#8D96A6',
  primary: '#0AAE93',
  primaryText: '#FFFFFF',
  secondary: '#5B4CF0',
  warm: '#E58E00',
  danger: '#E5284F',
  success: '#159F55',
  info: '#1F7AE0',
  map: '#E6ECF3',
  mapGrid: '#D6DEE8',
  overlay: 'rgba(10,14,21,0.5)',
};

export type Colors = typeof dark;
export type ThemeMode = 'dark' | 'light' | 'system';

export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
export const space = (n: number) => n * 4;

export const type = {
  hero: { fontSize: 44, fontWeight: '800' as const, letterSpacing: -1.5, fontVariant: ['tabular-nums' as const] },
  stat: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.8, fontVariant: ['tabular-nums' as const] },
  h1: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.6 },
  h2: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.3 },
  h3: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '400' as const, lineHeight: 21 },
  small: { fontSize: 13, fontWeight: '500' as const },
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 1, textTransform: 'uppercase' as const },
};

/** Accent gradients used for hero cards, buttons and challenge banners. */
export const gradients = {
  brand: ['#2EE6C5', '#4DA3FF', '#7C6CFF'] as const,
  warm: ['#FFB547', '#FF5C7A'] as const,
  night: ['#141B2B', '#0B0F18'] as const,
  dawn: ['#E9FBF7', '#EAF0FF'] as const,
};

interface ThemeCtx {
  c: Colors;
  isDark: boolean;
  mode: ThemeMode;
  setMode(m: ThemeMode): void;
}

const Ctx = createContext<ThemeCtx>({ c: dark, isDark: true, mode: 'dark', setMode: () => {} });
const KEY = 'skyro.theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('dark');
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v && setModeState(v as ThemeMode)).catch(() => {});
  }, []);
  const value = useMemo<ThemeCtx>(() => {
    const isDark = mode === 'system' ? system !== 'light' : mode === 'dark';
    return {
      c: isDark ? dark : light,
      isDark,
      mode,
      setMode: (m) => {
        setModeState(m);
        AsyncStorage.setItem(KEY, m).catch(() => {});
      },
    };
  }, [mode, system]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
