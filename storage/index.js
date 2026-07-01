import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  doc, collection, getDoc, setDoc, getDocs, deleteDoc, writeBatch,
  query, orderBy, limit, onSnapshot,
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

function sortLogs(logs = []) {
  return [...logs].sort((a, b) => {
    const at = itemTime(a);
    const bt = itemTime(b);
    if (bt !== at) return bt - at;
    return String(b.date || '').localeCompare(String(a.date || ''));
  });
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

function itemTime(item) {
  const raw = item?.updatedAt || item?.savedAt || item?.createdAt || item?.date || '';
  const t = raw ? Date.parse(raw) : 0;
  return Number.isFinite(t) ? t : 0;
}

function mergeById(primary = [], secondary = []) {
  const map = new Map();
  [...secondary, ...primary].forEach(item => {
    if (!item?.id) return;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      return;
    }

    const incomingTime = itemTime(item);
    const existingTime = itemTime(existing);
    if (incomingTime >= existingTime) {
      map.set(item.id, { ...existing, ...item });
    }
  });
  return [...map.values()];
}

function normalizeLogForStorage(log) {
  const date = log?.date || new Date().toISOString().split('T')[0];
  const workoutId = log?.workoutId || 'session';
  const id = log?.id || `${date}_${workoutId}`;
  return { ...log, id, date, workoutId, updatedAt: new Date().toISOString() };
}

// ─── Onboarding ───────────────────────────────────────────
// Legacy global key + per-user key. La PWA puede perder storage local al reinstalarse,
// así que también inferimos onboarding desde perfil/rutinas remotas/locales.
const ONBOARDED_KEY = 'panchita_onboarded';

export async function isOnboarded() {
  try {
    const legacy = await AsyncStorage.getItem(ONBOARDED_KEY);

    // Si todavía no hay auth, solo podemos confiar en la bandera legacy.
    if (!auth.currentUser) return legacy === 'true';

    const userFlag = await AsyncStorage.getItem(localKey('onboarded'));
    if (userFlag === 'true') return true;

    const localProfileRaw = await AsyncStorage.getItem(localKey('profile'));
    const localProfile = localProfileRaw ? JSON.parse(localProfileRaw) : null;
    if (localProfile?.onboarded || localProfile?.name || localProfile?.split) return true;

    try {
      const snap = await withTimeout(getDoc(userDoc('profile/data')), 4500, 'isOnboardedProfile');
      if (snap.exists()) {
        const profile = snap.data();
        await AsyncStorage.setItem(localKey('profile'), JSON.stringify(profile));
        if (profile?.onboarded || profile?.name || profile?.split) {
          await AsyncStorage.setItem(localKey('onboarded'), 'true');
          await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
          return true;
        }
      }
    } catch (error) {
      console.warn('Remote onboard check failed:', error?.message || error);
    }

    const [localWorkouts, localCustom] = await Promise.all([
      getLocalList('workouts'),
      getLocalList('customRoutines'),
    ]);
    if (localWorkouts.length > 0 || localCustom.length > 0) return true;

    try {
      const [remoteWorkouts, remoteCustom] = await Promise.all([
        withTimeout(getAll('workouts'), 4500, 'isOnboardedWorkouts').catch(() => []),
        withTimeout(getAll('customRoutines'), 4500, 'isOnboardedCustom').catch(() => []),
      ]);
      if (remoteWorkouts.length > 0) await setLocalList('workouts', remoteWorkouts);
      if (remoteCustom.length > 0) await setLocalList('customRoutines', remoteCustom);
      if (remoteWorkouts.length > 0 || remoteCustom.length > 0) {
        await AsyncStorage.setItem(localKey('onboarded'), 'true');
        await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
        return true;
      }
    } catch {}

    // Fallback legacy: para usuarios creados antes de tener bandera por usuario.
    // Lo usamos al final para no marcar por accidente otro usuario como onboarded.
    if (legacy === 'true') {
      await AsyncStorage.setItem(localKey('onboarded'), 'true');
      return true;
    }

    return false;
  } catch (error) {
    console.warn('isOnboarded failed:', error?.message || error);
    return false;
  }
}

