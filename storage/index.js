import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  doc, collection, getDoc, setDoc, getDocs, deleteDoc, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../config/firebase';

// ─── Helpers ──────────────────────────────────────────────
function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error('No user authenticated');
  return u.uid;
}

function userDoc(path)  { return doc(db, 'users', uid(), ...path.split('/')); }
function userCol(path)  { return collection(db, 'users', uid(), ...path.split('/')); }

function withTimeout(promise, ms = 6000, label = 'operacion') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    }),
  ]);
}

async function getAll(colPath) {
  const snap = await getDocs(userCol(colPath));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function localKey(name) {
  return `panchita_${uid()}_${name}`;
}

async function getLocalList(name) {
  try {
    const raw = await AsyncStorage.getItem(localKey(name));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function setLocalList(name, items) {
  try {
    await AsyncStorage.setItem(localKey(name), JSON.stringify(items));
  } catch (error) {
    console.warn('AsyncStorage save failed:', error);
  }
}

function mergeById(primary = [], secondary = []) {
  const map = new Map();
  [...secondary, ...primary].forEach(item => {
    if (item?.id) map.set(item.id, item);
  });
  return [...map.values()];
}

// ─── Onboarding (device-local) ─────────────────────────────
const ONBOARDED_KEY = 'panchita_onboarded';

export async function isOnboarded() {
  const val = await AsyncStorage.getItem(ONBOARDED_KEY);
  return val === 'true';
}

export async function setOnboarded() {
  await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
}

// ─── Usuario / Perfil ─────────────────────────────────────
export async function getUser() {
  try {
    const snap = await getDoc(userDoc('profile/data'));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

export async function saveUser(user) {
  await setDoc(userDoc('profile/data'), user, { merge: true });
}

// ─── Rutinas base ──────────────────────────────────────────
export async function getWorkouts() {
  try { return await getAll('workouts'); }
  catch { return []; }
}

export async function saveWorkouts(workouts) {
  const batch = writeBatch(db);
  for (const w of workouts) {
    const ref = doc(userCol('workouts'), w.id || w.workoutId || String(Date.now()));
    batch.set(ref, w, { merge: true });
  }
  await batch.commit();
}

// ─── Rutinas custom ────────────────────────────────────────
export async function getCustomRoutines() {
  const local = await getLocalList('customRoutines');
  try {
    const remote = await withTimeout(getAll('customRoutines'), 3500, 'customRoutines');
    // Merge inteligente: si Firestore tiene la rutina pero sin ejercicios
    // (sync parcial anterior), preservar los ejercicios del local.
    const baseMap = new Map();
    local.forEach(r => { if (r?.id) baseMap.set(r.id, r); });
    const merged = mergeById(remote, local).map(routine => {
      const hasExercises = Array.isArray(routine.exercises) && routine.exercises.length > 0;
      if (!hasExercises) {
        const localVersion = baseMap.get(routine.id);
        if (localVersion?.exercises?.length > 0) {
          const fixed = { ...routine, exercises: localVersion.exercises };
          // Re-sync al Firestore en background para corregir el dato remoto
          withTimeout(
            setDoc(doc(userCol('customRoutines'), routine.id), fixed, { merge: true }),
            6500, 'fixRoutineExercises'
          ).catch(e => console.warn('Re-sync routine exercises failed:', e));
          return fixed;
        }
      }
      return routine;
    });
    await setLocalList('customRoutines', merged);
    return merged;
  } catch {
    return local;
  }
}

export async function saveCustomRoutine(routine) {
  const id = routine.id || String(Date.now());
  const normalized = { ...routine, id };

  // Primero guardamos local para que móvil nunca quede cargando si Firebase tarda.
  const local = await getLocalList('customRoutines');
  const updated = mergeById([normalized], local);
  await setLocalList('customRoutines', updated);

  // Luego sincronizamos en segundo plano. Si Firebase se duerme, la app sigue usable.
  withTimeout(
    setDoc(doc(userCol('customRoutines'), id), normalized, { merge: true }),
    6500,
    'saveCustomRoutine'
  ).catch(error => console.warn('Remote custom routine sync failed:', error));

  return normalized;
}

export async function deleteCustomRoutine(id) {
  const local = await getLocalList('customRoutines');
  await setLocalList('customRoutines', local.filter(item => item.id !== id));
  withTimeout(deleteDoc(doc(userCol('customRoutines'), id)), 6500, 'deleteCustomRoutine')
    .catch(error => console.warn('Remote custom routine delete failed:', error));
}

// ─── Logs de sesiones ──────────────────────────────────────
export async function getLogs() {
  const local = await getLocalList('logs');
  try {
    const remote = await withTimeout(getAll('logs'), 5000, 'logs');
    const merged = mergeById(remote, local);
    await setLocalList('logs', merged);
    return merged;
  } catch {
    return local;
  }
}

export async function saveLog(log) {
  const id = `${log.date}_${log.workoutId || 'session'}`;
  const normalized = { ...log, id, updatedAt: new Date().toISOString() };

  // Local primero: las reps quedan guardadas aunque Firebase tarde o el móvil pierda conexión.
  const local = await getLocalList('logs');
  const updated = mergeById([normalized], local);
  await setLocalList('logs', updated);

  // Sync remoto en segundo plano. Panchita no espera al WiFi para contar reps.
  withTimeout(
    setDoc(doc(userCol('logs'), id), normalized, { merge: true }),
    6500,
    'saveLog'
  ).catch(error => console.warn('Remote log sync failed:', error));

  return normalized;
}

export async function getLastLog(workoutId) {
  const logs = await getLogs();
  return logs.filter(l => l.workoutId === workoutId && l.completed)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

export async function getWeekActivity() {
  const logs = await getLogs();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    days.push({ date: dateStr, trained: !!logs.find(l => l.date === dateStr && l.completed) });
  }
  return days;
}

// ─── Peso corporal ─────────────────────────────────────────
export async function getBodyWeights() {
  try {
    const items = await getAll('weightLog');
    return items.sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

export async function saveBodyWeight(entry) {
  await setDoc(doc(userCol('weightLog'), entry.date), entry, { merge: true });
}

export async function deleteBodyWeight(date) {
  await deleteDoc(doc(userCol('weightLog'), date));
}

// ─── Analytics ─────────────────────────────────────────────
export async function getWeeklyFrequency(numWeeks = 8) {
  const logs = await getLogs();
  const result = [];
  for (let w = numWeeks - 1; w >= 0; w--) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() - w * 7);
    weekStart.setHours(0,0,0,0);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = weekStart.toISOString().split('T')[0];
    const endStr   = weekEnd.toISOString().split('T')[0];
    const trained = new Set(
      logs.filter(l => l.completed && l.date >= startStr && l.date <= endStr).map(l => l.date)
    ).size;
    const label = weekStart.toLocaleDateString('es', { day: 'numeric', month: 'short' });
    result.push({ weekLabel: label, count: trained, startStr, endStr });
  }
  return result;
}

export async function getExerciseProgress(exerciseName) {
  const logs = await getLogs();
  const byDate = {};
  for (const log of logs) {
    if (!log.completed) continue;
    const ex = log.exercises?.find(e => e.name.toLowerCase() === exerciseName.toLowerCase());
    if (!ex) continue;
    const maxW = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0));
    if (maxW > 0 && (!byDate[log.date] || byDate[log.date] < maxW)) byDate[log.date] = maxW;
  }
  return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, maxWeight]) => ({ date, maxWeight }));
}

