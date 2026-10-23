// strength/engine.js — Motor de fuerza de PanchitaFit.
// Implementación propia inspirada en el análisis del modelo de MacroFactor Workouts:
//   · %1RM por "reps efectivas" (reps + RIR + 0.5): 1.013 · 0.972^eff
//   · Fatiga entre series según RIR y descanso real
//   · Modelo por ejercicio ajustado con tus registros (peso = coef · base^eff)
// Funciones puras, sin React ni Firebase, para poder probarlas con node.

export const KG_TO_LB = 2.20462;
export const PCT_COEF = 1.013;
export const DEFAULT_BASE = 0.972;
export const DEFAULT_RIR = 1;          // si una serie vieja no tiene RIR, asumimos 1
export const MIN_BASE = 0.94;
export const MAX_BASE = 0.99;
export const WARMUP_PERCENTS = [0.4, 0.6, 0.8, 0.95];

// ─── Utilidades ──────────────────────────────────────────
export function num(v) {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseRir(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10) : null;
}

export function toKg(weight, unit = 'kg') {
  const n = num(weight);
  if (n === null) return null;
  return unit === 'lb' ? n / KG_TO_LB : n;
}

export function fromKg(kg, unit = 'kg') {
  if (kg === null || kg === undefined || !Number.isFinite(kg)) return null;
  return unit === 'lb' ? kg * KG_TO_LB : kg;
}

/** Redondea al incremento usable: 0.5 kg o 1 lb. */
export function roundWeight(value, unit = 'kg') {
  if (value === null || !Number.isFinite(value)) return null;
  const step = unit === 'lb' ? 1 : 0.5;
  return Math.round(value / step) * step;
}

