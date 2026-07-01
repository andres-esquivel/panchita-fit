import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getUser, getLogs } from '../storage';
import { useTheme } from '../contexts/ThemeContext';
import Panchita from '../components/Panchita';
import { IconArrow, IconCalendar, IconCheck, IconHistory, IconTimer } from '../components/icons';

function makeUi(colors) {
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
  };
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function itemTime(item) {
  const raw = item?.completedAt || item?.updatedAt || item?.savedAt || item?.createdAt || item?.date || '';
  const t = raw ? Date.parse(raw) : 0;
  return Number.isFinite(t) ? t : 0;
}

function completedLogs(logs = []) {
  return [...logs]
    .filter(l => l?.completed)
    .sort((a, b) => {
      const dateCmp = String(b.date || '').localeCompare(String(a.date || ''));
      return dateCmp || (itemTime(b) - itemTime(a));
    });
}

function countSets(log) {
  return (log?.exercises || []).reduce((n, ex) => n + (ex.sets || []).filter(st => st.done !== false).length, 0);
}

function countExercises(log) {
  return (log?.exercises || []).length;
}

function estimateDuration(log) {
  if (!log) return 0;
  if (Number(log.durationMinutes) > 0) return Math.round(Number(log.durationMinutes));
  const start = Date.parse(log.startedAt || '');
  const end = Date.parse(log.completedAt || log.updatedAt || '');
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return Math.max(1, Math.round((end - start) / 60000));
  }
  const ex = countExercises(log);
  const sets = countSets(log);
  if (!ex && !sets) return 0;
  return Math.max(18, ex * 8 + sets * 3);
}

