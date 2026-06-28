import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  TouchableOpacity, TextInput, Modal, Animated, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Share } from 'react-native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getLogs, saveLog, getWeightUnit, shareRoutine } from '../storage';
import Panchita from '../components/Panchita';
import ConfirmModal from '../components/ConfirmModal';

const TODAY = new Date().toISOString().split('T')[0];
const KG_TO_LB = 2.20462;

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

const MUSCLE_EXERCISES = {
  chest:     ['Press banca', 'Press inclinado', 'Aperturas', 'Fondos', 'Pullover'],
  back:      ['Dominadas', 'Remo con barra', 'Jalón al pecho', 'Peso muerto', 'Remo en polea'],
  legs:      ['Sentadilla', 'Prensa', 'Peso muerto rumano', 'Curl femoral', 'Pantorrilla', 'Extensión cuád'],
  shoulders: ['Press militar', 'Elevaciones laterales', 'Face pull', 'Pájaro', 'Press Arnold'],
  arms:      ['Curl barra', 'Curl martillo', 'Press francés', 'Extensión cable', 'Curl concentrado'],
};
const MUSCLE_LABELS = { chest:'pecho', back:'espalda', legs:'piernas', shoulders:'hombros', arms:'brazos' };

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

function normalizeExercises(raw) {
  if (!raw) return [];
  if (typeof raw === 'string') return raw.split(',').map(s=>s.trim()).filter(Boolean);
  if (Array.isArray(raw)) {
    return raw.map(ex=>{
      if (typeof ex === 'string' && ex.trim()) return ex.trim();
      if (ex && typeof ex === 'object' && ex.name) return String(ex.name).trim();
      return null;
    }).filter(Boolean);
  }
  return Object.values(raw).map(ex=>{
    if (typeof ex === 'string' && ex.trim()) return ex.trim();
    if (ex && typeof ex === 'object' && ex.name) return String(ex.name).trim();
    return null;
  }).filter(Boolean);
}

function convertWeightValue(val, from, to) {
  if (from===to||!val) return val;
  const n = parseFloat(val);
  if (isNaN(n)) return val;
  const result = from==='kg' ? n*KG_TO_LB : n/KG_TO_LB;
  return String(Math.round(result*10)/10);
}

