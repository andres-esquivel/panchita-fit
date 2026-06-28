import React, { useMemo, useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Switch, SafeAreaView, ScrollView,
  TouchableOpacity, Alert,
} from 'react-native';
import { signOut } from 'firebase/auth';
import { auth } from '../config/firebase';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import { getWeightUnit, saveWeightUnit } from '../storage';

function IconMoon({ color, size = 20 }) { return <Text style={{ fontSize: size, color }}>🌙</Text>; }
function IconSun({ color, size = 20 })  { return <Text style={{ fontSize: size, color }}>☀️</Text>; }

export default function SettingsScreen() {
  const { isDark, toggleTheme, colors } = useTheme();
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
    Alert.alert(
      'Cerrar sesión',
      '¿Seguro querés salir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: () => signOut(auth) },
      ]
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Ajustes</Text>
          <Text style={s.headerSub}>Personalizá tu experiencia</Text>
        </View>

        <Text style={s.sectionTitle}>APARIENCIA</Text>
        <View style={s.card}>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={s.iconBg}>
                {isDark ? <IconMoon color={colors.purpleLight} /> : <IconSun color={colors.lime} />}
              </View>
              <View>
                <Text style={s.rowLabel}>Modo {isDark ? 'oscuro' : 'claro'}</Text>
                <Text style={s.rowSub}>
                  {isDark ? 'El gym se entrena de noche' : 'La vitamina D también cuenta'}
                </Text>
              </View>
            </View>
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: colors.purpleDim, true: colors.purple }}
              thumbColor={isDark ? colors.purpleLight : '#ffffff'}
              ios_backgroundColor={colors.purpleDim}
            />
          </View>
        </View>

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
            {/* Toggle kg / lb */}
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

        <Text style={s.sectionTitle}>CUENTA</Text>
        <View style={s.card}>
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>Email</Text>
            <Text style={s.infoValue} numberOfLines={1}>{auth.currentUser?.email || '—'}</Text>
          </View>
          <View style={[s.infoRow, s.infoRowLast]}>
            <Text style={s.infoLabel}>ID de usuario</Text>
            <Text style={[s.infoValue, { fontSize: 11, color: colors.gray }]} numberOfLines={1}>
              {auth.currentUser?.uid?.slice(0, 12) + '...' || '—'}
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
    safe:         { flex: 1, backgroundColor: colors.bg },
    scroll:       { padding: 20, paddingTop: 16, paddingBottom: 60 },
    header:       { marginBottom: 28 },
    headerTitle:  { fontSize: 32, fontWeight: '800', color: colors.white, marginBottom: 4 },
    headerSub:    { fontSize: 15, color: colors.gray },
    sectionTitle: {
      fontSize: 11, fontWeight: '700', color: colors.purple,
      letterSpacing: 1.2, marginBottom: 8, marginTop: 24, marginLeft: 4,
    },
    card:         { backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, paddingHorizontal: 16, overflow: 'hidden' },
    row:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14 },
    rowLeft:      { flexDirection: 'row', alignItems: 'center', flex: 1 },
    iconBg:       {
      width: 38, height: 38, borderRadius: RADIUS.md,
      backgroundColor: colors.purpleDim,
      alignItems: 'center', justifyContent: 'center', marginRight: 12,
    },
    rowLabel:     { fontSize: 16, fontWeight: '600', color: colors.white },
    rowSub:       { fontSize: 12, color: colors.gray, marginTop: 2 },

    // Toggle kg / lb
    unitToggle:       { flexDirection: 'row', backgroundColor: colors.bgInput, borderRadius: RADIUS.full, padding: 3, borderWidth: 1, borderColor: colors.purpleDim },
    unitBtn:          { paddingHorizontal: 14, paddingVertical: 6, borderRadius: RADIUS.full },
    unitBtnActive:    { backgroundColor: colors.purple },
    unitBtnText:      { fontSize: 14, fontWeight: '700', color: colors.gray },
    unitBtnTextActive:{ color: '#fff' },

    infoRow:      {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.purpleDim,
    },
    infoRowLast:  { borderBottomWidth: 0 },
    infoLabel:    { fontSize: 15, color: colors.grayLight },
    infoValue:    { fontSize: 15, color: colors.white, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
    logoutBtn:    {
      marginTop: 28, backgroundColor: '#3f0f0f', borderRadius: RADIUS.full,
      paddingVertical: 16, alignItems: 'center',
      borderWidth: 1, borderColor: colors.danger,
    },
    logoutText:   { color: colors.danger, fontWeight: '700', fontSize: 16 },
    footer:       { textAlign: 'center', color: colors.gray, fontSize: 13, marginTop: 32 },
  });
}
