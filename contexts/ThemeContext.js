import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PALETTES } from '../constants/theme';

const ThemeContext = createContext();

const STORAGE_KEY = '@panchita_theme';
const VALID_PALETTES = ['purple', 'light', 'beast', 'ocean', 'fire', 'jungle'];

// Migración de valores viejos → nuevas claves
function migratePaletteKey(val) {
  if (!val) return 'purple';
  if (val === 'dark') return 'purple';   // 'dark' era el default viejo
  if (VALID_PALETTES.includes(val)) return val;
  return 'purple';
}

export function ThemeProvider({ children }) {
  const [palette, setPaletteState] = useState('purple');
  const [ready,   setReady]        = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then(val => setPaletteState(migratePaletteKey(val)))
      .finally(() => setReady(true));
  }, []);

  function setTheme(key) {
    if (!VALID_PALETTES.includes(key)) return;
    setPaletteState(key);
    AsyncStorage.setItem(STORAGE_KEY, key).catch(() => {});
  }

  // Backward compat
  const isDark    = palette !== 'light';
  const theme     = palette; // theme === palette key

  function toggleTheme() {
    setTheme(isDark ? 'light' : 'purple');
  }

  const colors = useMemo(() => PALETTES[palette] || PALETTES.purple, [palette]);

  if (!ready) return null;

  return (
    <ThemeContext.Provider value={{ isDark, theme, palette, setTheme, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de ThemeProvider');
  return ctx;
}