export async function getAllTrackedExercises() {
  const logs = await getLogs();
  const set = new Set();
  for (const log of logs) {
    if (log.completed) log.exercises?.forEach(e => set.add(e.name));
  }
  return [...set].sort();
}

export async function getBestProgressExercise() {
  const logs = await getLogs();
  const today = new Date();
  const thisWeekStart = new Date(today);
  thisWeekStart.setDate(today.getDate() - today.getDay()); thisWeekStart.setHours(0,0,0,0);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const tsStr = thisWeekStart.toISOString().split('T')[0];
  const lwStr = lastWeekStart.toISOString().split('T')[0];
  const exerciseMax = {};
  for (const log of logs) {
    if (!log.completed) continue;
    const isThis = log.date >= tsStr;
    const isLast = log.date >= lwStr && log.date < tsStr;
    if (!isThis && !isLast) continue;
    for (const ex of (log.exercises || [])) {
      const maxW = Math.max(...ex.sets.map(s => parseFloat(s.weight) || 0));
      if (maxW <= 0) continue;
      if (!exerciseMax[ex.name]) exerciseMax[ex.name] = { thisWeek: 0, lastWeek: 0 };
      if (isThis && maxW > exerciseMax[ex.name].thisWeek) exerciseMax[ex.name].thisWeek = maxW;
      if (isLast && maxW > exerciseMax[ex.name].lastWeek) exerciseMax[ex.name].lastWeek = maxW;
    }
  }
  let best = null, bestDelta = 0;
  for (const [name, { thisWeek, lastWeek }] of Object.entries(exerciseMax)) {
    if (thisWeek > 0 && lastWeek > 0) {
      const delta = thisWeek - lastWeek;
      if (delta > bestDelta) { bestDelta = delta; best = { name, thisWeek, lastWeek, delta }; }
    }
  }
  return best;
}