// ─── Componente principal ──────────────────────────────────
// Props: routine (object), onClose () => void, onFinish () => void
export default function ActiveWorkoutScreen({ routine, onClose, onFinish }) {
  const { colors } = useTheme();
  const s = useMemo(()=>createStyles(colors),[colors]);

  const [log, setLog]             = useState(null);
  const [lastLog, setLastLog]     = useState(null);
  const [saving, setSaving]       = useState(false);
  const [autoSaveState, setAutoSaveState] = useState('idle');
  const [completed, setCompleted] = useState(false);
  const [weightUnit, setWeightUnit] = useState('kg');

  const [panchitaReaction, setPanchitaReaction] = useState(false);
  const [reactionPhrase, setReactionPhrase]     = useState('');

  const [showSavePop, setShowSavePop] = useState(false);
  const [savePopPhrase, setSavePopPhrase] = useState('');
  const saveFadeAnim = useRef(new Animated.Value(0)).current;

  const [showCompletion, setShowCompletion]     = useState(false);
  const [completionPhrase, setCompletionPhrase] = useState('');

  const [showAddExModal, setShowAddExModal] = useState(false);
  const [addExSearch, setAddExSearch]       = useState('');

  const [showMenu, setShowMenu] = useState(false);

  // Compartir
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCode, setShareCode]           = useState('');
  const [codeCopied, setCodeCopied]         = useState(false);
  const [shareWarning, setShareWarning]     = useState('');

  const [confirmModal, setConfirmModal] = useState({
    visible:false, title:'', message:'', confirmText:'Confirmar',
    confirmDestructive:false, onConfirm:null, showCancel:true,
  });

  const autoSaveTimerRef = useRef(null);
  const lastSavedLogRef  = useRef('');

  // Cargar unidad una vez
  useEffect(()=>{ getWeightUnit().then(u=>setWeightUnit(u)); },[]);

  // Iniciar sesión cuando cambia la rutina
  useEffect(()=>{
    if (!routine) return;
    initSession(routine);
    return ()=>{ if(autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[routine?.id]);

  // Cleanup al desmontar
  useEffect(()=>()=>{ if(autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); },[]);

  // Autosave debounced 900ms
  useEffect(()=>{
    if (!log||!routine||completed) {
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
  },[log, routine?.id, completed]);

  // ─── ConfirmModal helpers ─────────────────────────────────
  function showConfirm({ title, message='', onConfirm, confirmDestructive=false, confirmText='Confirmar' }) {
    setConfirmModal({ visible:true, title, message, onConfirm, confirmDestructive, confirmText, showCancel:true });
  }
  function hideConfirm() { setConfirmModal(prev=>({ ...prev, visible:false })); }
  function showInfo(title, message='') {
    setConfirmModal({ visible:true, title, message, onConfirm:hideConfirm, confirmDestructive:false, confirmText:'Ok', showCancel:false });
  }

  // ─── Iniciar sesión ───────────────────────────────────────
  async function initSession(workout) {
    const exerciseNames = normalizeExercises(workout.exercises);
    const blankLog = {
      date: TODAY,
      workoutId: workout.id,
      workoutName: workout.name || workout.day,
      completed: false,
      exercises: exerciseNames.map(name=>({ name, unit: weightUnit, sets:[{ reps:'', weight:'' }] })),
    };
    setLog(blankLog);
    setCompleted(false);
    setLastLog(null);
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
        const validatedLog = {
          ...todayLog,
          exercises: (todayLog.exercises||[]).map((ex,i)=>({
            ...ex,
            name: ex.name || exerciseNames[i] || `Ejercicio ${i+1}`,
            unit: ex.unit || weightUnit,
          })),
        };
        setLog(validatedLog);
        setCompleted(todayLog.completed);
        lastSavedLogRef.current = logSignature(validatedLog);
        setAutoSaveState('saved');
      } else if (workout.isRecurring && last) {
        setLog({
          ...blankLog,
          exercises: blankLog.exercises.map(ex=>{
            const lastEx = last.exercises?.find(e=>e.name===ex.name);
            if (!lastEx) return ex;
            return {
              ...ex,
              unit: lastEx.unit || ex.unit,
              sets: (lastEx.sets||[]).map(st=>({ reps:st.reps||'', weight:st.weight||'', done:false })),
            };
          }),
        });
      }
    } catch(e) { console.warn('initSession logs load failed:',e); }
  }

  // ─── Set management ──────────────────────────────────────
  const updateSet = useCallback((exIdx, setIdx, field, value)=>{
    const clean = String(value||'').replace(',','.');
    const valid = field==='reps' ? clean.replace(/[^0-9]/g,'') : clean.replace(/[^0-9.]/g,'');
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
      if (ex.sets.length>1) {
        return { ...prev, exercises: prev.exercises.map((e,ei)=>ei!==exIdx?e:{ ...e, sets:e.sets.filter((_,si)=>si!==setIdx) }) };
      }
      return { ...prev, exercises: prev.exercises.map((e,ei)=>ei!==exIdx?e:{ ...e, sets:[{ reps:'', weight:'', done:false }] }) };
    });
  },[]);

  const removeExercise = useCallback((exIdx)=>{
    setLog(prev=>({ ...prev, exercises: prev.exercises.filter((_,ei)=>ei!==exIdx) }));
  },[]);

  const moveExercise = useCallback((exIdx, dir)=>{
    setLog(prev=>{
      const exs = [...(prev.exercises||[])];
      const target = exIdx + dir;
      if (target < 0 || target >= exs.length) return prev;
      [exs[exIdx], exs[target]] = [exs[target], exs[exIdx]];
      return { ...prev, exercises: exs };
    });
  },[]);

  const setExUnit = useCallback((exIdx, newUnit)=>{
    setLog(prev=>{
      const ex = prev.exercises[exIdx];
      if (!ex) return prev;
      const oldUnit = ex.unit || 'kg';
      if (oldUnit===newUnit) return prev;
      return {
        ...prev,
        exercises: prev.exercises.map((e,ei)=>{
          if (ei!==exIdx) return e;
          return { ...e, unit:newUnit, sets:e.sets.map(st=>({ ...st, weight:st.weight?convertWeightValue(st.weight,oldUnit,newUnit):st.weight })) };
        }),
      };
    });
  },[]);

  function addExerciseToSession(name) {
    const trimmed = (name||'').trim();
    if (!trimmed||!log) return;
    setLog(prev=>({ ...prev, exercises:[...prev.exercises,{ name:trimmed, unit:weightUnit, sets:[{ reps:'', weight:'' }] }] }));
    setShowAddExModal(false);
    setAddExSearch('');
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
    return lastLog.exercises?.find(e=>e.name===exName)?.unit || null;
  }

  function getLastValue(exName, setIdx, field) {
    if (!lastLog) return null;
    return lastLog.exercises?.find(e=>e.name===exName)?.sets?.[setIdx]?.[field] || null;
  }

  // ─── Back con prompt de guardado ─────────────────────────
  function handleBack() {
    if (logHasProgress(log) && !completed) {
      showConfirm({
        title: '¿Salir del entrenamiento?',
        message: 'Podés guardar el progreso antes de salir.',
        confirmText: 'Guardar y salir',
        onConfirm: async () => {
          hideConfirm();
          if (log) { try { await saveLog(log); } catch(e) { console.warn(e); } }
          onClose();
        },
      });
    } else {
      onClose();
    }
  }

  // ─── Compartir ────────────────────────────────────────────
  function openShareModal() {
    setShareCode(''); setShareWarning(''); setCodeCopied(false);
    setShowShareModal(true);
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let localCode = '';
    for (let i=0; i<6; i++) localCode += chars[Math.floor(Math.random()*chars.length)];
    setShareCode(localCode);
    shareRoutine({ ...routine, _presetCode: localCode }).catch(()=>{
      setShareWarning('Código generado localmente — puede que otros no puedan importarlo aún.');
    });
  }

  async function copyShareCode() {
    if (!shareCode) return;
    try {
      await Share.share({ message:`Mi rutina en PanchitaFit: ${shareCode}` });
      setCodeCopied(true);
      setTimeout(()=>setCodeCopied(false),3000);
    } catch {}
  }

  // ─── Render ──────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>

      {/* Popup autosave */}
      {showSavePop&&(
        <Animated.View style={[s.autosavePop,{opacity:saveFadeAnim}]} pointerEvents="none">
          <Panchita state="happy" size={56} autoWave={false}/>
          <Text style={s.autosavePopText}>{savePopPhrase}</Text>
        </Animated.View>
      )}

      {/* Reacción flotante */}
      {panchitaReaction&&(
        <View style={s.reaction}>
          <Panchita state="happy" size={44}/>
          <View style={{flex:1}}>
            <Text style={s.reactionText}>{reactionPhrase}</Text>
          </View>
        </View>
      )}

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity onPress={handleBack} style={s.headerBack} activeOpacity={0.7}>
          <Text style={s.headerBackTxt}>← Volver</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{routine?.name||routine?.day||''}</Text>
        <TouchableOpacity onPress={()=>setShowMenu(true)} style={s.headerMenuBtn} activeOpacity={0.7}>
          <Text style={s.headerMenuTxt}>⋯</Text>
        </TouchableOpacity>
      </View>

      {/* Barra de estado guardado */}
      <View style={s.saveBar}>
        {autoSaveState==='saving'&&<Text style={s.saveBarTxt}>Guardando...</Text>}
        {autoSaveState==='saved'&&!completed&&<Text style={s.saveBarTxt}>✓ Guardado</Text>}
        {autoSaveState==='error'&&<Text style={[s.saveBarTxt,{color:'#ef4444'}]}>⚠ Error al guardar</Text>}
        {completed&&<Text style={[s.saveBarTxt,{color:colors.lime||'#a3e635'}]}>Sesión completada ✓</Text>}
      </View>

      {/* Modal completado */}
      <Modal visible={showCompletion} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Panchita state="happy" size={100}/>
            <Text style={s.modalTitle}>Rutina completada</Text>
            <Text style={s.modalPhrase}>{completionPhrase}</Text>
            <TouchableOpacity style={s.modalBtn} onPress={()=>{ setShowCompletion(false); onFinish?.(); }}>
              <Text style={s.modalBtnText}>Volver al inicio</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={()=>setShowCompletion(false)} style={{marginTop:4}}>
              <Text style={{color:colors.gray,fontSize:13,textAlign:'center'}}>Seguir viendo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal menú ⋯ */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={()=>setShowMenu(false)}>
        <View style={s.bsOverlay}>
          <TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={()=>setShowMenu(false)}/>
          <View style={s.bottomSheet}>
            <View style={s.bottomSheetHandle}/>
            <Text style={s.bottomSheetTitle} numberOfLines={1}>{routine?.name||routine?.day}</Text>
            <TouchableOpacity style={s.bsOption} onPress={()=>{ setShowMenu(false); setTimeout(()=>setShowAddExModal(true),180); }}>
              <Text style={s.bsOptionTxt}>+ Agregar ejercicio</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.bsOption} onPress={()=>{ setShowMenu(false); setTimeout(()=>openShareModal(),180); }}>
              <Text style={s.bsOptionTxt}>🔗 Compartir rutina</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.bsOption,{borderTopWidth:1,borderTopColor:colors.purpleDim,marginTop:4}]} onPress={()=>setShowMenu(false)}>
              <Text style={[s.bsOptionTxt,{color:colors.gray}]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal compartir */}
      <Modal visible={showShareModal} transparent animationType="fade" onRequestClose={()=>setShowShareModal(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard,{width:'88%'}]}>
            <Panchita state="happy" size={90}/>
            <Text style={s.modalTitle}>Compartir rutina</Text>
            {shareCode?(
              <>
                <Text style={s.shareSubtitle}>{routine?.name||routine?.day}</Text>
                <TouchableOpacity style={s.shareCodeBox} onPress={copyShareCode} activeOpacity={0.7}>
                  <Text style={s.shareCodeText}>{shareCode}</Text>
                  <Text style={s.shareCodeHint}>{codeCopied?'✓ Compartido!':'Tap para compartir'}</Text>
                </TouchableOpacity>
                {shareWarning
                  ?<Text style={s.shareWarningText}>{shareWarning}</Text>
                  :<Text style={s.sharePanchitaPhrase}>"Ahora todos van a saber que entrenás."</Text>
                }
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

      {/* Modal agregar ejercicio */}
      <Modal visible={showAddExModal} transparent animationType="slide" onRequestClose={()=>{ setShowAddExModal(false); setAddExSearch(''); }}>
        <View style={s.bsOverlay}>
          <TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={()=>{ setShowAddExModal(false); setAddExSearch(''); }}/>
          <View style={[s.bottomSheet,{paddingHorizontal:0,paddingTop:16,paddingBottom:32}]}>
            <View style={s.bottomSheetHandle}/>
            <Text style={[s.bottomSheetTitle,{marginBottom:12}]}>Agregar ejercicio</Text>
            <View style={{paddingHorizontal:16,marginBottom:12}}>
              <TextInput
                style={s.createInput}
                placeholder="Buscar o escribir nombre libre..."
                placeholderTextColor={colors.gray}
                value={addExSearch}
                onChangeText={setAddExSearch}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={()=>addExSearch.trim()&&addExerciseToSession(addExSearch)}
              />
            </View>
            <ScrollView style={{maxHeight:320}} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
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

      {/* ── Contenido principal ── */}
      <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">

        {completed&&(
          <View style={s.completedBanner}>
            <Text style={s.completedText}>Sesión completada hoy ✓</Text>
          </View>
        )}

        {log&&(log.exercises||[]).length===0&&(
          <View style={s.emptyExState}>
            <Text style={s.emptyExTitle}>Sin ejercicios</Text>
            <Text style={s.emptyExText}>Eliminaste todos los ejercicios de esta sesión.</Text>
            <TouchableOpacity style={s.emptyExBtn} onPress={()=>initSession(routine)}>
              <Text style={s.emptyExBtnText}>Recargar rutina</Text>
            </TouchableOpacity>
          </View>
        )}

        {(log?.exercises||[]).map((ex, exIdx)=>(
          <View key={exIdx} style={s.exCard}>
            {/* Header ejercicio */}
            <View style={s.exHeader}>
              <Text style={[s.exName,{flex:1,marginBottom:0}]}>{ex.name||`Ejercicio ${exIdx+1}`}</Text>
              <View style={s.exUnitToggle}>
                {['kg','lb'].map(u=>(
                  <TouchableOpacity key={u} style={[s.exUnitBtn,(ex.unit||weightUnit)===u&&s.exUnitBtnActive]} onPress={()=>setExUnit(exIdx,u)}>
                    <Text style={[s.exUnitTxt,(ex.unit||weightUnit)===u&&s.exUnitTxtActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity style={s.exOrderBtn} onPress={()=>moveExercise(exIdx,-1)} activeOpacity={0.6} disabled={exIdx===0}>
                <Text style={[s.exOrderTxt,exIdx===0&&{opacity:0.22}]}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.exOrderBtn} onPress={()=>moveExercise(exIdx,1)} activeOpacity={0.6} disabled={exIdx===(log?.exercises?.length-1)}>
                <Text style={[s.exOrderTxt,exIdx===(log?.exercises?.length-1)&&{opacity:0.22}]}>↓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.exRemoveBtn} activeOpacity={0.7}
                onPress={()=>showConfirm({
                  title:'¿Eliminar ejercicio?',
                  message:`Se eliminará "${ex.name||`Ejercicio ${exIdx+1}`}" de esta sesión.`,
                  confirmText:'Eliminar', confirmDestructive:true,
                  onConfirm:()=>{ hideConfirm(); removeExercise(exIdx); },
                })}
              >
                <Text style={s.exRemoveTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Sets */}
            {(ex.sets||[]).map((st, setIdx)=>{
              const prevReps   = getLastValue(ex.name, setIdx, 'reps');
              const prevWeight = getLastValue(ex.name, setIdx, 'weight');
              const isDone     = !!st.done;
              const isOnly     = ex.sets.length===1;
              return (
                <View key={setIdx} style={[s.setCard, isDone&&s.setCardDone]}>
                  <View style={s.setCardHeader}>
                    <TouchableOpacity style={s.setDoneArea} onPress={()=>toggleSetDone(exIdx,setIdx)} activeOpacity={0.7}>
                      <View style={[s.setCircle, isDone&&s.setCircleDone]}>
                        <Text style={[s.setCircleTxt, isDone&&s.setCircleTxtDone]}>{isDone?'✓':setIdx+1}</Text>
                      </View>
                      <Text style={[s.setLabel, isDone&&s.setLabelDone]}>{isDone?'Completado':`Set ${setIdx+1}`}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.setDelBtn, isOnly&&s.setDelBtnSoft]} onPress={()=>removeSet(exIdx,setIdx)} activeOpacity={0.7}>
                      <Text style={[s.setDelTxt, isOnly&&s.setDelTxtSoft]}>{isOnly?'limpiar':'−'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.setInputRow}>
                    <View style={s.setInputGroup}>
                      <Text style={s.setInputLabel}>REPS</Text>
                      <TextInput
                        style={[s.setInput, isDone&&s.setInputDone]}
                        value={String(st.reps||'')}
                        onChangeText={v=>updateSet(exIdx,setIdx,'reps',v)}
                        keyboardType="numeric" placeholder="0"
                        placeholderTextColor={colors.gray}
                        editable={!isDone} selectTextOnFocus returnKeyType="next"
                      />
                      {!isDone&&<Text style={s.setAntLabel}>ant: {prevReps||'—'}</Text>}
                    </View>
                    <View style={s.setInputGroup}>
                      <Text style={s.setInputLabel}>{(ex.unit||weightUnit).toUpperCase()}</Text>
                      <TextInput
                        style={[s.setInput, isDone&&s.setInputDone]}
                        value={String(st.weight||'')}
                        onChangeText={v=>updateSet(exIdx,setIdx,'weight',v)}
                        keyboardType="numeric" placeholder="0"
                        placeholderTextColor={colors.gray}
                        editable={!isDone} selectTextOnFocus returnKeyType="done"
                      />
                      {!isDone&&<Text style={s.setAntLabel}>ant: {prevWeight?`${prevWeight}${getLastExUnit(ex.name)||ex.unit||weightUnit}`:'—'}</Text>}
                    </View>
                  </View>
                </View>
              );
            })}

            <View style={s.exFooter}>
              <TouchableOpacity style={s.addSetBtn} onPress={()=>addSet(exIdx)}>
                <Text style={s.addSetTxt}>+ Set</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {log&&(
          <TouchableOpacity style={s.addExToSessionBtn} onPress={()=>setShowAddExModal(true)} activeOpacity={0.7}>
            <Text style={s.addExToSessionTxt}>+ Agregar ejercicio</Text>
          </TouchableOpacity>
        )}

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

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex:1, backgroundColor:colors.bg },

    // Header
    header: { flexDirection:'row', alignItems:'center', paddingHorizontal:14, paddingVertical:12, backgroundColor:colors.bgCard, borderBottomWidth:1, borderBottomColor:colors.purpleDim, minHeight:52 },
    headerBack: { paddingVertical:8, paddingRight:12, minWidth:80 },
    headerBackTxt: { color:colors.purpleLight, fontSize:14, fontWeight:'600' },
    headerTitle: { flex:1, fontSize:16, fontWeight:'700', color:colors.white, textAlign:'center' },
    headerMenuBtn: { minWidth:80, height:44, alignItems:'flex-end', justifyContent:'center', paddingLeft:12 },
    headerMenuTxt: { fontSize:22, color:colors.gray, fontWeight:'900', paddingRight:4 },

    // Save bar
    saveBar: { height:26, paddingHorizontal:14, backgroundColor:colors.bgCard, borderBottomWidth:1, borderBottomColor:colors.purpleDim, justifyContent:'center', alignItems:'flex-end' },
    saveBarTxt: { fontSize:11, color:colors.gray },

    // Autosave popup
    autosavePop: { position:'absolute', bottom:88, left:12, flexDirection:'row', alignItems:'center', gap:8, backgroundColor:colors.bgCard, borderRadius:RADIUS.lg, padding:10, borderWidth:1, borderColor:colors.purpleDim, zIndex:999, maxWidth:'72%', shadowColor:'#7c3aed', shadowOpacity:0.3, shadowRadius:6, elevation:8 },
    autosavePopText: { color:colors.white, fontSize:12, lineHeight:17, fontStyle:'italic', flex:1 },

    // Reacción
    reaction: { position:'absolute', top:120, left:14, right:14, flexDirection:'row', alignItems:'center', gap:10, backgroundColor:colors.bgCard, borderRadius:RADIUS.lg, padding:12, borderWidth:1, borderColor:colors.purple, zIndex:99, shadowColor:'#7c3aed', shadowOpacity:0.4, shadowRadius:8, elevation:8 },
    reactionText: { color:colors.white, fontSize:13, fontStyle:'italic', lineHeight:18 },

    // Scroll
    scroll: { padding:12, paddingBottom:80 },

    // Completado
    completedBanner: { backgroundColor:colors.purpleDim, borderRadius:RADIUS.md, padding:10, marginBottom:12, alignItems:'center', borderWidth:1, borderColor:colors.purple },
    completedText: { color:colors.purpleLight, fontWeight:'600', fontSize:14 },

    // Empty exercises
    emptyExState: { alignItems:'center', paddingVertical:60, paddingHorizontal:24 },
    emptyExTitle: { fontSize:17, fontWeight:'700', color:colors.white, marginBottom:6 },
    emptyExText:  { fontSize:14, color:colors.gray, textAlign:'center', marginBottom:20, lineHeight:20 },
    emptyExBtn:   { backgroundColor:colors.purple, borderRadius:RADIUS.full, paddingVertical:12, paddingHorizontal:28 },
    emptyExBtnText: { color:'#fff', fontWeight:'700', fontSize:15 },

    // Exercise card
    exCard: { backgroundColor:colors.bgCard, borderRadius:RADIUS.lg, padding:14, marginBottom:14 },
    exHeader: { flexDirection:'row', alignItems:'center', marginBottom:12, gap:8 },
    exName: { fontSize:17, fontWeight:'800', color:colors.white, letterSpacing:0.1 },
    exUnitToggle: { flexDirection:'row', backgroundColor:colors.bgInput, borderRadius:RADIUS.full, padding:2, borderWidth:1, borderColor:colors.purpleDim, flexShrink:0 },
    exUnitBtn:       { paddingHorizontal:8, paddingVertical:4, borderRadius:RADIUS.full, minWidth:30, alignItems:'center' },
    exUnitBtnActive: { backgroundColor:colors.purple },
    exUnitTxt:       { fontSize:11, fontWeight:'700', color:colors.gray },
    exUnitTxtActive: { color:colors.accentText||'#fff' },
    exOrderBtn: { width:28, height:32, alignItems:'center', justifyContent:'center' },
    exOrderTxt: { fontSize:18, color:colors.gray, fontWeight:'700', lineHeight:22 },
    exRemoveBtn: { width:44, height:44, alignItems:'center', justifyContent:'center', marginLeft:4 },
    exRemoveTxt: { fontSize:20, color:'#ef4444', fontWeight:'700', lineHeight:24 },
    exFooter: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:8, paddingTop:10, borderTopWidth:1, borderTopColor:colors.purpleDim },
    addSetBtn: { paddingVertical:10, paddingHorizontal:12, minHeight:44, justifyContent:'center' },
    addSetTxt: { color:colors.purpleLight, fontSize:15, fontWeight:'700' },

    // Set card
    setCard: { backgroundColor:colors.bgInput, borderRadius:RADIUS.md, padding:12, marginBottom:10, borderWidth:1, borderColor:colors.purpleDim },
    setCardDone: { borderColor:colors.purple, opacity:0.72 },
    setCardHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10, minHeight:44 },
    setDoneArea: { flexDirection:'row', alignItems:'center', gap:8, flex:1, minHeight:44 },
    setCircle: { width:28, height:28, borderRadius:14, borderWidth:2, borderColor:colors.purpleDim, alignItems:'center', justifyContent:'center' },
    setCircleDone: { backgroundColor:colors.purple, borderColor:colors.purple },
    setCircleTxt: { fontSize:12, fontWeight:'800', color:colors.gray },
    setCircleTxtDone: { color:'#fff' },
    setLabel: { fontSize:14, fontWeight:'600', color:colors.grayLight },
    setLabelDone: { color:colors.purpleLight },
    setDelBtn: { paddingHorizontal:12, paddingVertical:10, borderRadius:RADIUS.full, backgroundColor:colors.bgCard, borderWidth:1, borderColor:colors.purpleDim, minWidth:44, minHeight:44, alignItems:'center', justifyContent:'center' },
    setDelBtnSoft: { borderColor:'transparent', backgroundColor:'transparent' },
    setDelTxt: { fontSize:18, fontWeight:'700', color:colors.gray },
    setDelTxtSoft: { fontSize:12, color:colors.gray },
    setInputRow: { flexDirection:'row', gap:10 },
    setInputGroup: { flex:1, gap:5 },
    setInputLabel: { fontSize:10, fontWeight:'700', color:colors.gray, textTransform:'uppercase', letterSpacing:1 },
    setInput: { height:52, backgroundColor:colors.bg, borderRadius:RADIUS.sm, borderWidth:1.5, borderColor:colors.purpleDim, fontSize:22, fontWeight:'700', color:colors.white, textAlign:'center' },
    setInputDone: { opacity:0.35, borderColor:'transparent' },
    setAntLabel: { fontSize:11, color:'#666', marginTop:4, textAlign:'center' },

    // Actions
    addExToSessionBtn: { borderWidth:1.5, borderColor:colors.purpleDim, borderRadius:RADIUS.full, paddingVertical:13, alignItems:'center', marginBottom:12, minHeight:48, justifyContent:'center', borderStyle:'dashed' },
    addExToSessionTxt: { color:colors.purpleLight, fontWeight:'700', fontSize:15 },
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

    // Share
    shareSubtitle: { fontSize:14, color:colors.grayLight, marginTop:2, marginBottom:16, textAlign:'center' },
    shareCodeBox: { backgroundColor:colors.bgInput, borderRadius:RADIUS.md, paddingVertical:20, paddingHorizontal:32, alignItems:'center', marginBottom:10, borderWidth:2, borderColor:colors.purple, width:'100%' },
    shareCodeText: { fontSize:36, fontWeight:'900', color:colors.purple, letterSpacing:6 },
    shareCodeHint: { fontSize:12, color:colors.gray, marginTop:6 },
    sharePanchitaPhrase: { fontSize:13, color:colors.gray, fontStyle:'italic', textAlign:'center', paddingHorizontal:16, marginBottom:8 },
    shareExpiry: { fontSize:12, color:colors.gray, textAlign:'center', marginBottom:16 },
    shareWarningText: { fontSize:12, color:colors.danger||'#ef4444', textAlign:'center', paddingHorizontal:8, marginBottom:8, lineHeight:17 },

    // Bottom sheet
    bsOverlay: { flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.72)' },
    bottomSheet: { backgroundColor:colors.bgCard, borderTopLeftRadius:RADIUS.xl, borderTopRightRadius:RADIUS.xl, paddingBottom:40, paddingTop:12, borderTopWidth:1, borderColor:colors.purpleDim },
    bottomSheetHandle: { width:40, height:4, borderRadius:2, backgroundColor:colors.purpleDim, alignSelf:'center', marginBottom:14 },
    bottomSheetTitle: { fontSize:16, fontWeight:'700', color:colors.grayLight, paddingHorizontal:20, marginBottom:8 },
    bsOption: { paddingVertical:16, paddingHorizontal:20, minHeight:52 },
    bsOptionTxt: { fontSize:16, color:colors.white, fontWeight:'500' },

    createInput: { backgroundColor:colors.bgInput, borderRadius:RADIUS.md, padding:12, fontSize:14, color:colors.white, borderWidth:1, borderColor:colors.purpleDim, alignSelf:'stretch' },
  });
}
