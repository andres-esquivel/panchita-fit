import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, Alert,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getWeightUnit, saveWeightUnit } from '../storage';

const THEMES = [
  { key: 'dark',  label: 'Modo Oscuro',  emoji: '🌙', sub: 'El gym se entrena de noche' },
  { key: 'light', label: 'Modo Claro',   emoji: '☀️', sub: 'La vitamina D también cuenta' },
  { key: 'beast', label: 'Modo Bestia',  emoji: '⚡', sub: 'Verde neón. Cero excusas.' },
];

export default function SettingsScreen() {
  const { theme, setTheme, colors } = useTheme();
  const s = useMemo(() => createStyles(colors, theme), [colors, theme]);

  const [weightUnit, setWeightUnit] = useState('kg');

  useEffect(() => {
    getWeightUnit().then(setWeightUnit);
  }, []);

  async function handleWeightUnitChange(unit) {
    setWeightUnit(unit);
    await saveWeightUnit(unit);
  }

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Seguro querés salir?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: () => signOut(auth) },
    ]);
  }

  const isBeast = theme === 'beast';

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{isBeast ? '⚡ Ajustes' : 'Ajustes'}</Text>
          <Text style={s.headerSub}>Personalizá tu experiencia</Text>
        </View>

        {/* ── APARIENCIA ── */}
        <Text style={s.sectionTitle}>APARIENCIA</Text>
        <View style={s.card}>
          {THEMES.map((t, i) => {
            const isActive = theme === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[
                  s.themeRow,
                  i < THEMES.length - 1 && s.themeRowBorder,
                  isActive && s.themeRowActive,
                ]}
                onPress={() => setTheme(t.key)}
                activeOpacity={0.7}
              >
                <View style={[s.themeEmoji, isActive && s.themeEmojiActive]}>
                  <Text style={{ fontSize: 20 }}>{t.emoji}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.themeLabel, isActive && s.themeLabelActive]}>
                    {t.label}
                  </Text>
                  <Text style={s.themeSub}>{t.sub}</Text>
                </View>
                <View style={[s.themeCheck, isActive && s.themeCheckActive]}>
                  {isActive && <Text style={s.themeCheckTxt}>✓</Text>}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── ENTRENAMIENTO ── */}
        <Text style={s.sectionTitle}>ENTRENAMIENTO</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.iconBg}>
                <Text style={{ fontSize: 18 }}>⚖️</Text>
              </View>
              <View>
                <Text style={s.rowLabel}>Unidad de peso</Text>
                <Text style={s.rowSub}>Para registrar pesos en los ejercicios</Text>
              </View>
            </View>
            <View style={s.unitToggle}>
              <TouchableOpacity
                style={[s.unitBtn, weightUnit === 'kg' && s.unitBtnActive]}
                onPress={() => handleWeightUnitChange('kg')}
              >
                <Text style={[s.unitBtnText, weightUnit === 'kg' && s.unitBtnTextActive]}>kg</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.unitBtn, weightUnit === 'lb' && s.unitBtnActive]}
                onPress={() => handleWeightUnitChange('lb')}
              >
                <Text style={[s.unitBtnText, weightUnit === 'lb' && s.unitBtnTextActive]}>lb</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

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

        {/* ── APP ── */}
        <Text style={s.sectionTitle}>APP</Text>
        <View style={s.card}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Versión</Text>
            <Text style={s.infoValue}>1.0.0</Text>
          </View>
          <View style={[s.infoRow, s.infoRowLast]}>
            <Text style={s.infoLabel}>Hecha con</Text>
            <Text style={s.infoValue}>{isBeast ? '⚡ y mucho gym' : '💜 y mucho gym'}</Text>
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

        <Text style={s.footer}>
          {isBeast ? '⚡ PanchitaFit · Modo Bestia activado' : 'PanchitaFit · Tu coach salchicha favorita 🐾'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function createStyles(colors, theme) {
  const isBeast = theme === 'beast';
  const accent = colors.purple;

  return StyleSheet.create({
    safe:   { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: 20, paddingTop: 16, paddingBottom: 60 },

    header:      { marginBottom: 24 },
    headerTitle: { fontSize: 32, fontWeight: '800', color: colors.white, marginBottom: 4 },
    headerSub:   { fontSize: 15, color: colors.gray },

    sectionTitle: {
      fontSize: 11, fontWeight: '700', color: accent,
      letterSpacing: 1.2, marginBottom: 8, marginTop: 24, marginLeft: 4,
    },

    card: { backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, overflow: 'hidden', borderWidth: isBeast ? 1 : 0, borderColor: isBeast ? 'rgba(57,255,20,0.2)' : 'transparent' },

    // ── Selector de tema ──
    themeRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 },
    themeRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.purpleDim },
    themeRowActive: { backgroundColor: isBeast ? 'rgba(57,255,20,0.06)' : colors.purpleDim + '44' },
    themeEmoji: { width: 40, height: 40, borderRadius: RADIUS.md, backgroundColor: colors.bgInput, alignItems: 'center', justifyContent: 'center' },
    themeEmojiActive: { backgroundColor: accent + '33' },
    themeLabel: { fontSize: 15, fontWeight: '600', color: colors.grayLight },
    themeLabelActive: { color: accent, fontWeight: '700' },
    themeSub: { fontSize: 12, color: colors.gray, marginTop: 2 },
    themeCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.purpleDim, alignItems: 'center', justifyContent: 'center' },
    themeCheckActive: { backgroundColor: accent, borderColor: accent },
    themeCheckTxt: { color: isBeast ? '#000' : '#fff', fontSize: 12, fontWeight: '800' },

    // ── Fila genérica ──
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16 },
    rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    iconBg: { width: 38, height: 38, borderRadius: RADIUS.md, backgroundColor: colors.bgInput, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    rowLabel: { fontSize: 16, fontWeight: '600', color: colors.white },
    rowSub: { fontSize: 12, color: colors.gray, marginTop: 2 },

    // ── Toggle kg/lb ──
    unitToggle: { flexDirection: 'row', backgroundColor: colors.bgInput, borderRadius: RADIUS.full, padding: 3, borderWidth: 1, borderColor: colors.purpleDim },
    unitBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.full },
    unitBtnActive: { backgroundColor: accent },
    unitBtnText: { fontSize: 14, fontWeight: '700', color: colors.gray },
    unitBtnTextActive: { color: isBeast ? '#000' : '#fff' },

    // ── Info rows ──
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.purpleDim },
    infoRowLast: { borderBottomWidth: 0 },
    infoLabel: { fontSize: 15, color: colors.grayLight },
    infoValue: { fontSize: 15, color: colors.white, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },

    logoutBtn: { marginTop: 28, backgroundColor: '#3f0f0f', borderRadius: RADIUS.full, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.danger },
    logoutText: { color: colors.danger, fontWeight: '700', fontSize: 16 },
    footer: { textAlign: 'center', color: colors.gray, fontSize: 13, marginTop: 32 },
  });
}
