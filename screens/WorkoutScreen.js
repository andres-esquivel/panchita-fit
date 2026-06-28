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
} from '../storage';
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

  // Modo
  const [mode, setMode] = useState('base');

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

  const autoSaveTimerRef = useRef(null);
  const lastSavedLogRef  = useRef('');
  const selectedWorkoutRef = useRef(null); // para acceso en closures async

  useFocusEffect(useCallback(()=>{ loadAll(); },[mode]));

  useEffect(()=>()=>{ if(autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); },[]);

  // Cargar unidad de peso
  useEffect(()=>{
    getWeightUnit().then(u=>{ setWeightUnit(u); prevWeightUnitRef.current=u; });
  },[]);

  // Convertir pesos existentes cuando cambia la unidad
  useEffect(()=>{
    const prev = prevWeightUnitRef.current;
    if (prev===weightUnit || !log) return;
    prevWeightUnitRef.current = weightUnit;
    setLog(l=>({
      ...l,
      exercises: (l.exercises||[]).map(ex=>({
        ...ex,
        sets: (ex.sets||[]).map(st=>({
          ...st,
          weight: st.weight ? convertWeightValue(st.weight, prev, weightUnit) : st.weight,
        })),
      })),
    }));
  },[weightUnit]);

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
    // ── FASE 1: local inmediato (sin red, ~0ms) ──────────────
    const [localBase, localCustom] = await Promise.all([
      getLocalWorkouts(),
      getLocalCustomRoutines(),
    ]);
    setBaseWorkouts(localBase);
    setCustomRoutines(localCustom);
    // Auto-seleccionar primera rutina disponible
    if (!selectedWorkoutRef.current) {
      const list = mode==='base' ? localBase : localCustom;
      if (list.length>0) await selectWorkout(list[0]);
    }

    // ── FASE 2: sincronizar con Firestore en background ──────
    setSyncing(true);
    try {
      const [remoteBase, remoteCustom] = await Promise.all([
        getWorkouts(),
        getCustomRoutines(),
      ]);
      setBaseWorkouts(remoteBase);
      setCustomRoutines(remoteCustom);
      // Si lo que llegó de Firestore difiere de lo local, actualizar selección
      if (!selectedWorkoutRef.current) {
        const list = mode==='base' ? remoteBase : remoteCustom;
        if (list.length>0) await selectWorkout(list[0]);
      }
    } catch(e) {
      console.warn('Background sync failed:', e);
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
      exercises: exerciseNames.map(name=>({ name, sets:[{ reps:'', weight:'' }] })),
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
      if (exercises.length===0) return prev; // no eliminar si es el último
      return { ...prev, exercises };
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

  // ─── Duplicar / eliminar rutina ───────────────────────────
  function confirmRoutineAction(routine) {
    Alert.alert(routine.name||routine.day, '¿Qué querés hacer?', [
      { text:'Cancelar', style:'cancel' },
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
    setLog({ date:TODAY, workoutId:routine.id, completed:false, exercises:routine.exercises.map(name=>({ name, sets:[{ reps:'',weight:'' }] })) });
    setCompleted(false); setLastLog(null);
  }

  const currentList = useMemo(()=>{
    const list = mode==='base' ? baseWorkouts : customRoutines;
    if (mode!=='custom') return list;
    return [...list].sort((a,b)=>(b.isRecurring?1:0)-(a.isRecurring?1:0));
  },[mode,baseWorkouts,customRoutines]);

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

      {/* Header modo A/B — fila única */}
      <View style={s.modeHeader}>
        <View style={s.modeTabs}>
          <TouchableOpacity style={[s.modeTab,mode==='base'&&s.modeTabActive]} onPress={()=>switchMode('base')}>
            <Text style={[s.modeTabText,mode==='base'&&s.modeTabTextActive]}>Mis rutinas</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.modeTab,mode==='custom'&&s.modeTabActive]} onPress={()=>switchMode('custom')}>
            <Text style={[s.modeTabText,mode==='custom'&&s.modeTabTextActive]}>Personalizadas</Text>
          </TouchableOpacity>
        </View>
        {/* Botón recomendación como icono compacto */}
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
        {!syncing&&autoSaveState==='saving'&&<Text style={s.autoSaveHint}>Guardando...</Text>}
        {!syncing&&autoSaveState==='saved'&&<Text style={s.autoSaveHint}>✓ Guardado</Text>}
        {!syncing&&autoSaveState==='error'&&<Text style={[s.autoSaveHint,{color:'#ef4444'}]}>⚠ Error</Text>}
      </View>

      {/* Selector de rutinas */}
      <View style={{flexDirection:'row',alignItems:'center'}}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayScroll}>
          {currentList.map(w=>(
            <TouchableOpacity key={w.id} style={[s.dayChip,selectedWorkout?.id===w.id&&s.dayChipActive]} onPress={()=>selectWorkout(w)} onLongPress={()=>w.isCustom&&confirmRoutineAction(w)}>
              <Text style={[s.dayChipText,selectedWorkout?.id===w.id&&s.dayChipTextActive]}>
                {w.isRecurring?'📅 ':''}{w.day||w.name}
              </Text>
            </TouchableOpacity>
          ))}
          {currentList.length===0&&<Text style={[s.dayChipText,{paddingVertical:8,color:colors.gray}]}>{mode==='custom'?'Sin rutinas aún':'Sin rutinas base'}</Text>}
        </ScrollView>
        {mode==='custom'&&(
          <TouchableOpacity style={s.addRoutineBtn} onPress={openCreateModal}>
            <Text style={s.addRoutineTxt}>+</Text>
          </TouchableOpacity>
        )}
      </View>
      {mode==='custom'&&currentList.length>0&&(
        <Text style={s.longPressHint}>Mantené presionado para editar, duplicar o eliminar</Text>
      )}

      {/* Lista de ejercicios */}
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        {!log&&(
          <View style={s.emptyState}>
            {mode==='custom'?(
              <><Panchita state="idle" size={90}/><Text style={s.emptyTitle}>Creá tu primera rutina</Text><Text style={s.emptyText}>Tocá + para agregar ejercicios personalizados.</Text><TouchableOpacity style={s.emptyBtn} onPress={openCreateModal}><Text style={s.emptyBtnText}>+ Crear rutina</Text></TouchableOpacity></>
            ):(
              <><Panchita state="idle" size={90}/><Text style={s.emptyTitle}>Seleccioná una rutina</Text></>
            )}
          </View>
        )}

        {log&&completed&&(
          <View style={s.completedBanner}>
            <Text style={s.completedText}>Sesión completada hoy ✓</Text>
          </View>
        )}

        {/* Tarjetas de ejercicios */}
        {(log?.exercises||[]).map((ex, exIdx)=>(
          <View key={exIdx} style={s.exCard}>
            {/* Nombre del ejercicio — completo, sin truncar */}
            <Text style={s.exName}>{ex.name || `Ejercicio ${exIdx+1}`}</Text>

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
                    {/* Botón done — toca el label o el círculo */}
                    <TouchableOpacity
                      style={s.setDoneArea}
                      onPress={()=>toggleSetDone(exIdx,setIdx)}
                      hitSlop={{top:6,bottom:6,left:6,right:6}}
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

                    {/* Botón eliminar / limpiar */}
                    <TouchableOpacity
                      style={[s.setDelBtn, isOnly&&s.setDelBtnSoft]}
                      onPress={()=>removeSet(exIdx,setIdx)}
                      hitSlop={{top:8,bottom:8,left:8,right:8}}
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
                      <Text style={s.setInputLabel}>{weightUnit.toUpperCase()}</Text>
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
                      Ant: {prevReps||'—'} reps × {prevWeight||'—'} {weightUnit}
                    </Text>
                  )}
                </View>
              );
            })}

            {/* Acciones del ejercicio */}
            <View style={s.exFooter}>
              <TouchableOpacity style={s.addSetBtn} onPress={()=>addSet(exIdx)}>
                <Text style={s.addSetTxt}>+ Set</Text>
              </TouchableOpacity>
              {(log?.exercises||[]).length>1&&(
                <TouchableOpacity onPress={()=>{
                  Alert.alert('Eliminar ejercicio',`¿Eliminar "${ex.name}" de esta sesión?`,[
                    {text:'Cancelar',style:'cancel'},
                    {text:'Eliminar',style:'destructive',onPress:()=>removeExercise(exIdx)},
                  ]);
                }} style={s.removeExBtn}>
                  <Text style={s.removeExTxt}>Quitar ejercicio</Text>
                </TouchableOpacity>
              )}
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
    addRoutineBtn: { width:34, height:34, borderRadius:17, backgroundColor:colors.purple, alignItems:'center', justifyContent:'center', marginRight:14 },
    addRoutineTxt: { color:'#fff', fontSize:22, fontWeight:'300', lineHeight:28 },
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
    exName: { fontSize:17, fontWeight:'800', color:colors.white, marginBottom:12, letterSpacing:0.1 },

    // ── Tarjeta de set (layout vertical) ──
    setCard: {
      backgroundColor:colors.bgInput, borderRadius:RADIUS.md,
      padding:12, marginBottom:10,
      borderWidth:1, borderColor:colors.purpleDim,
    },
    setCardDone: { borderColor:colors.purple, opacity:0.72 },

    // Header de la tarjeta de set
    setCardHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 },
    setDoneArea: { flexDirection:'row', alignItems:'center', gap:8, flex:1 },
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

    // Botón eliminar set
    setDelBtn: { paddingHorizontal:12, paddingVertical:6, borderRadius:RADIUS.full, backgroundColor:colors.bgCard, borderWidth:1, borderColor:colors.purpleDim, minWidth:36, alignItems:'center' },
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
    exFooter: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:6, paddingTop:8, borderTopWidth:1, borderTopColor:colors.purpleDim },
    addSetBtn: { paddingVertical:6, paddingHorizontal:10 },
    addSetTxt: { color:colors.purpleLight, fontSize:15, fontWeight:'700' },
    removeExBtn: { paddingVertical:6, paddingHorizontal:10 },
    removeExTxt: { color:colors.gray, fontSize:12, textDecorationLine:'underline' },

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
  });
}
