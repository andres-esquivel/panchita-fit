import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  TouchableOpacity, TextInput, Modal, Alert, Animated, Keyboard, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  getWorkouts, getLogs, saveLog,
  getCustomRoutines, saveCustomRoutine, deleteCustomRoutine,
  getRecentMuscleActivity,
} from '../storage';
import Panchita from '../components/Panchita';

const TODAY = new Date().toISOString().split('T')[0];

// ─── Frases por set completado ────────────────────────────
const SET_PHRASES = [
  '¡Set hecho! Eso es lo que hay que hacer.',
  'Bien. Ahora descansá exactamente 90 segundos. No 3 minutos.',
  'Set completado. El siguiente es tuyo también.',
  'Menos mal que lo hiciste. Esperaba peor.',
  'Otro set menos. Seguís vivo, bien.',
  'Perfecto. Come proteína después. Ahora el siguiente.',
  'Set. Nada del otro mundo, pero lo hiciste.',
  '¡Ese es el camino! O al menos uno de ellos.',
  'Bien ejecutado. Panchita lo anota mentalmente.',
  'Completado. ¿Ves? No era para tanto.',
];

// ─── Frases de completado ──────────────────────────────────
const COMPLETION_PHRASES = [
  'Vaya, vaya... resultó que sí podías.',
  'Rutina completada. Casi no lo creo, pero aquí estamos.',
  'Lo hiciste. Ahora a comer proteína y fingir que no duele nada.',
  'Sesión terminada. Panchita está... impresionada. Un poco.',
  'Completado. Ya podés presumirle a tu yo de ayer.',
];

// ─── Lógica de recomendación ───────────────────────────────
const MUSCLE_LABELS = {
  chest:     'pecho',
  back:      'espalda',
  legs:      'piernas',
  shoulders: 'hombros',
  arms:      'brazos',
};

const MUSCLE_EXERCISES = {
  chest:     ['Press banca', 'Press inclinado', 'Aperturas', 'Fondos', 'Pullover'],
  back:      ['Dominadas', 'Remo con barra', 'Jalón al pecho', 'Peso muerto', 'Remo en polea'],
  legs:      ['Sentadilla', 'Prensa', 'Peso muerto rumano', 'Curl femoral', 'Pantorrilla', 'Extensión cuád'],
  shoulders: ['Press militar', 'Elevaciones laterales', 'Face pull', 'Pájaro', 'Press Arnold'],
  arms:      ['Curl barra', 'Curl martillo', 'Press francés', 'Extensión cable', 'Curl concentrado'],
};

const PANCHITA_RECOMMEND_PHRASES = {
  legs: (days) => days === null
    ? '¿Piernas? Nunca. Hoy rompemos esa racha.'
    : days === 0 ? 'Hoy ya hiciste piernas. Pero si querés más castigo...'
    : `Llevas ${days} día${days > 1 ? 's' : ''} sin mover las piernas. Ya sé que duelen, pero ahí vamos.`,
  chest: (days) => days === null
    ? 'El pecho nunca ha visto una barra. Hoy cambia eso.'
    : days === 0 ? 'Pecho de nuevo. Panchita no dice nada. Solo juzga.'
    : `${days} día${days > 1 ? 's' : ''} sin press banca. El pecho ya no te reconoce.`,
  back: (days) => days === null
    ? 'La espalda existe. Hoy la saludamos.'
    : days === 0 ? 'Otra vez espalda. El remo no descansa.'
    : `Llevas ${days} día${days > 1 ? 's' : ''} sin espalda. El dolor muscular va a ser... interesante.`,
  shoulders: (days) => days === null
    ? 'Hombros vírgenes de entrenamiento. Empezamos hoy.'
    : days === 0 ? 'Hombros de vuelta. Igual ya no podés levantar los brazos.'
    : `${days} día${days > 1 ? 's' : ''} sin hombros. El press militar te extraña.`,
  arms: (days) => days === null
    ? 'Brazos sin curl. Panchita suspira. Empecemos.'
    : days === 0 ? 'Brazos otra vez. La vanidad tiene precio.'
    : `${days} día${days > 1 ? 's' : ''} de brazos en reposo. El espejo ya pregunta.`,
};

function logHasProgress(log) {
  if (!log) return false;
  if (log.completed) return true;
  return (log.exercises || []).some(ex =>
    (ex.sets || []).some(st =>
      String(st.reps || '').trim() ||
      String(st.weight || '').trim() ||
      !!st.done
    )
  );
}

