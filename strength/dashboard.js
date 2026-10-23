// strength/dashboard.js — Datos de las tarjetas del Dashboard (funciones puras).
import {
  exerciseIdFromName, e1rmSeries, weeklyStrengthSummary, fromKg,
} from './engine.js';

export const DASHBOARD_TILES = [
  { id: 'week',       label: 'Entrenos' },
  { id: 'strength',   label: 'Fuerza' },
  { id: 'bodyweight', label: 'Peso corporal' },
  { id: 'volume',     label: 'Volumen' },
  { id: 'intensity',  label: 'Intensidad' },
  { id: 'records',    label: 'Récords' },
];
export const DEFAULT_TILE_ORDER = DASHBOARD_TILES.map(t => t.id);

/** Normaliza una config guardada: [{id, visible}] con todas las tarjetas conocidas. */
export function normalizeTileConfig(saved) {
  const known = new Set(DEFAULT_TILE_ORDER);
  const out = [];
  for (const t of Array.isArray(saved) ? saved : []) {
    if (t && known.has(t.id) && !out.some(o => o.id === t.id)) out.push({ id: t.id, visible: t.visible !== false });
  }
  for (const id of DEFAULT_TILE_ORDER) if (!out.some(o => o.id === id)) out.push({ id, visible: true });
  return out;
}

function iso(d) { return d.toISOString().split('T')[0]; }

/** Semana domingo–sábado, igual que getWeeklyVolume. offset 0 = esta semana. */
export function weekBounds(today = new Date(), offset = 0) {
  const start = new Date(today);
  start.setDate(start.getDate() - start.getDay() - offset * 7);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return { startStr: iso(start), endStr: iso(end) };
}

function pctDelta(now, before) {
  if (!(before > 0) || !Number.isFinite(now)) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

/**
 * logs: todos los logs; bodyWeights: [{date, weight}] (en la unidad del usuario)
 * unit: 'kg' | 'lb'; plannedDays: objetivo semanal.
 */
export function computeDashboard({ logs = [], bodyWeights = [], unit = 'kg', plannedDays = 5, today = new Date() } = {}) {
  const completed = logs.filter(l => l?.completed);
  const { startStr, endStr } = weekBounds(today, 0);

  // Entrenos de la semana
  const trainedDates = new Set(completed.filter(l => l.date >= startStr && l.date <= endStr).map(l => l.date));
  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const ds = iso(d);
    last7.push({ date: ds, trained: completed.some(l => l.date === ds) });
  }
  const week = { done: trainedDates.size, planned: plannedDays, last7 };

  // Peso corporal
  const bw = [...bodyWeights].filter(w => Number.isFinite(+w.weight)).sort((a, b) => a.date.localeCompare(b.date));
  let bodyweight = null;
  if (bw.length) {
    const last = bw[bw.length - 1];
    const cutoff = new Date(last.date + 'T12:00:00'); cutoff.setDate(cutoff.getDate() - 7);
    const ref = [...bw].reverse().find(w => w.date <= iso(cutoff));
    bodyweight = {
      value: +last.weight,
      delta: ref ? Math.round((+last.weight - +ref.weight) * 10) / 10 : null,
      series: bw.slice(-14).map(w => +w.weight),
    };
  }

  // Fuerza: ejercicio más frecuente en los últimos 60 días
  const since = new Date(today); since.setDate(since.getDate() - 60);
  const sinceStr = iso(since);
  const counts = {};
  const names = {};
  for (const l of completed) {
    if (l.date < sinceStr) continue;
    for (const ex of l.exercises || []) {
      const id = ex.exerciseId || exerciseIdFromName(ex.name);
      if (!(ex.sets || []).some(s => parseFloat(s.weight) > 0 && parseFloat(s.reps) > 0)) continue;
      counts[id] = (counts[id] || 0) + 1; names[id] = ex.name;
    }
  }
  const topId = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  let strength = null;
  if (topId) {
    const series = e1rmSeries(completed, topId, unit).slice(-8);
    if (series.length) {
      const lastV = series[series.length - 1].e1rm;
      strength = { name: names[topId], value: lastV, deltaPct: series.length > 1 ? pctDelta(lastV, series[0].e1rm) : null, series: series.map(p => p.e1rm) };
    }
  }

  // Volumen: últimas 6 semanas
  const weeks = [];
  for (let off = 5; off >= 0; off--) {
    const b = weekBounds(today, off);
    weeks.push(weeklyStrengthSummary(completed, b.startStr, b.endStr));
  }
  const thisW = weeks[weeks.length - 1], lastW = weeks[weeks.length - 2];
  const volume = {
    value: Math.round(fromKg(thisW.volumeKg, unit)),
    deltaPct: pctDelta(thisW.volumeKg, lastW.volumeKg),
    series: weeks.map(w => Math.round(fromKg(w.volumeKg, unit))),
  };

  const intensity = { avgRir: thisW.avgRir, failureSets: thisW.failureSets, rirSets: thisW.rirSets };
  const records = { list: thisW.records.map(r => ({ name: r.name, value: Math.round(fromKg(r.e1rmKg, unit) * 10) / 10 })) };

  return { week, bodyweight, strength, volume, intensity, records, unit };
}
