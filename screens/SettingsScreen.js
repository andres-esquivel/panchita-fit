import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator, Platform,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { IconBolt, IconFire, IconLeaf, IconMoon, IconSleep, IconSun, IconTimer, IconWater, IconCheck, IconClose, IconMuscle, IconEditar, IconWarning } from '../components/icons';
import Sisifo from '../components/Sisifo';
import { getUser, saveUser, getRestTimerSeconds, saveRestTimerSeconds, getNotificationPrefs, saveNotificationPrefs, getWeekSchedule, saveWeekSchedule, getLocalCustomRoutines } from '../storage';


function isWebNotificationSupported() {
  return Platform.OS === 'web' && typeof window !== 'undefined' && 'Notification' in window;
}

function isPwaStandalone() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true;
}

function isIOSWeb() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator?.userAgent || '');
}

function currentNotificationPermission() {
  if (!isWebNotificationSupported()) return 'unsupported';
  return window.Notification.permission || 'default';
}

function showBrowserNotification(title, body) {
  if (!isWebNotificationSupported() || window.Notification.permission !== 'granted') return false;
  try {
    new window.Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'panchita-test',
    });
    return true;
  } catch {
    return false;
  }
}

// Días de la semana en orden visual L-D
const WEEK_DAYS = ['L','M','X','J','V','S','D'];
const WEEK_DAY_NAMES = { L:'Lunes', M:'Martes', X:'Miércoles', J:'Jueves', V:'Viernes', S:'Sábado', D:'Domingo' };

// ─── Meta de paletas (UI preview) ─────────────────────────────
const PALETTE_OPTIONS = [
  {
    key: 'purple', icon: IconMoon, name: 'Noche\nPúrpura',
    previewBg: '#0d0d1a', previewAccent: '#7c3aed', previewBtn: '#a855f7',
  },
  {
    key: 'light',  icon: IconSun, name: 'Día\nClaro',
    previewBg: '#f8f8f8', previewAccent: '#6d28d9', previewBtn: '#7c3aed',
  },
  {
    key: 'beast',  icon: IconBolt, name: 'Modo\nBestia',
    previewBg: '#0a0a0a', previewAccent: '#39ff14', previewBtn: '#39ff14',
  },
  {
    key: 'ocean',  icon: IconWater, name: 'Océano',
    previewBg: '#0a1628', previewAccent: '#0ea5e9', previewBtn: '#38bdf8',
  },
  {
    key: 'fire',   icon: IconFire, name: 'Fuego',
    previewBg: '#1a0a0a', previewAccent: '#ef4444', previewBtn: '#f97316',
  },
  {
    key: 'jungle', icon: IconLeaf, name: 'Selva',
    previewBg: '#0a1a0a', previewAccent: '#22c55e', previewBtn: '#4ade80',
  },
];

