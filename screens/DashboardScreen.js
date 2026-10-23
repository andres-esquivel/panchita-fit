// DashboardScreen — Inicio estilo MacroFactor: Panchita arriba, "hoy toca" y tarjetas de datos
// personalizables (orden y visibilidad). Reemplaza a HomeScreen como primera tab.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity, Modal, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import {
  getUser, getLogs, getBodyWeights, getWeekSchedule, getWeightUnit,
  getDashboardConfig, saveDashboardConfig,
} from '../storage';
import { computeDashboard, DASHBOARD_TILES, normalizeTileConfig } from '../strength/dashboard';
import Panchita from '../components/Panchita';
import DataTile from '../components/dashboard/DataTile';
import Sparkline from '../components/dashboard/Sparkline';
import DetailModal from '../components/DetailModal';
import ProgressScreen from './ProgressScreen';
import { IconArrow, IconArrowDown, IconArrowUp, IconCheck, IconFire, IconMuscle, IconSleep } from '../components/icons';

const DAY_KEYS_BY_GETDAY = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const DOW_LETTERS = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
const GUTTER = 16, GAP = 12;

const PHRASES = {
  happy: ['Hoy ya entrenaste. Comé proteína y no me hablés.', 'Sesión hecha. Estoy... impresionada.'],
  idle:  ['¿Hoy entrenamos o solo miramos la app?', 'El sofá no construye músculo.'],
  angry: ['El gimnasio pregunta por vos.', 'No estoy enojada. Estoy decepcionada.'],
};

function moodFrom(logs) {
  const today = new Date().toISOString().split('T')[0];
  const last = logs.filter(l => l.completed).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) return 'idle';
  const days = Math.floor((new Date(today) - new Date(last.date)) / 86400000);
  return days === 0 ? 'happy' : days > 2 ? 'angry' : 'idle';
}

