import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Modal, View, Text, StyleSheet, ScrollView, SafeAreaView,
  TouchableOpacity, TextInput, ActivityIndicator, Animated, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { RADIUS } from '../constants/theme';
import { getWeeklyVolume, saveWeeklyReview } from '../storage';
import Panchita from '../components/Panchita';
import { GROQ_API_KEY } from '../config';

const GROQ_URL   = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_KEY   = GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.1-8b-instant';

const REFLECTION_PHRASES = [
  '¡Mira quién no abandonó! Cuéntame.',
  'Bien. ¿Y cómo te sentiste esta semana, atleta?',
  'Sobreviviste otra semana. Eso es algo.',
  '¿Vas a contarme cómo estuvo o me lo tengo que imaginar?',
];
const FALLBACK_GOAL_PHRASES = [
  goal => `"${goal}". Lo escucho. Lo veo difícil, pero bueno.`,
  goal => `"${goal}". Claro que sí. Ya veremos.`,
  goal => `"${goal}". Suena ambicioso. Me gusta la energía.`,
  goal => `"${goal}". Anotado. Ahora a cumplirlo.`,
];

// ─── Frases de resumen ────────────────────────────────────
function getDayPhrase(completed, planned) {
  if (completed === 0) return '...Cero días. Espectacular rendimiento.';
  if (completed >= planned) return `¡${completed} de ${planned} días! Eso sí es presentarse.`;
  if (completed >= planned * 0.8) return `${completed} de ${planned} días. Casi. No sé si eso cuenta.`;
  return `${completed} de ${planned} días. La mitad, más o menos.`;
}
function getVolumePhrase(pct) {
  if (pct === 0 || isNaN(pct)) return null;
  if (pct > 20) return `${pct}% más de volumen que la semana anterior. Eso sí es progreso.`;
  if (pct > 0)  return `${pct}% más de volumen que la semana anterior. Algo es algo.`;
  if (pct < -20) return `${Math.abs(pct)}% menos volumen que la semana anterior. Tomaste vacaciones sin avisarme.`;
  if (pct < 0)  return `${Math.abs(pct)}% menos volumen que la semana anterior. Bájale al drama.`;
  return `El mismo volumen que la semana anterior. Ni mejor ni peor.`;
}

async function callGroqGoalResponse(goal, daysCompleted, volumeDeltaPct) {
  const prompt = `Eres Panchita, una salchicha musculosa y motivadora sarcástica.
El usuario completó ${daysCompleted} días esta semana${volumeDeltaPct !== 0 ? ` y tuvo ${volumeDeltaPct > 0 ? '+' : ''}${volumeDeltaPct}% de volumen vs la semana anterior` : ''}.
Su objetivo para la próxima semana es: "${goal}"
Responde con UNA sola frase corta (máximo 12 palabras), en español, sarcástica pero alentadora, sobre ese objetivo. Sin emojis. Sin comillas.`;

  if (!GROQ_KEY) return null;

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.9,
      }),
    });
    const json = await res.json();
    return json.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ─── Componente de paso ───────────────────────────────────