export default function SettingsScreen() {
  const { palette, setTheme, colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [restTimerSeconds, setRestTimerSeconds] = useState(90);
  const [notificationPrefs, setNotificationPrefs] = useState(null);
  const [notificationStatus, setNotificationStatus] = useState(currentNotificationPermission());
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState('');
  const [profileName, setProfileName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  // T3 — programación semanal
  const [weekSchedule, setWeekSchedule] = useState({});
  const [routines, setRoutines]         = useState([]);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [pickerDay, setPickerDay]         = useState(null);

  useEffect(() => {
    getUser().then(u => setProfileName(u?.name || '')).catch(() => {});
    getRestTimerSeconds().then(setRestTimerSeconds);
    getNotificationPrefs().then(prefs => {
      setNotificationPrefs(prefs);
      setNotificationStatus(currentNotificationPermission());
    }).catch(() => setNotificationPrefs({ enabled:false, permission:currentNotificationPermission() }));
    loadWeekData();
  }, []);

  async function loadWeekData() {
    const [schedule, rts] = await Promise.all([
      getWeekSchedule().catch(()=>({})),
      getLocalCustomRoutines().catch(()=>[]),
    ]);
    setWeekSchedule(schedule);
    setRoutines(rts);
  }

  function openDayPicker(day) {
    setPickerDay(day);
    setShowDayPicker(true);
  }

  async function assignDay(day, value) {
    const updated = { ...weekSchedule, [day]: value };
    setWeekSchedule(updated);
    setShowDayPicker(false);
    await saveWeekSchedule(updated);
  }

  async function handleRestTimerChange(seconds) {
    setRestTimerSeconds(seconds);
    await saveRestTimerSeconds(seconds);
  }

  async function handleToggleNotifications() {
    if (notificationBusy) return;
    setNotificationBusy(true);
    setNotificationMsg('');
    try {
      if (!isWebNotificationSupported()) {
        const prefs = await saveNotificationPrefs({ enabled:false, permission:'unsupported' });
        setNotificationPrefs(prefs);
        setNotificationStatus('unsupported');
        setNotificationMsg('Este navegador no soporta notificaciones web. Panchita está molesta, pero informada.');
        return;
      }

      let permission = currentNotificationPermission();
      const nextEnabled = !notificationPrefs?.enabled;

      if (nextEnabled && permission === 'default') {
        permission = await window.Notification.requestPermission();
      }

      const enabled = nextEnabled && permission === 'granted';
      const prefs = await saveNotificationPrefs({ enabled, permission });
      setNotificationPrefs(prefs);
      setNotificationStatus(permission);

      if (enabled) {
        setNotificationMsg(isIOSWeb() && !isPwaStandalone()
          ? 'Permiso listo. En iPhone, para recibirlas mejor, agregá PanchitaFit a pantalla de inicio.'
          : 'Notificaciones activadas. Panchita ya tiene permiso para molestar con propósito.');
      } else if (permission === 'denied') {
        setNotificationMsg('El navegador bloqueó notificaciones. Activales permiso desde configuración del sitio.');
      } else {
        setNotificationMsg('Notificaciones desactivadas. Silencio sospechoso.');
      }
    } catch (error) {
      console.warn('notification toggle failed:', error);
      setNotificationMsg('No pude activar notificaciones en este navegador. Probá desde la app instalada.');
    } finally {
      setNotificationBusy(false);
    }
  }

  async function handleTestNotification() {
    setNotificationMsg('');
    if (!isWebNotificationSupported()) {
      setNotificationMsg('Este navegador no soporta notificaciones web.');
      return;
    }
    const permission = currentNotificationPermission();
    if (permission !== 'granted') {
      setNotificationMsg('Primero activá el permiso de notificaciones. Panchita toca la puerta antes de entrar.');
      return;
    }
    const ok = showBrowserNotification(
      'Panchita dice:',
      'Probando notificaciones. Técnica limpia, hidratación y cero excusas raras.'
    );
    setNotificationMsg(ok ? 'Notificación de prueba enviada.' : 'No pude mostrar la notificación de prueba.');
  }

  async function handleSaveName() {
    const clean = profileName.trim();
    if (!clean) return;
    setSavingName(true);
    setNameSaved(false);
    try {
      await saveUser({ name: clean });
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2200);
    } finally {
      setSavingName(false);
    }
  }

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Seguro querés salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.header}>
          <Text style={s.headerTitle}>Ajustes</Text>
          <Text style={s.headerSub}>Personalizá tu experiencia</Text>
        </View>

        {/* ── PERFIL ── */}
        <Text style={s.sectionTitle}>PERFIL</Text>
        <View style={s.card}>
          <View style={s.profileRow}>
            <View style={s.iconBg}>
              <IconEditar size={20} color={colors.purpleLight} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Nombre visible</Text>
              <Text style={s.rowSub}>Así te saluda Panchita. Sí, te va a juzgar igual.</Text>
            </View>
          </View>
          <View style={s.nameEditRow}>
            <TextInput
              style={s.nameInput}
              value={profileName}
              onChangeText={v => { setProfileName(v); setNameSaved(false); }}
              placeholder="Tu nombre"
              placeholderTextColor={colors.gray}
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <TouchableOpacity
              style={[s.nameSaveBtn, (!profileName.trim() || savingName) && { opacity: 0.65 }]}
              onPress={handleSaveName}
              disabled={!profileName.trim() || savingName}
              activeOpacity={0.75}
            >
              {savingName ? <ActivityIndicator color={colors.accentText || '#fff'} size="small" /> : <Text style={s.nameSaveTxt}>{nameSaved ? 'Guardado' : 'Guardar'}</Text>}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── APARIENCIA ── */}
        <Text style={s.sectionTitle}>APARIENCIA</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.palettesScroll}
          decelerationRate="fast"
          snapToInterval={130}
        >
          {PALETTE_OPTIONS.map(opt => {
            const isActive = palette === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                style={[s.paletteCard, isActive && s.paletteCardActive,
                  { borderColor: isActive ? opt.previewAccent : colors.purpleDim }]}
                onPress={() => setTheme(opt.key)}
                activeOpacity={0.75}
              >
                {/* Mini preview del fondo de la paleta */}
                <View style={[s.paletteBg, { backgroundColor: opt.previewBg }]}>
                  <opt.icon size={28} color={opt.previewAccent} />
                </View>

                {/* Tres círculos de color */}
                <View style={s.paletteCircles}>
                  <View style={[s.circle, { backgroundColor: opt.previewBg, borderWidth: 1, borderColor: colors.purpleDim }]} />
                  <View style={[s.circle, { backgroundColor: opt.previewAccent }]} />
                  <View style={[s.circle, { backgroundColor: opt.previewBtn }]} />
                </View>

                {/* Nombre */}
                <Text style={[s.paletteName, isActive && { color: opt.previewAccent }]} numberOfLines={2}>
                  {opt.name}
                </Text>

                {/* Checkmark activo */}
                {isActive && (
                  <View style={[s.paletteCheck, { backgroundColor: opt.previewAccent }]}>
                    <IconCheck size={13} color={colors.accentText} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── ENTRENAMIENTO ── */}
        <Text style={s.sectionTitle}>ENTRENAMIENTO</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.iconBg}>
                <IconTimer size={20} color={colors.purpleLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Descanso entre sets</Text>
                <Text style={s.rowSub}>Arranca cuando marcás un set completado</Text>
              </View>
            </View>
          </View>
          <View style={s.restTimerGrid}>
            {[0, 60, 90, 120, 180].map(sec => (
              <TouchableOpacity
                key={sec}
                style={[s.restTimerBtn, restTimerSeconds === sec && s.restTimerBtnActive]}
                onPress={() => handleRestTimerChange(sec)}
                activeOpacity={0.75}
              >
                <Text style={[s.restTimerText, restTimerSeconds === sec && s.restTimerTextActive]}>
                  {sec === 0 ? 'Off' : `${sec}s`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── NOTIFICACIONES ── */}
        <Text style={s.sectionTitle}>NOTIFICACIONES</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.iconBg}>
                <IconBolt size={20} color={colors.purpleLight} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Panchita te recuerda entrenar</Text>
                <Text style={s.rowSub}>
                  Fase 1: permiso y pruebas. Los recordatorios programados vienen después con backend.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[s.togglePill, notificationPrefs?.enabled && s.togglePillOn, notificationBusy && { opacity: 0.6 }]}
              onPress={handleToggleNotifications}
              disabled={notificationBusy}
              activeOpacity={0.75}
            >
              {notificationBusy ? <ActivityIndicator color={colors.accentText || '#fff'} size="small" /> : <Text style={[s.togglePillTxt, notificationPrefs?.enabled && s.togglePillTxtOn]}>{notificationPrefs?.enabled ? 'On' : 'Off'}</Text>}
            </TouchableOpacity>
          </View>

          <View style={s.notificationInfoBox}>
            <View style={s.notificationInfoLine}>
              <Text style={s.notificationInfoLabel}>Permiso</Text>
              <Text style={s.notificationInfoValue}>{notificationStatus}</Text>
            </View>
            {isIOSWeb() && !isPwaStandalone() ? (
              <View style={s.notificationHintRow}>
                <IconWarning size={15} color={colors.lime} />
                <Text style={s.notificationHintTxt}>En iPhone agregá la app a pantalla de inicio para mejor soporte.</Text>
              </View>
            ) : null}
            {notificationMsg ? <Text style={s.notificationMsg}>{notificationMsg}</Text> : null}
          </View>

          <TouchableOpacity
            style={[s.testNotificationBtn, (!notificationPrefs?.enabled || notificationStatus !== 'granted') && { opacity: 0.55 }]}
            onPress={handleTestNotification}
            activeOpacity={0.75}
          >
            <Text style={s.testNotificationTxt}>Probar notificación</Text>
          </TouchableOpacity>
        </View>

        {/* ── MI SEMANA ── */}
        <Text style={s.sectionTitle}>MI SEMANA</Text>
        <View style={s.card}>
          <View style={s.weekRow}>
            {WEEK_DAYS.map(day=>{
              const val = weekSchedule[day];
              const isRest = val==='rest';
              const hasRoutine = val && val!=='rest';
              return (
                <TouchableOpacity key={day} style={s.dayCell} onPress={()=>openDayPicker(day)} activeOpacity={0.7}>
                  <Text style={[s.dayCellLabel, hasRoutine&&s.dayCellLabelActive, isRest&&s.dayCellLabelRest]}>{day}</Text>
                  <View style={[s.dayCellDot, hasRoutine&&s.dayCellDotActive, isRest&&s.dayCellDotRest]}>
                    {isRest&&<IconSleep size={15} color={colors.grayLight} />}
                    {hasRoutine&&<IconMuscle size={15} color={colors.purpleLight} />}
                  </View>
                  {hasRoutine&&(
                    <Text style={s.dayCellName} numberOfLines={1}>{val.name?.split(' ')[0]||'?'}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={s.weekHint}>Tocá un día para asignar una rutina</Text>
        </View>

        {/* Modal selector de día */}
        <Modal visible={showDayPicker} transparent animationType="slide" onRequestClose={()=>setShowDayPicker(false)}>
          <View style={s.bsOverlay}>
            <TouchableOpacity style={{flex:1}} activeOpacity={1} onPress={()=>setShowDayPicker(false)}/>
            <View style={s.bottomSheet}>
              <View style={s.bottomSheetHandle}/>
              <Text style={s.bottomSheetTitle}>{pickerDay?WEEK_DAY_NAMES[pickerDay]:''}</Text>
              <ScrollView style={{maxHeight:320}} showsVerticalScrollIndicator={false}>
                <TouchableOpacity style={s.bsOption} onPress={()=>assignDay(pickerDay,'rest')}>
                  <View style={s.bsOptionRow}><IconSleep size={18} color={colors.grayLight} /><Text style={s.bsOptionTxt}>Descanso</Text></View>
                </TouchableOpacity>
                {routines.map(r=>(
                  <TouchableOpacity key={r.id} style={s.bsOption} onPress={()=>assignDay(pickerDay,{id:r.id,name:r.name||r.day})}>
                    <View style={s.bsOptionRow}><IconMuscle size={18} color={colors.purpleLight} /><Text style={s.bsOptionTxt}>{r.name||r.day}</Text></View>
                  </TouchableOpacity>
                ))}
                {routines.length===0&&(
                  <Text style={{color:colors.gray,padding:16,fontSize:13}}>Sin rutinas guardadas aún.</Text>
                )}
                <TouchableOpacity style={[s.bsOption,{borderTopWidth:1,borderTopColor:colors.purpleDim}]} onPress={()=>assignDay(pickerDay,null)}>
                  <View style={s.bsOptionRow}><IconClose size={16} color={colors.gray} /><Text style={[s.bsOptionTxt,{color:colors.gray}]}>Quitar asignación</Text></View>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ── PANCHITA ── */}
        <Text style={s.sectionTitle}>PANCHITA</Text>
        <View style={s.card}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Modelo de IA</Text>
            <Text style={s.infoValue}>llama-3.1-8b-instant</Text>
          </View>
          <View style={[s.infoRow, s.infoRowLast]}>
            <Text style={s.infoLabel}>Proveedor</Text>
            <Text style={s.infoValue}>Groq (gratis)</Text>
          </View>
        </View>

        {/* ── MASCOTAS ── */}
        <Text style={s.sectionTitle}>MASCOTAS</Text>
        <View style={s.card}>
          <View style={s.mascotRow}>
            <View style={s.mascotStage}>
              <Sisifo state="push" size={112} autoWave />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.rowLabel}>Sísifo</Text>
              <Text style={s.rowSub}>Piedra, montaña y cero excusas. Tocá la mascota para verla empujar.</Text>
            </View>
          </View>
        </View>

        {/* ── APP ── */}
        <Text style={s.sectionTitle}>APP</Text>
        <View style={s.card}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Versión</Text>
            <Text style={s.infoValue}>1.0.0</Text>
          </View>
          <View style={[s.infoRow, s.infoRowLast]}>
            <Text style={s.infoLabel}>Hecha con</Text>
            <Text style={s.infoValue}>Panchita + mucho gym</Text>
          </View>
        </View>

        {/* ── CUENTA ── */}
        <Text style={s.sectionTitle}>CUENTA</Text>
        <View style={s.card}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Email</Text>
            <Text style={s.infoValue} numberOfLines={1}>{auth.currentUser?.email || '—'}</Text>
          </View>
          <View style={[s.infoRow, s.infoRowLast]}>
            <Text style={s.infoLabel}>ID de usuario</Text>
            <Text style={[s.infoValue, { fontSize: 11, color: colors.gray }]} numberOfLines={1}>
              {(auth.currentUser?.uid?.slice(0, 12) || '—') + '...'}
            </Text>
          </View>
        </View>

        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Text style={s.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>

        <Text style={s.footer}>PanchitaFit · Tu coach salchicha favorita</Text>

      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: 20, paddingTop: 16, paddingBottom: 60 },

    header:      { marginBottom: 24 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: colors.white, marginBottom: 4 },
    headerSub:   { fontSize: 15, color: colors.gray },

    sectionTitle: {
      fontSize: 11, fontWeight: '700', color: colors.purple,
      letterSpacing: 1.2, marginBottom: 10, marginTop: 24, marginLeft: 2,
    },

    // ── Paletas horizontales ──
    palettesScroll: { paddingVertical: 4, paddingRight: 8 },
    paletteCard: {
      width: 118, marginRight: 10,
      backgroundColor: colors.bgCard,
      borderRadius: RADIUS.lg,
      borderWidth: 2,
      borderColor: colors.purpleDim,
      overflow: 'hidden',
      position: 'relative',
    },
    paletteCardActive: {
      shadowColor: colors.purple,
      shadowOpacity: 0.5, shadowRadius: 10, elevation: 6,
    },
    paletteBg: {
      height: 58, alignItems: 'center', justifyContent: 'center',
    },
    paletteCircles: {
      flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 10,
    },
    circle: {
      width: 18, height: 18, borderRadius: 9,
    },
    paletteName: {
      fontSize: 11, fontWeight: '700', color: colors.grayLight,
      paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12,
      lineHeight: 15,
    },
    paletteCheck: {
      position: 'absolute', top: 6, right: 6,
      width: 20, height: 20, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    paletteCheckTxt: { fontSize: 11, fontWeight: '900' },

    // ── Card genérica ──
    card: {
      backgroundColor: colors.bgCard,
      borderRadius: RADIUS.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.purpleDim,
    },

    // ── Fila genérica ──
    row: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14, paddingHorizontal: 16,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
    iconBg: {
      width: 38, height: 38, borderRadius: RADIUS.md,
      backgroundColor: colors.bgInput,
      alignItems: 'center', justifyContent: 'center',
    },
    rowLabel: { fontSize: 15, fontWeight: '600', color: colors.white },
    rowSub:   { fontSize: 11, color: colors.gray, marginTop: 2 },
    rowBorder:{ borderTopWidth: 1, borderTopColor: colors.purpleDim },

    profileRow: { flexDirection:'row', alignItems:'center', gap:12, paddingHorizontal:16, paddingTop:14, paddingBottom:10 },
    nameEditRow: { flexDirection:'row', alignItems:'center', gap:10, paddingHorizontal:16, paddingBottom:14 },
    nameInput: {
      flex:1, minHeight:44, borderRadius:RADIUS.md, backgroundColor:colors.bgInput,
      borderWidth:1, borderColor:colors.purpleDim, color:colors.white,
      paddingHorizontal:12, fontSize:15, fontWeight:'600',
    },
    nameSaveBtn: {
      minHeight:44, paddingHorizontal:16, borderRadius:RADIUS.md,
      backgroundColor:colors.purple, alignItems:'center', justifyContent:'center',
    },
    nameSaveTxt: { color:colors.accentText||'#fff', fontWeight:'800', fontSize:13 },
    restTimerGrid: { flexDirection:'row', flexWrap:'wrap', gap:8, paddingHorizontal:16, paddingBottom:14 },
    restTimerBtn: { minWidth:58, paddingVertical:9, paddingHorizontal:12, borderRadius:RADIUS.full, backgroundColor:colors.bgInput, borderWidth:1, borderColor:colors.purpleDim, alignItems:'center' },
    restTimerBtnActive: { backgroundColor:colors.purple, borderColor:colors.purple },
    restTimerText: { fontSize:13, fontWeight:'800', color:colors.grayLight },
    restTimerTextActive: { color:colors.accentText||'#fff' },

    togglePill: {
      minWidth:56, height:34, borderRadius:RADIUS.full,
      backgroundColor:colors.bgInput, borderWidth:1, borderColor:colors.purpleDim,
      alignItems:'center', justifyContent:'center', paddingHorizontal:12,
    },
    togglePillOn: { backgroundColor:colors.purple, borderColor:colors.purple },
    togglePillTxt: { color:colors.grayLight, fontSize:12, fontWeight:'900' },
    togglePillTxtOn: { color:colors.accentText||'#fff' },
    notificationInfoBox: {
      marginHorizontal:16, marginBottom:12, padding:12,
      backgroundColor:colors.bgInput, borderRadius:RADIUS.md,
      borderWidth:1, borderColor:colors.purpleDim,
    },
    notificationInfoLine: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
    notificationInfoLabel: { color:colors.gray, fontSize:12, fontWeight:'700' },
    notificationInfoValue: { color:colors.purpleLight, fontSize:12, fontWeight:'900' },
    notificationHintRow: { flexDirection:'row', alignItems:'center', gap:7, marginBottom:8 },
    notificationHintTxt: { flex:1, color:colors.grayLight, fontSize:11, lineHeight:15, fontWeight:'600' },
    notificationMsg: { color:colors.grayLight, fontSize:12, lineHeight:16, fontStyle:'italic' },
    testNotificationBtn: {
      marginHorizontal:16, marginBottom:14, minHeight:42,
      borderRadius:RADIUS.full, backgroundColor:colors.purpleDim,
      alignItems:'center', justifyContent:'center', borderWidth:1, borderColor:colors.purple,
    },
    testNotificationTxt: { color:colors.purpleLight, fontSize:13, fontWeight:'900' },

    mascotRow: {
      flexDirection:'row', alignItems:'center', gap:14,
      paddingVertical:14, paddingHorizontal:16,
    },
    mascotStage: {
      width:118, height:118, borderRadius:RADIUS.lg,
      backgroundColor:colors.bgInput, borderWidth:1, borderColor:colors.purpleDim,
      alignItems:'center', justifyContent:'center', overflow:'hidden',
    },

    // ── Info rows ──
    infoRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 14, paddingHorizontal: 16,
      borderBottomWidth: 1, borderBottomColor: colors.purpleDim,
    },
    infoRowLast: { borderBottomWidth: 0 },
    infoLabel:   { fontSize: 15, color: colors.grayLight },
    infoValue:   { fontSize: 15, color: colors.white, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },

    logoutBtn: {
      marginTop: 28,
      backgroundColor: '#3f0f0f',
      borderRadius: RADIUS.full,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.danger,
    },
    logoutText: { color: colors.danger, fontWeight: '700', fontSize: 16 },
    footer: { textAlign: 'center', color: colors.gray, fontSize: 13, marginTop: 32 },

    // T3 — Mi semana
    weekRow: { flexDirection:'row', justifyContent:'space-around', paddingVertical:16, paddingHorizontal:8 },
    weekHint: { fontSize:11, color:colors.gray, textAlign:'center', paddingBottom:12 },
    dayCell: { alignItems:'center', gap:5, minWidth:38 },
    dayCellLabel: { fontSize:13, fontWeight:'700', color:colors.gray },
    dayCellLabelActive: { color:colors.purpleLight },
    dayCellLabelRest: { color:colors.gray },
    dayCellDot: {
      width:32, height:32, borderRadius:16,
      backgroundColor:colors.bgInput, borderWidth:1, borderColor:colors.purpleDim,
      alignItems:'center', justifyContent:'center',
    },
    dayCellDotActive: { backgroundColor:colors.purpleDim, borderColor:colors.purple },
    dayCellDotRest: { backgroundColor:colors.bgInput, borderColor:colors.gray },
    dayCellName: { fontSize:9, color:colors.purpleLight, fontWeight:'700', maxWidth:38, textAlign:'center' },

    // Bottom sheet para selector de día
    bsOverlay: { flex:1, justifyContent:'flex-end', backgroundColor:'rgba(0,0,0,0.72)' },
    bottomSheet: {
      backgroundColor:colors.bgCard,
      borderTopLeftRadius:RADIUS.xl, borderTopRightRadius:RADIUS.xl,
      paddingBottom:36, paddingTop:12,
      borderTopWidth:1, borderTopColor:colors.purpleDim,
    },
    bottomSheetHandle: { width:40, height:4, borderRadius:2, backgroundColor:colors.purpleDim, alignSelf:'center', marginBottom:14 },
    bottomSheetTitle: { fontSize:16, fontWeight:'700', color:colors.grayLight, paddingHorizontal:20, marginBottom:8 },
    bsOption: { paddingVertical:16, paddingHorizontal:20, minHeight:52 },
    bsOptionRow: { flexDirection:'row', alignItems:'center', gap:10 },
    bsOptionTxt: { fontSize:16, color:colors.white, fontWeight:'500' },
  });
}
