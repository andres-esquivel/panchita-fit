import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  TouchableOpacity, TextInput, Modal, Alert, Animated, Keyboard, ActivityIndicator,
  Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
import { useFocusEffect } from '@react-navigation/native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  getWorkouts, getLocalWorkouts, getLogs, saveLog,
  getCustomRoutines, getLocalCustomRoutines,
  saveCustomRoutine, deleteCustomRoutine,
  getRecentMuscleActivity, getWeightUnit,
  shareRoutine, importSharedRoutine,
} from '../storage';
import { IconShare } from '../components/icons';
import { Share } from 'react-native';
import Panchita from '../components/Panchita';

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

function calcLogVolume(log) {
  return (log.exercises||[]).reduce((total,ex)=>
    total+(ex.sets||[]).reduce((s,st)=>{
      const r=parseFloat(st.reps)||0, w=parseFloat(st.weight)||0;
      return s+r*w;
    },0)
  ,0);
}

// ─── Componente principal ──────────────────────────────────
export default function WorkoutScreen({ navigation }) {
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

  // ── T3: routine selection modal ───────────────────────
  const [showRoutineModal, setShowRoutineModal]       = useState(false);
  const [routineModalTarget, setRoutineModalTarget]   = useState(null);
  const [routineModalDaysSince, setRoutineModalDaysSince] = useState(null);
  const [showHistoryView, setShowHistoryView]         = useState(false);
  const [historyLogs, setHistoryLogs]                 = useState([]);
  const [historyDetailLog, setHistoryDetailLog]       = useState(null);

  // ── T4: loading + fallback ────────────────────────────
  const [initialLoading, setInitialLoading]   = useState(true);
  const [usingLocalData, setUsingLocalData]   = useState(false);

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

  const autoSaveTimerRef = useRef(null);
  const lastSavedLogRef  = useRef('');
  const selectedWorkoutRef = useRef(null); // para acceso en closures async

  useFocusEffect(useCallback(()=>{ loadAll(); },[mode]));

  useEffect(()=>()=>{ if(autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); },[]);

  // Cargar unidad de peso
  useEffect(()=>{
    getWeightUnit().then(u=>{ setWeightUnit(u); prevWeightUnitRef.current=u; });
  },[]);

  // Nota: la unidad global (weightUnit) solo es el default para ejercicios nuevos.
  // Cada ejercicio tiene su propia unidad (ex.unit). Ver T2.

  // Autosave
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
    },900);
  },[log, selectedWorkout?.id, completed]);

  async function loadAll() {
    // ── FASE 1: local inmediato < 200ms ─────────────────────
    setInitialLoading(true);
    setUsingLocalData(false);
    const [localBase, localCustom] = await Promise.all([
      getLocalWorkouts(),
      getLocalCustomRoutines(),
    ]);
    setBaseWorkouts(localBase);
    setCustomRoutines(localCustom);
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
      Alert.alert('Panchita dice:','No pude guardar. Intentá otra vez.');
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
      Alert.alert('Panchita dice:','No pude terminar la rutina. Intentá otra vez.');
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
    if (exercises.length===0) { Alert.alert('Error','Agregá al menos un ejercicio.'); return; }
    setEditingRoutineSaving(true);
    try {
      const updated = { ...editingRoutine, exercises };
      await saveCustomRoutine(updated);
      setCustomRoutines(prev=>prev.map(r=>r.id===updated.id?updated:r));
      setShowEditModal(false);
      if (selectedWorkout?.id===updated.id) await selectWorkout(updated);
    } catch(e) {
      Alert.alert('Error','No se pudo guardar. Revisá conexión.');
    } finally { setEditingRoutineSaving(false); }
  }

  // ─── Compartir rutina ─────────────────────────────────────
  async function openShareRoutine(routine) {
    setShareRoutineTarget(routine);
    setShareCode('');
    setCodeCopied(false);
    setSharingLoading(true);
    setShowShareModal(true);
    try {
      const code = await shareRoutine(routine);
      setShareCode(code);
    } catch(e) {
      setShowShareModal(false);
      Alert.alert('Error', 'No se pudo generar el código. Revisá tu conexión.');
    } finally {
      setSharingLoading(false);
    }
  }

  async function copyShareCode() {
    if (!shareCode) return;
    try {
      await Share.share({ message: `Mi rutina en PanchitaFit: ${shareCode}` });
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
    const clean = importCode.trim().toUpperCase();
    if (clean.length < 6) { setImportError('Ingresá los 6 caracteres del código.'); return; }
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
  function confirmRoutineAction(routine) {
    Alert.alert(routine.name||routine.day, '¿Qué querés hacer?', [
      { text:'Cancelar', style:'cancel' },
      { text:'Compartir 🔗', onPress:()=>openShareRoutine(routine) },
      { text:'Editar ejercicios', onPress:()=>openEditModal(routine) },
      { text:'Duplicar', onPress:()=>duplicateRoutine(routine) },
      { text:'Eliminar', style:'destructive', onPress:()=>doDeleteRoutine(routine) },
    ]);
  }

  async function duplicateRoutine(routine) {
    const newR = { ...routine, id:`custom_${Date.now()}`, name:`${routine.name||routine.day} (copia)`, day:`${routine.name||routine.day} (copia)`, createdAt:new Date().toISOString() };
    await saveCustomRoutine(newR);
    setCustomRoutines(prev=>[newR,...prev]);
  }

  async function doDeleteRoutine(routine) {
    await deleteCustomRoutine(routine.id);
    const updated = await getCustomRoutines();
    setCustomRoutines(updated);
    if (selectedWorkout?.id===routine.id) {
      setSelectedWorkout(null); setLog(null);
      if (updated.length>0) await selectWorkout(updated[0]);
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
      Alert.alert('Error','No se pudo guardar el nombre.');
    } finally { setEditNameSaving(false); }
  }

  // ─── T3: Routine selection modal ─────────────────────────
  async function openRoutineModal(routine) {
    setRoutineModalTarget(routine);
    setShowHistoryView(false);
    setHistoryDetailLog(null);
    setHistoryLogs([]);
    setRoutineModalDaysSince(null);
    setShowRoutineModal(true);
    // Cargar historial en background
    try {
      const logs = await getLogs();
      const routineLogs = logs
        .filter(l=>l.workoutId===routine.id && l.completed)
        .sort((a,b)=>b.date.localeCompare(a.date));
      setHistoryLogs(routineLogs.slice(0,10));
      if (routineLogs.length>0) {
        const lastDate = routineLogs[0].date;
        const today = new Date(); today.setHours(0,0,0,0);
        const last  = new Date(lastDate); last.setHours(0,0,0,0);
        setRoutineModalDaysSince(Math.round((today-last)/(1000*60*60*24)));
      }
    } catch { /* sin historial */ }
  }

  function startNewSession() {
    setShowRoutineModal(false);
    if (routineModalTarget) selectWorkout(routineModalTarget);
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
    const routine = { id:`rec_${recommendation.group}`, day:`${recommendation.label.charAt(0).toUpperCase()+recommendation.label.slice(1)} (Panchita)`, exercises:recommendation.exercises };
    setShowRecommend(false);
    setSelectedWorkout(routine);
    setLog({ date:TODAY, workoutId:routine.id, completed:false, exercises:routine.exercises.map(name=>({ name, unit:weightUnit, sets:[{ reps:'',weight:'' }] })) });
    setCompleted(false); setLastLog(null);
  }

  // T2: "Mis rutinas" siempre muestra rutinas personalizadas del usuario
  const currentList = useMemo(()=>
    [...customRoutines].sort((a,b)=>(b.isRecurring?1:0)-(a.isRecurring?1:0))
  ,[customRoutines]);

  // ─── Render ──────────────────────────────────────────────
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
              <Text style={s.recurringLabel}>{newRoutineRecurring?'📅':'🔁'} Repetir cada semana</Text>
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
                      <Text style={s.createRemoveTxt}>✕</Text>
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
                  <TextInput style={[s.createInput,{flex:1}]} placeholder={`Ejercicio ${i+1}`} placeholderTextColor={colors.gray} value={ex} onChangeText={v=>{ const a=[...editExercises]; a[i]=v; setEditExercises(a); }} returnKeyType="next" />
                  {editExercises.length>1&&(
                    <TouchableOpacity onPress={()=>setEditExercises(prev=>prev.filter((_,j)=>j!==i))} style={s.createRemoveBtn}>
                      <Text style={s.createRemoveTxt}>✕</Text>
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
              <TouchableOpacity style={s.modalBtn} onPress={useRecommendedRoutine}><Text style={s.modalBtnText}>Usar esta rutina →</Text></TouchableOpacity>
              <TouchableOpacity onPress={()=>setShowRecommend(false)} style={{marginTop:8}}><Text style={{color:colors.gray,fontSize:13,textAlign:'center'}}>No gracias</Text></TouchableOpacity>
            </>):null}
          </View>
        </View>
      </Modal>

      {/* Modal compartir rutina */}
      <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={()=>setShowShareModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{width:'88%'}]}>
            <Panchita state={sharingLoading?'idle':'happy'} size={90}/>
            <Text style={s.modalTitle}>Compartir rutina</Text>
            {sharingLoading?(
              <ActivityIndicator color={colors.purpleLight} size="large"/>
            ):shareCode?(
              <>
                <Text style={s.shareSubtitle}>{shareRoutineTarget?.name||shareRoutineTarget?.day}</Text>
                <TouchableOpacity style={s.shareCodeBox} onPress={copyShareCode} activeOpacity={0.7}>
                  <Text style={s.shareCodeText}>{shareCode}</Text>
                  <Text style={s.shareCodeHint}>{codeCopied?'✓ Compartido!':'Tap para compartir'}</Text>
                </TouchableOpacity>
                <Text style={s.sharePanchitaPhrase}>"Ahora todos van a saber que entrenás. O al menos que tenés una rutina."</Text>
                <Text style={s.shareExpiry}>Este código expira en 30 días.</Text>
                <TouchableOpacity style={s.modalBtn} onPress={copyShareCode}>
                  <Text style={s.modalBtnText}>{codeCopied?'✓ Compartido!':'📤 Compartir código'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setShowShareModal(false)} style={{marginTop:10}}>
                  <Text style={{color:colors.gray,fontSize:13,textAlign:'center'}}>Cerrar</Text>
                </TouchableOpacity>
              </>
            ):null}
          </View>
        </View>
      </Modal>

      {/* Modal importar rutina */}
      <Modal visible={showImportModal} transparent animationType="slide" onRequestClose={()=>setShowImportModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{width:'92%',padding:22,alignItems:'stretch'}]}>
            <Text style={[s.modalTitle,{marginBottom:6}]}>Importar rutina</Text>
            <Text style={[s.modalPhrase,{marginBottom:16}]}>Ingresá el código de 6 caracteres</Text>

            <TextInput
              style={[s.createInput,{textAlign:'center',fontSize:22,fontWeight:'800',letterSpacing:4,marginBottom:12}]}
              value={importCode}
              onChangeText={v=>{ setImportCode(v.toUpperCase().replace(/[^A-Z0-9]/g,'')); setImportError(''); setImportPreview(null); }}
              placeholder="ABC123"
              placeholderTextColor={colors.gray}
              maxLength={6}
              autoCapitalize="characters"
              keyboardType="default"
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
                  <Text style={[s.createBtnTxt,{color:'#fff'}]}>Importar ✓</Text>
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
              <Text style={s.bsOptionTxt}>✏️  Editar nombre</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.bsOption} onPress={()=>{ setShowChipMenu(false); setTimeout(()=>openEditModal(chipMenuRoutine),180); }}>
              <Text style={s.bsOptionTxt}>📝  Editar ejercicios</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.bsOption} onPress={()=>{ setShowChipMenu(false); duplicateRoutine(chipMenuRoutine); }}>
              <Text style={s.bsOptionTxt}>📋  Duplicar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.bsOption} onPress={()=>{ setShowChipMenu(false); setTimeout(()=>openShareRoutine(chipMenuRoutine),180); }}>
              <Text style={s.bsOptionTxt}>🔗  Compartir</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.bsOption} onPress={()=>{
              const r=chipMenuRoutine;
              setShowChipMenu(false);
              setTimeout(()=>Alert.alert('Eliminar rutina',`¿Eliminás "${r?.name||r?.day}"?`,[
                {text:'Cancelar',style:'cancel'},
                {text:'Eliminar',style:'destructive',onPress:()=>doDeleteRoutine(r)},
              ]),200);
            }}>
              <Text style={[s.bsOptionTxt,{color:colors.danger}]}>🗑️  Eliminar</Text>
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
                  <Text style={[s.createBtnTxt,{color:colors.accentText||'#fff',fontSize:16}]}>⚡ Nueva sesión</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.createBtn,{backgroundColor:colors.bgInput,borderWidth:1,borderColor:colors.purpleDim,marginBottom:6}]} onPress={()=>setShowHistoryView(true)}>
                  <Text style={[s.createBtnTxt,{color:colors.grayLight}]}>📊 Ver historial</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={()=>setShowRoutineModal(false)} style={{alignItems:'center',paddingVertical:10}}>
                  <Text style={{color:colors.gray,fontSize:13}}>Cancelar</Text>
                </TouchableOpacity>
              </>
            )}
            {showHistoryView&&!historyDetailLog&&(
              <>
                <TouchableOpacity onPress={()=>setShowHistoryView(false)} style={{marginBottom:10}}>
                  <Text style={{color:colors.purple,fontSize:14}}>← Volver</Text>
                </TouchableOpacity>
                <Text style={[s.modalTitle,{marginBottom:12,textAlign:'left'}]}>Historial</Text>
                {historyLogs.length===0?(
                  <Text style={{color:colors.gray,textAlign:'center',paddingVertical:24}}>
                    Sin sesiones completadas aún.
                  </Text>
                ):(
                  <ScrollView style={{maxHeight:340}} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {historyLogs.map((hl,i)=>(
                      <TouchableOpacity key={i} style={[s.recExList,{marginBottom:8,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}]} onPress={()=>setHistoryDetailLog(hl)}>
                        <View style={{flex:1}}>
                          <Text style={{color:colors.white,fontWeight:'700',fontSize:14}}>{formatLogDate(hl.date)}</Text>
                          <Text style={{color:colors.gray,fontSize:12,marginTop:2}}>
                            {(hl.exercises||[]).length} ejercicios · {(hl.exercises||[]).reduce((n,ex)=>n+(ex.sets||[]).filter(st=>st.done).length,0)} sets completados
                          </Text>
                        </View>
                        <Text style={{color:colors.purple,fontSize:18,paddingLeft:8}}>›</Text>
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
                  <Text style={{color:colors.purple,fontSize:14}}>← Volver al historial</Text>
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
                          Set {si+1}: {st.reps||'—'} reps × {st.weight||'—'} {ex.unit||'kg'}{st.done?' ✓':''}
                        </Text>
                      ))}
                    </View>
                  ))}
                </ScrollView>
                <TouchableOpacity style={[s.createBtn,{backgroundColor:colors.purple,marginTop:12}]} onPress={startNewSession}>
                  <Text style={[s.createBtnTxt,{color:colors.accentText||'#fff'}]}>⚡ Nueva sesión con esta rutina</Text>
                </TouchableOpacity>
              </>
            )}
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
          <Text style={s.recommendBtnIcon}>✨</Text>
        </TouchableOpacity>
      </View>

      {/* Nombre rutina activa + estado */}
      <View style={s.activeBar}>
        {selectedWorkout&&log ? (
          <Text style={s.activeName} numberOfLines={1} ellipsizeMode="tail">
            {selectedWorkout.isRecurring?'📅 ':''}{selectedWorkout.name||selectedWorkout.day}
          </Text>
        ) : (
          <Text style={s.activeName} numberOfLines={1}>{syncing ? 'Cargando...' : 'Seleccioná una rutina'}</Text>
        )}
        {syncing&&<Text style={s.syncHint}>↻ Sincronizando</Text>}
        {!syncing&&usingLocalData&&<Text style={s.localDataHint}>📴 Local</Text>}
        {!syncing&&!usingLocalData&&autoSaveState==='saving'&&<Text style={s.autoSaveHint}>Guardando...</Text>}
        {!syncing&&!usingLocalData&&autoSaveState==='saved'&&<Text style={s.autoSaveHint}>✓ Guardado</Text>}
        {!syncing&&autoSaveState==='error'&&<Text style={[s.autoSaveHint,{color:'#ef4444'}]}>⚠ Error</Text>}
      </View>

      {/* Selector de rutinas — T1: ⋯ por chip, T3: tap → modal */}
      <View style={{flexDirection:'row',alignItems:'center'}}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayScroll}>
          {currentList.map(w=>(
            <View key={w.id} style={[s.dayChip, s.dayChipRow, selectedWorkout?.id===w.id&&s.dayChipActive]}>
              <TouchableOpacity style={{flex:1}} onPress={()=>openRoutineModal(w)}>
                <Text style={[s.dayChipText, selectedWorkout?.id===w.id&&s.dayChipTextActive]} numberOfLines={1}>
                  {w.isRecurring?'📅 ':''}{w.day||w.name}
                </Text>
              </TouchableOpacity>
              {/* ⋯ 44×44 sin hitSlop — hitSlop no funciona en web */}
              <TouchableOpacity onPress={()=>openChipMenu(w)} style={s.chipMenuBtn} activeOpacity={0.6}>
                <Text style={[s.chipMenuTxt, selectedWorkout?.id===w.id&&{color:'rgba(255,255,255,0.85)'}]}>⋯</Text>
              </TouchableOpacity>
            </View>
          ))}
          {currentList.length===0&&!initialLoading&&(
            <Text style={[s.dayChipText,{paddingVertical:8,color:colors.gray}]}>Sin rutinas aún</Text>
          )}
        </ScrollView>
        {/* Botón importar */}
        <View style={s.addRoutineBtns}>
          <TouchableOpacity style={s.addRoutineBtn} onPress={openImportModal} hitSlop={{top:8,bottom:8,left:8,right:8}}>
            <Text style={s.addRoutineImportTxt}>⬇</Text>
          </TouchableOpacity>
        </View>
      </View>

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
            <Text style={s.completedText}>Sesión completada hoy ✓</Text>
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
            {/* Header: nombre + toggle unidad + ✕ (esquina sup. derecha, 44×44 real) */}
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
              {/* Botón ✕ — 44×44 explícito, sin hitSlop (no funciona en web) */}
              <TouchableOpacity
                style={s.exRemoveBtn}
                activeOpacity={0.7}
                onPress={()=>Alert.alert(
                  '¿Eliminar ejercicio?',
                  `Se eliminará "${ex.name || `Ejercicio ${exIdx+1}`}" de esta sesión.`,
                  [
                    { text:'Cancelar', style:'cancel' },
                    { text:'Eliminar', style:'destructive', onPress:()=>removeExercise(exIdx) },
                  ]
                )}
              >
                <Text style={s.exRemoveTxt}>✕</Text>
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
                        <Text style={[s.setCircleTxt, isDone&&s.setCircleTxtDone]}>
                          {isDone ? '✓' : setIdx+1}
                        </Text>
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
                      <Text style={[s.setDelTxt, isOnly&&s.setDelTxtSoft]}>
                        {isOnly ? 'limpiar' : '−'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* ── Inputs: REPS + KG/LB ── */}
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
                    </View>
                  </View>

                  {/* ── Anterior ── */}
                  {hasPrev&&!isDone&&(
                    <Text style={s.setPrevText}>
                      Ant: {prevReps||'—'} reps × {prevWeight||'—'} {getLastExUnit(ex.name)||ex.unit||weightUnit}
                    </Text>
                  )}
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

    // Barra activa
    activeBar: { paddingHorizontal:14, paddingVertical:8, backgroundColor:colors.bgCard, borderBottomWidth:1, borderBottomColor:colors.purpleDim, flexDirection:'row', alignItems:'center', justifyContent:'space-between', minHeight:40 },
    activeName: { fontSize:14, fontWeight:'700', color:colors.purpleLight, flex:1, marginRight:8 },
    syncHint: { fontSize:11, color:colors.purple, marginLeft:8 },
    autoSaveHint: { fontSize:11, color:colors.gray, marginLeft:8 },

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
    shareCodeBox: { backgroundColor:colors.bgInput, borderRadius:RADIUS.md, paddingVertical:20, paddingHorizontal:32, alignItems:'center', marginBottom:10, borderWidth:2, borderColor:colors.purple, width:'100%' },
    shareCodeText: { fontSize:36, fontWeight:'900', color:colors.purple, letterSpacing:6 },
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
    bsOptionTxt: { fontSize:16, color:colors.white, fontWeight:'500' },

    // ✕ ejercicio — esquina superior derecha, 44×44 sin hitSlop
    exRemoveBtn: { width:44, height:44, alignItems:'center', justifyContent:'center', marginLeft:4 },
    exRemoveTxt: { fontSize:20, color:'#ef4444', fontWeight:'700', lineHeight:24 },

    // T4 — indicador datos locales
    localDataHint: { fontSize:11, color:colors.gray, marginLeft:8, opacity:0.8 },
  });
}
