// MoreScreen — tab "Más" estilo MacroFactor: lista agrupada que lleva a Progreso, Historial,
// personalización del Dashboard y Ajustes.
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, SafeAreaView, TouchableOpacity } from 'react-native';
import { RADIUS } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import DetailModal from '../components/DetailModal';
import ProgressScreen from './ProgressScreen';
import SettingsScreen from './SettingsScreen';
import { IconArrow, IconChart, IconEditar, IconHistory, IconPaw, IconSettings } from '../components/icons';

export default function MoreScreen({ navigation }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);
  const [open, setOpen] = useState(null); // 'progress' | 'settings' | null

  const groups = [
    {
      title: 'Tus datos',
      rows: [
        { icon: IconChart, label: 'Progreso detallado', sub: '1RM estimado, peso corporal y frecuencia', onPress: () => setOpen('progress') },
        { icon: IconHistory, label: 'Historial de sesiones', sub: 'Todos tus entrenos', onPress: () => navigation.navigate('Workout', { showHistory: true }) },
      ],
    },
    {
      title: 'Personalización',
      rows: [
        { icon: IconEditar, label: 'Tarjetas del Dashboard', sub: 'Qué ver y en qué orden', onPress: () => navigation.navigate('Inicio', { customize: true }) },
        { icon: IconPaw, label: 'Panchita', sub: 'Hablar con tu coach', onPress: () => navigation.navigate('Coach') },
      ],
    },
    {
      title: 'App',
      rows: [
        { icon: IconSettings, label: 'Ajustes', sub: 'Cuenta, unidades, temas, timer y mascota', onPress: () => setOpen('settings') },
      ],
    },
  ];

  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Más</Text>
        {groups.map(g => (
          <View key={g.title} style={{ marginBottom: 20 }}>
            <Text style={s.groupTitle}>{g.title}</Text>
            <View style={s.card}>
              {g.rows.map((r, i) => {
                const Icon = r.icon;
                return (
                  <TouchableOpacity key={r.label} style={[s.row, i > 0 && s.rowBorder]} onPress={r.onPress} activeOpacity={0.7}>
                    <View style={s.iconBox}><Icon size={18} color={colors.purpleLight} /></View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.rowLbl}>{r.label}</Text>
                      <Text style={s.rowSub} numberOfLines={1}>{r.sub}</Text>
                    </View>
                    <IconArrow size={13} color={colors.gray} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <DetailModal visible={open === 'progress'} onClose={() => setOpen(null)} colors={colors} backLabel="Más">
        <ProgressScreen />
      </DetailModal>
      <DetailModal visible={open === 'settings'} onClose={() => setOpen(null)} colors={colors} backLabel="Más">
        <SettingsScreen />
      </DetailModal>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    scroll: { padding: 16, paddingBottom: 40, width: '100%', maxWidth: 520, alignSelf: 'center' },
    title: { fontSize: 30, fontWeight: '800', color: colors.white, marginTop: 8, marginBottom: 18 },
    groupTitle: { fontSize: 12, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4 },
    card: { backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, borderWidth: 1, borderColor: colors.purpleDim, overflow: 'hidden' },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, minHeight: 60 },
    rowBorder: { borderTopWidth: 1, borderTopColor: colors.purpleDim },
    iconBox: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.purpleDim, alignItems: 'center', justifyContent: 'center' },
    rowLbl: { fontSize: 15, fontWeight: '700', color: colors.white },
    rowSub: { fontSize: 12, color: colors.gray, marginTop: 2 },
  });
}