export function formatWeight(value, unit = 'kg') {
  const r = roundWeight(value, unit);
  if (r === null) return '';
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** Id estable a partir del nombre ("Press Banca " → "press-banca"). */
export function exerciseIdFromName(name = '') {
  return String(name)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'ejercicio';
}

// ─── Curva de fuerza ─────────────────────────────────────
export function effectiveReps(reps, rir) {
  return reps + (rir ?? DEFAULT_RIR) + 0.5;
}

/** Fracción del 1RM que se puede mover para esas reps con ese RIR. */
export function pct1RM(reps, rir) {
  return PCT_COEF * Math.pow(DEFAULT_BASE, effectiveReps(reps, rir));
}

/** 1RM estimado (en la misma unidad que weight). */
export function estimate1RM(weight, reps, rir) {
  if (!(weight > 0) || !(reps > 0)) return null;
  return weight / pct1RM(reps, rir);
}

// ─── Fatiga entre series ─────────────────────────────────
/** Fatiga residual según descanso (más descanso → menos fatiga). */
export function restFactor(restSec) {
  const sec = Number.isFinite(restSec) ? restSec : 120;
  if (Math.floor(sec / 60) > 10) return 0.05;
  const minutes = Math.max(sec, 5) / 60;
  return 0.405 - 0.147 * Math.log(minutes);
}

/** Fracción de capacidad (reps efectivas) que se pierde para la siguiente serie. */
export function fatigueFraction(reps, rir, restSec) {
  const r = rir ?? DEFAULT_RIR;
  const proximity = r > 0 ? 0.973 * Math.exp(-4.47 * (r + 0.5) / (reps + 0.5)) : 1;
  return Math.min(0.9, Math.max(0, proximity * restFactor(restSec)));
}

/**
 * Multiplicador de peso para repetir las mismas reps y RIR en la siguiente serie.
 * Ej: 0.95 → bajar 5 %.
 */
export function nextSetWeightRatio(reps, rir, restSec) {
  const r = rir ?? DEFAULT_RIR;
  const eff = effectiveReps(reps, r);
  const effNext = Math.max(0.5, eff * (1 - fatigueFraction(reps, r, restSec)) - (r > 0 ? 0.5 : 0));
  return Math.pow(DEFAULT_BASE, eff - effNext);
}

// ─── Modelo por ejercicio ────────────────────────────────
/**
 * points: [{ weightKg, reps, rir, date }] (solo series válidas).
 * Devuelve { coef, base, e1rmKg, points } o null si no hay datos.
 * - base: pendiente personal de la curva, solo si hay suficiente variedad de reps;
 *         si no, la curva por defecto. Siempre acotada a [0.94, 0.99].
 * - coef: anclado a la sesión más reciente para que el modelo siga tu forma actual.
 */
export function fitExerciseModel(points = []) {
  const valid = points.filter(p => p && p.weightKg > 0 && p.reps > 0 && p.reps <= 30);
  if (!valid.length) return null;

  const dates = [...new Set(valid.map(p => p.date || ''))].sort();
  const recentDates = new Set(dates.slice(-4));
  const recent = valid.filter(p => recentDates.has(p.date || ''));

  let base = DEFAULT_BASE;
  const xs = recent.map(p => effectiveReps(p.reps, p.rir));
  const spread = Math.max(...xs) - Math.min(...xs);
  if (recent.length >= 4 && spread >= 3) {
    const ly = recent.map(p => Math.log(p.weightKg));
    const n = xs.length;
    const sx = xs.reduce((a, b) => a + b, 0);
    const sy = ly.reduce((a, b) => a + b, 0);
    const sxx = xs.reduce((a, x) => a + x * x, 0);
    const sxy = xs.reduce((a, x, i) => a + x * ly[i], 0);
    const den = n * sxx - sx * sx;
    if (den > 0) {
      const slope = (n * sxy - sx * sy) / den;
      base = Math.min(MAX_BASE, Math.max(MIN_BASE, Math.exp(slope)));
    }
  }

  const lastDate = dates[dates.length - 1];
  const last = valid.filter(p => (p.date || '') === lastDate);
  const coefs = last.map(p => p.weightKg / Math.pow(base, effectiveReps(p.reps, p.rir))).sort((a, b) => a - b);
  const coef = coefs[Math.floor((coefs.length - 1) / 2)]; // mediana (baja) = conservador

  // 1RM = peso para 1 rep a RIR 0 (reps efectivas 1.5)
  return { coef, base, e1rmKg: coef * Math.pow(base, 1.5), points: valid.length };
}

/** Peso (kg) que el modelo predice para reps + RIR objetivo. */
export function predictWeightKg(model, reps, rir) {
  if (!model || !(reps > 0)) return null;
  return model.coef * Math.pow(model.base, effectiveReps(reps, rir));
}

// ─── Sugerencias para la sesión ──────────────────────────
/**
 * Sugerencia de una serie.
 * - Si la serie anterior del mismo ejercicio ya está hecha hoy: ajusta por fatiga
 *   (mismas reps y RIR con el descanso planeado).
 * - Si no: usa el modelo del historial con las reps/RIR objetivo de la última sesión.
 * Devuelve { weightKg, reps, rir, source } o null.
 */
export function suggestSet({ model, prevSetToday, target, restSec }) {
  if (prevSetToday && prevSetToday.weightKg > 0 && prevSetToday.reps > 0) {
    const ratio = nextSetWeightRatio(prevSetToday.reps, prevSetToday.rir, restSec);
    return {
      weightKg: prevSetToday.weightKg * ratio,
      reps: prevSetToday.reps,
      rir: prevSetToday.rir ?? DEFAULT_RIR,
      source: 'fatigue',
    };
  }
  if (model && target && target.reps > 0) {
    const rir = target.rir ?? DEFAULT_RIR;
    return { weightKg: predictWeightKg(model, target.reps, rir), reps: target.reps, rir, source: 'model' };
  }
  return null;
}

/** Calentamiento: 40/60/80/95 % del peso de trabajo, sin repetir pesos. */
export function warmupWeights(workingWeight, unit = 'kg') {
  if (!(workingWeight > 0)) return [];
  const minUseful = unit === 'lb' ? 40 : 20;
  if (workingWeight < minUseful) return [];
  const out = [];
  for (const p of WARMUP_PERCENTS) {
    const w = roundWeight(workingWeight * p, unit);
    if (w > 0 && w < workingWeight && !out.includes(w)) out.push(w);
  }
  return out;
}

// ─── Historial → puntos ──────────────────────────────────
/**
 * Extrae los puntos de un ejercicio desde los logs completados.
 * Acepta logs viejos (solo reps/weight como texto).
 */
export function exercisePointsFromLogs(logs = [], exerciseId, { beforeDate } = {}) {
  const out = [];
  for (const log of logs) {
    if (!log?.completed) continue;
    if (beforeDate && !(String(log.date) < beforeDate)) continue;
    for (const ex of log.exercises || []) {
      const id = ex.exerciseId || exerciseIdFromName(ex.name);
      if (id !== exerciseId) continue;
      for (const st of ex.sets || []) {
        const reps = num(st.reps);
        const weightKg = toKg(st.weight, ex.unit || 'kg');
        if (!(reps > 0) || !(weightKg > 0)) continue;
        out.push({ weightKg, reps, rir: parseRir(st.rir), date: log.date });
      }
    }
  }
  return out;
}

/** Mejor 1RM estimado por fecha para gráficas de progreso. */
export function e1rmSeries(logs = [], exerciseId, unit = 'kg') {
  const byDate = {};
  for (const p of exercisePointsFromLogs(logs, exerciseId)) {
    const e = estimate1RM(p.weightKg, p.reps, p.rir);
    if (e && (!byDate[p.date] || byDate[p.date] < e)) byDate[p.date] = e;
  }
  return Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, kg]) => ({ date, e1rm: Math.round(fromKg(kg, unit) * 10) / 10 }));
}