export async function setOnboarded() {
  await AsyncStorage.setItem(ONBOARDED_KEY, 'true');
  if (auth.currentUser) {
    await AsyncStorage.setItem(localKey('onboarded'), 'true');
    withTimeout(
      setDoc(userDoc('profile/data'), { onboarded: true, updatedAt: new Date().toISOString() }, { merge: true }),
      6500,
      'setOnboarded'
    ).catch(error => console.warn('Remote onboard sync failed:', error));
  }
}

// ─── Usuario / Perfil ─────────────────────────────────────
export async function getUser() {
  try {
    const localRaw = await AsyncStorage.getItem(localKey('profile'));
    const local = localRaw ? JSON.parse(localRaw) : null;
    try {
      const snap = await withTimeout(getDoc(userDoc('profile/data')), 3500, 'getUser');
      if (snap.exists()) {
        const remote = snap.data();
        await AsyncStorage.setItem(localKey('profile'), JSON.stringify(remote));
        return remote;
      }
    } catch {}
    return local;
  } catch { return null; }
}

export async function saveUser(user) {
  const current = await getUser().catch(() => null);
  const merged = { ...(current || {}), ...(user || {}), updatedAt: new Date().toISOString() };
  await AsyncStorage.setItem(localKey('profile'), JSON.stringify(merged));
  withTimeout(
    setDoc(userDoc('profile/data'), merged, { merge: true }),
    6500,
    'saveUser'
  ).catch(error => console.warn('Remote profile sync failed:', error));
  return merged;
}

// ─── Rutinas base ──────────────────────────────────────────
// Versión local-only: retorna lo que hay en AsyncStorage sin tocar red.
export async function getLocalWorkouts() {
  return await getLocalList('workouts');
}

export async function getWorkouts() {
  try {
    const remote = await withTimeout(getAll('workouts'), 5000, 'workouts');
    // Cachear localmente para acceso offline inmediato la próxima vez.
    if (remote.length > 0) await setLocalList('workouts', remote);
    return remote;
  } catch {
    return await getLocalList('workouts');
  }
}

export async function saveWorkouts(workouts = []) {
  const normalized = workouts.map((w, idx) => ({
    ...w,
    id: w.id || w.workoutId || `workout_${Date.now()}_${idx}`,
    updatedAt: new Date().toISOString(),
  }));

  // Local primero: onboarding/rutinas no desaparecen si Firestore tarda.
  await setLocalList('workouts', normalized);

  const batch = writeBatch(db);
  for (const w of normalized) {
    const ref = doc(userCol('workouts'), w.id);
    batch.set(ref, w, { merge: true });
  }
  withTimeout(batch.commit(), 7000, 'saveWorkouts')
    .catch(error => console.warn('Remote workouts sync failed:', error));

  return normalized;
}

// ─── Rutinas custom ────────────────────────────────────────
// Versión local-only: instantánea, sin red.
export async function getLocalCustomRoutines() {
  return await getLocalList('customRoutines');
}

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
  const normalized = { ...routine, id, updatedAt: new Date().toISOString() };

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
    // Importante: elegir por updatedAt. Si el móvil guardó local y Firestore
    // todavía trae una versión vieja, NO dejamos que la versión vieja borre sets.
    const merged = sortLogs(mergeById(remote, local));
    await setLocalList('logs', merged);
    return merged;
  } catch {
    return sortLogs(local);
  }
}

export function subscribeLogs(onChange, onError, maxItems = 60) {
  if (!auth.currentUser) {
    onChange?.([]);
    return () => {};
  }

  const q = query(userCol('logs'), orderBy('date', 'desc'), limit(maxItems));
  return onSnapshot(q, async (snap) => {
    const remote = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const local = await getLocalList('logs');
    const merged = sortLogs(mergeById(remote, local));
    await setLocalList('logs', merged);
    onChange?.(merged);
  }, (error) => {
    console.warn('subscribeLogs failed:', error?.message || error);
    getLocalList('logs').then(local => onChange?.(sortLogs(local))).catch(() => {});
    onError?.(error);
  });
}

export async function saveLogDraft(log) {
  if (!log) return null;
  const normalized = normalizeLogForStorage(log);
  const local = await getLocalList('logs');
  const updated = mergeById([normalized], local);
  await setLocalList('logs', updated);

  if (!normalized.completed) {
    await AsyncStorage.setItem(localKey('activeSession'), JSON.stringify({
      id: normalized.id,
      workoutId: normalized.workoutId,
      workoutName: normalized.workoutName || normalized.name || normalized.day || 'Sesión',
      date: normalized.date,
      backfilled: !!normalized.backfilled,
      updatedAt: normalized.updatedAt,
    }));
  }
  return normalized;
}