function StepCard({ children, style }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[{ opacity: fadeAnim }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── Modal principal ──────────────────────────────────────
export default function WeeklyReviewModal({ visible, weekKey, weekEnd, onClose }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [step, setStep]                   = useState(0); // 0:resumen 1:reflexión 2:objetivo 3:confirmación
  const [loading, setLoading]             = useState(true);
  const [daysCompleted, setDaysCompleted] = useState(0);
  const [daysPlanned]                     = useState(5); // objetivo fijo
  const [volThis, setVolThis]             = useState(0);
  const [volLast, setVolLast]             = useState(0);
  const [volumeDeltaPct, setVolumeDeltaPct] = useState(0);
  const [reflection, setReflection]       = useState('');
  const [nextGoal, setNextGoal]           = useState('');
  const [panchitaResponse, setPanchitaResponse] = useState('');
  const [loadingGoal, setLoadingGoal]     = useState(false);
  const [panchitaState, setPanchitaState] = useState('neutral');
  const [saved, setSaved]                 = useState(false);

  const reflectionPhrase = useRef(REFLECTION_PHRASES[Math.floor(Math.random() * REFLECTION_PHRASES.length)]).current;

  useEffect(() => {
    if (visible) {
      setStep(0); setLoading(true); setReflection(''); setNextGoal('');
      setPanchitaResponse(''); setSaved(false); setPanchitaState('neutral');
      loadData();
    }
  }, [visible]);

  async function loadData() {
    try {
      const [thisW, lastW] = await Promise.all([getWeeklyVolume(0), getWeeklyVolume(1)]);
      setDaysCompleted(thisW.daysCompleted);
      setVolThis(thisW.volume);
      setVolLast(lastW.volume);
      const pct = lastW.volume > 0
        ? Math.round(((thisW.volume - lastW.volume) / lastW.volume) * 100)
        : 0;
      setVolumeDeltaPct(pct);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoalSubmit() {
    if (!nextGoal.trim()) return;
    setLoadingGoal(true);
    try {
      const response = await callGroqGoalResponse(nextGoal.trim(), daysCompleted, volumeDeltaPct);
      const finalResponse = response ||
        FALLBACK_GOAL_PHRASES[Math.floor(Math.random() * FALLBACK_GOAL_PHRASES.length)](nextGoal.trim());
      setPanchitaResponse(finalResponse);
      setPanchitaState(daysCompleted >= 4 ? 'happy' : 'neutral');
      setStep(3);
    } finally {
      setLoadingGoal(false);
    }
  }

  async function handleFinish() {
    if (saved) { onClose(); return; }
    const review = {
      id: Date.now().toString(),
      weekKey,
      weekEnd,
      daysCompleted,
      daysPlanned,
      volumeThisWeek: volThis,
      volumeLastWeek: volLast,
      volumeDeltaPct,
      reflection: reflection.trim(),
      nextGoal: nextGoal.trim(),
      panchitaResponse,
      createdAt: new Date().toISOString(),
    };
    await saveWeeklyReview(review);
    setSaved(true);
    onClose();
  }

  const volumePhrase = getVolumePhrase(volumeDeltaPct);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={s.root}>
          {/* Header */}
          <View style={s.header}>
            <Text style={s.headerTitle}>Cierre semanal</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Indicador de pasos */}
          <View style={s.stepsRow}>
            {[0,1,2,3].map(i => (
              <View key={i} style={[s.stepDot, i <= step && s.stepDotActive, i < step && s.stepDotDone]} />
            ))}
          </View>

          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={s.centerBox}>
                <ActivityIndicator color={colors.purple} size="large" />
                <Text style={s.loadingTxt}>Panchita está calculando...</Text>
              </View>
            ) : (

              <>
                {/* ── PASO 0: Resumen ── */}
                {step === 0 && (
                  <StepCard>
                    <Panchita state={daysCompleted >= 4 ? 'happy' : 'neutral'} size={100} />
                    <Text style={s.stepLabel}>Esta semana</Text>
                    <Text style={s.weekDateRange}>{weekEnd}</Text>

                    <View style={s.summaryCard}>
                      <Text style={s.summaryIcon}>✅</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={s.summaryMain}>
                          {daysCompleted} de {daysPlanned} días entrenados
                        </Text>
                        <Text style={s.summaryPhrase}>{getDayPhrase(daysCompleted, daysPlanned)}</Text>
                      </View>
                    </View>

                    {volLast > 0 && (
                      <View style={s.summaryCard}>
                        <Text style={s.summaryIcon}>📊</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.summaryMain}>
                            {volThis.toLocaleString()} kg de volumen total
                          </Text>
                          {volumePhrase && (
                            <Text style={s.summaryPhrase}>{volumePhrase}</Text>
                          )}
                        </View>
                      </View>
                    )}

                    <TouchableOpacity style={s.btnPrimary} onPress={() => setStep(1)}>
                      <Text style={s.btnPrimaryTxt}>Continuar →</Text>
                    </TouchableOpacity>
                  </StepCard>
                )}

                {/* ── PASO 1: Reflexión ── */}
                {step === 1 && (
                  <StepCard>
                    <Panchita state="neutral" size={90} />
                    <Text style={s.stepLabel}>Reflexión</Text>
                    <Text style={s.panchitaQuote}>💬 {reflectionPhrase}</Text>

                    <TextInput
                      style={s.textArea}
                      value={reflection}
                      onChangeText={setReflection}
                      placeholder="Cómo me sentí esta semana..."
                      placeholderTextColor={colors.gray}
                      multiline
                      numberOfLines={5}
                      maxLength={500}
                      textAlignVertical="top"
                    />
                    <Text style={s.charCount}>{reflection.length}/500</Text>

                    <TouchableOpacity
                      style={s.btnPrimary}
                      onPress={() => setStep(2)}
                    >
                      <Text style={s.btnPrimaryTxt}>
                        {reflection.trim() ? 'Siguiente →' : 'Saltar →'}
                      </Text>
                    </TouchableOpacity>
                  </StepCard>
                )}

                {/* ── PASO 2: Objetivo ── */}
                {step === 2 && (
                  <StepCard>
                    <Panchita state="neutral" size={90} />
                    <Text style={s.stepLabel}>Objetivo</Text>
                    <Text style={s.panchitaQuote}>🎯 ¿Qué vas a hacer diferente la próxima semana?</Text>

                    <TextInput
                      style={s.textInput}
                      value={nextGoal}
                      onChangeText={setNextGoal}
                      placeholder="Ej: Entrenar 5 días, aumentar peso en press..."
                      placeholderTextColor={colors.gray}
                      returnKeyType="done"
                      maxLength={200}
                    />

                    <TouchableOpacity
                      style={[s.btnPrimary, (!nextGoal.trim() || loadingGoal) && s.btnDisabled]}
                      onPress={handleGoalSubmit}
                      disabled={!nextGoal.trim() || loadingGoal}
                    >
                      {loadingGoal ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={s.btnPrimaryTxt}>Preguntarle a Panchita →</Text>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity style={s.btnSecondary} onPress={() => {
                      setPanchitaResponse('');
                      setStep(3);
                    }}>
                      <Text style={s.btnSecondaryTxt}>Saltar sin objetivo</Text>
                    </TouchableOpacity>
                  </StepCard>
                )}

                {/* ── PASO 3: Confirmación ── */}
                {step === 3 && (
                  <StepCard>
                    <Panchita state={panchitaState} size={110} />
                    <Text style={s.stepLabel}>¡Semana cerrada!</Text>

                    {panchitaResponse ? (
                      <View style={s.panchitaResponseCard}>
                        <Text style={s.panchitaResponseTxt}>"{panchitaResponse}"</Text>
                        <Text style={s.panchitaResponseSub}>— Panchita</Text>
                      </View>
                    ) : (
                      <Text style={s.panchitaQuote}>
                        Datos guardados. Hasta la próxima semana, atleta.
                      </Text>
                    )}

                    {/* Mini resumen final */}
                    <View style={s.finalSummary}>
                      <View style={s.finalRow}>
                        <Text style={s.finalLabel}>Días completados</Text>
                        <Text style={s.finalVal}>{daysCompleted}/{daysPlanned}</Text>
                      </View>
                      {volThis > 0 && (
                        <View style={s.finalRow}>
                          <Text style={s.finalLabel}>Volumen total</Text>
                          <Text style={s.finalVal}>{volThis.toLocaleString()} kg</Text>
                        </View>
                      )}
                      {reflection.trim() ? (
                        <View style={s.finalRow}>
                          <Text style={s.finalLabel}>Reflexión</Text>
                          <Text style={[s.finalVal, { fontSize: 12, flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                            {reflection.trim()}
                          </Text>
                        </View>
                      ) : null}
                      {nextGoal.trim() ? (
                        <View style={s.finalRow}>
                          <Text style={s.finalLabel}>Objetivo</Text>
                          <Text style={[s.finalVal, { fontSize: 12, flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                            {nextGoal.trim()}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <TouchableOpacity style={[s.btnPrimary, { backgroundColor: colors.lime }]} onPress={handleFinish}>
                      <Text style={[s.btnPrimaryTxt, { color: '#0f0a1e' }]}>Guardar y cerrar</Text>
                    </TouchableOpacity>
                  </StepCard>
                )}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    root:         { flex: 1, backgroundColor: colors.bg },
    header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
    headerTitle:  { fontSize: 20, fontWeight: '800', color: colors.white },
    closeBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
    closeTxt:     { fontSize: 14, color: colors.gray },

    stepsRow:     { flexDirection: 'row', gap: 6, paddingHorizontal: 20, marginBottom: 8 },
    stepDot:      { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.purpleDim },
    stepDotActive:{ backgroundColor: colors.purple },
    stepDotDone:  { backgroundColor: colors.purpleLight },

    scroll:       { padding: 20, paddingBottom: 60, alignItems: 'center' },

    centerBox:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
    loadingTxt:   { color: colors.gray, marginTop: 16, fontSize: 14 },

    stepLabel:    { fontSize: 13, fontWeight: '700', color: colors.purpleLight, textTransform: 'uppercase', letterSpacing: 1, marginTop: 16, marginBottom: 4 },
    weekDateRange:{ fontSize: 12, color: colors.gray, marginBottom: 20 },

    summaryCard:  { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 16, gap: 12, marginBottom: 12, width: '100%', borderWidth: 1, borderColor: colors.purpleDim },
    summaryIcon:  { fontSize: 22 },
    summaryMain:  { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 4 },
    summaryPhrase:{ fontSize: 13, color: colors.purpleLight, fontStyle: 'italic' },

    panchitaQuote:{ fontSize: 15, color: colors.white, fontStyle: 'italic', textAlign: 'center', marginVertical: 18, paddingHorizontal: 8, lineHeight: 22 },

    textArea:     { backgroundColor: colors.bgCard, borderRadius: RADIUS.md, padding: 14, fontSize: 15, color: colors.white, borderWidth: 1, borderColor: colors.purpleDim, width: '100%', minHeight: 120, lineHeight: 22 },
    textInput:    { backgroundColor: colors.bgCard, borderRadius: RADIUS.md, padding: 14, fontSize: 15, color: colors.white, borderWidth: 1, borderColor: colors.purpleDim, width: '100%', marginBottom: 16 },
    charCount:    { fontSize: 11, color: colors.gray, alignSelf: 'flex-end', marginTop: 4, marginBottom: 16 },

    btnPrimary:   { backgroundColor: colors.purple, borderRadius: RADIUS.full, paddingVertical: 15, paddingHorizontal: 32, alignItems: 'center', width: '100%', marginTop: 8 },
    btnPrimaryTxt:{ color: '#fff', fontWeight: '800', fontSize: 16 },
    btnDisabled:  { opacity: 0.45 },
    btnSecondary: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
    btnSecondaryTxt:{ color: colors.gray, fontSize: 14 },

    panchitaResponseCard:{ backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 20, width: '100%', marginVertical: 16, borderWidth: 1, borderColor: colors.purpleDim, alignItems: 'center' },
    panchitaResponseTxt: { fontSize: 16, color: colors.white, fontStyle: 'italic', textAlign: 'center', lineHeight: 24 },
    panchitaResponseSub: { fontSize: 12, color: colors.purpleLight, marginTop: 8 },

    finalSummary: { backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 16, width: '100%', marginBottom: 20, borderWidth: 1, borderColor: colors.purpleDim },
    finalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.purpleDim + '60' },
    finalLabel:   { fontSize: 13, color: colors.gray },
    finalVal:     { fontSize: 14, fontWeight: '700', color: colors.white },
  });
}