function durationLabel(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function dateShort(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return '—';
  return d.toLocaleDateString('es-CR', { day: 'numeric', month: 'short' }).replace('.', '');
}

function daysAgo(dateStr) {
  const d = parseDate(dateStr);
  if (!d) return 'sin fecha';
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const diff = Math.round((today - d) / 86400000);
  if (diff <= 0) return 'hoy';
  if (diff === 1) return 'ayer';
  return `hace ${diff} días`;
}

function calcStreak(logs = []) {
  const days = new Set(logs.filter(l => l.completed && l.date).map(l => l.date));
  let streak = 0;
  const cursor = new Date(); cursor.setHours(12, 0, 0, 0);
  while (true) {
    const key = cursor.toISOString().split('T')[0];
    if (!days.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function weekStats(logs = []) {
  const now = new Date(); now.setHours(12, 0, 0, 0);
  const start = new Date(now); start.setDate(now.getDate() - 6);
  const recent = logs.filter(l => {
    const d = parseDate(l.date);
    return l.completed && d && d >= start && d <= now;
  });
  const days = new Set(recent.map(l => l.date));
  const totalTime = recent.reduce((sum, log) => sum + estimateDuration(log), 0);
  return { sessions: days.size, totalTime, streak: calcStreak(logs) };
}

function workoutName(log) {
  return log?.workoutName || log?.routineName || log?.day || log?.name || 'Rutina';
}

export default function HomeScreen({ navigation }) {
  const { colors } = useTheme();
  const ui = useMemo(() => makeUi(colors), [colors]);
  const [user, setUser] = useState(null);
  const [logs, setLogs] = useState([]);
  const s = useMemo(() => createStyles(ui), [ui]);

  useFocusEffect(useCallback(() => {
    let alive = true;
    Promise.all([getUser(), getLogs()])
      .then(([u, l]) => {
        if (!alive) return;
        setUser(u);
        setLogs(completedLogs(l));
      })
      .catch(error => console.warn('Home load failed:', error));
    return () => { alive = false; };
  }, []));

  const recent = logs.slice(0, 3);
  const last = recent[0] || null;
  const stats = weekStats(logs);
  const firstName = (user?.name || 'atleta').trim().split(/\s+/)[0];

  function startSession() {
    if (last?.workoutId) navigation.navigate('Workout', { selectRoutineId: last.workoutId });
    else navigation.navigate('Workout');
  }

  function openSession(log) {
    navigation.navigate('Workout', { openSessionId: log.id, openSessionWorkoutId: log.workoutId });
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.hello}>Hola, {firstName}</Text>
          <Text style={s.meta}>Tu resumen de entrenamiento</Text>
        </View>

        <View style={s.panchitaCard}>
          <Panchita state={stats.streak > 0 ? 'happy' : 'idle'} size={74} autoWave={false} />
          <View style={s.panchitaTextWrap}>
            <Text style={s.cardTitle}>Panchita dice</Text>
            <Text style={s.panchitaMsg}>
              {stats.streak > 0
                ? `${stats.streak} día${stats.streak === 1 ? '' : 's'} de racha. Casi parece disciplina.`
                : 'Todavía no hay racha. El sofá sigue ganando por decisión unánime.'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={s.startCard} onPress={startSession} activeOpacity={0.85}>
          <View style={{ flex: 1 }}>
            <Text style={s.startLabel}>Start session</Text>
            <Text style={s.startTitle}>{last ? workoutName(last) : 'Elegí una rutina'}</Text>
            <Text style={s.startMeta}>{last ? `Última vez: ${daysAgo(last.date)}` : 'Primera sesión pendiente'}</Text>
          </View>
          <View style={s.startIcon}><IconArrow size={18} color={ui.bg} /></View>
        </TouchableOpacity>

        <View style={s.sectionHead}>
          <Text style={s.sectionTitle}>Recent sessions</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Workout', { showHistory: true })}>
            <Text style={s.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>

        <View style={s.recentCard}>
          {recent.length === 0 ? (
            <View style={s.emptyRecent}>
              <IconHistory size={20} color={ui.dim} />
              <Text style={s.emptyText}>Sin sesiones todavía. Panchita está tomando nota.</Text>
            </View>
          ) : recent.map(log => (
            <TouchableOpacity key={log.id || `${log.date}_${log.workoutId}`} style={s.sessionRow} onPress={() => openSession(log)} activeOpacity={0.75}>
              <View style={s.datePill}>
                <Text style={s.dateText}>{dateShort(log.date)}</Text>
              </View>
              <View style={s.sessionInfo}>
                <Text style={s.sessionName} numberOfLines={1}>{workoutName(log)}</Text>
                <Text style={s.sessionMeta}>{countExercises(log)} ejercicios · {durationLabel(estimateDuration(log))}</Text>
              </View>
              <IconArrow size={14} color={ui.dim} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <IconCalendar size={17} color={ui.accent} />
            <Text style={s.statValue}>{stats.sessions}</Text>
            <Text style={s.statLabel}>sesiones</Text>
          </View>
          <View style={s.statCard}>
            <IconTimer size={17} color={ui.accent} />
            <Text style={s.statValue}>{durationLabel(stats.totalTime)}</Text>
            <Text style={s.statLabel}>tiempo</Text>
          </View>
          <View style={s.statCard}>
            <IconCheck size={17} color={ui.accent} />
            <Text style={s.statValue}>{stats.streak}</Text>
            <Text style={s.statLabel}>racha</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(ui) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: ui.bg },
    scroll: { padding: 16, paddingBottom: 28 },
    header: { marginTop: 6, marginBottom: 14 },
    hello: { color: ui.text, fontSize: 15, fontWeight: '800' },
    meta: { color: ui.muted, fontSize: 11, marginTop: 3 },
    panchitaCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: ui.card, borderRadius: 14, borderWidth: 0.5, borderColor: ui.border,
      paddingVertical: 12, paddingHorizontal: 12, marginBottom: 12,
    },
    panchitaTextWrap: { flex: 1 },
    cardTitle: { color: ui.accent, fontSize: 11, fontWeight: '800', marginBottom: 4 },
    panchitaMsg: { color: ui.text, fontSize: 13, lineHeight: 18, fontWeight: '600' },
    startCard: {
      backgroundColor: ui.accent, borderRadius: 14, padding: 15, marginBottom: 18,
      flexDirection: 'row', alignItems: 'center', borderWidth: 0.5, borderColor: ui.accent,
    },
    startLabel: { color: '#1a1a1a', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
    startTitle: { color: ui.bg, fontSize: 15, fontWeight: '900', marginTop: 5 },
    startMeta: { color: '#263018', fontSize: 10, fontWeight: '700', marginTop: 4 },
    startIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,14,14,0.12)' },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    sectionTitle: { color: ui.text, fontSize: 15, fontWeight: '800' },
    seeAll: { color: ui.accent, fontSize: 11, fontWeight: '800' },
    recentCard: { backgroundColor: ui.card, borderRadius: 14, borderWidth: 0.5, borderColor: ui.border, overflow: 'hidden', marginBottom: 12 },
    sessionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 0.5, borderBottomColor: ui.border },
    datePill: { width: 48, borderRadius: 8, borderWidth: 0.5, borderColor: ui.borderStrong, paddingVertical: 6, alignItems: 'center', backgroundColor: ui.field },
    dateText: { color: ui.accent, fontSize: 10, fontWeight: '800', textTransform: 'lowercase' },
    sessionInfo: { flex: 1 },
    sessionName: { color: ui.text, fontSize: 13, fontWeight: '800' },
    sessionMeta: { color: ui.muted, fontSize: 10, marginTop: 3 },
    emptyRecent: { padding: 18, alignItems: 'center', gap: 8 },
    emptyText: { color: ui.muted, fontSize: 11, textAlign: 'center' },
    statsRow: { flexDirection: 'row', gap: 8 },
    statCard: { flex: 1, backgroundColor: ui.card, borderRadius: 12, borderWidth: 0.5, borderColor: ui.border, paddingVertical: 12, alignItems: 'center' },
    statValue: { color: ui.text, fontSize: 14, fontWeight: '900', marginTop: 6 },
    statLabel: { color: ui.muted, fontSize: 9, marginTop: 2 },
  });
}
