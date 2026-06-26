import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getUser, getWeekActivity, getLogs } from '../storage';
import Panchita from '../components/Panchita';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

const INSIGHT_PHRASES = {
  idle: [
    'Aquí esperando... como siempre.',
    '¿Hoy entrenamos o solo miramos la app?',
    'El sofá no construye músculo. Por si acaso.',
  ],
  happy: [
    '¡Hoy ya entrenaste! Descansá y comé bien.',
    'Sesión completada. Panchita está... impresionada.',
    '¡Buen trabajo hoy! Mañana volvemos.',
  ],
  angry: [
    'No estoy enojada. Estoy decepcionada. Que es peor.',
    'El gimnasio pregunta por vos.',
    'Esto no es descanso. Esto es abandono.',
  ],
};

function getHomeMood(logs) {
  const today = new Date().toISOString().split('T')[0];
  const last = logs.filter(l => l.completed).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return 'idle';
  const days = Math.floor((new Date(today) - new Date(last.date)) / (1000 * 60 * 60 * 24));
  if (days === 0) return 'happy';
  if (days > 2)  return 'angry';
  return 'idle';
}

function randomPhrase(mood) {
  const arr = INSIGHT_PHRASES[mood] || INSIGHT_PHRASES.idle;
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [user, setUser]                   = useState(null);
  const [weekActivity, setWeekActivity]   = useState([]);
  const [insight, setInsight]             = useState(randomPhrase('idle'));
  const [streak, setStreak]               = useState(0);
  const [totalSessions, setTotalSessions] = useState(0);
  const [mood, setMood]                   = useState('idle');

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function loadData() {
    try {
      const [u, activity, logs] = await Promise.all([getUser(), getWeekActivity(), getLogs()]);
      setUser(u);
      setWeekActivity(activity);
      const m = getHomeMood(logs);
      setMood(m);
      setInsight(randomPhrase(m));
      setTotalSessions(logs.filter(l => l.completed).length);
      let s = 0;
      for (const day of [...activity].reverse()) {
        if (day.trained) s++; else break;
      }
      setStreak(s);
    } catch (e) {
      console.log('HomeScreen loadData error:', e);
      setInsight(randomPhrase('idle'));
    }
  }

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 18) return 'Buenas tardes';
    return 'Buenas noches';
  };

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>{greeting()},</Text>
            <Text style={s.name}>{user?.name || 'atleta'}</Text>
          </View>
          <View style={s.streakBadge}>
            <Text style={s.streakNum}>{streak}</Text>
            <Text style={s.streakLabel}>racha</Text>
          </View>
        </View>

        {/* Panchita insight card */}
        <View style={s.insightCard}>
          <View style={s.insightRow}>
            {/* Panchita ‚Äî ocupa toda la altura de la fila */}
            <Panchita state={mood} size={130} onIdle={() => setMood("idle")} />
            {/* Columna derecha: globo + botón */}
            <View style={s.insightRight}>
              <View style={s.insightBubble}>
                <Text style={s.insightText}>{insight}</Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('Coach')}>
                <Text style={s.insightBtnText}>Hablar con Panchita →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Actividad semanal */}
        <Text style={s.sectionTitle}>Esta semana</Text>
        <View style={s.weekCard}>
          {weekActivity.map((day, i) => {
            const isToday = i === weekActivity.length - 1;
            const dow = new Date(day.date + 'T12:00:00').getDay();
            return (
              <View key={i} style={s.dayCol}>
                <View style={[s.dayBar, day.trained && s.dayBarActive, isToday && !day.trained && s.dayBarToday]}>
                  {day.trained && <View style={s.dayBarFill} />}
                </View>
                <Text style={[s.dayLabel, isToday && s.dayLabelToday]}>
                  {DAY_LABELS[dow === 0 ? 6 : dow - 1]}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Stats */}
        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statNum}>{totalSessions}</Text>
            <Text style={s.statLabel}>sesiones totales</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{streak}</Text>
            <Text style={s.statLabel}>días seguidos</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statNum}>{weekActivity.filter(d => d.trained).length}</Text>
            <Text style={s.statLabel}>esta semana</Text>
          </View>
        </View>

        <TouchableOpacity style={s.trainBtn} onPress={() => navigation.navigate('Workout')}>
          <Text style={s.trainBtnText}>Ir a entrenar hoy →</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe:           { flex: 1, backgroundColor: colors.bg },
    scroll:         { padding: 20, paddingBottom: 40 },
    header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, marginTop: 8 },
    greeting:       { fontSize: 14, color: colors.gray },
    name:           { fontSize: 26, fontWeight: '700', color: colors.white },
    streakBadge:    {
      backgroundColor: colors.purpleDim, borderRadius: RADIUS.lg,
      paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center',
      borderWidth: 1, borderColor: colors.purple,
    },
    streakNum:      { fontSize: 22, fontWeight: '700', color: colors.lime },
    streakLabel:    { fontSize: 10, color: colors.purpleLight, marginTop: 1 },
    insightCard:    {
      backgroundColor: colors.bgCard, borderRadius: RADIUS.lg,
      paddingTop: 0, paddingRight: 16, paddingBottom: 16, paddingLeft: 0,
      marginBottom: 24, borderWidth: 1, borderColor: colors.purpleDim,
      overflow: 'visible',
    },
    insightRow:     { flexDirection: 'row', alignItems: 'center', gap: 10 },
    insightRight:   { flex: 1, gap: 10 },
    insightBubble:  {
      backgroundColor: colors.purpleDim, borderRadius: RADIUS.md,
      borderTopLeftRadius: 4, padding: 14,
    },
    insightText:    { fontSize: 15, color: colors.white, lineHeight: 21, fontWeight: '700' },
    insightBtnText: { fontSize: 13, color: colors.purpleLight, fontWeight: '600', textAlign: 'right' },
    sectionTitle:   { fontSize: 16, fontWeight: '700', color: colors.white, marginBottom: 12 },
    weekCard:       {
      backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 20,
      flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20,
    },
    dayCol:         { alignItems: 'center', gap: 8 },
    dayBar:         { width: 28, height: 64, borderRadius: RADIUS.sm, backgroundColor: colors.bgInput, justifyContent: 'flex-end', overflow: 'hidden' },
    dayBarActive:   { backgroundColor: colors.purpleDim },
    dayBarToday:    { borderWidth: 1, borderColor: colors.purple },
    dayBarFill:     { height: '100%', backgroundColor: colors.purple, borderRadius: RADIUS.sm },
    dayLabel:       { fontSize: 12, color: colors.gray, fontWeight: '500' },
    dayLabelToday:  { color: colors.purpleLight },
    statsRow:       { flexDirection: 'row', gap: 12, marginBottom: 24 },
    statCard:       { flex: 1, backgroundColor: colors.bgCard, borderRadius: RADIUS.md, padding: 14, alignItems: 'center' },
    statNum:        { fontSize: 24, fontWeight: '700', color: colors.lime },
    statLabel:      { fontSize: 11, color: colors.gray, marginTop: 2, textAlign: 'center' },
    trainBtn:       { backgroundColor: colors.purple, borderRadius: RADIUS.full, paddingVertical: 18, alignItems: 'center' },
    trainBtnText:   { color: '#ffffff', fontWeight: '700', fontSize: 16 },
  });
}