export async function getActiveSessionDraft() {
  try {
    const raw = await AsyncStorage.getItem(localKey('activeSession'));
    if (!raw) return null;
    const marker = JSON.parse(raw);
    const logs = await getLocalList('logs');
    const log = logs.find(l => l.id === marker.id) || logs.find(l => l.date === marker.date && l.workoutId === marker.workoutId);
    if (!log || log.completed) {
      await AsyncStorage.removeItem(localKey('activeSession'));
      return null;
    }
    return { ...marker, log };
  } catch {
    return null;
  }
}

export async function clearActiveSessionDraft(id) {
  try {
    const raw = await AsyncStorage.getItem(localKey('activeSession'));
    if (!raw) return;
    const marker = JSON.parse(raw);
    if (!id || marker.id === id) await AsyncStorage.removeItem(localKey('activeSession'));
  } catch {}
}

export async function saveLog(log) {
  const normalized = await saveLogDraft(log);
  if (!normalized) return null;
  const { id } = normalized;

  // Sync remoto en segundo plano. Panchita no espera al WiFi para contar reps.
  withTimeout(
    setDoc(doc(userCol('logs'), id), normalized, { merge: true }),
    6500,
    'saveLog'
  ).catch(error => console.warn('Remote log sync failed:', error));

  if (normalized.completed) clearActiveSessionDraft(id).catch(() => {});
  return normalized;
}


