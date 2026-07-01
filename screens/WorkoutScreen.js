import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  TouchableOpacity, TextInput, Modal, Alert, Animated, Keyboard, ActivityIndicator,
  Dimensions, KeyboardAvoidingView, Platform, AppState,
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  getWorkouts, getLocalWorkouts, getLogs, saveLog, saveLogDraft,
  getCustomRoutines, getLocalCustomRoutines,
  saveCustomRoutine, deleteCustomRoutine,
  getRecentMuscleActivity, getWeightUnit,
  shareRoutine, importSharedRoutine, getActiveSessionDraft, subscribeLogs, moveLogDate,
} from '../storage';
import {
  IconArrow, IconArrowDown, IconArrowUp, IconBack, IconBolt, IconCalendar,
  IconCheck, IconClose, IconCopy, IconDocument, IconDownload, IconEditar, IconEliminar, IconHistory,
  IconTimer, IconMenuDots, IconRepeat, IconShare, IconStar, IconWarning,
} from '../components/icons';
import { Share } from 'react-native';
import Panchita from '../components/Panchita';
import ConfirmModal from '../components/ConfirmModal';
import ActiveWorkoutScreen from './ActiveWorkoutScreen';

const SCREEN_W = Dimensions.get('window').width;

function formatShareCodePreview(code) {
  const clean = String(code || '').trim();
  if (!clean) return '';
  if (clean.length <= 34) return clean;
  return `${clean.slice(0, 18)}...${clean.slice(-12)}`;
}

const TODAY = new Date().toISOString().split('T')[0];
const KG_TO_LB = 2.20462;

// ─── Frases ──────────────────────────────────────────────
const SET_PHRASES = [
  '¡Set hecho! Eso es lo que hay que hacer.',
  'Bien. Ahora descansá 90 segundos. No 3 minutos.',
  'Set completado. El siguiente es tuyo también.',
  'Menos mal que lo hiciste. Esperaba peor.',
  'Otro set menos. Seguís vivo, bien.',
  '¡Ese es el camino! O al menos uno de ellos.',
  'Completado. ¿Ves? No era para tanto.',
];

const COMPLETION_PHRASES = [
  'Vaya, vaya... resultó que sí podías.',
  'Rutina completada. Casi no lo creo, pero aquí estamos.',
  'Lo hiciste. Ahora a comer proteína y fingir que no duele nada.',
  'Completado. Ya podés presumirle a tu yo de ayer.',
];

const AUTOSAVE_PHRASES = [
  'Guardado. No confío en el WiFi pero bueno.',
  'Datos a salvo. Por ahora.',
  'Guardé todo. Seguí levantando.',
];

// ─── Recomendación muscular ───────────────────────────────
const MUSCLE_LABELS = { chest:'pecho', back:'espalda', legs:'piernas', shoulders:'hombros', arms:'brazos' };
const MUSCLE_EXERCISES = {
  chest:     ['Press banca', 'Press inclinado', 'Aperturas', 'Fondos', 'Pullover'],
  back:      ['Dominadas', 'Remo con barra', 'Jalón al pecho', 'Peso muerto', 'Remo en polea'],
  legs:      ['Sentadilla', 'Prensa', 'Peso muerto rumano', 'Curl femoral', 'Pantorrilla', 'Extensión cuád'],
  shoulders: ['Press militar', 'Elevaciones laterales', 'Face pull', 'Pájaro', 'Press Arnold'],
  arms:      ['Curl barra', 'Curl martillo', 'Press francés', 'Extensión cable', 'Curl concentrado'],
};
const PANCHITA_RECOMMEND_PHRASES = {
  legs: d => d===null?'¿Piernas? Nunca. Hoy rompemos esa racha.':d===0?'Hoy ya hiciste piernas.':`${d} día${d>1?'s':''} sin piernas. Ahí vamos.`,
  chest: d => d===null?'El pecho nunca ha visto una barra. Hoy cambia eso.':d===0?'Pecho de nuevo. Solo juzgo.':`${d} día${d>1?'s':''} sin press. El pecho ya no te reconoce.`,
  back: d => d===null?'La espalda existe. Hoy la saludamos.':d===0?'Otra vez espalda. El remo no descansa.':`${d} día${d>1?'s':''} sin espalda.`,
  shoulders: d => d===null?'Hombros sin entrenar. Empezamos hoy.':d===0?'Hombros de vuelta.':`${d} día${d>1?'s':''} sin hombros.`,
  arms: d => d===null?'Brazos sin curl. Empecemos.':d===0?'Brazos otra vez.':`${d} día${d>1?'s':''} sin brazos.`,
};

function logHasProgress(log) {
  if (!log) return false;
  if (log.completed) return true;
  return (log.exercises||[]).some(ex=>(ex.sets||[]).some(st=>
    String(st.reps||'').trim()||String(st.weight||'').trim()||!!st.done
  ));
}

function logSignature(log) {
  if (!log) return '';
  return JSON.stringify({
    date: log.date, workoutId: log.workoutId, completed: !!log.completed,
    exercises: (log.exercises||[]).map(ex=>({
      name: ex.name,
      sets: (ex.sets||[]).map(st=>({ reps:String(st.reps||''), weight:String(st.weight||''), done:!!st.done })),
    })),
  });
}

function buildRecommendation(muscleActivity) {
  let worstGroup='legs', worstDays=-1;
  for (const [group,days] of Object.entries(muscleActivity)) {
    const score = days===null?999:days;
    if (score>worstDays) { worstDays=score; worstGroup=group; }
  }
  const realDays = muscleActivity[worstGroup];
  return {
    group: worstGroup,
    label: MUSCLE_LABELS[worstGroup],
    exercises: MUSCLE_EXERCISES[worstGroup],
    daysSince: realDays,
    phrase: PANCHITA_RECOMMEND_PHRASES[worstGroup]?.(realDays)||`Hora de entrenar ${MUSCLE_LABELS[worstGroup]}.`,
  };
}

// ─── Normalizar ejercicios desde cualquier formato ────────
// BUG CRÍTICO: Object.values("Press banca") → ["P","r","e","s","s",...]
// Por eso los nombres salían como "E" (primera letra de "Ejercicio...")
function normalizeExercises(raw) {
  if (!raw) return [];
  // Si es string, puede ser CSV: "Press banca, Press inclinado"
  if (typeof raw === 'string') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  // Array normal: ["Press banca", ...] o [{name:"Press banca", sets:[...]}, ...]
  if (Array.isArray(raw)) {
    return raw.map(ex => {
      if (typeof ex === 'string' && ex.trim()) return ex.trim();
      if (ex && typeof ex === 'object' && ex.name) return String(ex.name).trim();
      return null;
    }).filter(Boolean);
  }
  // Objeto con claves numéricas (Firestore a veces serializa arrays así)
  return Object.values(raw).map(ex => {
    if (typeof ex === 'string' && ex.trim()) return ex.trim();
    if (ex && typeof ex === 'object' && ex.name) return String(ex.name).trim();
    return null;
  }).filter(Boolean);
}

// ─── Conversión de peso ────────────────────────────────────
function convertWeightValue(val, from, to) {
  if (from === to || !val) return val;
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  const result = from==='kg' ? n*KG_TO_LB : n/KG_TO_LB;
  return String(Math.round(result*10)/10);
}

// ─── T4: Skeleton loader ──────────────────────────────────
function SkeletonRect({ width, height, style, colors: c }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim,{toValue:1,duration:900,useNativeDriver:true}),
        Animated.timing(anim,{toValue:0,duration:900,useNativeDriver:true}),
      ])
    ).start();
    return ()=>anim.stopAnimation();
  },[]);
  const opacity = anim.interpolate({inputRange:[0,1],outputRange:[0.2,0.45]});
  return (
    <Animated.View style={[
      { height, borderRadius:8, backgroundColor:c.grayLight, opacity },
      typeof width==='string' ? { width } : { width },
      style,
    ]}/>
  );
}

// ─── T3: Frases Panchita por días ──────────────────────────
function getPanchitaRoutinePhrase(daysSince) {
  if (daysSince===null) return '¿Primera vez con esta rutina? Veremos.';
  if (daysSince===0) return 'Dos veces en un día. Qué dedicación. O qué aburrimiento.';
  if (daysSince<3)  return 'Ya de vuelta. No esperaba menos.';
  if (daysSince<=7) return 'Una semana. Justo a tiempo.';
  return '¿Esta rutina? ¿En serio? ¿Cuándo fue la última vez...?';
}

function formatLogDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'});
}

function formatDateDisplay(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

function daysInMonth(month, year) {
  return new Date(year, month, 0).getDate();
}

function WheelPicker({ items, selectedIndex, onSelect, width, colors }) {
  const ITEM_H = 42;
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.scrollTo({ y: selectedIndex * ITEM_H, animated: false });
  }, [selectedIndex]);
  return (
    <View style={{ width, height: ITEM_H * 3, overflow: 'hidden', borderRadius: RADIUS.md, backgroundColor: colors.bgInput }}>
      <View style={{ position: 'absolute', top: ITEM_H, left: 0, right: 0, height: ITEM_H, backgroundColor: colors.purpleDim, opacity: 0.7 }} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          onSelect(Math.max(0, Math.min(idx, items.length - 1)));
        }}
        contentContainerStyle={{ paddingVertical: ITEM_H }}
      >
        {items.map((item, i) => (
          <View key={i} style={{ height: ITEM_H, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{
              fontSize: i === selectedIndex ? 18 : 14,
              fontWeight: i === selectedIndex ? '800' : '600',
              color: i === selectedIndex ? colors.white : colors.gray,
            }}>
              {String(item).padStart(2, '0')}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function calcLogVolume(log) {
  return (log.exercises||[]).reduce((total,ex)=>
    total+(ex.sets||[]).reduce((s,st)=>{
      const r=parseFloat(st.reps)||0, w=parseFloat(st.weight)||0;
      return s+r*w;
    },0)
  ,0);
}


function makeSessionUi(colors) {
  return {
    bg: colors.bg || '#0e0e0e',
    card: colors.bgCard || '#1a1a1a',
    field: colors.bgInput || '#111111',
    border: colors.border || '#2a2a2a',
    borderStrong: colors.purpleDim || '#333333',
    accent: colors.lime || '#7fff00',
    text: colors.white || '#f5f5f5',
    muted: colors.gray || '#9b9b9b',
    dim: colors.grayLight || '#6f6f6f',
    danger: colors.danger || '#ff4d4d',
  };
}

function sessionWorkoutName(log) {
  return log?.workoutName || log?.routineName || log?.day || log?.name || 'Rutina';
}

function sessionCountSets(log) {
  return (log?.exercises || []).reduce((n, ex) => n + (ex.sets || []).filter(st => st.done !== false).length, 0);
}

function sessionDuration(log) {
  if (Number(log?.durationMinutes) > 0) return Math.round(Number(log.durationMinutes));
  const start = Date.parse(log?.startedAt || '');
  const end = Date.parse(log?.completedAt || log?.updatedAt || '');
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return Math.max(1, Math.round((end - start) / 60000));
  const ex = (log?.exercises || []).length;
  const sets = sessionCountSets(log);
  return ex || sets ? Math.max(18, ex * 8 + sets * 3) : 0;
}

function sessionDurationLabel(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function sessionRepsSummary(ex) {
  const sets = (ex.sets || []).filter(st => st.done !== false);
  const reps = sets.map(st => st.reps || '—').join(' / ');
  return reps || '—';
}

function sessionWeightSummary(ex) {
  const sets = (ex.sets || []).filter(st => st.done !== false);
  const weights = sets.map(st => `${st.weight || '—'} ${ex.unit || st.unit || 'kg'}`).join(' / ');
  return weights || '—';
}

function SessionDetailView({ log, onBack, onSaveDate, colors }) {
  const [editing, setEditing] = useState(false);
  const [newDate, setNewDate] = useState(log?.date || TODAY);
  const [savingDate, setSavingDate] = useState(false);
  const [error, setError] = useState('');
  const ui = useMemo(() => makeSessionUi(colors || {}), [colors]);
  const styles = useMemo(() => createSessionStyles(ui), [ui]);

  useEffect(() => {
    setNewDate(log?.date || TODAY);
    setEditing(false);
    setError('');
  }, [log?.id, log?.date]);

  async function saveDate() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      setError('Usá formato YYYY-MM-DD. Sí, aburrido, pero confiable.');
      return;
    }
    setSavingDate(true);
    setError('');
    try {
      await onSaveDate(newDate);
      setEditing(false);
    } catch (e) {
      console.warn('save session date failed:', e);
      setError('No se pudo guardar la fecha. Panchita culpa al WiFi.');
    } finally {
      setSavingDate(false);
    }
  }

  const exercises = log?.exercises || [];
  const totalSets = sessionCountSets(log);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.75}>
          <IconBack size={16} color={ui.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.title} numberOfLines={2}>Session · {sessionWorkoutName(log)}</Text>

        <View style={styles.summaryCard}>
          <View style={styles.dateRow}>
            <View>
              <Text style={styles.label}>date</Text>
              <Text style={styles.dateText}>{formatDateDisplay(log?.date)}</Text>
            </View>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)} activeOpacity={0.8}>
              <IconEditar size={15} color={ui.accent} />
              <Text style={styles.editText}>Edit</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statGrid}>
            <View style={styles.statBox}><IconTimer size={16} color={ui.accent} /><Text style={styles.statValue}>{sessionDurationLabel(sessionDuration(log))}</Text><Text style={styles.statLabel}>duration</Text></View>
            <View style={styles.statBox}><IconDocument size={16} color={ui.accent} /><Text style={styles.statValue}>{exercises.length}</Text><Text style={styles.statLabel}>exercises</Text></View>
            <View style={styles.statBox}><IconCheck size={16} color={ui.accent} /><Text style={styles.statValue}>{totalSets}</Text><Text style={styles.statLabel}>sets</Text></View>
          </View>

          {editing && (
            <View style={styles.inlineEditor}>
              <Text style={styles.editorTitle}>Cambiar fecha</Text>
              <View style={styles.readOnlyRow}>
                <Text style={styles.label}>current date</Text>
                <Text style={styles.readOnlyText}>{formatDateDisplay(log?.date)}</Text>
              </View>
              <Text style={styles.label}>new date</Text>
              <TextInput
                value={newDate}
                onChangeText={setNewDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={ui.dim}
                style={styles.dateInput}
                keyboardType="numbers-and-punctuation"
              />
              <Text style={styles.note}>Solo se cambia la fecha. Los ejercicios, sets y pesos quedan intactos.</Text>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
              <View style={styles.editorActions}>
                <TouchableOpacity style={[styles.editorBtn, styles.cancelBtn]} onPress={() => { setEditing(false); setNewDate(log?.date || TODAY); setError(''); }} disabled={savingDate}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.editorBtn, styles.saveBtn, savingDate && { opacity: 0.65 }]} onPress={saveDate} disabled={savingDate}>
                  {savingDate ? <ActivityIndicator size="small" color={ui.bg} /> : <Text style={styles.saveText}>Save</Text>}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Exercises</Text>
        {exercises.length === 0 ? (
          <View style={styles.exerciseCard}><Text style={styles.metaText}>Esta sesión no tiene ejercicios guardados.</Text></View>
        ) : exercises.map((ex, idx) => {
          const sets = (ex.sets || []).filter(st => st.done !== false);
          return (
            <View key={`${ex.name}_${idx}`} style={styles.exerciseCard}>
              <View style={styles.exerciseHead}>
                <Text style={styles.exerciseName} numberOfLines={1}>{ex.name || `Ejercicio ${idx + 1}`}</Text>
                <Text style={styles.setPill}>{sets.length} sets</Text>
              </View>
              <View style={styles.exerciseMetaRow}>
                <View style={styles.metaBox}><Text style={styles.label}>reps</Text><Text style={styles.metaText}>{sessionRepsSummary(ex)}</Text></View>
                <View style={styles.metaBox}><Text style={styles.label}>weight</Text><Text style={styles.metaText}>{sessionWeightSummary(ex)}</Text></View>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

function SessionHistoryListView({ logs, colors, onBack, onOpen }) {
  const ui = useMemo(() => makeSessionUi(colors || {}), [colors]);
  const styles = useMemo(() => createSessionListStyles(ui), [ui]);
  const sessions = useMemo(() => [...(logs || [])]
    .filter(l => l.completed)
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))), [logs]);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.75}>
          <IconBack size={16} color={ui.accent} />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Recent sessions</Text>
        {sessions.length === 0 ? (
          <View style={styles.card}><Text style={styles.meta}>No hay sesiones guardadas todavía.</Text></View>
        ) : sessions.map(log => (
          <TouchableOpacity key={log.id || `${log.date}_${log.workoutId}`} style={styles.row} onPress={() => onOpen(log)} activeOpacity={0.75}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>{sessionWorkoutName(log)}</Text>
              <Text style={styles.meta}>{formatLogDate(log.date)} · {(log.exercises || []).length} ejercicios · {sessionDurationLabel(sessionDuration(log))}</Text>
            </View>
            <IconArrow size={14} color={ui.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function createSessionListStyles(ui) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: ui.bg },
    scroll: { padding: 16, paddingBottom: 34 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 4 },
    backText: { color: ui.accent, fontSize: 11, fontWeight: '800' },
    title: { color: ui.text, fontSize: 15, fontWeight: '900', marginBottom: 12 },
    card: { backgroundColor: ui.card, borderRadius: 14, borderWidth: 0.5, borderColor: ui.border, padding: 14 },
    row: { backgroundColor: ui.card, borderRadius: 12, borderWidth: 0.5, borderColor: ui.border, padding: 12, marginBottom: 9, flexDirection: 'row', alignItems: 'center', gap: 10 },
    name: { color: ui.text, fontSize: 13, fontWeight: '800' },
    meta: { color: ui.muted, fontSize: 10, marginTop: 4 },
  });
}

function createSessionStyles(ui) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: ui.bg },
    scroll: { padding: 16, paddingBottom: 34 },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 4 },
    backText: { color: ui.accent, fontSize: 11, fontWeight: '800' },
    title: { color: ui.text, fontSize: 15, fontWeight: '900', marginBottom: 12 },
    summaryCard: { backgroundColor: ui.card, borderRadius: 14, borderWidth: 0.5, borderColor: ui.border, padding: 13, marginBottom: 14 },
    dateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 },
    label: { color: ui.muted, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    dateText: { color: ui.text, fontSize: 13, fontWeight: '800', marginTop: 4 },
    editBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 0.5, borderColor: ui.borderStrong, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
    editText: { color: ui.accent, fontSize: 10, fontWeight: '800' },
    statGrid: { flexDirection: 'row', gap: 8 },
    statBox: { flex: 1, backgroundColor: ui.field, borderRadius: 10, borderWidth: 0.5, borderColor: ui.border, padding: 10, alignItems: 'center' },
    statValue: { color: ui.text, fontSize: 13, fontWeight: '900', marginTop: 5 },
    statLabel: { color: ui.muted, fontSize: 9, marginTop: 2 },
    inlineEditor: { marginTop: 12, borderTopWidth: 0.5, borderTopColor: ui.border, paddingTop: 12 },
    editorTitle: { color: ui.text, fontSize: 13, fontWeight: '800', marginBottom: 10 },
    readOnlyRow: { backgroundColor: ui.field, borderRadius: 8, borderWidth: 0.5, borderColor: ui.border, padding: 10, marginBottom: 10 },
    readOnlyText: { color: ui.muted, fontSize: 12, fontWeight: '700', marginTop: 4 },
    dateInput: { marginTop: 6, borderRadius: 8, borderWidth: 1, borderColor: ui.accent, backgroundColor: ui.field, color: ui.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontWeight: '800' },
    note: { color: ui.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
    errorText: { color: ui.danger, fontSize: 10, marginTop: 8, fontWeight: '700' },
    editorActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
    editorBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
    cancelBtn: { backgroundColor: ui.field, borderWidth: 0.5, borderColor: ui.borderStrong },
    saveBtn: { backgroundColor: ui.accent },
    cancelText: { color: ui.muted, fontSize: 11, fontWeight: '800' },
    saveText: { color: ui.bg, fontSize: 11, fontWeight: '900' },
    sectionTitle: { color: ui.text, fontSize: 14, fontWeight: '900', marginBottom: 8 },
    exerciseCard: { backgroundColor: ui.card, borderRadius: 12, borderWidth: 0.5, borderColor: ui.border, padding: 12, marginBottom: 9 },
    exerciseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 },
    exerciseName: { color: ui.text, fontSize: 13, fontWeight: '800', flex: 1 },
    setPill: { color: ui.accent, fontSize: 10, fontWeight: '800', borderWidth: 0.5, borderColor: ui.borderStrong, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
    exerciseMetaRow: { flexDirection: 'row', gap: 8 },
    metaBox: { flex: 1, backgroundColor: ui.field, borderRadius: 8, borderWidth: 0.5, borderColor: ui.border, padding: 9 },
    metaText: { color: ui.text, fontSize: 11, fontWeight: '700', marginTop: 4 },
  });
}