function fmt(n, dec = 0) {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('es-CR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function signed(n, dec = 1, suffix = '') {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return `${n > 0 ? '+' : ''}${fmt(n, dec)}${suffix}`;
}

export default function DashboardScreen({ navigation, route }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const { width } = useWindowDimensions();
  const tileW = Math.floor((Math.min(width, 520) - GUTTER * 2 - GAP) / 2);

  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [mood, setMood] = useState('idle');
  const [phrase, setPhrase] = useState(PHRASES.idle[0]);
  const [today, setToday] = useState(undefined);
  const [config, setConfig] = useState(normalizeTileConfig(null));
  const [draft, setDraft] = useState(null); // config en edición
  const [showProgress, setShowProgress] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  useEffect(() => {
    if (route?.params?.customize) {
      setDraft(config);
      navigation.setParams({ customize: undefined });
    }
  }, [route?.params?.customize]);

  async function load() {
    try {
      const [u, logs, bw, schedule, unit, cfg] = await Promise.all([
        getUser(), getLogs(), getBodyWeights().catch(() => []),
        getWeekSchedule().catch(() => ({})), getWeightUnit(), getDashboardConfig(),
      ]);
      const planned = Object.values(schedule || {}).filter(v => v && typeof v === 'object').length || 5;
      setUser(u);
      setConfig(cfg);
      setData(computeDashboard({ logs, bodyWeights: bw, unit, plannedDays: planned }));
      const m = moodFrom(logs);
      setMood(m);
      const pool = PHRASES[m];
      setPhrase(pool[Math.floor(Math.random() * pool.length)]);
      setToday(schedule?.[DAY_KEYS_BY_GETDAY[new Date().getDay()]] ?? null);
    } catch (e) {
      console.log('Dashboard load error:', e);
      setToday(null);
    }
  }

  function greeting() {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 18 ? 'Buenas tardes' : 'Buenas noches';
  }

  const unit = data?.unit || 'kg';
  const accent = colors.purpleLight;
  const dim = colors.purpleDim;
  const openProgress = () => setShowProgress(true);

  function renderTile(id) {
    if (!data) return <DataTile colors={colors} label="…" empty="Cargando…" style={{ width: tileW }} />;
    const common = { colors, style: { width: tileW } };
    switch (id) {
      case 'week': {
        const w = data.week;
        return (
          <DataTile {...common} label="Entrenos" value={`${w.done}/${w.planned}`} caption="esta semana"
            onPress={() => navigation.navigate('Workout', { showHistory: true })}>
            <View style={s.dotsRow}>
              {w.last7.map(d => (
                <View key={d.date} style={s.dotCol}>
                  <View style={[s.dot, { backgroundColor: d.trained ? accent : dim }]} />
                  <Text style={s.dotLbl}>{DOW_LETTERS[new Date(d.date + 'T12:00:00').getDay()]}</Text>
                </View>
              ))}
            </View>
          </DataTile>
        );
      }
      case 'strength': {
        const st = data.strength;
        if (!st) return <DataTile {...common} label="Fuerza" empty="Completá entrenos con peso y reps para ver tu 1RM estimado." onPress={openProgress} />;
        return (
          <DataTile {...common} label={`1RM est. · ${st.name}`} value={fmt(st.value, 1)} unit={unit}
            delta={st.deltaPct !== null ? `${signed(st.deltaPct, 1, '%')} últimas sesiones` : null}
            deltaGood={st.deltaPct === null ? null : st.deltaPct >= 0} onPress={openProgress}>
            <Sparkline values={st.series} color={accent} dimColor={dim} />
          </DataTile>
        );
      }
      case 'bodyweight': {
        const b = data.bodyweight;
        if (!b) return <DataTile {...common} label="Peso corporal" empty="Registrá tu peso para ver la tendencia." onPress={openProgress} />;
        return (
          <DataTile {...common} label="Peso corporal" value={fmt(b.value, 1)} unit={unit}
            delta={b.delta !== null ? `${signed(b.delta, 1)} ${unit} en 7 días` : null}
            onPress={openProgress}>
            <Sparkline values={b.series} color={accent} dimColor={dim} />
          </DataTile>
        );
      }
      case 'volume': {
        const v = data.volume;
        return (
          <DataTile {...common} label="Volumen semanal" value={fmt(v.value)} unit={unit}
            delta={v.deltaPct !== null ? `${signed(v.deltaPct, 0, '%')} vs semana pasada` : null}
            deltaGood={v.deltaPct === null ? null : v.deltaPct >= 0} onPress={openProgress}>
            <Sparkline values={v.series} color={accent} dimColor={dim} minBars={1} />
          </DataTile>
        );
      }
      case 'intensity': {
        const it = data.intensity;
        if (!it.rirSets) return <DataTile {...common} label="Intensidad" empty="Marcá el RIR en tus series para medir la intensidad." />;
        return (
          <DataTile {...common} label="Intensidad" value={fmt(it.avgRir, 1)} unit="RIR prom."
            caption={`${it.failureSets} ${it.failureSets === 1 ? 'serie' : 'series'} al fallo · ${it.rirSets} con RIR`} />
        );
      }
      case 'records': {
        const r = data.records.list;
        return (
          <DataTile {...common} label="Récords" value={String(r.length)} unit="esta semana"
            caption={r.length ? r.slice(0, 2).map(x => x.name).join(', ') : 'Todavía ninguno. La semana no ha terminado.'}
            onPress={openProgress} />
        );
      }
      default: return null;
    }
  }

  const visible = config.filter(t => t.visible);
  let streak = 0;
  for (const d of [...(data?.week.last7 || [])].reverse()) { if (d.trained) streak++; else break; }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>{greeting()}, {user?.name || 'atleta'}</Text>
            <Text style={s.title}>Dashboard</Text>
          </View>
          {!!data && streak > 0 && (
            <View style={s.streak}>
              <IconFire size={16} color={accent} />
              <Text style={s.streakTxt}>{streak}</Text>
              <Text style={s.streakLbl}>racha</Text>
            </View>
          )}
        </View>

        {/* Panchita */}
        <TouchableOpacity style={s.panchita} activeOpacity={0.8} onPress={() => navigation.navigate('Coach')}>
          <Panchita state={mood === 'idle' ? 'waveLoop' : mood} size={64} autoWave={false} />
          <Text style={s.panchitaTxt} numberOfLines={3}>{phrase}</Text>
          <IconArrow size={13} color={colors.gray} />
        </TouchableOpacity>

        {/* Hoy toca */}
        {today !== undefined && (
          today === 'rest' ? (
            <View style={s.today}>
              <IconSleep size={24} color={colors.grayLight} />
              <View style={{ flex: 1 }}>
                <Text style={s.todayLbl}>HOY</Text>
                <Text style={s.todayTitle}>Descanso</Text>
              </View>
            </View>
          ) : (
            <View style={s.today}>
              <IconMuscle size={24} color={accent} />
              <View style={{ flex: 1 }}>
                <Text style={s.todayLbl}>HOY TOCA</Text>
                <Text style={s.todayTitle} numberOfLines={1}>{today?.name || 'Elegí una rutina'}</Text>
              </View>
              <TouchableOpacity
                style={s.startBtn}
                onPress={() => navigation.navigate('Workout', today?.id ? { selectRoutineId: today.id } : undefined)}
              >
                <Text style={s.startTxt}>{today?.id ? 'Empezar' : 'Ver'}</Text>
              </TouchableOpacity>
            </View>
          )
        )}

        {/* Tarjetas */}
        <View style={s.sectionRow}>
          <Text style={s.section}>Tus datos</Text>
          <TouchableOpacity onPress={() => setDraft(config)}><Text style={s.link}>Personalizar</Text></TouchableOpacity>
        </View>
        <View style={s.grid}>
          {visible.map(t => <React.Fragment key={t.id}>{renderTile(t.id)}</React.Fragment>)}
        </View>
        {!visible.length && <Text style={s.emptyGrid}>Ocultaste todas las tarjetas. Tocá Personalizar.</Text>}

        <TouchableOpacity style={s.fullBtn} onPress={openProgress} activeOpacity={0.75}>
          <Text style={s.fullTxt}>Ver progreso completo</Text>
          <IconArrow size={13} color={accent} />
        </TouchableOpacity>
      </ScrollView>

      {/* Personalizar */}
      <Modal visible={!!draft} transparent animationType="slide" onRequestClose={() => setDraft(null)}>
        <View style={s.sheetOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setDraft(null)} />
          <View style={s.sheet}>
            <View style={s.handle} />
            <Text style={s.sheetTitle}>Personalizar dashboard</Text>
            <Text style={s.sheetSub}>Elegí qué tarjetas ver y en qué orden.</Text>
            {(draft || []).map((t, i) => {
              const meta = DASHBOARD_TILES.find(x => x.id === t.id);
              return (
                <View key={t.id} style={s.cfgRow}>
                  <TouchableOpacity
                    style={[s.check, t.visible && { backgroundColor: colors.purple, borderColor: colors.purple }]}
                    onPress={() => setDraft(d => d.map(x => x.id === t.id ? { ...x, visible: !x.visible } : x))}
                  >
                    {t.visible && <IconCheck size={13} color="#fff" />}
                  </TouchableOpacity>
                  <Text style={[s.cfgLbl, !t.visible && { color: colors.gray }]}>{meta?.label}</Text>
                  <TouchableOpacity style={s.cfgArrow} disabled={i === 0}
                    onPress={() => setDraft(d => { const a = [...d]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; return a; })}>
                    <IconArrowUp size={15} color={i === 0 ? colors.purpleDim : accent} />
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cfgArrow} disabled={i === draft.length - 1}
                    onPress={() => setDraft(d => { const a = [...d]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; return a; })}>
                    <IconArrowDown size={15} color={i === draft.length - 1 ? colors.purpleDim : accent} />
                  </TouchableOpacity>
                </View>
              );
            })}
            <TouchableOpacity style={s.saveBtn} onPress={async () => { setConfig(await saveDashboardConfig(draft)); setDraft(null); }}>
              <Text style={s.saveTxt}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DetailModal visible={showProgress} onClose={() => { setShowProgress(false); load(); }} colors={colors} backLabel="Dashboard">
        <ProgressScreen />
      </DetailModal>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: GUTTER, paddingBottom: 40, width: '100%', maxWidth: 520, alignSelf: 'center' },
    header: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 8, marginBottom: 16 },
    kicker: { fontSize: 13, color: colors.gray, fontWeight: '600' },
    title: { fontSize: 30, fontWeight: '800', color: colors.white, marginTop: 2 },
    streak: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: colors.purpleDim },
    streakTxt: { fontSize: 15, fontWeight: '800', color: colors.white },
    streakLbl: { fontSize: 11, fontWeight: '600', color: colors.grayLight },
    panchita: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.purpleDim },
    panchitaTxt: { flex: 1, fontSize: 14, color: colors.grayLight, lineHeight: 20 },
    today: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: colors.purpleDim },
    todayLbl: { fontSize: 11, fontWeight: '700', color: colors.gray, letterSpacing: 0.8 },
    todayTitle: { fontSize: 17, fontWeight: '800', color: colors.white, marginTop: 2 },
    startBtn: { backgroundColor: colors.purple, paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full, minHeight: 40, justifyContent: 'center' },
    startTxt: { color: colors.accentText || '#fff', fontWeight: '800', fontSize: 14 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    section: { fontSize: 18, fontWeight: '800', color: colors.white },
    link: { fontSize: 14, fontWeight: '700', color: colors.purpleLight, paddingVertical: 6 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
    emptyGrid: { color: colors.gray, fontSize: 13, textAlign: 'center', marginVertical: 20 },
    dotsRow: { flexDirection: 'row', justifyContent: 'space-between' },
    dotCol: { alignItems: 'center', gap: 4 },
    dot: { width: 12, height: 12, borderRadius: 6 },
    dotLbl: { fontSize: 9, color: colors.gray, fontWeight: '700' },
    fullBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 18, paddingVertical: 14, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: colors.purpleDim, minHeight: 48 },
    fullTxt: { color: colors.purpleLight, fontWeight: '700', fontSize: 15 },
    sheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
    sheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 32 },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.purpleDim, alignSelf: 'center', marginBottom: 14 },
    sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.white },
    sheetSub: { fontSize: 13, color: colors.gray, marginTop: 4, marginBottom: 12 },
    cfgRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.purpleDim },
    check: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.gray, alignItems: 'center', justifyContent: 'center' },
    cfgLbl: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.white },
    cfgArrow: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    saveBtn: { marginTop: 16, backgroundColor: colors.purple, borderRadius: RADIUS.full, paddingVertical: 14, alignItems: 'center', minHeight: 48 },
    saveTxt: { color: colors.accentText || '#fff', fontWeight: '800', fontSize: 15 },
  });
}