// ─── Récords y resumen semanal ───────────────────────────
/** Mejor 1RM estimado (kg) por ejercicio en los logs dados. { id: { kg, name } } */
export function bestE1rmByExercise(logs = [], { beforeDate } = {}) {
  const best = {};
  for (const log of logs) {
    if (!log?.completed) continue;
    if (beforeDate && !(String(log.date) < beforeDate)) continue;
    for (const ex of log.exercises || []) {
      const id = ex.exerciseId || exerciseIdFromName(ex.name);
      for (const st of ex.sets || []) {
        const e = estimate1RM(toKg(st.weight, ex.unit || 'kg'), num(st.reps), parseRir(st.rir));
        if (e && (!best[id] || e > best[id].kg)) best[id] = { kg: e, name: ex.name };
      }
    }
  }
  return best;
}

/** ¿Esta serie supera el mejor 1RM estimado previo? (margen 0.5 % para evitar falsos récords) */
export function isNewRecord(prevBestKg, weightKg, reps, rir) {
  const e = estimate1RM(weightKg, reps, rir);
  if (!e || !(prevBestKg > 0)) return false;
  return e > prevBestKg * 1.005;
}

/**
 * Resumen de la semana [startStr, endStr]:
 * volumen en kg (convierte lb), series con RIR, series al fallo, RIR promedio y récords.
 */
export function weeklyStrengthSummary(logs = [], startStr, endStr) {
  const inWeek = l => l?.completed && l.date >= startStr && l.date <= endStr;
  const prevBest = bestE1rmByExercise(logs, { beforeDate: startStr });
  const weekBest = bestE1rmByExercise(logs.filter(inWeek));
  let volumeKg = 0, rirSets = 0, rirSum = 0, failureSets = 0, hardSets = 0;
  for (const log of logs.filter(inWeek)) {
    for (const ex of log.exercises || []) {
      for (const st of ex.sets || []) {
        const w = toKg(st.weight, ex.unit || 'kg'), r = num(st.reps);
        if (w > 0 && r > 0) volumeKg += w * r;
        const rir = parseRir(st.rir);
        if (rir === null) continue;
        rirSets++; rirSum += rir;
        if (rir === 0) failureSets++;
        if (rir <= 3) hardSets++;
      }
    }
  }
  const records = Object.entries(weekBest)
    .filter(([id, b]) => prevBest[id] && b.kg > prevBest[id].kg * 1.005)
    .map(([id, b]) => ({ id, name: b.name, e1rmKg: b.kg, prevKg: prevBest[id].kg }))
    .sort((a, b) => (b.e1rmKg / b.prevKg) - (a.e1rmKg / a.prevKg));
  return {
    volumeKg: Math.round(volumeKg),
    rirSets, failureSets, hardSets,
    avgRir: rirSets ? Math.round((rirSum / rirSets) * 10) / 10 : null,
    records,
  };
}