// ─── Componente principal ──────────────────────────────────
export default function WorkoutScreen({ navigation, route }) {
  const { colors } = useTheme();
  const s = useMemo(()=>createStyles(colors),[colors]);

  // Datos
  const [baseWorkouts, setBaseWorkouts]     = useState([]);
  const [customRoutines, setCustomRoutines] = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [log, setLog]           = useState(null);
  const [lastLog, setLastLog]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [autoSaveState, setAutoSaveState] = useState('idle');
  const [completed, setCompleted] = useState(false);
  const [weightUnit, setWeightUnit] = useState('kg');
  const prevWeightUnitRef = useRef('kg');

  // Modo — T2: default custom, "Mis rutinas" siempre muestra rutinas personalizadas
  const [mode, setMode] = useState('custom');

  // Reacción Panchita
  const [panchitaReaction, setPanchitaReaction] = useState(false);
  const [reactionPhrase, setReactionPhrase]     = useState('');

  // Popup autosave
  const [showSavePop, setShowSavePop] = useState(false);
  const [savePopPhrase, setSavePopPhrase] = useState('');
  const saveFadeAnim = useRef(new Animated.Value(0)).current;

  // Modal completado
  const [showCompletion, setShowCompletion]     = useState(false);
  const [completionPhrase, setCompletionPhrase] = useState('');

  // Modal crear rutina
  const [showCreateModal, setShowCreateModal]         = useState(false);
  const [newRoutineName, setNewRoutineName]           = useState('');
  const [newExercises, setNewExercises]               = useState(['','','']);
  const [newRoutineRecurring, setNewRoutineRecurring] = useState(false);
  const [createError, setCreateError]                 = useState('');
  const [creatingRoutine, setCreatingRoutine]         = useState(false);

  // Modal editar ejercicios
  const [showEditModal, setShowEditModal]       = useState(false);
  const [editingRoutine, setEditingRoutine]     = useState(null);
  const [editExercises, setEditExercises]       = useState([]);
  const [editingRoutineSaving, setEditingRoutineSaving] = useState(false);

  // Modal recomendación
  const [showRecommend, setShowRecommend]     = useState(false);
  const [recommendation, setRecommendation]   = useState(null);
  const [loadingRecommend, setLoadingRecommend] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // ── T1: chip menu ────────────────────────────────────────
  const [showChipMenu, setShowChipMenu]       = useState(false);
  const [chipMenuRoutine, setChipMenuRoutine] = useState(null);
  const [showEditNameModal, setShowEditNameModal] = useState(false);
  const [editNameRoutine, setEditNameRoutine] = useState(null);
  const [editNameValue, setEditNameValue]     = useState('');
  const [editNameSaving, setEditNameSaving]   = useState(false);
  const [deletingRoutineId, setDeletingRoutineId] = useState(null);
  const [deletingRoutineName, setDeletingRoutineName] = useState('');

  // ── T3: routine selection modal ───────────────────────
  const [showRoutineModal, setShowRoutineModal]       = useState(false);
  const [routineModalTarget, setRoutineModalTarget]   = useState(null);
  const [routineModalDaysSince, setRoutineModalDaysSince] = useState(null);
  const [activeWorkoutRoutine, setActiveWorkoutRoutine] = useState(null);
  const [activeWorkoutDate, setActiveWorkoutDate] = useState(TODAY);
  const [activeWorkoutBackfill, setActiveWorkoutBackfill] = useState(false);
  const [showHistoryView, setShowHistoryView]         = useState(false);
  const [historyLogs, setHistoryLogs]                 = useState([]);
  const [historyDetailLog, setHistoryDetailLog]       = useState(null);
  const [sessionDetailLog, setSessionDetailLog]       = useState(null);
  const [showAllSessions, setShowAllSessions]         = useState(false);
  const [allSessionLogs, setAllSessionLogs]           = useState([]);
  const [activeDraft, setActiveDraft]                 = useState(null);

  // Registrar sesión pasada
  const now = new Date();
  const [showPastDateModal, setShowPastDateModal] = useState(false);
  const [pastRoutineTarget, setPastRoutineTarget] = useState(null);
  const [pastDayIdx, setPastDayIdx] = useState(Math.max(0, now.getDate() - 2));
  const [pastMonthIdx, setPastMonthIdx] = useState(now.getMonth());
  const [pastYearIdx, setPastYearIdx] = useState(0);

  // ── T4: loading + fallback ────────────────────────────
  const [initialLoading, setInitialLoading]   = useState(true);
  const [usingLocalData, setUsingLocalData]   = useState(false);

  // ── ConfirmModal — reemplaza Alert.alert (no funciona en web móvil) ──
  const [confirmModal, setConfirmModal] = useState({
    visible:false, title:'', message:'', confirmText:'Confirmar',
    confirmDestructive:false, onConfirm:null, showCancel:true,
  });

  // Agregar ejercicio a sesión activa
  const [showAddExModal, setShowAddExModal]   = useState(false);
  const [addExSearch, setAddExSearch]         = useState('');

  // Compartir rutina
  const [showShareModal, setShowShareModal]   = useState(false);
  const [shareCode, setShareCode]             = useState('');
  const [sharingLoading, setSharingLoading]   = useState(false);
  const [shareRoutineTarget, setShareRoutineTarget] = useState(null);
  const [codeCopied, setCodeCopied]           = useState(false);

  // Importar rutina
  const [showImportModal, setShowImportModal] = useState(false);
  const [importCode, setImportCode]           = useState('');
  const [importLoading, setImportLoading]     = useState(false);
  const [importPreview, setImportPreview]     = useState(null);
  const [importError, setImportError]         = useState('');

  // T1 — último uso por rutina (derivado de logs)
  const [lastUsedMap, setLastUsedMap] = useState({});
  // T4 — aviso si Firestore falló al compartir
  const [shareWarning, setShareWarning] = useState('');

  const autoSaveTimerRef = useRef(null);
  const lastSavedLogRef  = useRef('');
  const lastDraftLogRef  = useRef('');
  const selectedWorkoutRef = useRef(null); // para acceso en closures async

  const pastYears = useMemo(() => {
    const years = [];
    for (let y = now.getFullYear(); y >= 2020; y--) years.push(y);
    return years;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pastSelectedYear = pastYears[pastYearIdx] || now.getFullYear();
  const pastSelectedMonth = pastMonthIdx + 1;
  const pastMaxDays = daysInMonth(pastSelectedMonth, pastSelectedYear);
  const pastDays = useMemo(() => Array.from({ length: pastMaxDays }, (_, i) => i + 1), [pastMaxDays]);
  const pastSafeDayIdx = Math.min(pastDayIdx, pastMaxDays - 1);

  function selectedPastIso() {
    const d = pastDays[pastSafeDayIdx] || 1;
    return `${pastSelectedYear}-${String(pastSelectedMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }

  function openSessionDetailView(sessionLog) {
    if (!sessionLog) return;
    setSessionDetailLog(sessionLog);
    setHistoryDetailLog(null);
    setShowHistoryView(false);
    setShowRoutineModal(false);
  }

  async function saveSessionDetailDate(newDate) {
    const updated = await moveLogDate(sessionDetailLog, newDate);
    setSessionDetailLog(updated);
    const refreshed = await getLogs().catch(() => []);
    setAllSessionLogs(refreshed);
    await loadAll();
  }

  async function openAllSessionsView() {
    const refreshed = await getLogs().catch(() => []);
    setAllSessionLogs(refreshed);
    setShowAllSessions(true);
    setShowRoutineModal(false);
  }

  function applyRoutineHistory(routine, logs = []) {
    if (!routine?.id) return;
    const routineLogs = logs
      .filter(l => l.workoutId === routine.id && l.completed)
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    setHistoryLogs(routineLogs.slice(0, 10));
    if (routineLogs.length > 0) {
      const lastDate = routineLogs[0].date;
      const today = new Date(); today.setHours(0,0,0,0);
      const last  = new Date(lastDate); last.setHours(0,0,0,0);
      setRoutineModalDaysSince(Math.round((today-last)/(1000*60*60*24)));
    } else {
      setRoutineModalDaysSince(null);
    }
  }

  useFocusEffect(useCallback(()=>{ loadAll(); },[mode]));

  // Historial en vivo: pinta desde caché local inmediatamente y luego se actualiza
  // cuando Firestore responde. Evita el bug de historial blanco hasta refrescar.
  useEffect(() => {
    if (!showRoutineModal || !routineModalTarget?.id) return;
    let alive = true;
    getLogs().then(logs => {
      if (alive) applyRoutineHistory(routineModalTarget, logs);
    }).catch(() => {});
    const unsub = subscribeLogs((logs) => {
      if (alive) applyRoutineHistory(routineModalTarget, logs);
    }, undefined, 80);
    return () => { alive = false; unsub?.(); };
  }, [showRoutineModal, routineModalTarget?.id]);

  useEffect(()=>()=>{ if(autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); },[]);

  // Cargar unidad de peso
  useEffect(()=>{
    getWeightUnit().then(u=>{ setWeightUnit(u); prevWeightUnitRef.current=u; });
  },[]);

  // T1 — computar último uso por rutina desde logs
  useEffect(()=>{
    if (customRoutines.length===0) return;
    getLogs().then(logs=>{
      const map={};
      for (const log of logs) {
        if (log.completed && log.workoutId) {
          if (!map[log.workoutId] || log.date > map[log.workoutId]) {
            map[log.workoutId] = log.date;
          }
        }
      }
      setLastUsedMap(map);
    }).catch(()=>{});
  },[customRoutines.length]);

  // T3 — abrir rutina específica desde HomeScreen vía navigation params
  useEffect(()=>{
    const selectId = route?.params?.selectRoutineId;
    if (!selectId || customRoutines.length===0) return;
    const target = customRoutines.find(r=>r.id===selectId);
    if (target) {
      openRoutineModal(target);
      navigation.setParams({ selectRoutineId: undefined });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[route?.params?.selectRoutineId, customRoutines.length]);

  // Abrir historial completo o detalle desde Inicio.
  useEffect(()=>{
    if (route?.params?.showHistory) {
      openAllSessionsView();
      navigation.setParams({ showHistory: undefined });
    }
  }, [route?.params?.showHistory]);

  useEffect(()=>{
    const openId = route?.params?.openSessionId;
    if (!openId) return;
    let alive = true;
    getLogs().then(logs => {
      if (!alive) return;
      const found = logs.find(l => l.id === openId)
        || logs.find(l => l.workoutId === route?.params?.openSessionWorkoutId && l.id === openId);
      if (found) openSessionDetailView(found);
      navigation.setParams({ openSessionId: undefined, openSessionWorkoutId: undefined });
    }).catch(error => console.warn('open session detail failed:', error));
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route?.params?.openSessionId]);

  // Nota: la unidad global (weightUnit) solo es el default para ejercicios nuevos.
  // Cada ejercicio tiene su propia unidad (ex.unit). Ver T2.

  // Draft local inmediato para la vista de entrenamiento embebida.
  useEffect(()=>{
    if (!log || completed || !logHasProgress(log)) return;
    const signature = logSignature(log);
    if (signature === lastDraftLogRef.current) return;
    lastDraftLogRef.current = signature;
    saveLogDraft(log).catch(e => console.warn('draft save failed:', e));
  }, [log, completed]);

  useEffect(()=>{
    const flushDraft = () => {
      if (log && !completed && logHasProgress(log)) saveLogDraft(log).catch(()=>{});
    };
    const sub = AppState?.addEventListener?.('change', state => {
      if (state === 'inactive' || state === 'background') flushDraft();
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('beforeunload', flushDraft);
      return () => { window.removeEventListener('beforeunload', flushDraft); sub?.remove?.(); };
    }
    return () => sub?.remove?.();
  }, [log, completed]);

  // Autosave remoto debounced 3.5s
  useEffect(()=>{
    if (!log||!selectedWorkout||completed) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      return;
    }
    if (!logHasProgress(log)) { setAutoSaveState('idle'); return; }
    const signature = logSignature(log);
    if (signature===lastSavedLogRef.current) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveState('saving');
    autoSaveTimerRef.current = setTimeout(async()=>{
      try {
        await saveLog(log);
        lastSavedLogRef.current = signature;
        setAutoSaveState('saved');
        const phrase = AUTOSAVE_PHRASES[Math.floor(Math.random()*AUTOSAVE_PHRASES.length)];
        setSavePopPhrase(phrase);
        setShowSavePop(true);
        saveFadeAnim.setValue(0);
        Animated.sequence([
          Animated.timing(saveFadeAnim,{toValue:1,duration:300,useNativeDriver:true}),
          Animated.delay(1800),
          Animated.timing(saveFadeAnim,{toValue:0,duration:600,useNativeDriver:true}),
        ]).start(()=>setShowSavePop(false));
      } catch(e) {
        console.warn('autosave failed:',e);
        setAutoSaveState('error');
      }
    },3500);
  },[log, selectedWorkout?.id, completed]);

  // ─── ConfirmModal helpers ─────────────────────────────────
  function showConfirm({ title, message='', onConfirm, confirmDestructive=false, confirmText='Confirmar' }) {
    setConfirmModal({ visible:true, title, message, onConfirm, confirmDestructive, confirmText, showCancel:true });
  }
  function hideConfirm() {
    setConfirmModal(prev=>({ ...prev, visible:false }));
  }
  // Para errores/info: solo botón OK, sin cancelar
  function showInfo(title, message='') {
    setConfirmModal({ visible:true, title, message, onConfirm:hideConfirm, confirmDestructive:false, confirmText:'Ok', showCancel:false });
  }

  async function loadAll() {
    // ── FASE 1: local inmediato < 200ms ─────────────────────
    setInitialLoading(true);
    setUsingLocalData(false);
    const [localBase, localCustom, draft] = await Promise.all([
      getLocalWorkouts(),
      getLocalCustomRoutines(),
      getActiveSessionDraft().catch(() => null),
    ]);
    setBaseWorkouts(localBase);
    setCustomRoutines(localCustom);
    setActiveDraft(draft);
    setInitialLoading(false); // skeleton desaparece
    if (!selectedWorkoutRef.current && localCustom.length>0) {
      await selectWorkout(localCustom[0]);
    }

    // ── FASE 2: Firestore con timeout 5s ────────────────────
    setSyncing(true);
    try {
      const TIMEOUT = 5000;
      const remotePromise = Promise.all([getWorkouts(), getCustomRoutines()]);
      const timeoutPromise = new Promise((_,rej)=>
        setTimeout(()=>rej(new Error('timeout')),TIMEOUT)
      );
      const [remoteBase, remoteCustom] = await Promise.race([remotePromise, timeoutPromise]);
      setBaseWorkouts(remoteBase);
      setCustomRoutines(remoteCustom);
      getActiveSessionDraft().then(setActiveDraft).catch(() => {});
      setUsingLocalData(false);
      if (!selectedWorkoutRef.current && remoteCustom.length>0) {
        await selectWorkout(remoteCustom[0]);
      }
    } catch(e) {
      console.warn('Background sync failed:', e);
      setUsingLocalData(true); // muestra indicador "Usando datos locales"
    } finally {
      setSyncing(false);
    }
  }

  async function selectWorkout(workout) {
    selectedWorkoutRef.current = workout;
    setSelectedWorkout(workout);

    // Normalizar ejercicios — manejar todos los formatos posibles de Firestore
    let exerciseNames = normalizeExercises(workout.exercises);

    // Si los ejercicios están vacíos, intentar recargar desde storage (puede ser sync parcial)
    if (exerciseNames.length===0 && workout.id) {
      try {
        const allCustom = await getCustomRoutines();
        const fresh = allCustom.find(r=>r.id===workout.id);
        if (fresh) exerciseNames = normalizeExercises(fresh.exercises);
      } catch(e) { console.warn('exercise reload failed:',e); }
    }

    const blankLog = {
      date: TODAY,
      workoutId: workout.id,
      workoutName: workout.name || workout.day,
      completed: false,
      exercises: exerciseNames.map(name=>({ name, unit: weightUnit, sets:[{ reps:'', weight:'' }] })),
    };

    setLog(blankLog);
    setCompleted(false);
    lastSavedLogRef.current = '';
    lastDraftLogRef.current = '';
    setAutoSaveState('idle');

    try {
      const logs = await getLogs();
      const last = logs
        .filter(l=>l.workoutId===workout.id && l.completed)
        .sort((a,b)=>b.date.localeCompare(a.date))[0] || null;
      setLastLog(last);

      const todayLog = logs.find(l=>l.date===TODAY && l.workoutId===workout.id);
      if (todayLog) {
        // Asegurar que los ejercicios del log guardado tengan nombres válidos
        const validatedLog = {
          ...todayLog,
          exercises: (todayLog.exercises||[]).map((ex,i)=>({
            ...ex,
            name: ex.name || exerciseNames[i] || `Ejercicio ${i+1}`,
            unit: ex.unit || weightUnit,   // restaurar unidad guardada
          })),
        };
        setLog(validatedLog);
        setCompleted(todayLog.completed);
        lastSavedLogRef.current = logSignature(validatedLog);
        lastDraftLogRef.current = logSignature(validatedLog);
        setAutoSaveState('saved');
      } else if (workout.isRecurring && last) {
        // Rutina recurrente: pre-cargar pesos anteriores
        setLog({
          ...blankLog,
          exercises: blankLog.exercises.map(ex=>{
            const lastEx = last.exercises?.find(e=>e.name===ex.name);
            if (!lastEx) return ex;
            return {
              ...ex,
              unit: lastEx.unit || ex.unit,  // restaurar unidad del log anterior
              sets: (lastEx.sets||[]).map(st=>({ reps:st.reps||'', weight:st.weight||'', done:false })),
            };
          }),
        });
      }
    } catch(e) {
      console.warn('selectWorkout logs load failed:',e);
      setLastLog(null);
    }
  }

  async function switchMode(newMode) {
    selectedWorkoutRef.current = null;
    setMode(newMode);
    setSelectedWorkout(null);
    setLog(null);
    const list = newMode==='base' ? baseWorkouts : customRoutines;
    if (list.length>0) await selectWorkout(list[0]);
  }

  // ─── Set management ──────────────────────────────────────
  const updateSet = useCallback((exIdx, setIdx, field, value)=>{
    const clean = String(value||'').replace(',','.');
    const valid = field==='reps'
      ? clean.replace(/[^0-9]/g,'')
      : clean.replace(/[^0-9.]/g,'');
    setLog(prev=>({
      ...prev,
      exercises: prev.exercises.map((ex,ei)=>ei!==exIdx?ex:{
        ...ex,
        sets: ex.sets.map((st,si)=>si!==setIdx?st:{ ...st,[field]:valid,done:false }),
      }),
    }));
  },[]);

  const addSet = useCallback((exIdx)=>{
    setLog(prev=>({
      ...prev,
      exercises: prev.exercises.map((ex,ei)=>{
        if (ei!==exIdx) return ex;
        const last = ex.sets[ex.sets.length-1];
        return { ...ex, sets:[...ex.sets,{ reps:last?.reps||'', weight:last?.weight||'', done:false }] };
      }),
    }));
  },[]);

  const toggleSetDone = useCallback((exIdx, setIdx)=>{
    setLog(prev=>{
      const set = prev.exercises[exIdx]?.sets[setIdx];
      if (!set) return prev;
      const wasDone = !!set.done;
      const updated = {
        ...prev,
        exercises: prev.exercises.map((ex,ei)=>ei!==exIdx?ex:{
          ...ex,
          sets: ex.sets.map((st,si)=>si!==setIdx?st:{ ...st,done:!wasDone }),
        }),
      };
      if (!wasDone) {
        const phrase = SET_PHRASES[Math.floor(Math.random()*SET_PHRASES.length)];
        setReactionPhrase(phrase);
        setPanchitaReaction(true);
        setTimeout(()=>setPanchitaReaction(false),2500);
      }
      return updated;
    });
  },[]);

  const removeSet = useCallback((exIdx, setIdx)=>{
    setLog(prev=>{
      const ex = prev.exercises[exIdx];
      if (!ex) return prev;

      // Si quedan 2+ sets: eliminar ese set
      if (ex.sets.length>1) {
        return {
          ...prev,
          exercises: prev.exercises.map((e,ei)=>ei!==exIdx?e:{
            ...e, sets:e.sets.filter((_,si)=>si!==setIdx),
          }),
        };
      }

      // Si es el último set: limpiar valores (no eliminar el ejercicio)
      return {
        ...prev,
        exercises: prev.exercises.map((e,ei)=>ei!==exIdx?e:{
          ...e, sets:[{ reps:'', weight:'', done:false }],
        }),
      };
    });
  },[]);

  const removeExercise = useCallback((exIdx)=>{
    setLog(prev=>{
      const exercises = prev.exercises.filter((_,ei)=>ei!==exIdx);
      // Permitir dejar lista vacía — el estado vacío se renderiza en la UI
      return { ...prev, exercises };
    });
  },[]);

  // T5 — mover ejercicio en sesión activa
  const moveExercise = useCallback((exIdx, dir)=>{
    setLog(prev=>{
      const exs = [...(prev.exercises||[])];
      const target = exIdx + dir;
      if (target < 0 || target >= exs.length) return prev;
      [exs[exIdx], exs[target]] = [exs[target], exs[exIdx]];
      return { ...prev, exercises: exs };
    });
  },[]);

  // ─── Agregar ejercicio a sesión activa ───────────────────
  function addExerciseToSession(name) {
    const trimmed = (name||'').trim();
    if (!trimmed || !log) return;
    setLog(prev => ({
      ...prev,
      exercises: [...prev.exercises, { name: trimmed, unit: weightUnit, sets: [{ reps: '', weight: '' }] }],
    }));
    setShowAddExModal(false);
    setAddExSearch('');
  }

  // ─── Cambiar unidad por ejercicio ─────────────────────────
  const setExUnit = useCallback((exIdx, newUnit)=>{
    setLog(prev=>{
      const ex = prev.exercises[exIdx];
      if (!ex) return prev;
      const oldUnit = ex.unit || 'kg';
      if (oldUnit === newUnit) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((e, ei)=>{
          if (ei!==exIdx) return e;
          return {
            ...e,
            unit: newUnit,
            sets: e.sets.map(st=>({
              ...st,
              weight: st.weight ? convertWeightValue(st.weight, oldUnit, newUnit) : st.weight,
            })),
          };
        }),
      };
    });
  },[]);

  // ─── Guardar / terminar ───────────────────────────────────
  async function saveProgress() {
    if (!log) return;
    setSaving(true);
    try {
      await saveLog(log);
      lastSavedLogRef.current = logSignature(log);
      setAutoSaveState('saved');
      setReactionPhrase('Progreso guardado. Igual no te lo creo hasta que termines.');
      setPanchitaReaction(true);
      setTimeout(()=>setPanchitaReaction(false),2500);
    } catch(e) {
      console.warn('manual save failed:',e);
      setAutoSaveState('error');
      showInfo('Panchita dice:','No pude guardar. Intentá otra vez.');
    } finally { setSaving(false); }
  }

  async function finishWorkout() {
    if (!log) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const finishedLog = { ...log, completed:true };
    setSaving(true);
    try {
      await saveLog(finishedLog);
      lastSavedLogRef.current = logSignature(finishedLog);
      setAutoSaveState('saved');
      setLog(finishedLog);
      setCompleted(true);
      const phrase = COMPLETION_PHRASES[Math.floor(Math.random()*COMPLETION_PHRASES.length)];
      setCompletionPhrase(phrase);
      setShowCompletion(true);
    } catch(e) {
      console.warn('finish workout failed:',e);
      showInfo('Panchita dice:','No pude terminar la rutina. Intentá otra vez.');
    } finally { setSaving(false); }
  }

  function getLastExUnit(exName) {
    if (!lastLog) return null;
    const ex = lastLog.exercises?.find(e=>e.name===exName);
    return ex?.unit || null;
  }

  function getLastValue(exName, setIdx, field) {
    if (!lastLog) return null;
    const ex = lastLog.exercises?.find(e=>e.name===exName);
    return ex?.sets?.[setIdx]?.[field] || null;
  }

  // ─── Crear rutina ─────────────────────────────────────────
  function openCreateModal() {
    setNewRoutineName(''); setNewExercises(['','','']);
    setNewRoutineRecurring(false); setCreateError(''); setCreatingRoutine(false);
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    Keyboard.dismiss(); setShowCreateModal(false);
    setCreateError(''); setCreatingRoutine(false); setNewRoutineRecurring(false);
  }

  async function saveNewRoutine() {
    if (creatingRoutine) return;
    Keyboard.dismiss(); setCreateError('');
    const trimmedName = newRoutineName.trim();
    if (!trimmedName) { setCreateError('La rutina necesita un nombre.'); return; }
    const exercises = newExercises.map(e=>e.trim()).filter(Boolean);
    if (exercises.length===0) { setCreateError('Agregá al menos un ejercicio.'); return; }
    setCreatingRoutine(true);
    try {
      const routine = {
        id: `custom_${Date.now()}`,
        name: trimmedName, day: trimmedName,
        exercises, isCustom:true, isRecurring:newRoutineRecurring,
        createdAt: new Date().toISOString(),
      };
      await saveCustomRoutine(routine);
      setCustomRoutines(prev=>[routine,...prev.filter(r=>r.id!==routine.id)]);
      setMode('custom');
      setShowCreateModal(false);
      selectWorkout(routine).catch(e=>console.warn(e));
    } catch(e) {
      setCreateError('No pude guardar la rutina. Revisá conexión.');
    } finally { setCreatingRoutine(false); setNewRoutineRecurring(false); }
  }

  // T5 — mover ejercicio en modal editar rutina
  function moveEditExercise(idx, dir) {
    const arr = [...editExercises];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    setEditExercises(arr);
  }

  // ─── Editar ejercicios de rutina ──────────────────────────
  function openEditModal(routine) {
    setEditingRoutine(routine);
    setEditExercises([...(normalizeExercises(routine.exercises).length>0
      ? normalizeExercises(routine.exercises)
      : [''])]);
    setShowEditModal(true);
  }

  async function saveEditedRoutine() {
    if (!editingRoutine) return;
    const exercises = editExercises.map(e=>e.trim()).filter(Boolean);
    if (exercises.length===0) { showInfo('Error','Agregá al menos un ejercicio.'); return; }
    setEditingRoutineSaving(true);
    try {
      const updated = { ...editingRoutine, exercises };
      await saveCustomRoutine(updated);
      setCustomRoutines(prev=>prev.map(r=>r.id===updated.id?updated:r));
      setShowEditModal(false);
      if (selectedWorkout?.id===updated.id) await selectWorkout(updated);
    } catch(e) {
      showInfo('Error','No se pudo guardar. Revisá conexión.');
    } finally { setEditingRoutineSaving(false); }
  }

  // ─── Compartir rutina — código real verificado en Firestore ──
  async function openShareRoutine(routine) {
    setShareRoutineTarget(routine);
    setShareCode('');
    setShareWarning('');
    setCodeCopied(false);
    setSharingLoading(true);
    setShowShareModal(true);

    try {
      // No mostramos un código hasta confirmar que existe en servidor.
      const serverCode = await shareRoutine(routine);
      setShareCode(serverCode);
    } catch (error) {
      console.warn('openShareRoutine error:', error);
      setShareWarning(error?.message || 'No se pudo publicar el código. Revisá conexión e intentá otra vez.');
    } finally {
      setSharingLoading(false);
    }
  }

  async function copyShareCode() {
    if (!shareCode) return;
    try {
      await Share.share({ message: `Mi rutina en PanchitaFit:
${shareCode}` });
      setCodeCopied(true);
      setTimeout(()=>setCodeCopied(false), 3000);
    } catch {
      // usuario canceló Share
    }
  }

  // ─── Importar rutina ──────────────────────────────────────
  function openImportModal() {
    setImportCode('');
    setImportPreview(null);
    setImportError('');
    setImportLoading(false);
    setShowImportModal(true);
  }

  async function handleLookupCode() {
    const clean = importCode.trim();
    if (!clean) { setImportError('Pegá el código completo que te compartieron.'); return; }
    setImportLoading(true);
    setImportError('');
    setImportPreview(null);
    try {
      const preview = await importSharedRoutine(clean);
      setImportPreview(preview);
    } catch(e) {
      setImportError(e.message || 'No se pudo encontrar el código.');
    } finally {
      setImportLoading(false);
    }
  }

  async function confirmImport() {
    if (!importPreview) return;
    // Evitar nombre duplicado
    const existingNames = customRoutines.map(r=>(r.name||r.day||'').toLowerCase());
    let nombre = importPreview.nombre;
    if (existingNames.includes(nombre.toLowerCase())) nombre = `${nombre} (importada)`;

    const routine = {
      id: `custom_${Date.now()}`,
      name: nombre, day: nombre,
      exercises: importPreview.ejercicios,
      isCustom: true, isRecurring: false,
      createdAt: new Date().toISOString(),
    };
    await saveCustomRoutine(routine);
    setCustomRoutines(prev=>[routine,...prev]);
    setShowImportModal(false);
    setMode('custom');
    selectWorkout(routine).catch(()=>{});
  }

  // ─── Duplicar / eliminar rutina ───────────────────────────
  // Nota: ya no se usa directamente — el menú ⋯ llama a showConfirm directamente
  function confirmDeleteRoutine(routine) {
    showConfirm({
      title: '¿Eliminar rutina?',
      message: `Se eliminará "${routine.name||routine.day}" permanentemente. Esta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      confirmDestructive: true,
      onConfirm: () => { hideConfirm(); doDeleteRoutine(routine); },
    });
  }

  async function duplicateRoutine(routine) {
    const newR = { ...routine, id:`custom_${Date.now()}`, name:`${routine.name||routine.day} (copia)`, day:`${routine.name||routine.day} (copia)`, createdAt:new Date().toISOString() };
    await saveCustomRoutine(newR);
    setCustomRoutines(prev=>[newR,...prev]);
  }

  async function doDeleteRoutine(routine) {
    if (!routine?.id) return;
    const previous = customRoutines;
    const updated = previous.filter(r => r.id !== routine.id);
    setDeletingRoutineId(routine.id);
    setDeletingRoutineName(routine.name || routine.day || 'rutina');
    setCustomRoutines(updated);
    setShowChipMenu(false);
    if (selectedWorkout?.id===routine.id) {
      setSelectedWorkout(null); setLog(null);
      if (updated.length>0) selectWorkout(updated[0]).catch(()=>{});
    }
    try {
      await deleteCustomRoutine(routine.id);
    } catch(e) {
      setCustomRoutines(previous);
      showInfo('No se pudo eliminar', 'Restauré la rutina porque falló el guardado. El WiFi hizo cardio y se cansó.');
    } finally {
      setDeletingRoutineId(null);
      setDeletingRoutineName('');
    }
  }

  // ─── T1: Chip menu ───────────────────────────────────────
  function openChipMenu(routine) {
    setChipMenuRoutine(routine);
    setShowChipMenu(true);
  }

  function openEditNameModal(routine) {
    setEditNameRoutine(routine);
    setEditNameValue(routine.name||routine.day||'');
    setEditNameSaving(false);
    setShowEditNameModal(true);
  }

  async function saveRoutineName() {
    if (!editNameRoutine) return;
    const trimmed = editNameValue.trim();
    if (!trimmed) return;
    setEditNameSaving(true);
    try {
      const updated = { ...editNameRoutine, name:trimmed, day:trimmed };
      await saveCustomRoutine(updated);
      setCustomRoutines(prev=>prev.map(r=>r.id===updated.id?updated:r));
      if (selectedWorkout?.id===updated.id) {
        setSelectedWorkout(updated);
        selectedWorkoutRef.current = updated;
      }
      setShowEditNameModal(false);
    } catch(e) {
      showInfo('Error','No se pudo guardar el nombre.');
    } finally { setEditNameSaving(false); }
  }

  // ─── T3: Routine selection modal ─────────────────────────
  function openRoutineModal(routine) {
    setRoutineModalTarget(routine);
    setShowHistoryView(false);
    setHistoryDetailLog(null);
    setHistoryLogs([]);
    setRoutineModalDaysSince(null);
    setShowRoutineModal(true);
  }

  function routineFromDraft(draft = activeDraft) {
    if (!draft?.log) return null;
    const all = [...customRoutines, ...baseWorkouts];
    const existing = all.find(r => r.id === draft.workoutId);
    if (existing) return existing;
    return {
      id: draft.workoutId,
      name: draft.log.workoutName || draft.workoutName || 'Sesión reciente',
      day: draft.log.workoutName || draft.workoutName || 'Sesión reciente',
      exercises: (draft.log.exercises || []).map(ex => ex.name).filter(Boolean),
      isCustom: true,
    };
  }

  function continueActiveDraft() {
    const routine = routineFromDraft();
    if (!routine || !activeDraft?.log) return;
    setActiveWorkoutDate(activeDraft.log.date || activeDraft.date || TODAY);
    setActiveWorkoutBackfill(!!activeDraft.log.backfilled);
    setActiveWorkoutRoutine(routine);
  }

  function startNewSession() {
    setShowRoutineModal(false);
    setActiveWorkoutDate(TODAY);
    setActiveWorkoutBackfill(false);
    if (routineModalTarget) setActiveWorkoutRoutine(routineModalTarget);
  }

  function openPastSessionModal(routine) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    setPastRoutineTarget(routine);
    setPastDayIdx(Math.max(0, yesterday.getDate() - 1));
    setPastMonthIdx(yesterday.getMonth());
    const yearIndex = pastYears.findIndex(y => y === yesterday.getFullYear());
    setPastYearIdx(yearIndex >= 0 ? yearIndex : 0);
    setShowRoutineModal(false);
    setShowPastDateModal(true);
  }

  function startPastSession() {
    const iso = selectedPastIso();
    if (iso > TODAY) {
      showInfo('Fecha inválida', 'No podés registrar una sesión del futuro. Panchita todavía no domina viajes temporales.');
      return;
    }
    setActiveWorkoutDate(iso);
    setActiveWorkoutBackfill(true);
    setActiveWorkoutRoutine(pastRoutineTarget);
    setShowPastDateModal(false);
  }

  // ─── Recomendación ────────────────────────────────────────
  async function openRecommendation() {
    setLoadingRecommend(true); setShowRecommend(true);
    try {
      const activity = await getRecentMuscleActivity();
      setRecommendation(buildRecommendation(activity));
    } catch {
      setRecommendation({ group:'legs', label:'piernas', exercises:MUSCLE_EXERCISES.legs, daysSince:null, phrase:'No pude analizar, pero hacé piernas.' });
    } finally { setLoadingRecommend(false); }
  }

  function useRecommendedRoutine() {
    if (!recommendation) return;
    const routine = {
      id:`rec_${recommendation.group}`,
      name:`${recommendation.label.charAt(0).toUpperCase()+recommendation.label.slice(1)} (Panchita)`,
      day:`${recommendation.label.charAt(0).toUpperCase()+recommendation.label.slice(1)} (Panchita)`,
      exercises:recommendation.exercises,
    };
    setShowRecommend(false);
    setActiveWorkoutDate(TODAY);
    setActiveWorkoutBackfill(false);
    setActiveWorkoutRoutine(routine);
  }

  function closeActiveWorkout() {
    setActiveWorkoutRoutine(null);
    setActiveWorkoutDate(TODAY);
    setActiveWorkoutBackfill(false);
    setSelectedWorkout(null);
    setLog(null);
    setCompleted(false);
    loadAll();
  }

  function finishActiveWorkout() {
    const wasBackfill = activeWorkoutBackfill;
    setActiveWorkoutRoutine(null);
    setActiveWorkoutDate(TODAY);
    setActiveWorkoutBackfill(false);
    setSelectedWorkout(null);
    setLog(null);
    setCompleted(false);
    setActiveDraft(null);
    loadAll();
    if (!wasBackfill) navigation.navigate('Inicio');
  }

  // Lista ordenada por último uso (más reciente arriba)
  const currentList = useMemo(()=>{
    return [...customRoutines].sort((a, b) => {
      const aLast = lastUsedMap[a.id] || '';
      const bLast = lastUsedMap[b.id] || '';
      if (bLast !== aLast) return bLast.localeCompare(aLast);
      return (b.isRecurring?1:0) - (a.isRecurring?1:0);
    });
  },[customRoutines, lastUsedMap]);

  // ─── Render ──────────────────────────────────────────────
  if (sessionDetailLog) {
    return (
      <SessionDetailView
        log={sessionDetailLog}
        colors={colors}
        onBack={() => setSessionDetailLog(null)}
        onSaveDate={saveSessionDetailDate}
      />
    );
  }

  if (showAllSessions) {
    return (
      <SessionHistoryListView
        logs={allSessionLogs}
        colors={colors}
        onBack={() => setShowAllSessions(false)}
        onOpen={openSessionDetailView}
      />
    );
  }

  if (activeWorkoutRoutine) {
    return (
      <ActiveWorkoutScreen
        routine={activeWorkoutRoutine}
        sessionDate={activeWorkoutDate}
        isBackfill={activeWorkoutBackfill}
        onClose={closeActiveWorkout}
        onFinish={finishActiveWorkout}
      />
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Popup autosave */}
      {showSavePop && (
        <Animated.View style={[s.autosavePop,{opacity:saveFadeAnim}]} pointerEvents="none">
          <Panchita state="happy" size={56} autoWave={false} />
          <Text style={s.autosavePopText}>{savePopPhrase}</Text>
        </Animated.View>
      )}

      {/* Reacción flotante */}
      {panchitaReaction && (
        <View style={s.reaction}>
          <Panchita state="happy" size={44} />
          <View style={{flex:1}}>
            <Text style={s.reactionText}>{reactionPhrase}</Text>
          </View>
        </View>
      )}

      {/* Modal completado */}
      <Modal visible={showCompletion} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Panchita state="happy" size={100}/>
            <Text style={s.modalTitle}>Rutina completada</Text>
            <Text style={s.modalPhrase}>{completionPhrase}</Text>
            <TouchableOpacity style={s.modalBtn} onPress={()=>{ setShowCompletion(false); navigation.navigate('Inicio'); }}>
              <Text style={s.modalBtnText}>Volver al inicio</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal crear rutina */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={closeCreateModal}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{padding:20,width:'92%',maxHeight:'88%',alignItems:'stretch'}]}>
            <Text style={[s.modalTitle,{marginBottom:12}]}>Nueva rutina</Text>
            <TextInput style={[s.createInput,{marginBottom:10}]} placeholder="Nombre de la rutina" placeholderTextColor={colors.gray} value={newRoutineName} onChangeText={v=>{setNewRoutineName(v);setCreateError('');}} />
            {/* Toggle recurrente */}
            <TouchableOpacity style={[s.recurringRow,newRoutineRecurring&&s.recurringRowOn]} onPress={()=>setNewRoutineRecurring(v=>!v)} activeOpacity={0.8}>
              <View style={s.inlineIconRow}>
                {newRoutineRecurring ? <IconCalendar size={17} color={colors.purpleLight} /> : <IconRepeat size={17} color={colors.purpleLight} />}
                <Text style={s.recurringLabel}>Repetir cada semana</Text>
              </View>
              <View style={[s.recurringToggle,newRoutineRecurring&&s.recurringToggleOn]}>
                <Text style={[s.recurringToggleTxt,newRoutineRecurring&&{color:'#fff'}]}>{newRoutineRecurring?'Sí':'No'}</Text>
              </View>
            </TouchableOpacity>
            <Text style={[s.createLabel,{marginTop:12,marginBottom:8}]}>Ejercicios</Text>
            <ScrollView style={{maxHeight:260}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {newExercises.map((ex,i)=>(
                <View key={i} style={s.createExRow}>
                  <TextInput style={[s.createInput,{flex:1}]} placeholder={`Ejercicio ${i+1}`} placeholderTextColor={colors.gray} value={ex} onChangeText={v=>{ const a=[...newExercises]; a[i]=v; setNewExercises(a); setCreateError(''); }} returnKeyType="next" />
                  {newExercises.length>1&&(
                    <TouchableOpacity onPress={()=>setNewExercises(prev=>prev.filter((_,j)=>j!==i))} style={s.createRemoveBtn}>
                      <IconClose size={14} color={colors.grayLight} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={s.addExBtn} onPress={()=>setNewExercises(p=>[...p,''])}>
                <Text style={s.addExTxt}>+ Agregar ejercicio</Text>
              </TouchableOpacity>
            </ScrollView>
            {createError?<Text style={s.createError}>{createError}</Text>:null}
            <View style={{flexDirection:'row',gap:10,marginTop:14}}>
              <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purpleDim}]} onPress={closeCreateModal} disabled={creatingRoutine}>
                <Text style={[s.createBtnTxt,{color:colors.grayLight}]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purple},creatingRoutine&&{opacity:0.65}]} onPress={saveNewRoutine} disabled={creatingRoutine}>
                {creatingRoutine?<ActivityIndicator color="#fff" size="small"/>:<Text style={[s.createBtnTxt,{color:'#fff'}]}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal editar ejercicios */}
      <Modal visible={showEditModal} transparent animationType="slide" onRequestClose={()=>setShowEditModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{padding:20,width:'92%',maxHeight:'85%',alignItems:'stretch'}]}>
            <Text style={[s.modalTitle,{marginBottom:12}]}>Editar ejercicios</Text>
            <Text style={[s.createLabel,{marginBottom:8}]}>{editingRoutine?.name||editingRoutine?.day}</Text>
            <ScrollView style={{maxHeight:300}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {editExercises.map((ex,i)=>(
                <View key={i} style={s.createExRow}>
                  {/* T5 — flechas para reordenar en edición */}
                  <View style={{flexDirection:'column',gap:2,marginRight:2}}>
                    <TouchableOpacity style={[s.exOrderBtn,{width:26,height:22}]} onPress={()=>moveEditExercise(i,-1)} disabled={i===0}>
                      <IconArrowUp size={14} color={i===0 ? colors.gray : colors.purpleLight} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.exOrderBtn,{width:26,height:22}]} onPress={()=>moveEditExercise(i,1)} disabled={i===editExercises.length-1}>
                      <IconArrowDown size={14} color={i===editExercises.length-1 ? colors.gray : colors.purpleLight} />
                    </TouchableOpacity>
                  </View>
                  <TextInput style={[s.createInput,{flex:1}]} placeholder={`Ejercicio ${i+1}`} placeholderTextColor={colors.gray} value={ex} onChangeText={v=>{ const a=[...editExercises]; a[i]=v; setEditExercises(a); }} returnKeyType="next" />
                  {editExercises.length>1&&(
                    <TouchableOpacity onPress={()=>setEditExercises(prev=>prev.filter((_,j)=>j!==i))} style={s.createRemoveBtn}>
                      <IconClose size={14} color={colors.grayLight} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={s.addExBtn} onPress={()=>setEditExercises(p=>[...p,''])}>
                <Text style={s.addExTxt}>+ Agregar ejercicio</Text>
              </TouchableOpacity>
            </ScrollView>
            <View style={{flexDirection:'row',gap:10,marginTop:14}}>
              <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purpleDim}]} onPress={()=>setShowEditModal(false)} disabled={editingRoutineSaving}>
                <Text style={[s.createBtnTxt,{color:colors.grayLight}]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purple},editingRoutineSaving&&{opacity:0.65}]} onPress={saveEditedRoutine} disabled={editingRoutineSaving}>
                {editingRoutineSaving?<ActivityIndicator color="#fff" size="small"/>:<Text style={[s.createBtnTxt,{color:'#fff'}]}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal recomendación */}
      <Modal visible={showRecommend} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{width:'90%'}]}>
            <Panchita state={loadingRecommend?'idle':'happy'} size={90}/>
            {loadingRecommend?<Text style={s.modalPhrase}>Analizando tu historial...</Text>:recommendation?(<>
              <View style={s.recBadge}><Text style={s.recBadgeText}>{recommendation.label.toUpperCase()} HOY</Text></View>
              <Text style={[s.modalPhrase,{fontStyle:'italic'}]}>"{recommendation.phrase}"</Text>
              <View style={s.recExList}>{recommendation.exercises.map((ex,i)=><Text key={i} style={s.recExItem}>· {ex}</Text>)}</View>
              <TouchableOpacity style={s.modalBtn} onPress={useRecommendedRoutine}>
                <View style={s.modalBtnRow}><Text style={s.modalBtnText}>Usar esta rutina</Text><IconArrow size={16} color={colors.accentText||'#fff'} /></View>
              </TouchableOpacity>
              <TouchableOpacity onPress={()=>setShowRecommend(false)} style={{marginTop:8}}><Text style={{color:colors.gray,fontSize:13,textAlign:'center'}}>No gracias</Text></TouchableOpacity>
            </>):null}
          </View>
        </View>
      </Modal>

      {/* Modal compartir rutina */}
      <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={()=>setShowShareModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{width:'88%'}]}>
            <Panchita state={sharingLoading?'thinking':shareCode?'happy':'angry'} size={90}/>
            <Text style={s.modalTitle}>Compartir rutina</Text>
            {sharingLoading?(
              <>
                <ActivityIndicator color={colors.purpleLight} size="large"/>
                <Text style={[s.sharePanchitaPhrase,{marginTop:12}]}>Publicando el código real... nada de códigos fantasma, gracias.</Text>
              </>
            ):shareCode?(
              <>
                <Text style={s.shareSubtitle}>{shareRoutineTarget?.name||shareRoutineTarget?.day}</Text>
                <TouchableOpacity style={s.shareCodeBox} onPress={copyShareCode} activeOpacity={0.7}>
                  <Text style={s.shareCodeText} numberOfLines={1} ellipsizeMode="middle">{formatShareCodePreview(shareCode)}</Text>
                  <Text style={s.shareCodeHint}>{codeCopied?'Compartido':'Código largo listo · tap para compartir'}</Text>
                </TouchableOpacity>
                <Text style={s.sharePanchitaPhrase}>"Ahora todos van a saber que entrenás. O al menos que tenés una rutina."</Text>
                <Text style={s.shareExpiry}>Este código expira en 30 días.</Text>
                <TouchableOpacity style={s.modalBtn} onPress={copyShareCode}>
                  <View style={s.modalBtnRow}>
                    {codeCopied ? <IconCheck size={16} color={colors.accentText||'#fff'} /> : <IconShare size={16} color={colors.accentText||'#fff'} />}
                    <Text style={s.modalBtnText}>{codeCopied?'Compartido':'Compartir código'}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setShowShareModal(false)} style={{marginTop:10}}>
                  <Text style={{color:colors.gray,fontSize:13,textAlign:'center'}}>Cerrar</Text>
                </TouchableOpacity>
              </>
            ):(
              <>
                <Text style={s.shareWarningText}>{shareWarning || 'No se pudo publicar el código.'}</Text>
                <TouchableOpacity style={[s.modalBtn,{marginTop:14}]} onPress={()=>shareRoutineTarget && openShareRoutine(shareRoutineTarget)}>
                  <Text style={s.modalBtnText}>Intentar de nuevo</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setShowShareModal(false)} style={{marginTop:10}}>
                  <Text style={{color:colors.gray,fontSize:13,textAlign:'center'}}>Cerrar</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Modal importar rutina */}
      <Modal visible={showImportModal} transparent animationType="slide" onRequestClose={()=>setShowImportModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{width:'92%',padding:22,alignItems:'stretch'}]}>
            <Text style={[s.modalTitle,{marginBottom:6}]}>Importar rutina</Text>
            <Text style={[s.modalPhrase,{marginBottom:16}]}>Pegá el código completo que te compartieron</Text>

            <TextInput
              style={[s.createInput,{textAlign:'center',fontSize:14,fontWeight:'800',letterSpacing:0,marginBottom:12,minHeight:96}]}
              value={importCode}
              onChangeText={v=>{ setImportCode(v.trim()); setImportError(''); setImportPreview(null); }}
              placeholder="PF1..."
              placeholderTextColor={colors.gray}
              multiline
              autoCapitalize="none"
              keyboardType="default"
              autoCorrect={false}
              autoComplete="off"
            />

            {importError?(
              <Text style={[s.createError,{marginBottom:10}]}>{importError}</Text>
            ):null}

            {/* Preview */}
            {importPreview&&(
              <View style={[s.recExList,{marginBottom:14}]}>
                <Text style={{color:colors.purpleLight,fontWeight:'700',marginBottom:6,fontSize:14}}>{importPreview.nombre}</Text>
                {importPreview.ejercicios.map((ex,i)=><Text key={i} style={s.recExItem}>· {ex}</Text>)}
              </View>
            )}

            <View style={{flexDirection:'row',gap:10}}>
              <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purpleDim}]} onPress={()=>setShowImportModal(false)}>
                <Text style={[s.createBtnTxt,{color:colors.grayLight}]}>Cancelar</Text>
              </TouchableOpacity>
              {!importPreview?(
                <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purple},importLoading&&{opacity:0.65}]} onPress={handleLookupCode} disabled={importLoading}>
                  {importLoading?<ActivityIndicator color="#fff" size="small"/>:<Text style={[s.createBtnTxt,{color:'#fff'}]}>Buscar</Text>}
                </TouchableOpacity>
              ):(
                <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purple}]} onPress={confirmImport}>
                  <View style={s.inlineIconRow}><Text style={[s.createBtnTxt,{color:'#fff'}]}>Importar</Text><IconCheck size={15} color="#fff" /></View>
                </TouchableOpacity>
              )}
            </View>
            {importPreview&&(
              <Text style={{color:colors.gray,fontSize:12,textAlign:'center',marginTop:10,fontStyle:'italic'}}>
                "Rutina importada. Ahora a ver si la usás."
              </Text>
            )}
          </View>
        </View>
      </Modal>

      {/* ── T1: Modal menú chip — usa flex-end, NO position:absolute (compatibilidad web) ── */}
      <Modal visible={showChipMenu} transparent animationType="slide" onRequestClose={()=>setShowChipMenu(false)}>
        <View style={s.bsOverlay}>
          <TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={()=>setShowChipMenu(false)}/>
          <View style={s.bottomSheet}>
            <View style={s.bottomSheetHandle}/>
            <Text style={s.bottomSheetTitle} numberOfLines={1}>{chipMenuRoutine?.name||chipMenuRoutine?.day}</Text>
            <TouchableOpacity style={s.bsOption} onPress={()=>{ setShowChipMenu(false); setTimeout(()=>openEditNameModal(chipMenuRoutine),180); }}>
              <View style={s.bsOptionRow}><IconEditar size={19} color={colors.purpleLight} /><Text style={s.bsOptionTxt}>Editar nombre</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={s.bsOption} onPress={()=>{ setShowChipMenu(false); setTimeout(()=>openEditModal(chipMenuRoutine),180); }}>
              <View style={s.bsOptionRow}><IconDocument size={19} color={colors.purpleLight} /><Text style={s.bsOptionTxt}>Editar ejercicios</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={s.bsOption} onPress={()=>{ setShowChipMenu(false); duplicateRoutine(chipMenuRoutine); }}>
              <View style={s.bsOptionRow}><IconCopy size={19} color={colors.purpleLight} /><Text style={s.bsOptionTxt}>Duplicar</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={s.bsOption} onPress={()=>{ setShowChipMenu(false); setTimeout(()=>openShareRoutine(chipMenuRoutine),180); }}>
              <View style={s.bsOptionRow}><IconShare size={19} color={colors.purpleLight} /><Text style={s.bsOptionTxt}>Compartir</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={s.bsOption} onPress={()=>{
              const r=chipMenuRoutine;
              setShowChipMenu(false);
              // Pequeño delay para que el bottom sheet cierre antes de abrir el confirm modal
              setTimeout(()=>confirmDeleteRoutine(r), 200);
            }}>
              <View style={s.bsOptionRow}><IconEliminar size={19} color={colors.danger} /><Text style={[s.bsOptionTxt,{color:colors.danger}]}>Eliminar</Text></View>
            </TouchableOpacity>
            <TouchableOpacity style={[s.bsOption,{borderTopWidth:1,borderTopColor:colors.purpleDim,marginTop:4}]} onPress={()=>setShowChipMenu(false)}>
              <Text style={[s.bsOptionTxt,{color:colors.gray}]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── T1: Modal editar nombre ── */}
      <Modal visible={showEditNameModal} transparent animationType="slide" onRequestClose={()=>setShowEditNameModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{width:'88%',padding:20,alignItems:'stretch'}]}>
            <Text style={[s.modalTitle,{marginBottom:14}]}>Editar nombre</Text>
            <TextInput
              style={s.createInput}
              value={editNameValue}
              onChangeText={setEditNameValue}
              placeholder="Nombre de la rutina"
              placeholderTextColor={colors.gray}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveRoutineName}
            />
            <View style={{flexDirection:'row',gap:10,marginTop:14}}>
              <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purpleDim}]} onPress={()=>setShowEditNameModal(false)} disabled={editNameSaving}>
                <Text style={[s.createBtnTxt,{color:colors.grayLight}]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purple},editNameSaving&&{opacity:0.65}]} onPress={saveRoutineName} disabled={editNameSaving}>
                {editNameSaving?<ActivityIndicator color="#fff" size="small"/>:<Text style={[s.createBtnTxt,{color:'#fff'}]}>Guardar</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── T3: Modal selección de rutina ── */}
      <Modal visible={showRoutineModal} transparent animationType="slide" onRequestClose={()=>setShowRoutineModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{width:'92%',padding:20,alignItems:'stretch',maxHeight:'88%'}]}>
            {!showHistoryView&&!historyDetailLog&&(
              <>
                <Text style={[s.modalTitle,{marginBottom:4}]} numberOfLines={2}>{routineModalTarget?.name||routineModalTarget?.day}</Text>
                <Text style={[s.modalPhrase,{fontStyle:'italic',marginBottom:18}]}>
                  "{getPanchitaRoutinePhrase(routineModalDaysSince)}"
                </Text>
                <TouchableOpacity style={[s.createBtn,{backgroundColor:colors.purple,marginBottom:10}]} onPress={startNewSession}>
                  <View style={s.inlineIconRow}><IconBolt size={16} color={colors.accentText||'#fff'} /><Text style={[s.createBtnTxt,{color:colors.accentText||'#fff',fontSize:16}]}>Nueva sesión</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={[s.createBtn,{backgroundColor:colors.bgInput,borderWidth:1,borderColor:colors.purple,marginBottom:10}]} onPress={()=>openPastSessionModal(routineModalTarget)}>
                  <View style={s.inlineIconRow}><IconCalendar size={16} color={colors.purpleLight} /><Text style={[s.createBtnTxt,{color:colors.purpleLight}]}>Registrar sesión pasada</Text></View>
                </TouchableOpacity>
                <TouchableOpacity style={[s.createBtn,{backgroundColor:colors.bgInput,borderWidth:1,borderColor:colors.purpleDim,marginBottom:6}]} onPress={()=>setShowHistoryView(true)}>
                  <View style={s.inlineIconRow}><IconHistory size={16} color={colors.grayLight} /><Text style={[s.createBtnTxt,{color:colors.grayLight}]}>Ver historial</Text></View>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setShowRoutineModal(false)} style={{alignItems:'center',paddingVertical:10}}>
                  <Text style={{color:colors.gray,fontSize:13}}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
            {showHistoryView&&!historyDetailLog&&(
              <>
                <TouchableOpacity onPress={()=>setShowHistoryView(false)} style={{marginBottom:10}}>
                  <View style={s.backLinkRow}><IconBack size={15} color={colors.purple} /><Text style={{color:colors.purple,fontSize:14}}>Volver</Text></View>
                </TouchableOpacity>
                <Text style={[s.modalTitle,{marginBottom:12,textAlign:'left'}]}>Historial</Text>
                {historyLogs.length===0?(
                  <Text style={{color:colors.gray,textAlign:'center',paddingVertical:24}}>
                    Sin sesiones completadas aún.
                  </Text>
                ):(
                  <ScrollView style={{maxHeight:340}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {historyLogs.map((hl,i)=>(
                      <TouchableOpacity key={i} style={[s.recExList,{marginBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}]} onPress={()=>openSessionDetailView(hl)}>
                        <View style={{flex:1}}>
                          <Text style={{color:colors.white,fontWeight:'700',fontSize:14}}>{formatLogDate(hl.date)}</Text>
                          <Text style={{color:colors.gray,fontSize:12,marginTop:2}}>
                            {(hl.exercises||[]).length} ejercicios · {(hl.exercises||[]).reduce((n,ex)=>n+(ex.sets||[]).filter(st=>st.done).length,0)} sets completados
                          </Text>
                        </View>
                        <IconArrow size={18} color={colors.purple} />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
                <TouchableOpacity onPress={()=>setShowRoutineModal(false)} style={{alignItems:'center',paddingTop:12}}>
                  <Text style={{color:colors.gray,fontSize:13}}>Cerrar</Text>
                </TouchableOpacity>
              </>
            )}
            {historyDetailLog&&(
              <>
                <TouchableOpacity onPress={()=>setHistoryDetailLog(null)} style={{marginBottom:10}}>
                  <View style={s.backLinkRow}><IconBack size={15} color={colors.purple} /><Text style={{color:colors.purple,fontSize:14}}>Volver al historial</Text></View>
                </TouchableOpacity>
                <Text style={[s.modalTitle,{marginBottom:4,textAlign:'left'}]}>{formatLogDate(historyDetailLog.date)}</Text>
                <Text style={{color:colors.gray,fontSize:12,marginBottom:12}}>
                  Volumen total: {Math.round(calcLogVolume(historyDetailLog)).toLocaleString()} kg·rep
                </Text>
                <ScrollView style={{maxHeight:300}} showsVerticalScrollIndicator={false}>
                  {(historyDetailLog.exercises||[]).map((ex,i)=>(
                    <View key={i} style={[s.recExList,{marginBottom:8}]}>
                      <Text style={{color:colors.purpleLight,fontWeight:'700',marginBottom:4}}>{ex.name}</Text>
                      {(ex.sets||[]).map((st,si)=>(
                        <Text key={si} style={s.recExItem}>
                          Set {si+1}: {st.reps||'—'} reps × {st.weight||'—'} {ex.unit||'kg'}{st.done?' completado':''}
                        </Text>
                      ))}
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity style={[s.createBtn,{backgroundColor:colors.purple,marginTop:12}]} onPress={startNewSession}>
                  <View style={s.inlineIconRow}><IconBolt size={16} color={colors.accentText||'#fff'} /><Text style={[s.createBtnTxt,{color:colors.accentText||'#fff'}]}>Nueva sesión con esta rutina</Text></View>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Registrar sesión pasada ── */}
      <Modal visible={showPastDateModal} transparent animationType="slide" onRequestClose={()=>setShowPastDateModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{width:'92%',padding:20,alignItems:'stretch'}]}>
            <Panchita state="thinking" size={82} autoWave={false} />
            <Text style={[s.modalTitle,{marginBottom:4}]}>Registrar sesión pasada</Text>
            <Text style={[s.modalPhrase,{marginBottom:10}]}>
              {pastRoutineTarget?.name || pastRoutineTarget?.day || 'Rutina'}
            </Text>
            <Text style={s.pastDatePreview}>{formatDateDisplay(selectedPastIso())}</Text>

            <View style={s.pastWheelRow}>
              <View style={s.pastWheelCol}>
                <Text style={s.pastWheelLabel}>Día</Text>
                <WheelPicker items={pastDays} selectedIndex={pastSafeDayIdx} onSelect={setPastDayIdx} width={58} colors={colors} />
              </View>
              <View style={s.pastWheelCol}>
                <Text style={s.pastWheelLabel}>Mes</Text>
                <WheelPicker items={Array.from({length:12},(_,i)=>i+1)} selectedIndex={pastMonthIdx} onSelect={setPastMonthIdx} width={58} colors={colors} />
              </View>
              <View style={s.pastWheelCol}>
                <Text style={s.pastWheelLabel}>Año</Text>
                <WheelPicker items={pastYears} selectedIndex={pastYearIdx} onSelect={setPastYearIdx} width={76} colors={colors} />
              </View>
            </View>

            {selectedPastIso() > TODAY && (
              <View style={s.pastWarning}>
                <IconWarning size={15} color={colors.danger} />
                <Text style={s.pastWarningTxt}>No se puede elegir una fecha futura.</Text>
              </View>
            )}

            <View style={{flexDirection:'row',gap:10,marginTop:16}}>
              <TouchableOpacity style={[s.createBtn,{flex:1,backgroundColor:colors.purpleDim}]} onPress={()=>setShowPastDateModal(false)}>
                <Text style={[s.createBtnTxt,{color:colors.grayLight}]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.createBtn,{flex:1,backgroundColor:colors.purple},selectedPastIso()>TODAY&&{opacity:0.5}]}
                onPress={startPastSession}
                disabled={selectedPastIso()>TODAY}
              >
                <View style={s.inlineIconRow}><IconCalendar size={15} color={colors.accentText||'#fff'} /><Text style={[s.createBtnTxt,{color:colors.accentText||'#fff'}]}>Abrir sesión</Text></View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header — T2: "Mis rutinas" fijo + "+ Nueva rutina" */}
      <View style={s.modeHeader}>
        <View style={s.modeTabs}>
          <View style={[s.modeTab, s.modeTabActive]}>
            <Text style={[s.modeTabText, s.modeTabTextActive]}>Mis rutinas</Text>
          </View>
          <TouchableOpacity style={s.modeTab} onPress={openCreateModal} activeOpacity={0.7}>
            <Text style={[s.modeTabText, s.modeTabNewText]}>+ Nueva rutina</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.recommendBtn} onPress={openRecommendation} hitSlop={{top:8,bottom:8,left:8,right:8}}>
          <IconStar size={20} color={colors.lime} />
        </TouchableOpacity>
      </View>

      {/* Nombre rutina activa + estado */}
      <View style={s.activeBar}>
        {selectedWorkout&&log ? (
          <Text style={s.activeName} numberOfLines={1} ellipsizeMode="tail">
            {selectedWorkout.name||selectedWorkout.day}
          </Text>
        ) : (
          <Text style={s.activeName} numberOfLines={1}>{syncing ? 'Cargando...' : 'Seleccioná una rutina'}</Text>
        )}
        {syncing&&<Text style={s.syncHint}>↻ Sincronizando</Text>}
        {!syncing&&usingLocalData&&<Text style={s.localDataHint}>Local</Text>}
        {!syncing&&!usingLocalData&&autoSaveState==='saving'&&<Text style={s.autoSaveHint}>Guardando...</Text>}
        {!syncing&&!usingLocalData&&autoSaveState==='saved'&&<View style={s.statusPill}><IconCheck size={12} color={colors.lime} /><Text style={s.autoSaveHint}>Guardado</Text></View>}
        {!syncing&&autoSaveState==='error'&&<View style={s.statusPill}><IconWarning size={12} color="#ef4444" /><Text style={[s.autoSaveHint,{color:'#ef4444'}]}>Error</Text></View>}
      </View>

      {deletingRoutineId && (
        <View style={s.deletingBanner}>
          <ActivityIndicator size="small" color={colors.purpleLight} />
          <Text style={s.deletingText}>Eliminando {deletingRoutineName}...</Text>
        </View>
      )}

      {activeDraft?.log && (
        <TouchableOpacity style={s.resumeCard} onPress={continueActiveDraft} activeOpacity={0.8}>
          <View style={{ flex: 1 }}>
            <Text style={s.resumeTitle}>Sesión reciente guardada</Text>
            <Text style={s.resumeMeta} numberOfLines={1}>
              {(activeDraft.log.workoutName || activeDraft.workoutName || 'Rutina')} · {formatDateDisplay(activeDraft.log.date || activeDraft.date)}
            </Text>
          </View>
          <View style={s.resumeBtn}>
            <Text style={s.resumeBtnTxt}>Continuar</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* T1 — Lista vertical de rutinas */}
      {initialLoading ? (
        <View style={s.routineListWrap}>
          {[0,1,2].map(i=>(
            <View key={i} style={s.routineRowSkeleton}>
              <View style={{flex:1,gap:6}}>
                <SkeletonRect colors={colors} width="58%" height={14}/>
                <SkeletonRect colors={colors} width="38%" height={11}/>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={s.routineListWrap}>
          <ScrollView style={{maxHeight:200}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
            {currentList.map(w=>{
              const isSelected = selectedWorkout?.id===w.id;
              const exCount = normalizeExercises(w.exercises).length;
              const lastUsed = lastUsedMap[w.id];
              return (
                <TouchableOpacity key={w.id} style={[s.routineRow, isSelected&&s.routineRowActive]} onPress={()=>openRoutineModal(w)} activeOpacity={0.75}>
                  <View style={{flex:1,gap:2}}>
                    <Text style={[s.routineRowName, isSelected&&s.routineRowNameActive]} numberOfLines={1}>
                      {w.name||w.day}
                    </Text>
                    <Text style={s.routineRowMeta}>
                      {exCount} ejercicio{exCount!==1?'s':''}{lastUsed?` · ${formatLogDate(lastUsed)}`:''}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={()=>openChipMenu(w)} style={s.routineRowMenu} activeOpacity={0.6}>
                    <IconMenuDots size={20} color={isSelected ? 'rgba(255,255,255,0.75)' : colors.gray} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
            {currentList.length===0&&(
              <Text style={{color:colors.gray,padding:16,fontSize:13}}>Sin rutinas aún — tocá "+ Nueva rutina"</Text>
            )}
          </ScrollView>
          <TouchableOpacity style={s.importRowBtn} onPress={openImportModal} activeOpacity={0.7}>
            <View style={s.inlineIconRow}><IconDownload size={16} color={colors.purpleLight} /><Text style={s.importRowBtnTxt}>Importar código de rutina</Text></View>
          </TouchableOpacity>
        </View>
      )}

      {/* Lista de ejercicios */}
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {/* T4: Skeleton mientras carga */}
        {initialLoading&&(
          <View>
            {[0,1,2].map(i=>(
              <View key={i} style={[s.exCard,{marginBottom:14}]}>
                <SkeletonRect colors={colors} width="55%" height={18} style={{marginBottom:14}}/>
                <SkeletonRect colors={colors} width="100%" height={52} style={{marginBottom:10}}/>
                <SkeletonRect colors={colors} width="100%" height={52}/>
              </View>
            ))}
          </View>
        )}

        {!initialLoading&&!log&&(
          <View style={s.emptyState}>
            <Panchita state="idle" size={90}/>
            <Text style={s.emptyTitle}>Creá tu primera rutina</Text>
            <Text style={s.emptyText}>Tocá "+ Nueva rutina" para agregar ejercicios personalizados.</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={openCreateModal}>
              <Text style={s.emptyBtnText}>+ Crear rutina</Text>
            </TouchableOpacity>
          </View>
        )}

        {log&&completed&&(
          <View style={s.completedBanner}>
            <View style={s.inlineIconRow}><IconCheck size={15} color={colors.lime} /><Text style={s.completedText}>Sesión completada hoy</Text></View>
          </View>
        )}

        {/* Estado vacío — todos los ejercicios eliminados */}
        {log&&(log.exercises||[]).length===0&&(
          <View style={s.emptyExState}>
            <Text style={s.emptyExTitle}>Sin ejercicios</Text>
            <Text style={s.emptyExText}>Eliminaste todos los ejercicios de esta sesión.</Text>
            <TouchableOpacity style={s.emptyExBtn} onPress={()=>selectWorkout(selectedWorkout)}>
              <Text style={s.emptyExBtnText}>Recargar rutina</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Tarjetas de ejercicios */}
        {(log?.exercises||[]).map((ex, exIdx)=>(
          <View key={exIdx} style={s.exCard}>
            {/* Header: nombre + toggle unidad + ↑↓ + ✕ */}
            <View style={s.exHeader}>
              <Text style={[s.exName,{flex:1,marginBottom:0}]}>{ex.name || `Ejercicio ${exIdx+1}`}</Text>
              <View style={s.exUnitToggle}>
                {['kg','lb'].map(u=>(
                  <TouchableOpacity
                    key={u}
                    style={[s.exUnitBtn,(ex.unit||weightUnit)===u&&s.exUnitBtnActive]}
                    onPress={()=>setExUnit(exIdx,u)}
                  >
                    <Text style={[s.exUnitTxt,(ex.unit||weightUnit)===u&&s.exUnitTxtActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {/* T5 — flechas para reordenar */}
              <TouchableOpacity
                style={s.exOrderBtn}
                onPress={()=>moveExercise(exIdx,-1)}
                activeOpacity={0.6}
                disabled={exIdx===0}
              >
                <IconArrowUp size={15} color={exIdx===0 ? colors.gray : colors.purpleLight} />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.exOrderBtn}
                onPress={()=>moveExercise(exIdx,1)}
                activeOpacity={0.6}
                disabled={exIdx===(log?.exercises?.length-1)}
              >
                <IconArrowDown size={15} color={exIdx===(log?.exercises?.length-1) ? colors.gray : colors.purpleLight} />
              </TouchableOpacity>
              {/* Botón ✕ — 44×44, usa ConfirmModal */}
              <TouchableOpacity
                style={s.exRemoveBtn}
                activeOpacity={0.7}
                onPress={()=>showConfirm({
                  title: '¿Eliminar ejercicio?',
                  message: `Se eliminará "${ex.name || `Ejercicio ${exIdx+1}`}" de esta sesión.`,
                  confirmText: 'Eliminar',
                  confirmDestructive: true,
                  onConfirm: () => { hideConfirm(); removeExercise(exIdx); },
                })}
              >
                <IconClose size={16} color={colors.danger} />
              </TouchableOpacity>
            </View>

            {/* Sets — tarjeta vertical por set */}
            {(ex.sets||[]).map((st, setIdx)=>{
              const prevReps   = getLastValue(ex.name, setIdx, 'reps');
              const prevWeight = getLastValue(ex.name, setIdx, 'weight');
              const hasPrev    = prevReps || prevWeight;
              const isDone     = !!st.done;
              const isOnly     = ex.sets.length === 1;

              return (
                <View key={setIdx} style={[s.setCard, isDone && s.setCardDone]}>
                  {/* ── Header: Set N + botones ── */}
                  <View style={s.setCardHeader}>
                    {/* Botón done — 44px mínimo, sin hitSlop */}
                    <TouchableOpacity
                      style={s.setDoneArea}
                      onPress={()=>toggleSetDone(exIdx,setIdx)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.setCircle, isDone&&s.setCircleDone]}>
                        {isDone ? <IconCheck size={14} color="#fff" /> : <Text style={s.setCircleTxt}>{setIdx+1}</Text>}
                      </View>
                      <Text style={[s.setLabel, isDone&&s.setLabelDone]}>
                        {isDone ? 'Completado' : `Set ${setIdx+1}`}
                      </Text>
                    </TouchableOpacity>

                    {/* Botón eliminar set / limpiar — sin hitSlop */}
                    <TouchableOpacity
                      style={[s.setDelBtn, isOnly&&s.setDelBtnSoft]}
                      onPress={()=>removeSet(exIdx,setIdx)}
                      activeOpacity={0.7}
                    >
                      {isOnly ? (
                        <Text style={[s.setDelTxt, s.setDelTxtSoft]}>limpiar</Text>
                      ) : (
                        <IconClose size={14} color={colors.grayLight} />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* ── Inputs: REPS + KG/LB con dato anterior bajo cada uno ── */}
                  <View style={s.setInputRow}>
                    <View style={s.setInputGroup}>
                      <Text style={s.setInputLabel}>REPS</Text>
                      <TextInput
                        style={[s.setInput, isDone&&s.setInputDone]}
                        value={String(st.reps||'')}
                        onChangeText={v=>updateSet(exIdx,setIdx,'reps',v)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.gray}
                        editable={!isDone}
                        selectTextOnFocus
                        returnKeyType="next"
                      />
                      {!isDone&&<Text style={s.setAntLabel}>ant: {prevReps||'—'}</Text>}
                    </View>
                    <View style={s.setInputGroup}>
                      <Text style={s.setInputLabel}>{(ex.unit||weightUnit).toUpperCase()}</Text>
                      <TextInput
                        style={[s.setInput, isDone&&s.setInputDone]}
                        value={String(st.weight||'')}
                        onChangeText={v=>updateSet(exIdx,setIdx,'weight',v)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.gray}
                        editable={!isDone}
                        selectTextOnFocus
                        returnKeyType="done"
                      />
                      {!isDone&&<Text style={s.setAntLabel}>ant: {prevWeight?`${prevWeight}${getLastExUnit(ex.name)||ex.unit||weightUnit}`:'—'}</Text>}
                    </View>
                  </View>
                </View>
              );
            })}

            {/* Acciones del ejercicio — solo "+ Set", ✕ está en el header */}
            <View style={s.exFooter}>
              <TouchableOpacity style={s.addSetBtn} onPress={()=>addSet(exIdx)}>
                <Text style={s.addSetTxt}>+ Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Botón agregar ejercicio a sesión activa */}
        {log&&(
          <TouchableOpacity style={s.addExToSessionBtn} onPress={()=>setShowAddExModal(true)} activeOpacity={0.7}>
            <Text style={s.addExToSessionTxt}>+ Agregar ejercicio</Text>
          </TouchableOpacity>
        )}

        {/* Botones de acción */}
        {log&&(
          <View style={s.actions}>
            <TouchableOpacity style={s.saveBtn} onPress={saveProgress} disabled={saving}>
              {saving?<ActivityIndicator size="small" color={colors.purpleLight}/>:<Text style={s.saveBtnText}>Guardar progreso</Text>}
            </TouchableOpacity>
            {!completed&&(
              <TouchableOpacity style={s.finishBtn} onPress={finishWorkout} disabled={saving}>
                <Text style={s.finishBtnText}>Terminar entrenamiento</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Modal agregar ejercicio a sesión activa ── */}
      <Modal visible={showAddExModal} transparent animationType="slide" onRequestClose={()=>{ setShowAddExModal(false); setAddExSearch(''); }}>
        <View style={s.bsOverlay}>
          <TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={()=>{ setShowAddExModal(false); setAddExSearch(''); }}/>
          <View style={[s.bottomSheet,{paddingHorizontal:0,paddingTop:16,paddingBottom:32}]}>
            <View style={s.bottomSheetHandle}/>
            <Text style={[s.bottomSheetTitle,{marginBottom:12}]}>Agregar ejercicio</Text>
            {/* Buscador */}
            <View style={{paddingHorizontal:16,marginBottom:12}}>
              <TextInput
                style={[s.createInput]}
                placeholder="Buscar o escribir nombre libre..."
                placeholderTextColor={colors.gray}
                value={addExSearch}
                onChangeText={setAddExSearch}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={()=>addExExSearch&&addExerciseToSession(addExSearch)}
              />
            </View>
            {/* Lista filtrada */}
            <ScrollView style={{maxHeight:320}} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* Opción libre si no coincide exactamente con ninguna */}
              {addExSearch.trim().length>1&&!Object.values(MUSCLE_EXERCISES).flat().some(e=>e.toLowerCase()===addExSearch.trim().toLowerCase())&&(
                <TouchableOpacity style={[s.bsOption,{borderBottomWidth:1,borderBottomColor:colors.purpleDim}]} onPress={()=>addExerciseToSession(addExSearch)}>
                  <Text style={[s.bsOptionTxt,{color:colors.purpleLight}]}>+ Agregar "{addExSearch.trim()}"</Text>
                </TouchableOpacity>
              )}
              {Object.entries(MUSCLE_EXERCISES).map(([group,exercises])=>{
                const filtered = exercises.filter(e=>!addExSearch.trim()||e.toLowerCase().includes(addExSearch.trim().toLowerCase()));
                if (filtered.length===0) return null;
                return (
                  <View key={group}>
                    <Text style={{fontSize:11,fontWeight:'700',color:colors.gray,textTransform:'uppercase',letterSpacing:1,paddingHorizontal:16,paddingTop:12,paddingBottom:4}}>
                      {MUSCLE_LABELS[group]}
                    </Text>
                    {filtered.map(ex=>(
                      <TouchableOpacity key={ex} style={s.bsOption} onPress={()=>addExerciseToSession(ex)}>
                        <Text style={s.bsOptionTxt}>{ex}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ConfirmModal — reemplaza Alert.alert globalmente en esta pantalla */}
      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={confirmModal.showCancel ? hideConfirm : null}
        confirmText={confirmModal.confirmText}
        confirmDestructive={confirmModal.confirmDestructive}
      />
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────
function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex:1, backgroundColor:colors.bg },

    // Popup autosave
    autosavePop: { position:'absolute', bottom:88, left:12, flexDirection:'row', alignItems:'center', gap:8, backgroundColor:colors.bgCard, borderRadius:RADIUS.lg, padding:10, borderWidth:1, borderColor:colors.purpleDim, zIndex:999, maxWidth:'72%', shadowColor:'#7c3aed', shadowOpacity:0.3, shadowRadius:6, elevation:8 },
    autosavePopText: { color:colors.white, fontSize:12, lineHeight:17, fontStyle:'italic', flex:1 },

    // Reacción flotante
    reaction: { position:'absolute', top:120, left:14, right:14, flexDirection:'row', alignItems:'center', gap:10, backgroundColor:colors.bgCard, borderRadius:RADIUS.lg, padding:12, borderWidth:1, borderColor:colors.purple, zIndex:99, shadowColor:'#7c3aed', shadowOpacity:0.4, shadowRadius:8, elevation:8 },
    reactionText: { color:colors.white, fontSize:13, fontStyle:'italic', lineHeight:18 },

    // Modo header — fila única
    modeHeader: { paddingHorizontal:14, paddingTop:10, paddingBottom:8, flexDirection:'row', alignItems:'center', gap:8 },
    modeTabs: { flex:1, flexDirection:'row', backgroundColor:colors.bgCard, borderRadius:RADIUS.full, padding:3 },
    modeTab: { flex:1, paddingVertical:7, borderRadius:RADIUS.full, alignItems:'center' },
    modeTabActive: { backgroundColor:colors.purple },
    modeTabText: { fontSize:13, color:colors.gray, fontWeight:'600' },
    modeTabTextActive: { color:'#fff' },
    recommendBtn: { width:40, height:40, borderRadius:20, backgroundColor:colors.purpleDim, alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:colors.purple },
    recommendBtnIcon: { fontSize:20 },
    inlineIconRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:7 },
    modalBtnRow: { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:7 },
    backLinkRow: { flexDirection:'row', alignItems:'center', gap:6 },

    // Barra activa
    activeBar: { paddingHorizontal:14, paddingVertical:8, backgroundColor:colors.bgCard, borderBottomWidth:1, borderBottomColor:colors.purpleDim, flexDirection:'row', alignItems:'center', justifyContent:'space-between', minHeight:40 },
    activeName: { fontSize:14, fontWeight:'700', color:colors.purpleLight, flex:1, marginRight:8 },
    syncHint: { fontSize:11, color:colors.purple, marginLeft:8 },
    autoSaveHint: { fontSize:11, color:colors.gray, marginLeft:8 },
    statusPill: { flexDirection:'row', alignItems:'center', gap:3, marginLeft:8 },
    deletingBanner: { flexDirection:'row', alignItems:'center', gap:8, paddingHorizontal:14, paddingVertical:9, backgroundColor:colors.bgInput, borderBottomWidth:1, borderBottomColor:colors.purpleDim },
    deletingText: { color:colors.grayLight, fontSize:12, fontWeight:'700', flex:1 },
    resumeCard: {
      marginHorizontal:12, marginTop:10, marginBottom:8, padding:12,
      backgroundColor:colors.bgInput, borderRadius:RADIUS.lg,
      borderWidth:1.5, borderColor:colors.purple,
      flexDirection:'row', alignItems:'center', gap:12,
      shadowColor:'#7c3aed', shadowOpacity:0.18, shadowRadius:8, elevation:4,
    },
    resumeTitle: { color:colors.white, fontSize:14, fontWeight:'900' },
    resumeMeta: { color:colors.grayLight, fontSize:12, marginTop:3, fontWeight:'600' },
    resumeBtn: { backgroundColor:colors.purple, borderRadius:RADIUS.full, paddingVertical:9, paddingHorizontal:14 },
    resumeBtnTxt: { color:colors.accentText||'#fff', fontSize:12, fontWeight:'900' },

    // Selector rutinas
    dayScroll: { paddingHorizontal:14, paddingVertical:8, maxHeight:52 },
    dayChip: { paddingHorizontal:14, paddingVertical:7, borderRadius:RADIUS.full, backgroundColor:colors.bgCard, marginRight:8, borderWidth:1, borderColor:colors.purpleDim },
    dayChipActive: { backgroundColor:colors.purple, borderColor:colors.purple },
    dayChipText: { fontSize:13, color:colors.gray, fontWeight:'500' },
    dayChipTextActive: { color:'#fff' },
    addRoutineBtns: { flexDirection:'row', alignItems:'center', gap:6, marginRight:10 },
    addRoutineBtn: { width:34, height:34, borderRadius:17, backgroundColor:colors.purple, alignItems:'center', justifyContent:'center' },
    addRoutineTxt: { color:'#fff', fontSize:22, fontWeight:'300', lineHeight:28 },
    addRoutineImportTxt: { color:'#fff', fontSize:16, fontWeight:'700', lineHeight:22 },

    // ── Modales de compartir / importar ──
    shareSubtitle: { fontSize:14, color:colors.grayLight, marginTop:2, marginBottom:16, textAlign:'center' },
    shareCodeBox: { backgroundColor:colors.bgInput, borderRadius:RADIUS.md, paddingVertical:14, paddingHorizontal:14, alignItems:'center', justifyContent:'center', marginBottom:10, borderWidth:2, borderColor:colors.purple, width:'100%', overflow:'hidden' },
    shareCodeText: { width:'100%', fontSize:14, lineHeight:18, fontWeight:'900', color:colors.purpleLight, letterSpacing:0.2, textAlign:'center' },
    shareCodeHint: { fontSize:12, color:colors.gray, marginTop:6 },
    sharePanchitaPhrase: { fontSize:13, color:colors.gray, fontStyle:'italic', textAlign:'center', paddingHorizontal:16, marginBottom:8 },
    shareExpiry: { fontSize:12, color:colors.gray, textAlign:'center', marginBottom:16 },
    longPressHint: { fontSize:10, color:colors.gray, textAlign:'center', marginBottom:2 },

    // Scroll
    scroll: { padding:12, paddingBottom:80 },

    // Empty state
    emptyState: { alignItems:'center', paddingTop:60, paddingHorizontal:24 },
    emptyTitle: { fontSize:18, fontWeight:'700', color:colors.white, marginBottom:8, textAlign:'center' },
    emptyText:  { fontSize:14, color:colors.gray, textAlign:'center', lineHeight:20, marginBottom:20 },
    emptyBtn:   { backgroundColor:colors.purple, borderRadius:RADIUS.full, paddingVertical:14, paddingHorizontal:32 },
    emptyBtnText:{ color:'#fff', fontWeight:'700', fontSize:15 },

    // Completado
    completedBanner: { backgroundColor:colors.purpleDim, borderRadius:RADIUS.md, padding:10, marginBottom:12, alignItems:'center', borderWidth:1, borderColor:colors.purple },
    completedText:   { color:colors.purpleLight, fontWeight:'600', fontSize:14 },

    // Tarjeta ejercicio
    exCard: { backgroundColor:colors.bgCard, borderRadius:RADIUS.lg, padding:14, marginBottom:14 },

    // Header: nombre + toggle de unidad
    exHeader: { flexDirection:'row', alignItems:'center', marginBottom:12, gap:8 },
    exName: { fontSize:17, fontWeight:'800', color:colors.white, letterSpacing:0.1 },

    // Toggle kg/lb por ejercicio
    exUnitToggle: {
      flexDirection:'row', backgroundColor:colors.bgInput,
      borderRadius:RADIUS.full, padding:2,
      borderWidth:1, borderColor:colors.purpleDim, flexShrink:0,
    },
    exUnitBtn:       { paddingHorizontal:8, paddingVertical:4, borderRadius:RADIUS.full, minWidth:30, alignItems:'center' },
    exUnitBtnActive: { backgroundColor:colors.purple },
    exUnitTxt:       { fontSize:11, fontWeight:'700', color:colors.gray },
    exUnitTxtActive: { color:colors.accentText||'#fff' },

    // ── Tarjeta de set (layout vertical) ──
    setCard: {
      backgroundColor:colors.bgInput, borderRadius:RADIUS.md,
      padding:12, marginBottom:10,
      borderWidth:1, borderColor:colors.purpleDim,
    },
    setCardDone: { borderColor:colors.purple, opacity:0.72 },

    // Header de la tarjeta de set
    setCardHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10, minHeight:44 },
    setDoneArea: { flexDirection:'row', alignItems:'center', gap:8, flex:1, minHeight:44 },
    setCircle: {
      width:28, height:28, borderRadius:14,
      borderWidth:2, borderColor:colors.purpleDim,
      alignItems:'center', justifyContent:'center',
    },
    setCircleDone: { backgroundColor:colors.purple, borderColor:colors.purple },
    setCircleTxt: { fontSize:12, fontWeight:'800', color:colors.gray },
    setCircleTxtDone: { color:'#fff' },
    setLabel: { fontSize:14, fontWeight:'600', color:colors.grayLight },
    setLabelDone: { color:colors.purpleLight },

    // Botón eliminar set — minHeight:44 en vez de hitSlop
    setDelBtn: { paddingHorizontal:12, paddingVertical:10, borderRadius:RADIUS.full, backgroundColor:colors.bgCard, borderWidth:1, borderColor:colors.purpleDim, minWidth:44, minHeight:44, alignItems:'center', justifyContent:'center' },
    setDelBtnSoft: { borderColor:'transparent', backgroundColor:'transparent' },
    setDelTxt: { fontSize:18, fontWeight:'700', color:colors.gray },
    setDelTxtSoft: { fontSize:12, color:colors.gray },

    // Inputs de set — dos columnas 45/45
    setInputRow: { flexDirection:'row', gap:10 },
    setInputGroup: { flex:1, gap:5 },
    setInputLabel: { fontSize:10, fontWeight:'700', color:colors.gray, textTransform:'uppercase', letterSpacing:1 },
    setInput: {
      height:52, backgroundColor:colors.bg,
      borderRadius:RADIUS.sm, borderWidth:1.5, borderColor:colors.purpleDim,
      fontSize:22, fontWeight:'700', color:colors.white, textAlign:'center',
    },
    setInputDone: { opacity:0.35, borderColor:'transparent' },

    // Dato anterior
    setPrevText: { fontSize:12, color:colors.gray, marginTop:8, fontStyle:'italic' },

    // Footer ejercicio
    exFooter: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:8, paddingTop:10, borderTopWidth:1, borderTopColor:colors.purpleDim },
    addSetBtn: { paddingVertical:10, paddingHorizontal:12, minHeight:44, justifyContent:'center' },
    addSetTxt: { color:colors.purpleLight, fontSize:15, fontWeight:'700' },
    removeExBtn: { paddingVertical:10, paddingHorizontal:12, minHeight:44, justifyContent:'center', borderRadius:RADIUS.sm, backgroundColor:colors.bgInput },
    removeExTxt: { color:'#ef4444', fontSize:13, fontWeight:'600' },

    // Estado vacío de ejercicios
    emptyExState: { alignItems:'center', paddingVertical:36, paddingHorizontal:24 },
    emptyExTitle: { fontSize:17, fontWeight:'700', color:colors.white, marginBottom:6 },
    emptyExText:  { fontSize:14, color:colors.gray, textAlign:'center', marginBottom:20, lineHeight:20 },
    emptyExBtn:   { backgroundColor:colors.purple, borderRadius:RADIUS.full, paddingVertical:12, paddingHorizontal:28 },
    emptyExBtnText:{ color:'#fff', fontWeight:'700', fontSize:15 },

    // Acciones principales
    actions: { gap:12, marginTop:8 },
    saveBtn: { borderWidth:1.5, borderColor:colors.purple, borderRadius:RADIUS.full, paddingVertical:16, alignItems:'center', minHeight:52, justifyContent:'center' },
    saveBtnText: { color:colors.purpleLight, fontWeight:'700', fontSize:15 },
    finishBtn: { backgroundColor:colors.purple, borderRadius:RADIUS.full, paddingVertical:16, alignItems:'center', minHeight:52, justifyContent:'center' },
    finishBtnText: { color:'#fff', fontWeight:'700', fontSize:16 },

    // Modals
    modalOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.78)', alignItems:'center', justifyContent:'center' },
    modalCard: { backgroundColor:colors.bgCard, borderRadius:RADIUS.xl, padding:28, alignItems:'center', gap:14, marginHorizontal:20, borderWidth:1, borderColor:colors.purple, shadowColor:'#7c3aed', shadowOpacity:0.5, shadowRadius:20, elevation:12 },
    modalTitle: { fontSize:20, fontWeight:'700', color:colors.white, textAlign:'center' },
    modalPhrase: { fontSize:14, color:colors.grayLight, textAlign:'center', lineHeight:20 },
    modalBtn: { backgroundColor:colors.purple, borderRadius:RADIUS.full, paddingVertical:13, paddingHorizontal:28, alignSelf:'stretch', alignItems:'center' },
    modalBtnText: { color:'#fff', fontWeight:'700', fontSize:15 },

    recBadge: { backgroundColor:colors.purple, borderRadius:RADIUS.full, paddingVertical:5, paddingHorizontal:16 },
    recBadgeText: { color:'#fff', fontWeight:'800', fontSize:12, letterSpacing:1 },
    recExList: { alignSelf:'stretch', backgroundColor:colors.bgInput, borderRadius:RADIUS.md, padding:12 },
    recExItem: { fontSize:13, color:colors.white, lineHeight:22 },
    pastDatePreview: { alignSelf:'center', backgroundColor:colors.bgInput, borderRadius:RADIUS.full, borderWidth:1, borderColor:colors.purpleDim, paddingHorizontal:16, paddingVertical:8, color:colors.white, fontSize:18, fontWeight:'900', marginBottom:14 },
    pastWheelRow: { flexDirection:'row', justifyContent:'center', gap:12, marginTop:2 },
    pastWheelCol: { alignItems:'center', gap:7 },
    pastWheelLabel: { fontSize:11, fontWeight:'800', color:colors.gray, textTransform:'uppercase', letterSpacing:1 },
    pastWarning: { marginTop:12, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6 },
    pastWarningTxt: { color:colors.danger, fontSize:12, fontWeight:'700' },

    // Crear / editar rutina
    createLabel: { fontSize:13, fontWeight:'700', color:colors.grayLight, alignSelf:'flex-start' },
    createInput: { backgroundColor:colors.bgInput, borderRadius:RADIUS.md, padding:12, fontSize:14, color:colors.white, borderWidth:1, borderColor:colors.purpleDim, alignSelf:'stretch' },
    createExRow: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
    createRemoveBtn: { width:30, height:30, borderRadius:15, backgroundColor:colors.purpleDim, alignItems:'center', justifyContent:'center' },
    createRemoveTxt: { color:colors.gray, fontSize:12 },
    addExBtn: { paddingVertical:10, alignItems:'center' },
    addExTxt: { color:colors.purpleLight, fontWeight:'600', fontSize:13 },
    createBtn: { borderRadius:RADIUS.full, paddingVertical:13, alignItems:'center', minHeight:46, justifyContent:'center' },
    createBtnTxt: { fontWeight:'700', fontSize:15 },
    createError: { color:colors.danger||'#ef4444', fontSize:13, lineHeight:18, textAlign:'center', marginTop:8 },

    recurringRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', alignSelf:'stretch', backgroundColor:colors.bgInput, borderRadius:RADIUS.md, padding:12, borderWidth:1, borderColor:colors.purpleDim },
    recurringRowOn: { borderColor:colors.purple, backgroundColor:colors.purpleDim },
    recurringLabel: { fontSize:14, color:colors.grayLight, fontWeight:'600' },
    recurringToggle: { backgroundColor:colors.bgCard, borderRadius:RADIUS.full, paddingHorizontal:12, paddingVertical:5, borderWidth:1, borderColor:colors.purpleDim },
    recurringToggleOn: { backgroundColor:colors.purple, borderColor:colors.purple },
    recurringToggleTxt: { fontSize:13, color:colors.gray, fontWeight:'700' },

    // T2 — nuevo tab
    modeTabNewText: { color:colors.purple, fontWeight:'700' },

    // T1 — chip con botón ⋯
    dayChipRow: { flexDirection:'row', alignItems:'center' },
    // 44×44 real — hitSlop NO funciona en React Native Web
    chipMenuBtn: { width:44, height:44, alignItems:'center', justifyContent:'center', marginLeft:2 },
    chipMenuTxt: { fontSize:18, color:colors.gray, fontWeight:'900', lineHeight:22 },

    // T1 — bottom sheet con flex-end (funciona en web y nativo)
    bsOverlay: { flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.72)' },
    bottomSheet: {
      backgroundColor:colors.bgCard,
      borderTopLeftRadius:RADIUS.xl, borderTopRightRadius:RADIUS.xl,
      paddingBottom:40, paddingTop:12,
      borderTopWidth:1, borderColor:colors.purpleDim,
    },
    bottomSheetHandle: { width:40, height:4, borderRadius:2, backgroundColor:colors.purpleDim, alignSelf:'center', marginBottom:14 },
    bottomSheetTitle: { fontSize:16, fontWeight:'700', color:colors.grayLight, paddingHorizontal:20, marginBottom:8 },
    bsOption: { paddingVertical:16, paddingHorizontal:20, minHeight:52 },
    bsOptionRow: { flexDirection:'row', alignItems:'center', gap:11 },
    bsOptionTxt: { fontSize:16, color:colors.white, fontWeight:'500' },

    // ✕ ejercicio — esquina superior derecha, 44×44 sin hitSlop
    exRemoveBtn: { width:44, height:44, alignItems:'center', justifyContent:'center', marginLeft:4 },
    exRemoveTxt: { fontSize:20, color:'#ef4444', fontWeight:'700', lineHeight:24 },

    // T4 — indicador datos locales
    localDataHint: { fontSize:11, color:colors.gray, marginLeft:8, opacity:0.8 },

    // Agregar ejercicio a sesión
    addExToSessionBtn: { borderWidth:1.5, borderColor:colors.purpleDim, borderRadius:RADIUS.full, paddingVertical:13, alignItems:'center', marginBottom:12, minHeight:48, justifyContent:'center', borderStyle:'dashed' },
    addExToSessionTxt: { color:colors.purpleLight, fontWeight:'700', fontSize:15 },

    // T1 — Lista vertical de rutinas
    routineListWrap: { borderBottomWidth:1, borderBottomColor:colors.purpleDim, backgroundColor:colors.bgCard },
    routineRowSkeleton: { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:1, borderBottomColor:colors.purpleDim },
    routineRow: { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:12, borderBottomWidth:1, borderBottomColor:colors.purpleDim },
    routineRowActive: { backgroundColor:colors.purpleDim },
    routineRowName: { fontSize:14, fontWeight:'700', color:colors.white },
    routineRowNameActive: { color:colors.purpleLight },
    routineRowMeta: { fontSize:11, color:colors.gray, marginTop:2 },
    routineRowMenu: { width:44, height:44, alignItems:'center', justifyContent:'center' },
    routineRowMenuTxt: { fontSize:20, color:colors.gray, fontWeight:'900' },
    importRowBtn: { paddingHorizontal:16, paddingVertical:11, borderTopWidth:0 },
    importRowBtnTxt: { fontSize:12, color:colors.purple, fontWeight:'600' },

    // T2 — ant: bajo cada input
    setAntLabel: { fontSize:11, color:'#666', marginTop:4, textAlign:'center' },

    // T4 — aviso compartir
    shareWarningText: { fontSize:12, color:colors.danger||'#ef4444', textAlign:'center', paddingHorizontal:8, marginBottom:8, lineHeight:17 },

    // T5 — flechas reordenar
    exOrderBtn: { width:28, height:32, alignItems:'center', justifyContent:'center' },
    exOrderTxt: { fontSize:18, color:colors.gray, fontWeight:'700', lineHeight:22 },
  });
}
