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

// ─── Meta de paletas (UI preview) ─────────────────────────────
const PALETTE_OPTIONS = [
  {
    key: 'purple', emoji: '🌙', name: 'Noche\nPúrpura',
    previewBg: '#0d0d1a', previewAccent: '#7c3aed', previewBtn: '#a855f7',
  },
  {
    key: 'light',  emoji: '☀️', name: 'Día\nClaro',
    previewBg: '#f8f8f8', previewAccent: '#6d28d9', previewBtn: '#7c3aed',
  },
  {
    key: 'beast',  emoji: '⚡', name: 'Modo\nBestia',
    previewBg: '#0a0a0a', previewAccent: '#39ff14', previewBtn: '#39ff14',
  },
  {
    key: 'ocean',  emoji: '🌊', name: 'Océano',
    previewBg: '#0a1628', previewAccent: '#0ea5e9', previewBtn: '#38bdf8',
  },
  {
    key: 'fire',   emoji: '🔥', name: 'Fuego',
    previewBg: '#1a0a0a', previewAccent: '#ef4444', previewBtn: '#f97316',
  },
  {
    key: 'jungle', emoji: '🌿', name: 'Selva',
    previewBg: '#0a1a0a', previewAccent: '#22c55e', previewBtn: '#4ade80',
  },
];

export default function SettingsScreen() {
  const { palette, setTheme, colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

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

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        <View style={s.header}>
          <Text style={s.headerTitle}>Ajustes</Text>
          <Text style={s.headerSub}>Personalizá tu experiencia</Text>
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
                  <Text style={s.paletteEmoji}>{opt.emoji}</Text>
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
                    <Text style={[s.paletteCheckTxt, { color: colors.accentText }]}>✓</Text>
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
                <Text style={{ fontSize: 18 }}>⚖️</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Unidad de peso</Text>
                <Text style={s.rowSub}>Valor por defecto en ejercicios nuevos</Text>
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
            <Text style={s.infoValue}>💜 y mucho gym</Text>
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

        <Text style={s.footer}>PanchitaFit · Tu coach salchicha favorita 🐾</Text>

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
    paletteEmoji: { fontSize: 26 },
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

    // ── Toggle kg/lb ──
    unitToggle: {
      flexDirection: 'row', backgroundColor: colors.bgInput,
      borderRadius: RADIUS.full, padding: 3,
      borderWidth: 1, borderColor: colors.purpleDim,
    },
    unitBtn:         { paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.full },
    unitBtnActive:   { backgroundColor: colors.purple },
    unitBtnText:     { fontSize: 14, fontWeight: '700', color: colors.gray },
    unitBtnTextActive: { color: colors.accentText },

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
  });
}
