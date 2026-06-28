// ─── Helper para construir una paleta completa ────────────────
// Los nombres de tokens siguen la convención original (purple/purpleLight/purpleDim)
// por compatibilidad con el código existente.
// 'purple'      = color accent principal
// 'purpleLight' = color accent secundario / botones
// 'purpleDim'   = accent semitransparente (fondos, bordes)
// 'accentText'  = color de texto sobre el accent (blanco o negro según contraste)
function makePalette(
  bg, bgCard, bgInput,
  accent, accentLight, accentDim,
  white, gray, grayLight,
  danger,
  { teal, lime, limeDark, accentText } = {}
) {
  return {
    bg, bgCard, bgInput,
    purple:      accent,
    purpleLight: accentLight,
    purpleDim:   accentDim,
    accentText:  accentText  || '#ffffff',
    white, gray, grayLight, danger,
    teal:     teal     || accent,
    lime:     lime     || accentLight,
    limeDark: limeDark || accent,
  };
}

// ─── Paletas ──────────────────────────────────────────────────
export const PALETTES = {
  // 🌙 Noche Púrpura — default
  purple: makePalette(
    '#0d0d1a', '#1a1130', '#241840',
    '#7c3aed', '#a855f7', 'rgba(124,58,237,0.22)',
    '#ffffff', '#6b7280', '#9ca3af', '#ef4444',
    { teal:'#0891b2', lime:'#a3e635', limeDark:'#65a30d', accentText:'#ffffff' }
  ),
  // ☀️ Día Claro
  light: makePalette(
    '#f8f8f8', '#ffffff', '#ede9fe',
    '#6d28d9', '#7c3aed', '#ddd6fe',
    '#1e1b4b', '#6b7280', '#4b5563', '#dc2626',
    { teal:'#0e7490', lime:'#4d7c0f', limeDark:'#365314', accentText:'#ffffff' }
  ),
  // ⚡ Modo Bestia
  beast: makePalette(
    '#0a0a0a', '#1a1a1a', '#111111',
    '#39ff14', '#00ff88', 'rgba(57,255,20,0.14)',
    '#ffffff', '#888888', '#aaaaaa', '#ff4444',
    { teal:'#00ff88', lime:'#39ff14', limeDark:'#00cc0a', accentText:'#000000' }
  ),
  // 🌊 Océano
  ocean: makePalette(
    '#0a1628', '#0d2241', '#0f2d55',
    '#0ea5e9', '#38bdf8', 'rgba(14,165,233,0.18)',
    '#f0f9ff', '#64748b', '#94a3b8', '#ef4444',
    { teal:'#38bdf8', lime:'#67e8f9', limeDark:'#0284c7', accentText:'#ffffff' }
  ),
  // 🔥 Fuego
  fire: makePalette(
    '#1a0a0a', '#2a1010', '#3a1818',
    '#ef4444', '#f97316', 'rgba(239,68,68,0.18)',
    '#fff7f7', '#78716c', '#a8a29e', '#ef4444',
    { teal:'#f97316', lime:'#fbbf24', limeDark:'#d97706', accentText:'#ffffff' }
  ),
  // 🌿 Selva
  jungle: makePalette(
    '#0a1a0a', '#0d2a0d', '#103810',
    '#22c55e', '#4ade80', 'rgba(34,197,94,0.18)',
    '#f0fff4', '#6b7280', '#9ca3af', '#ef4444',
    { teal:'#4ade80', lime:'#86efac', limeDark:'#16a34a', accentText:'#000000' }
  ),
};

// ─── Backward compat ──────────────────────────────────────────
export const DARK_COLORS  = PALETTES.purple;
export const LIGHT_COLORS = PALETTES.light;
export const BEAST_COLORS = PALETTES.beast;
export const COLORS       = PALETTES.purple;

// ─── Tipografía ───────────────────────────────────────────────
export const FONTS = {
  bold:     '700',
  semibold: '600',
  medium:   '500',
  regular:  '400',
};

// ─── Radios ───────────────────────────────────────────────────
export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   18,
  xl:   24,
  full: 999,
};