function logSignature(log) {
  if (!log) return '';
  return JSON.stringify({
    date: log.date,
    workoutId: log.workoutId,
    completed: !!log.completed,
    exercises: (log.exercises || []).map(ex => ({
      name: ex.name,
      sets: (ex.sets || []).map(st => ({
        reps: String(st.reps || ''),
        weight: String(st.weight || ''),
        done: !!st.done,
      })),
    })),
  });
}

function buildRecommendation(muscleActivity) {
  // Elegir el grupo que más tiempo lleva sin entrenarse
  let worstGroup = 'legs';
  let worstDays = -1;

  for (const [group, days] of Object.entries(muscleActivity)) {
    const score = days === null ? 999 : days;
    if (score > worstDays) {
      worstDays = score;
      worstGroup = group;
    }
  }

  const realDays = muscleActivity[worstGroup]; // null o número
  const phrase = PANCHITA_RECOMMEND_PHRASES[worstGroup]?.(realDays)
    || `Ya es hora de entrenar ${MUSCLE_LABELS[worstGroup]}.`;

  return {
    group: worstGroup,
    label: MUSCLE_LABELS[worstGroup],
    exercises: MUSCLE_EXERCISES[worstGroup],
    daysSince: realDays,
    phrase,
  };
}

// ─── Componente principal ──────────────────────────────────
export default function WorkoutScreen({ navigation }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  // Datos
  const [baseWorkouts, setBaseWorkouts]       = useState([]);
  const [customRoutines, setCustomRoutines]   = useState([]);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [log, setLog]                         = useState(null);
  const [lastLog, setLastLog]                 = useState(null);
  const [saving, setSaving]                   = useState(false);
  const [autoSaveState, setAutoSaveState]     = useState('idle'); // idle | saving | saved | error
  const [completed, setCompleted]             = useState(false);

  // Modo A / B
  const [mode, setMode] = useState('base'); // 'base' | 'custom'

  // Reacción Panchita flotante
  const [panchitaReaction, setPanchitaReaction] = useState(false);
  const [reactionPhrase, setReactionPhrase]     = useState('');

  // Modal completado
  const [showCompletion, setShowCompletion]     = useState(false);
  const [completionPhrase, setCompletionPhrase] = useState('');

  // Modal crear rutina
  const [showCreateModal, setShowCreateModal]   = useState(false);
  const [newRoutineName, setNewRoutineName]     = useState('');
  const [newExercises, setNewExercises]         = useState(['', '', '']);
  const [createError, setCreateError]           = useState('');
  const [creatingRoutine, setCreatingRoutine]   = useState(false);

  // Modal recomendación Panchita
  const [showRecommend, setShowRecommend]       = useState(false);
  const [recommendation, setRecommendation]     = useState(null);
  const [loadingRecommend, setLoadingRecommend] = useState(false);

  const autoSaveTimerRef = useRef(null);
  const lastSavedLogRef  = useRef('');

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!log || !selectedWorkout || completed) {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      return;
    }
    if (!logHasProgress(log)) {
      setAutoSaveState('idle');
      return;
    }

    const signature = logSignature(log);
    if (signature === lastSavedLogRef.current) return;

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setAutoSaveState('saving');

    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        await saveLog(log);
        lastSavedLogRef.current = signature;
        setAutoSaveState('saved');
      } catch (error) {
        console.warn('autosave workout failed:', error);
        setAutoSaveState('error');
      }
    }, 900);
  }, [log, selectedWorkout?.id, completed]);

  async function loadAll() {
    const [base, custom] = await Promise.all([getWorkouts(), getCustomRoutines()]);
    setBaseWorkouts(base);
    setCustomRoutines(custom);
    const allWorkouts = mode === 'base' ? base : custom;
    if (allWorkouts.length > 0 && !selectedWorkout) {
      await selectWorkout(allWorkouts[0]);
    }
  }

  async function selectWorkout(workout) {
    setSelectedWorkout(workout);
    const blankLog = {
      date: TODAY,
      workoutId: workout.id,
      completed: false,
      exercises: workout.exercises.map(name => ({
        name,
        sets: [{ reps: '', weight: '' }],
      })),
    };
    setLog(blankLog);
    setCompleted(false);
    lastSavedLogRef.current = '';
    setAutoSaveState('idle');

    try {
      const logs = await getLogs();
      const last = logs.filter(l => l.workoutId === workout.id && l.completed)
        .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
      setLastLog(last);
      const todayLog = logs.find(l => l.date === TODAY && l.workoutId === workout.id);
      if (todayLog) {
        setLog(todayLog);
        setCompleted(todayLog.completed);
        lastSavedLogRef.current = logSignature(todayLog);
        setAutoSaveState('saved');
      }
    } catch (error) {
      console.warn('selectWorkout logs load failed:', error);
      setLastLog(null);
    }
  }

  // Cambiar entre modo base / custom
  async function switchMode(newMode) {
    setMode(newMode);
    setSelectedWorkout(null);
    setLog(null);
    const list = newMode === 'base' ? baseWorkouts : customRoutines;
    if (list.length > 0) await selectWorkout(list[0]);
  }

  // ─── Set management ──────────────────────────────────────
  function normalizeSetValue(field, value) {
    const clean = String(value || '').replace(',', '.').replace(/[^0-9.]/g, '');
    const parts = clean.split('.');
    if (field === 'reps') return parts[0] || '';
    return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : clean;
  }

  function updateSet(exIdx, setIdx, field, value) {
    const nextValue = normalizeSetValue(field, value);
    setLog(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, ei) =>
        ei !== exIdx ? ex : {
          ...ex,
          sets: ex.sets.map((st, si) =>
            si !== setIdx ? st : { ...st, [field]: nextValue, done: field === 'reps' || field === 'weight' ? false : st.done }
          ),
        }
      ),
    }));
  }

  function addSet(exIdx) {
    setLog(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, ei) => {
        if (ei !== exIdx) return ex;
        const last = ex.sets[ex.sets.length - 1];
        return { ...ex, sets: [...ex.sets, { reps: last?.reps || '', weight: last?.weight || '', done: false }] };
      }),
    }));
  }

  // ─── Completar set ────────────────────────────────────────
  function toggleSetDone(exIdx, setIdx) {
    setLog(prev => {
      const set = prev.exercises[exIdx]?.sets[setIdx];
      if (!set) return prev;
      const wasDone = !!set.done;
      const updated = {
        ...prev,
        exercises: prev.exercises.map((ex, ei) =>
          ei !== exIdx ? ex : {
            ...ex,
            sets: ex.sets.map((st, si) =>
              si !== setIdx ? st : { ...st, done: !wasDone }
            ),
          }
        ),
      };
      if (!wasDone) {
        // Reacción Panchita al completar
        const phrase = SET_PHRASES[Math.floor(Math.random() * SET_PHRASES.length)];
        setReactionPhrase(phrase);
        setPanchitaReaction(true);
        setTimeout(() => setPanchitaReaction(false), 2500);
      }
      return updated;
    });
  }

  function removeSet(exIdx, setIdx) {
    setLog(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, ei) => {
        if (ei !== exIdx) return ex;
        if (ex.sets.length <= 1) {
          return { ...ex, sets: [{ reps: '', weight: '', done: false }] };
        }
        return { ...ex, sets: ex.sets.filter((_, si) => si !== setIdx) };
      }),
    }));
  }

  function clearSet(exIdx, setIdx) {
    setLog(prev => ({
      ...prev,
      exercises: prev.exercises.map((ex, ei) =>
        ei !== exIdx ? ex : {
          ...ex,
          sets: ex.sets.map((st, si) =>
            si !== setIdx ? st : { reps: '', weight: '', done: false }
          ),
        }
      ),
    }));
  }

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
      setTimeout(() => setPanchitaReaction(false), 2500);
    } catch (error) {
      console.warn('manual save failed:', error);
      setAutoSaveState('error');
      Alert.alert('Panchita dice:', 'No pude guardar. Intentá otra vez antes de que finjamos que esas reps existieron.');
    } finally {
      setSaving(false);
    }
  }

  async function finishWorkout() {
    if (!log) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const finishedLog = { ...log, completed: true };
    setSaving(true);
    try {
      await saveLog(finishedLog);
      lastSavedLogRef.current = logSignature(finishedLog);
      setAutoSaveState('saved');
      setLog(finishedLog);
      setCompleted(true);
      const phrase = COMPLETION_PHRASES[Math.floor(Math.random() * COMPLETION_PHRASES.length)];
      setCompletionPhrase(phrase);
      setShowCompletion(true);
    } catch (error) {
      console.warn('finish workout save failed:', error);
      setAutoSaveState('error');
      Alert.alert('Panchita dice:', 'No pude terminar y guardar la rutina. El WiFi hizo cardio y se fue.');
    } finally {
      setSaving(false);
    }
  }

  function getLastValue(exName, setIdx, field) {
    if (!lastLog) return null;
    const ex = lastLog.exercises?.find(e => e.name === exName);
    return ex?.sets?.[setIdx]?.[field] || null;
  }

  // ─── Crear rutina custom ──────────────────────────────────
  function openCreateModal() {
    setNewRoutineName('');
    setNewExercises(['', '', '']);
    setCreateError('');
    setCreatingRoutine(false);
    setShowCreateModal(true);
  }

  function closeCreateModal() {
    Keyboard.dismiss();
    setShowCreateModal(false);
    setCreateError('');
    setCreatingRoutine(false);
  }

  async function saveNewRoutine() {
    if (creatingRoutine) return;
    Keyboard.dismiss();
    setCreateError('');

    const trimmedName = newRoutineName.trim();
    if (!trimmedName) {
      setCreateError('La rutina necesita un nombre. Al menos eso.');
      return;
    }

    const exercises = newExercises.map(e => e.trim()).filter(Boolean);
    if (exercises.length === 0) {
      setCreateError('Agregá al menos un ejercicio. No vas a entrenar el aire.');
      return;
    }

    setCreatingRoutine(true);
    try {
      const routine = {
        id: `custom_${Date.now()}`,
        name: trimmedName,
        day: trimmedName,
        exercises,
        isCustom: true,
        createdAt: new Date().toISOString(),
      };
      await saveCustomRoutine(routine);
      setCustomRoutines(prev => {
        const withoutOld = prev.filter(item => item.id !== routine.id);
        return [routine, ...withoutOld];
      });
      setMode('custom');
      setShowCreateModal(false);
      setCreateError('');
      setCreatingRoutine(false);
      selectWorkout(routine).catch(error => console.warn('select custom routine failed:', error));
    } catch (error) {
      console.error('saveNewRoutine error:', error);
      setCreateError('No pude guardar la rutina. Revisá conexión/sesión e intentá otra vez.');
    } finally {
      setCreatingRoutine(false);
    }
  }

  function addExerciseField() {
    setNewExercises(prev => [...prev, '']);
  }

  function removeExerciseField(idx) {
    setNewExercises(prev => prev.filter((_, i) => i !== idx));
  }

  function updateExerciseField(idx, value) {
    setNewExercises(prev => prev.map((e, i) => i === idx ? value : e));
  }

  // ─── Eliminar rutina custom ───────────────────────────────
  function confirmDelete(routine) {
    Alert.alert(
      'Eliminar rutina',
      `¿Eliminar "${routine.name}"? Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar', style: 'destructive',
          onPress: async () => {
            await deleteCustomRoutine(routine.id);
            const updated = await getCustomRoutines();
            setCustomRoutines(updated);
            if (selectedWorkout?.id === routine.id) {
              setSelectedWorkout(null);
              setLog(null);
              if (updated.length > 0) await selectWorkout(updated[0]);
            }
          },
        },
      ]
    );
  }

  // ─── Recomendación Panchita ───────────────────────────────
  async function openRecommendation() {
    setLoadingRecommend(true);
    setShowRecommend(true);
    try {
      const muscleActivity = await getRecentMuscleActivity();
      const rec = buildRecommendation(muscleActivity);
      setRecommendation(rec);
    } catch (e) {
      setRecommendation({
        group: 'legs',
        label: 'piernas',
        exercises: MUSCLE_EXERCISES.legs,
        daysSince: null,
        phrase: 'No pude analizar tu historial, pero igual te digo: hacé piernas.',
      });
    } finally {
      setLoadingRecommend(false);
    }
  }

  function useRecommendedRoutine() {
    if (!recommendation) return;
    const routine = {
      id: `rec_${recommendation.group}`,
      day: `${recommendation.label.charAt(0).toUpperCase() + recommendation.label.slice(1)} (Panchita)`,
      exercises: recommendation.exercises,
    };
    setShowRecommend(false);
    // Cargar la rutina recomendada directamente como log temporal
    setSelectedWorkout(routine);
    setLog({
      date: TODAY,
      workoutId: routine.id,
      completed: false,
      exercises: routine.exercises.map(name => ({
        name,
        sets: [{ reps: '', weight: '' }],
      })),
    });
    setCompleted(false);
    setLastLog(null);
  }

  // ─── Renderizado ──────────────────────────────────────────
  const currentList = mode === 'base' ? baseWorkouts : customRoutines;

  return (
    <SafeAreaView style={s.safe}>
      {/* Reacción Panchita flotante */}
      {panchitaReaction && (
        <View style={s.reaction}>
          <Panchita state="happy" size={48} />
          <View style={s.reactionBubble}>
            <Text style={s.reactionText}>{reactionPhrase}</Text>
          </View>
        </View>
      )}

      {/* ── Modal: rutina completada ── */}
      <Modal visible={showCompletion} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Panchita state="happy" size={100} />
            <Text style={s.modalTitle}>Rutina completada</Text>
            <Text style={s.modalPhrase}>{completionPhrase}</Text>
            <TouchableOpacity style={s.modalBtn} onPress={() => { setShowCompletion(false); navigation.navigate('Inicio'); }}>
              <Text style={s.modalBtnText}>Volver al inicio</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal: crear rutina ── */}
      <Modal visible={showCreateModal} transparent animationType="slide" onRequestClose={closeCreateModal}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { padding: 20, width: '92%', maxHeight: '85%' }]}>
            <Text style={s.modalTitle}>Nueva rutina</Text>
            <TextInput
              style={[s.createInput, { marginBottom: 16 }]}
              placeholder="Nombre de la rutina (ej. Pecho + Tríceps)"
              placeholderTextColor={colors.gray}
              value={newRoutineName}
              onChangeText={v => { setNewRoutineName(v); if (createError) setCreateError(''); }}
              returnKeyType="next"
            />
            <Text style={[s.createLabel, { marginBottom: 8 }]}>Ejercicios</Text>
            <ScrollView style={{ maxHeight: 300, alignSelf: 'stretch' }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {newExercises.map((ex, i) => (
                <View key={i} style={s.createExRow}>
                  <TextInput
                    style={[s.createInput, { flex: 1 }]}
                    placeholder={`Ejercicio ${i + 1}`}
                    placeholderTextColor={colors.gray}
                    value={ex}
                    onChangeText={v => { updateExerciseField(i, v); if (createError) setCreateError(''); }}
                    returnKeyType="next"
                  />
                  {newExercises.length > 1 && (
                    <TouchableOpacity onPress={() => removeExerciseField(i)} style={s.createRemoveBtn}>
                      <Text style={s.createRemoveTxt}>✕</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              <TouchableOpacity style={s.addExBtn} onPress={addExerciseField}>
                <Text style={s.addExTxt}>+ Agregar ejercicio</Text>
              </TouchableOpacity>
            </ScrollView>
            {createError ? <Text style={s.createError}>{createError}</Text> : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[s.createBtn, { flex: 1, backgroundColor: colors.purpleDim }]} onPress={closeCreateModal} disabled={creatingRoutine}>
                <Text style={[s.createBtnTxt, { color: colors.grayLight }]}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.createBtn, { flex: 1, backgroundColor: colors.purple }, creatingRoutine && { opacity: 0.65 }]} onPress={saveNewRoutine} disabled={creatingRoutine}>
                {creatingRoutine ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={[s.createBtnTxt, { color: '#fff' }]}>Guardar</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal: recomendación Panchita ── */}
      <Modal visible={showRecommend} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { width: '90%' }]}>
            <Panchita state={loadingRecommend ? 'idle' : 'happy'} size={90} />
            {loadingRecommend ? (
              <Text style={s.modalPhrase}>Analizando tu historial...</Text>
            ) : recommendation ? (
              <>
                <View style={s.recBadge}>
                  <Text style={s.recBadgeText}>
                    {recommendation.label.toUpperCase()} HOY
                  </Text>
                </View>
                <Text style={[s.modalPhrase, { fontStyle: 'italic', marginBottom: 4 }]}>
                  "{recommendation.phrase}"
                </Text>
                <View style={s.recExList}>
                  {recommendation.exercises.map((ex, i) => (
                    <Text key={i} style={s.recExItem}>· {ex}</Text>
                  ))}
                </View>
                <TouchableOpacity style={s.modalBtn} onPress={useRecommendedRoutine}>
                  <Text style={s.modalBtnText}>Usar esta rutina →</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowRecommend(false)} style={{ marginTop: 8 }}>
                  <Text style={{ color: colors.gray, fontSize: 13, textAlign: 'center' }}>
                    No gracias, elijo yo
                  </Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── Header: modo A / B ── */}
      <View style={s.modeHeader}>
        <View style={s.modeTabs}>
          <TouchableOpacity
            style={[s.modeTab, mode === 'base' && s.modeTabActive]}
            onPress={() => switchMode('base')}
          >
            <Text style={[s.modeTabText, mode === 'base' && s.modeTabTextActive]}>
              Mis rutinas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.modeTab, mode === 'custom' && s.modeTabActive]}
            onPress={() => switchMode('custom')}
          >
            <Text style={[s.modeTabText, mode === 'custom' && s.modeTabTextActive]}>
              Personalizadas
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={s.recommendBtn} onPress={openRecommendation}>
          <Text style={s.recommendBtnText}>¿Qué entreno hoy?</Text>
        </TouchableOpacity>
      </View>

      {/* ── Selector de día / rutina ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.dayScroll}>
          {currentList.map(w => (
            <TouchableOpacity
              key={w.id}
              style={[s.dayChip, selectedWorkout?.id === w.id && s.dayChipActive]}
              onPress={() => selectWorkout(w)}
              onLongPress={() => w.isCustom && confirmDelete(w)}
            >
              <Text style={[s.dayChipText, selectedWorkout?.id === w.id && s.dayChipTextActive]}>
                {w.day || w.name}
              </Text>
            </TouchableOpacity>
          ))}
          {currentList.length === 0 && (
            <Text style={[s.dayChipText, { paddingVertical: 8, color: colors.gray }]}>
              {mode === 'custom' ? 'Sin rutinas personalizadas aún' : 'Sin rutinas base'}
            </Text>
          )}
        </ScrollView>
        {mode === 'custom' && (
          <TouchableOpacity style={s.addRoutineBtn} onPress={openCreateModal}>
            <Text style={s.addRoutineTxt}>+</Text>
          </TouchableOpacity>
        )}
      </View>
      {mode === 'custom' && currentList.length > 0 && (
        <Text style={s.longPressHint}>Mantené presionado para eliminar una rutina</Text>
      )}

      {/* ── Log de ejercicios ── */}
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {!log && (
          <View style={s.emptyState}>
            {mode === 'custom' ? (
              <>
                <Panchita state="idle" size={90} />
                <Text style={s.emptyTitle}>Creá tu primera rutina</Text>
                <Text style={s.emptyText}>Tocá + para agregar ejercicios personalizados y guardarlos para siempre.</Text>
                <TouchableOpacity style={s.emptyBtn} onPress={openCreateModal}>
                  <Text style={s.emptyBtnText}>+ Crear rutina</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Panchita state="idle" size={90} />
                <Text style={s.emptyTitle}>Seleccioná una rutina</Text>
              </>
            )}
          </View>
        )}

        {log && completed && (
          <View style={s.completedBanner}>
            <Text style={s.completedText}>Sesión completada hoy ✓</Text>
          </View>
        )}

        {log && autoSaveState !== 'idle' && !completed && (
          <View style={[s.autoSavePill, autoSaveState === 'error' && s.autoSavePillError]}>
            <Text style={[s.autoSaveText, autoSaveState === 'error' && s.autoSaveTextError]}>
              {autoSaveState === 'saving'
                ? 'Guardando automático...'
                : autoSaveState === 'saved'
                  ? 'Guardado automático ✓'
                  : 'Autosave falló. Tocá Guardar progreso.'}
            </Text>
          </View>
        )}

        {log?.exercises.map((ex, exIdx) => (
          <View key={exIdx} style={s.exCard}>
            <Text style={s.exName}>{ex.name}</Text>
            <View style={s.setHeader}>
              <Text style={[s.setCol, s.setLabel]}>Set</Text>
              <Text style={[s.setCol, s.setLabel]}>Ant.</Text>
              <Text style={[s.setCol, s.setLabel]}>Reps</Text>
              <Text style={[s.setCol, s.setLabel]}>Kg</Text>
              <View style={{ width: 76 }} />
            </View>
            {ex.sets.map((st, setIdx) => {
              const prevReps   = getLastValue(ex.name, setIdx, 'reps');
              const prevWeight = getLastValue(ex.name, setIdx, 'weight');
              const prevLabel  = prevReps && prevWeight ? `${prevWeight}x${prevReps}` : '-';
              const isDone     = !!st.done;
              return (
                <View key={setIdx} style={[s.setRow, isDone && s.setRowDone]}>
                  <Text style={[s.setCol, s.setNum, isDone && s.setNumDone]}>{setIdx + 1}</Text>
                  <Text style={[s.setCol, s.setPrev]}>{prevLabel}</Text>
                  <TextInput
                    style={[s.setCol, s.setInput, isDone && s.setInputDone]}
                    value={st.reps}
                    onChangeText={v => updateSet(exIdx, setIdx, 'reps', v)}
                    keyboardType="numeric"
                    placeholder="-"
                    placeholderTextColor={colors.gray}
                    editable={!isDone}
                  />
                  <TextInput
                    style={[s.setCol, s.setInput, isDone && s.setInputDone]}
                    value={st.weight}
                    onChangeText={v => updateSet(exIdx, setIdx, 'weight', v)}
                    keyboardType="numeric"
                    placeholder="-"
                    placeholderTextColor={colors.gray}
                    editable={!isDone}
                  />
                  <View style={s.setActions}>
                    <TouchableOpacity
                      onPress={() => toggleSetDone(exIdx, setIdx)}
                      style={[s.doneBtn, isDone && s.doneBtnActive]}
                    >
                      <Text style={[s.doneBtnTxt, isDone && s.doneBtnTxtActive]}>✓</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => ex.sets.length > 1 ? removeSet(exIdx, setIdx) : clearSet(exIdx, setIdx)}
                      style={[
                        s.removeBtn,
                        ex.sets.length <= 1 && !st.reps && !st.weight && !isDone && s.removeBtnDisabled,
                      ]}
                      disabled={ex.sets.length <= 1 && !st.reps && !st.weight && !isDone}
                    >
                      <Text style={s.removeTxt}>{ex.sets.length > 1 ? '−' : 'limpiar'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            <TouchableOpacity style={s.addSetBtn} onPress={() => addSet(exIdx)}>
              <Text style={s.addSetTxt}>+ Set</Text>
            </TouchableOpacity>
          </View>
        ))}

        {log && (
          <View style={s.actions}>
            <TouchableOpacity style={s.saveBtn} onPress={saveProgress} disabled={saving}>
              <Text style={s.saveBtnText}>{saving ? 'Guardando...' : 'Guardar progreso'}</Text>
            </TouchableOpacity>
            {!completed && (
              <TouchableOpacity style={s.finishBtn} onPress={finishWorkout}>
                <Text style={s.finishBtnText}>Terminar entrenamiento</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos ───────────────────────────────────────────────
function createStyles(colors) {
  return StyleSheet.create({
    safe:              { flex: 1, backgroundColor: colors.bg },

    // Modo header
    modeHeader:        { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6, gap: 10 },
    modeTabs:          { flexDirection: 'row', backgroundColor: colors.bgCard, borderRadius: RADIUS.full, padding: 3 },
    modeTab:           { flex: 1, paddingVertical: 8, borderRadius: RADIUS.full, alignItems: 'center' },
    modeTabActive:     { backgroundColor: colors.purple },
    modeTabText:       { fontSize: 13, color: colors.gray, fontWeight: '600' },
    modeTabTextActive: { color: '#fff' },
    recommendBtn:      { backgroundColor: colors.purpleDim, borderRadius: RADIUS.full, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.purple },
    recommendBtnText:  { color: colors.purpleLight, fontWeight: '700', fontSize: 13 },

    // Selector día
    dayScroll:         { paddingHorizontal: 14, paddingVertical: 10, maxHeight: 56 },
    dayChip:           { paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: colors.bgCard, marginRight: 8, borderWidth: 1, borderColor: colors.purpleDim },
    dayChipActive:     { backgroundColor: colors.purple, borderColor: colors.purple },
    dayChipText:       { fontSize: 13, color: colors.gray, fontWeight: '500' },
    dayChipTextActive: { color: '#fff' },
    addRoutineBtn:     { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.purple, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
    addRoutineTxt:     { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 28 },
    longPressHint:     { fontSize: 10, color: colors.gray, textAlign: 'center', marginBottom: 4 },

    // Scroll workout
    scroll:            { padding: 14, paddingBottom: 60 },

    // Empty state
    emptyState:        { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24 },
    emptyEmoji:        { fontSize: 48, marginBottom: 12 },
    emptyTitle:        { fontSize: 18, fontWeight: '700', color: colors.white, marginBottom: 8, textAlign: 'center' },
    emptyText:         { fontSize: 14, color: colors.gray, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
    emptyBtn:          { backgroundColor: colors.purple, borderRadius: RADIUS.full, paddingVertical: 14, paddingHorizontal: 32 },
    emptyBtnText:      { color: '#fff', fontWeight: '700', fontSize: 15 },

    // Completado
    completedBanner:   { backgroundColor: colors.limeDark + '33', borderRadius: RADIUS.md, padding: 12, marginBottom: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.lime },
    completedText:     { color: colors.lime, fontWeight: '600' },
    autoSavePill:      { alignSelf: 'flex-end', backgroundColor: colors.bgCard, borderRadius: RADIUS.full, paddingVertical: 6, paddingHorizontal: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.purpleDim },
    autoSavePillError: { borderColor: colors.danger || '#ef4444' },
    autoSaveText:      { color: colors.grayLight, fontSize: 11, fontWeight: '600' },
    autoSaveTextError: { color: colors.danger || '#ef4444' },

    // Ejercicios
    exCard:            { backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 16, marginBottom: 14 },
    exName:            { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 12 },
    setHeader:         { flexDirection: 'row', marginBottom: 6, alignItems: 'center' },
    setRow:            { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    setCol:            { flex: 1, textAlign: 'center' },
    setLabel:          { fontSize: 11, color: colors.gray, fontWeight: '600', textTransform: 'uppercase' },
    setNum:            { fontSize: 14, color: colors.gray },
    setPrev:           { fontSize: 13, color: colors.purpleLight },
    setInput:          { backgroundColor: colors.bgInput, borderRadius: RADIUS.sm, paddingVertical: 8, fontSize: 14, color: colors.white, textAlign: 'center', marginHorizontal: 3 },
    setInputDone:      { opacity: 0.45 },
    setRowDone:        { opacity: 0.85 },
    setNumDone:        { color: colors.lime },
    setActions:        { width: 76, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
    doneBtn:           { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.purpleDim, alignItems: 'center', justifyContent: 'center' },
    doneBtnActive:     { backgroundColor: colors.lime, borderColor: colors.lime },
    doneBtnTxt:        { fontSize: 14, color: colors.gray, fontWeight: '700', lineHeight: 16 },
    doneBtnTxtActive:  { color: '#0f0a1e' },
    removeBtn:         { minWidth: 34, height: 30, borderRadius: 15, paddingHorizontal: 6, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.purpleDim, alignItems: 'center', justifyContent: 'center' },
    removeBtnDisabled: { opacity: 0.25 },
    removeTxt:         { color: colors.grayLight, fontSize: 10, fontWeight: '700' },
    addSetBtn:         { alignSelf: 'flex-start', marginTop: 4 },
    addSetTxt:         { color: colors.purpleLight, fontSize: 13, fontWeight: '600' },

    // Acciones
    actions:           { gap: 12, marginTop: 8 },
    saveBtn:           { borderWidth: 1, borderColor: colors.purple, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center' },
    saveBtnText:       { color: colors.purpleLight, fontWeight: '600' },
    finishBtn:         { backgroundColor: colors.lime, borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center' },
    finishBtnText:     { color: '#0f0a1e', fontWeight: '700', fontSize: 16 },

    // Reacción flotante
    reaction:          { position: 'absolute', top: 130, left: 14, right: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 12, borderWidth: 1, borderColor: colors.purple, zIndex: 99, shadowColor: '#7c3aed', shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
    reactionBubble:    { flex: 1 },
    reactionText:      { color: colors.white, fontSize: 13, fontStyle: 'italic', lineHeight: 18 },

    // Modals
    modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', alignItems: 'center', justifyContent: 'center' },
    modalCard:         { backgroundColor: colors.bgCard, borderRadius: RADIUS.xl, padding: 28, alignItems: 'center', gap: 14, marginHorizontal: 20, borderWidth: 1, borderColor: colors.purple, shadowColor: '#7c3aed', shadowOpacity: 0.5, shadowRadius: 20, elevation: 12 },
    modalTitle:        { fontSize: 20, fontWeight: '700', color: colors.white, textAlign: 'center' },
    modalPhrase:       { fontSize: 14, color: colors.grayLight, textAlign: 'center', lineHeight: 20 },
    modalBtn:          { backgroundColor: colors.lime, borderRadius: RADIUS.full, paddingVertical: 13, paddingHorizontal: 28, marginTop: 4, alignSelf: 'stretch', alignItems: 'center' },
    modalBtnText:      { color: '#0f0a1e', fontWeight: '700', fontSize: 15 },

    // Recomendación Panchita
    recBadge:          { backgroundColor: colors.purple, borderRadius: RADIUS.full, paddingVertical: 5, paddingHorizontal: 16 },
    recBadgeText:      { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
    recExList:         { alignSelf: 'stretch', backgroundColor: colors.bgInput, borderRadius: RADIUS.md, padding: 12 },
    recExItem:         { fontSize: 13, color: colors.white, lineHeight: 22 },

    // Crear rutina
    createLabel:       { fontSize: 13, fontWeight: '700', color: colors.grayLight, alignSelf: 'flex-start' },
    createInput:       { backgroundColor: colors.bgInput, borderRadius: RADIUS.md, padding: 12, fontSize: 14, color: colors.white, borderWidth: 1, borderColor: colors.purpleDim, alignSelf: 'stretch' },
    createExRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    createRemoveBtn:   { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.purpleDim, alignItems: 'center', justifyContent: 'center' },
    createRemoveTxt:   { color: colors.gray, fontSize: 12 },
    addExBtn:          { paddingVertical: 10, alignItems: 'center' },
    addExTxt:          { color: colors.purpleLight, fontWeight: '600', fontSize: 13 },
    createBtn:         { borderRadius: RADIUS.full, paddingVertical: 13, alignItems: 'center', minHeight: 46, justifyContent: 'center' },
    createBtnTxt:      { fontWeight: '700', fontSize: 15 },
    createError:       { color: colors.danger || '#ef4444', fontSize: 13, lineHeight: 18, textAlign: 'center', alignSelf: 'stretch', marginTop: 8 },
  });
}
