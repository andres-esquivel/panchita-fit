import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DARK_COLORS, LIGHT_COLORS, BEAST_COLORS } from '../constants/theme';

const ThemeContext = createContext();

const STORAGE_KEY = '@panchita_theme';

export function ThemeProvider({ children }) {
  // 'dark' | 'light' | 'beast'
  const [theme, setThemeState] = useState('dark');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => {
        if (val === 'dark' || val === 'light' || val === 'beast') {
          setThemeState(val);
        }
        // Backward compat: old values were 'dark'/'light' strings — already handled above
      })
      .finally(() => setReady(true));
  }, []);

  function setTheme(t) {
    setThemeState(t);
    AsyncStorage.setItem(STORAGE_KEY, t).catch(() => {});
  }

  // Compat: isDark = true para 'dark' y 'beast' (ambos tienen fondo oscuro)
  const isDark = theme !== 'light';

  // Compat: toggleTheme alterna dark ↔ light (usado por código viejo)
  function toggleTheme() {
    setTheme(isDark ? 'light' : 'dark');
  }

  const colors = useMemo(() => {
    if (theme === 'beast') return BEAST_COLORS;
    if (theme === 'light') return LIGHT_COLORS;
    return DARK_COLORS;
  }, [theme]);

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ isDark, theme, setTheme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
