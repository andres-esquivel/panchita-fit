import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  SafeAreaView, TextInput, Alert,
} from 'react-native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { saveWorkouts, saveUser, setOnboarded } from '../storage';

const SPLITS = [
  { id: 'ppl',         label: 'Push / Pull / Legs',  days: 6, desc: '6 días · split clásico' },
  { id: 'upper_lower', label: 'Upper / Lower',        days: 4, desc: '4 días · fuerza balanceada' },
  { id: 'full_body',   label: 'Full Body',             days: 3, desc: '3 días · ideal para empezar' },
  { id: 'bro',         label: 'Bro Split',             days: 5, desc: '5 días · un músculo por día' },
  { id: 'custom',      label: 'Rutina personalizada',  days: 0, desc: 'Armá tu propia rutina desde el app' },
];

const DEFAULT_EXERCISES = {
  ppl: [
    { day: 'Push A', exercises: ['Press banca', 'Press inclinado', 'Aperturas', 'Press militar', 'Extensión tríceps'] },
    { day: 'Pull A', exercises: ['Peso muerto', 'Remo con barra', 'Jalón al pecho', 'Curl bíceps', 'Face pull'] },
    { day: 'Legs A', exercises: ['Sentadilla', 'Prensa', 'Extensión cuádriceps', 'Curl femoral', 'Pantorrilla'] },
  ],
  upper_lower: [
    { day: 'Upper A', exercises: ['Press banca', 'Remo con barra', 'Press militar', 'Jalón al pecho', 'Curl bíceps'] },
    { day: 'Lower A', exercises: ['Sentadilla', 'Peso muerto rumano', 'Prensa', 'Curl femoral', 'Pantorrilla'] },
  ],
  full_body: [
    { day: 'Full Body A', exercises: ['Sentadilla', 'Press banca', 'Peso muerto', 'Press militar', 'Remo'] },
    { day: 'Full Body B', exercises: ['Sentadilla frontal', 'Press inclinado', 'Peso muerto rumano', 'Dominadas', 'Dips'] },
  ],
  bro: [
    { day: 'Pecho',          exercises: ['Press banca', 'Press inclinado', 'Aperturas', 'Pullover', 'Fondos'] },
    { day: 'Espalda',        exercises: ['Dominadas', 'Remo con barra', 'Jalón al pecho', 'Remo en polea', 'Encogimientos'] },
    { day: 'Hombros',        exercises: ['Press militar', 'Elevaciones laterales', 'Pájaro', 'Face pull', 'Press Arnold'] },
    { day: 'Bíceps/Tríceps', exercises: ['Curl barra', 'Curl martillo', 'Press francés', 'Extensión cable', 'Curl concentrado'] },
    { day: 'Piernas',        exercises: ['Sentadilla', 'Prensa', 'Extensión cuád', 'Curl femoral', 'Pantorrilla'] },
  ],
  custom: [],
};

const STEPS = ['bienvenida', 'nombre', 'split', 'ejercicios', 'listo'];