export async function moveLogDate(log, newDate) {
  if (!log || !newDate) throw new Error('Missing log/date');
  const oldId = log.id || `${log.date || newDate}_${log.workoutId || 'session'}`;
  const updated = normalizeLogForStorage({
    ...log,
    id: `${newDate}_${log.workoutId || log.id || 'session'}`,
    date: newDate,
    editedAt: new Date().toISOString(),
  });

  const local = await getLocalList('logs');
  const withoutOld = local.filter(item => {
    const itemId = item.id || `${item.date || ''}_${item.workoutId || 'session'}`;
    return itemId !== oldId && itemId !== updated.id;
  });
  await setLocalList('logs', sortLogs([updated, ...withoutOld]));

  withTimeout(
    setDoc(doc(userCol('logs'), updated.id), updated, { merge: true }),
    6500,
    'moveLogDateSave'
  ).catch(error => console.warn('Remote log date update failed:', error));

  if (oldId !== updated.id) {
    withTimeout(deleteDoc(doc(userCol('logs'), oldId)), 6500, 'moveLogDateDelete')
      .catch(error => console.warn('Remote old log delete failed:', error));
  }

  return updated;
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
const WEEKLY_REVIEW_SEEN_KEY = 'panchita_weeklyReview_seen';

export async function getWeeklyReviews() {
  try {
    const items = await getAll('weeklyReviews');
    return items.sort((a, b) => b.weekEnd.localeCompare(a.weekEnd));
  } catch { return []; }
}

export async function saveWeeklyReview(review) {
  const id = review.weekKey.replace(/[^a-zA-Z0-9-]/g, '_');
  // Guardar local primero (instantáneo, evita re-aparición si Firestore es lento)
  await markWeeklyReviewSeen(review.weekKey);
  await setDoc(doc(userCol('weeklyReviews'), id), review, { merge: true });
}

// Marca la semana como vista en AsyncStorage (inmediato, funciona offline)
export async function markWeeklyReviewSeen(weekKey) {
  try {
    await AsyncStorage.setItem(WEEKLY_REVIEW_SEEN_KEY, weekKey);
  } catch (e) {
    console.warn('markWeeklyReviewSeen failed:', e);
  }
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

  // Chequeo local primero — instantáneo, funciona offline
  // Evita re-aparición si Firestore tarda o el usuario cerró sin completar
  try {
    const seen = await AsyncStorage.getItem(WEEKLY_REVIEW_SEEN_KEY);
    if (seen === weekKey) return null;
  } catch {}

  // Chequeo remoto — si ya existe en Firestore, sincroni local y no mostrar
  try {
    const reviews = await getWeeklyReviews();
    const already = reviews.find(r => r.weekKey === weekKey);
    if (already) {
      markWeeklyReviewSeen(weekKey).catch(() => {});
      return null;
    }
  } catch {}

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

// ─── Timer de descanso ─────────────────────────────────────
const REST_TIMER_KEY = 'panchita_restTimerSeconds';

export async function getRestTimerSeconds() {
  try {
    const val = await AsyncStorage.getItem(REST_TIMER_KEY);
    const n = parseInt(val, 10);
    return Number.isFinite(n) && n >= 0 ? n : 90;
  } catch { return 90; }
}

export async function saveRestTimerSeconds(seconds) {
  const normalized = Math.max(0, parseInt(seconds, 10) || 0);
  try {
    await AsyncStorage.setItem(REST_TIMER_KEY, String(normalized));
    withTimeout(
      setDoc(userDoc('settings/preferences'), { restTimerSeconds: normalized }, { merge: true }),
      5000,
      'saveRestTimerSeconds'
    ).catch(e => console.warn('saveRestTimerSeconds remote failed:', e));
  } catch (e) {
    console.warn('saveRestTimerSeconds local failed:', e);
  }
}


// ─── Notificaciones Panchita (fase 1) ─────────────────────
const NOTIFICATION_PREFS_DEFAULT = {
  enabled: false,
  permission: 'default',
  reminderTime: '08:00',
  routineReminders: true,
  restTimerAlerts: false,
  updatedAt: null,
};

export async function getNotificationPrefs() {
  const localName = 'notificationPrefs';
  const storageKey = auth.currentUser ? localKey(localName) : `panchita_${localName}`;
  const localRaw = await AsyncStorage.getItem(storageKey).catch(() => null);
  const local = localRaw ? JSON.parse(localRaw) : null;

  if (auth.currentUser) {
    try {
      const snap = await withTimeout(getDoc(userDoc('settings/preferences')), 3500, 'getNotificationPrefs');
      if (snap.exists()) {
        const remote = snap.data()?.notificationPrefs;
        if (remote) {
          const merged = { ...NOTIFICATION_PREFS_DEFAULT, ...(local || {}), ...remote };
          await AsyncStorage.setItem(storageKey, JSON.stringify(merged));
          return merged;
        }
      }
    } catch (error) {
      console.warn('getNotificationPrefs remote failed:', error?.message || error);
    }
  }

  return { ...NOTIFICATION_PREFS_DEFAULT, ...(local || {}) };
}

export async function saveNotificationPrefs(prefs = {}) {
  const previous = await getNotificationPrefs().catch(() => ({}));
  const merged = {
    ...NOTIFICATION_PREFS_DEFAULT,
    ...previous,
    ...prefs,
    updatedAt: new Date().toISOString(),
  };
  const storageKey = auth.currentUser ? localKey('notificationPrefs') : 'panchita_notificationPrefs';
  await AsyncStorage.setItem(storageKey, JSON.stringify(merged));

  if (auth.currentUser) {
    withTimeout(
      setDoc(userDoc('settings/preferences'), { notificationPrefs: merged }, { merge: true }),
      5000,
      'saveNotificationPrefs'
    ).catch(e => console.warn('saveNotificationPrefs remote failed:', e));
  }

  return merged;
}

// ─── Programación semanal ──────────────────────────────────
// Estructura: { L: {id, name} | 'rest' | null, M: ..., X: ..., J: ..., V: ..., S: ..., D: ... }
const WEEK_SCHEDULE_KEY = 'panchita_weekSchedule';

export async function getWeekSchedule() {
  // Local primero
  try {
    const raw = await AsyncStorage.getItem(WEEK_SCHEDULE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // Firestore con timeout
  try {
    const snap = await withTimeout(
      getDoc(userDoc('config/weekSchedule')),
      5000, 'getWeekSchedule'
    );
    if (snap.exists()) {
      const data = snap.data();
      await AsyncStorage.setItem(WEEK_SCHEDULE_KEY, JSON.stringify(data));
      return data;
    }
  } catch {}
  return {};
}

export async function saveWeekSchedule(schedule) {
  try {
    await AsyncStorage.setItem(WEEK_SCHEDULE_KEY, JSON.stringify(schedule));
  } catch (e) {
    console.warn('saveWeekSchedule local failed:', e);
  }
  try {
    await setDoc(userDoc('config/weekSchedule'), schedule);
  } catch (e) {
    console.warn('saveWeekSchedule Firestore failed:', e);
  }
}

// ─── Compartir rutinas con código ─────────────────────────
function toStringArray(exercises) {
  if (!exercises) return [];
  if (typeof exercises === 'string') return exercises.split(',').map(s => s.trim()).filter(Boolean);
  const arr = Array.isArray(exercises) ? exercises : Object.values(exercises);
  return arr.map(ex => {
    if (typeof ex === 'string') return ex.trim();
    if (ex?.name) return String(ex.name).trim();
    return null;
  }).filter(Boolean);
}


const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function utf8Bytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let cp = str.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (cp <= 0x7f) bytes.push(cp);
    else if (cp <= 0x7ff) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp <= 0xffff) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else bytes.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  }
  return bytes;
}

function utf8String(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    let cp;
    if (b < 0x80) cp = b;
    else if (b < 0xe0) cp = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b < 0xf0) cp = ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else cp = ((b & 0x07) << 18) | ((bytes[i++] & 0x3f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    if (cp <= 0xffff) out += String.fromCharCode(cp);
    else {
      cp -= 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

function base64UrlEncode(str) {
  const bytes = utf8Bytes(str);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    out += B64[a >> 2];
    out += B64[((a & 3) << 4) | ((b || 0) >> 4)];
    out += i + 1 < bytes.length ? B64[((b & 15) << 2) | ((c || 0) >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(encoded) {
  const clean = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = clean + '='.repeat((4 - clean.length % 4) % 4);
  const bytes = [];
  for (let i = 0; i < padded.length; i += 4) {
    const c1 = B64.indexOf(padded[i]);
    const c2 = B64.indexOf(padded[i + 1]);
    const c3 = padded[i + 2] === '=' ? -1 : B64.indexOf(padded[i + 2]);
    const c4 = padded[i + 3] === '=' ? -1 : B64.indexOf(padded[i + 3]);
    if (c1 < 0 || c2 < 0 || (c3 < 0 && padded[i + 2] !== '=') || (c4 < 0 && padded[i + 3] !== '=')) {
      throw new Error('base64 inválido');
    }
    bytes.push((c1 << 2) | (c2 >> 4));
    if (c3 >= 0) bytes.push(((c2 & 15) << 4) | (c3 >> 2));
    if (c4 >= 0) bytes.push(((c3 & 3) << 6) | c4);
  }
  return utf8String(bytes);
}

function encodeRoutinePayload(routine) {
  const payload = {
    v: 1,
    n: (routine.name || routine.day || 'Mi rutina').trim(),
    e: toStringArray(routine.exercises),
  };
  return `PF1.${base64UrlEncode(JSON.stringify(payload))}`;
}

function decodeRoutinePayload(rawCode) {
  const match = String(rawCode || '').trim().match(/PF1\.[A-Za-z0-9_-]+/);
  if (!match) return null;
  const payload = JSON.parse(base64UrlDecode(match[0].slice(4)));
  if (!payload || payload.v !== 1 || !Array.isArray(payload.e)) {
    throw new Error('El código de rutina no tiene un formato válido.');
  }
  return {
    nombre: String(payload.n || 'Rutina importada').trim() || 'Rutina importada',
    ejercicios: payload.e.map(ex => String(ex || '').trim()).filter(Boolean),
  };
}

export async function shareRoutine(routine) {
  // Compartir sin backend: el código contiene la rutina codificada.
  // Así no dependemos de reglas de Firestore, caché ni conexión del receptor.
  const code = encodeRoutinePayload(routine);
  if (!decodeRoutinePayload(code)) {
    throw new Error('No se pudo generar el código de rutina.');
  }
  return code;
}

export async function importSharedRoutine(code) {
  try {
    const selfContained = decodeRoutinePayload(code);
    if (selfContained) return selfContained;
  } catch (error) {
    console.warn('decodeRoutinePayload error:', error);
    throw new Error('El código PF1 está incompleto o se copió mal. Compartilo de nuevo desde la app.');
  }

  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (clean.length === 6) {
    throw new Error('Ese código corto era de la versión anterior. Compartí la rutina de nuevo para generar un código PF1 actualizado.');
  }

  throw new Error('Pegá el código completo que empieza con PF1.');
}

// ─── Limpiar todo (debug) ──────────────────────────────────
export async function clearAll() {
  await AsyncStorage.removeItem('panchita_onboarded');
}