export async function getWeeklyVolume(weekOffset = 0) {
  const logs = await getLogs();
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() - weekOffset * 7);
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  const startStr = weekStart.toISOString().split('T')[0];
  const endStr   = weekEnd.toISOString().split('T')[0];
  let volume = 0;
  let daysCompleted = new Set();
  for (const log of logs) {
    if (!log.completed || log.date < startStr || log.date > endStr) continue;
    daysCompleted.add(log.date);
    for (const ex of (log.exercises || [])) {
      for (const set of (ex.sets || [])) {
        const w = parseFloat(set.weight) || 0;
        const r = parseFloat(set.reps) || 0;
        volume += w * r;
      }
    }
  }
  return { volume: Math.round(volume), daysCompleted: daysCompleted.size, startStr, endStr };
}

// ─── Grupos musculares ─────────────────────────────────────
const MUSCLE_MAP = {
  chest:     ['press banca', 'press inclinado', 'aperturas', 'fondos', 'pullover', 'pecho'],
  back:      ['peso muerto', 'remo', 'jalón', 'dominadas', 'espalda'],
  legs:      ['sentadilla', 'prensa', 'extensión cuád', 'curl femoral', 'pantorrilla', 'femoral', 'peso muerto rumano'],
  shoulders: ['press militar', 'elevaciones', 'hombros', 'pájaro', 'face pull', 'arnold'],
  arms:      ['bíceps', 'curl barra', 'curl martillo', 'curl concentrado', 'tríceps', 'extensión tríceps', 'press francés'],
};

function detectGroups(names) {
  const found = new Set();
  for (const name of names) {
    const lower = name.toLowerCase();
    for (const [group, kws] of Object.entries(MUSCLE_MAP)) {
      if (kws.some(k => lower.includes(k))) found.add(group);
    }
  }
  return [...found];
}

export async function getRecentMuscleActivity() {
  const logs = await getLogs();
  const today = new Date().toISOString().split('T')[0];
  const completedLogs = logs.filter(l => l.completed).sort((a, b) => b.date.localeCompare(a.date));
  const result = Object.fromEntries(Object.keys(MUSCLE_MAP).map(g => [g, null]));
  for (const log of completedLogs) {
    const groups = detectGroups(log.exercises?.map(e => e.name) || []);
    const daysAgo = Math.floor((new Date(today) - new Date(log.date)) / 86400000);
    for (const g of groups) { if (result[g] === null) result[g] = daysAgo; }
  }
  return result;
}

// ─── Cierres semanales ─────────────────────────────────────
export async function getWeeklyReviews() {
  try {
    const items = await getAll('weeklyReviews');
    return items.sort((a, b) => b.weekEnd.localeCompare(a.weekEnd));
  } catch { return []; }
}

export async function saveWeeklyReview(review) {
  const id = review.weekKey.replace(/[^a-zA-Z0-9-]/g, '_');
  await setDoc(doc(userCol('weeklyReviews'), id), review, { merge: true });
}

function getWeekKey(date = new Date()) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(((d - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

export async function shouldShowWeeklyReview() {
  const today = new Date();
  const dow = today.getDay();
  if (dow !== 0 && dow !== 1) return null;
  const reviewDate = dow === 0 ? today : new Date(today.getTime() - 86400000);
  const weekKey = getWeekKey(reviewDate);
  const reviews = await getWeeklyReviews();
  const already = reviews.find(r => r.weekKey === weekKey);
  if (already) return null;
  const sunday = new Date(reviewDate);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const weekEnd = sunday.toISOString().split('T')[0];
  return { weekKey, weekEnd };
}

// ─── Unidad de peso (kg / lb) ──────────────────────────────
const WEIGHT_UNIT_KEY = 'panchita_weightUnit';

export async function getWeightUnit() {
  try {
    const val = await AsyncStorage.getItem(WEIGHT_UNIT_KEY);
    return val === 'lb' ? 'lb' : 'kg';
  } catch { return 'kg'; }
}

export async function saveWeightUnit(unit) {
  try {
    await AsyncStorage.setItem(WEIGHT_UNIT_KEY, unit);
    // Sincronizar en Firestore también
    withTimeout(
      setDoc(userDoc('settings/preferences'), { weightUnit: unit }, { merge: true }),
      5000, 'saveWeightUnit'
    ).catch(e => console.warn('saveWeightUnit remote failed:', e));
  } catch (e) {
    console.warn('saveWeightUnit local failed:', e);
  }
}

// ─── Limpiar todo (debug) ──────────────────────────────────
export async function clearAll() {
  await AsyncStorage.removeItem('panchita_onboarded');
}