export default function OnboardScreen({ onFinish }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const [step, setStep]                   = useState(0);
  const [name, setName]                   = useState('');
  const [selectedSplit, setSelectedSplit] = useState(null);
  const [workouts, setWorkouts]           = useState([]);

  function goNext() {
    if (step === 1 && !name.trim()) {
      Alert.alert('Panchita dice:', '¡Necesito saber tu nombre!');
      return;
    }
    if (step === 2 && !selectedSplit) {
      Alert.alert('Panchita dice:', 'Elegí tu split primero.');
      return;
    }
    if (step === 2) {
      const base = DEFAULT_EXERCISES[selectedSplit] || [];
      setWorkouts(base.map((w, i) => ({ id: `${selectedSplit}_${i}`, ...w })));
      if (selectedSplit === 'custom') {
        setStep(4);
        return;
      }
    }
    setStep(prev => prev + 1);
  }

  async function finish() {
    // Navegar de inmediato, no bloquear esperando Firestore
    try { await setOnboarded(); } catch (_) {}
    onFinish();
    // Guardar en Firestore en background (best-effort)
    saveUser({ name: name.trim(), split: selectedSplit }).catch(e =>
      console.log('saveUser bg:', e.message)
    );
    if (workouts.length > 0) saveWorkouts(workouts).catch(e =>
      console.log('saveWorkouts bg:', e.message)
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* STEP 0 */}
        {step === 0 && (
          <View style={s.center}>
            <Text style={s.emoji}>{'🐾'}</Text>
            <Text style={s.title}>Hola, soy Panchita</Text>
            <Text style={s.sub}>Tu coach de fitness personal.{'\n'}Vamos a configurar todo para que empieces a romperla.</Text>
            <TouchableOpacity style={s.btnPrimary} onPress={goNext}>
              <Text style={s.btnText}>{'¡'}Empecemos!</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 1 — Nombre */}
        {step === 1 && (
          <View style={s.center}>
            <Text style={s.emoji}>{'💪'}</Text>
            <Text style={s.title}>{'¿'}Cómo te llamo?</Text>
            <TextInput
              style={s.input}
              placeholder="Tu nombre o apodo"
              placeholderTextColor={colors.gray}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <TouchableOpacity style={s.btnPrimary} onPress={goNext}>
              <Text style={s.btnText}>Siguiente</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2 — Split */}
        {step === 2 && (
          <View style={s.section}>
            <Text style={s.title}>{'¿'}Qué split hacés?</Text>
            <Text style={s.sub}>Elegí el que más se ajuste a tus días disponibles.</Text>
            {SPLITS.map(sp => (
              <TouchableOpacity
                key={sp.id}
                style={[s.card, selectedSplit === sp.id && s.cardSelected]}
                onPress={() => setSelectedSplit(sp.id)}
              >
                <Text style={[s.cardTitle, selectedSplit === sp.id && s.cardTitleSelected]}>
                  {sp.label}
                </Text>
                <Text style={s.cardDesc}>{sp.desc}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={s.btnPrimary} onPress={goNext}>
              <Text style={s.btnText}>Confirmar</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 3 — Ejercicios */}
        {step === 3 && (
          <View style={s.section}>
            <Text style={s.title}>Tus días de entrenamiento</Text>
            <Text style={s.sub}>Podés editar los ejercicios desde el app cuando quieras.</Text>
            {workouts.map((w, wi) => (
              <View key={wi} style={s.dayCard}>
                <Text style={s.dayTitle}>{w.day}</Text>
                {w.exercises.map((ex, ei) => (
                  <Text key={ei} style={s.exItem}>· {ex}</Text>
                ))}
              </View>
            ))}
            <TouchableOpacity style={s.btnPrimary} onPress={goNext}>
              <Text style={s.btnText}>{'¡'}Perfecto!</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 4 — Listo */}
        {step === 4 && (
          <View style={s.center}>
            <Text style={s.emoji}>{'🎉'}</Text>
            <Text style={s.title}>{'¡'}Todo listo, {name}!</Text>
            {selectedSplit === 'custom' ? (
              <Text style={s.sub}>Panchita te espera.{'\n'}Creá tu primera rutina desde Entrenamiento.</Text>
            ) : (
              <Text style={s.sub}>Panchita va a estar acá para cada entrenamiento.{'\n'}No me falles.</Text>
            )}
            <TouchableOpacity style={s.btnLime} onPress={finish}>
              <Text style={[s.btnText, { color: '#0f0a1e' }]}>Ir al app →</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dots */}
        <View style={s.dots}>
          {STEPS.map((_, i) => (
            <View key={i} style={[s.dot, i === step && s.dotActive]} />
          ))}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe:              { flex: 1, backgroundColor: colors.bg },
    scroll:            { flexGrow: 1, padding: 24, paddingTop: 60 },
    center:            { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
    section:           { flex: 1, paddingBottom: 40 },
    emoji:             { fontSize: 64, marginBottom: 16 },
    title:             { fontSize: 28, fontWeight: '700', color: colors.white, textAlign: 'center', marginBottom: 12 },
    sub:               { fontSize: 16, color: colors.grayLight, textAlign: 'center', lineHeight: 24, marginBottom: 32 },
    input:             {
      width: '100%', backgroundColor: colors.bgInput, borderRadius: RADIUS.md,
      padding: 16, fontSize: 18, color: colors.white, marginBottom: 24,
      borderWidth: 1, borderColor: colors.purpleDim,
    },
    btnPrimary:        {
      backgroundColor: colors.purple, borderRadius: RADIUS.full,
      paddingVertical: 16, paddingHorizontal: 48, marginTop: 8,
    },
    btnLime:           {
      backgroundColor: colors.lime, borderRadius: RADIUS.full,
      paddingVertical: 16, paddingHorizontal: 48, marginTop: 8,
    },
    btnText:           { color: '#ffffff', fontWeight: '700', fontSize: 16 },
    card:              {
      backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 18,
      marginBottom: 12, borderWidth: 2, borderColor: 'transparent',
    },
    cardSelected:      { borderColor: colors.purple, backgroundColor: colors.purpleDim },
    cardTitle:         { fontSize: 17, fontWeight: '600', color: colors.white, marginBottom: 4 },
    cardTitleSelected: { color: colors.purpleLight },
    cardDesc:          { fontSize: 13, color: colors.gray },
    dayCard:           { backgroundColor: colors.bgCard, borderRadius: RADIUS.md, padding: 16, marginBottom: 12 },
    dayTitle:          { fontSize: 15, fontWeight: '700', color: colors.lime, marginBottom: 8 },
    exItem:            { fontSize: 14, color: colors.grayLight, marginBottom: 3 },
    dots:              { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 32 },
    dot:               { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.purpleDim },
    dotActive:         { backgroundColor: colors.purple, width: 24 },
  });
}
