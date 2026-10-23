// ExerciseGuideSheet — hoja inferior con la guía de un ejercicio (exercises/library.js).
import React, { useMemo } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { RADIUS } from '../constants/theme';
import { muscleLabel } from '../exercises/library';
import Panchita from './Panchita';
import { IconClose } from './icons';

function Section({ title, items, s, numbered }) {
  if (!items?.length) return null;
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {items.map((it, i) => (
        <View key={i} style={s.itemRow}>
          <Text style={s.bullet}>{numbered ? `${i + 1}.` : '•'}</Text>
          <Text style={s.itemTxt}>{it}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ExerciseGuideSheet({ guide, exerciseName, visible, onClose, colors }) {
  const s = useMemo(() => styles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.kicker}>GUÍA</Text>
              <Text style={s.title}>{guide?.name || exerciseName}</Text>
              {!!guide && guide.name !== exerciseName && !!exerciseName && (
                <Text style={s.subtitle}>En tu rutina: {exerciseName}</Text>
              )}
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} activeOpacity={0.7}>
              <IconClose size={18} color={colors.gray} />
            </TouchableOpacity>
          </View>

          {!guide ? (
            <View style={s.emptyBox}>
              <Panchita state="thinking" size={80} />
              <Text style={s.emptyTxt}>Todavía no tengo guía para este ejercicio. Pedísela a quien programa la app.</Text>
            </View>
          ) : (
            <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
              <View style={s.chips}>
                {guide.primary.map(m => <Text key={m} style={[s.chip, s.chipPrimary]}>{muscleLabel(m)}</Text>)}
                {guide.secondary.map(m => <Text key={m} style={s.chip}>{muscleLabel(m)}</Text>)}
              </View>
              <Text style={s.meta}>{guide.pattern} · {guide.equipment}</Text>

              <Section title="Preparación" items={guide.setup} s={s} />
              <Section title="Ejecución" items={guide.steps} s={s} numbered />
              <Section title="Errores comunes" items={guide.mistakes} s={s} />
              <Section title="Si la máquina está ocupada" items={[guide.swap]} s={s} />

              <View style={s.tipBox}>
                <Panchita state="happy" size={52} autoWave={false} />
                <Text style={s.tipTxt}>{guide.tip}</Text>
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = (colors) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: colors.bgCard, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 30, width: '100%', maxWidth: 560, alignSelf: 'center' },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.purpleDim, alignSelf: 'center', marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  kicker: { fontSize: 11, fontWeight: '700', color: colors.gray, letterSpacing: 0.8 },
  title: { fontSize: 20, fontWeight: '800', color: colors.white, marginTop: 2 },
  subtitle: { fontSize: 12, color: colors.gray, marginTop: 2 },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { fontSize: 12, fontWeight: '700', color: colors.grayLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, borderWidth: 1, borderColor: colors.purpleDim, overflow: 'hidden' },
  chipPrimary: { backgroundColor: colors.purple, borderColor: colors.purple, color: colors.accentText || '#fff' },
  meta: { fontSize: 12, color: colors.gray, marginBottom: 6 },
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: colors.purpleLight, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.6 },
  itemRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  bullet: { fontSize: 14, color: colors.gray, width: 18, fontWeight: '700' },
  itemTxt: { flex: 1, fontSize: 14, color: colors.white, lineHeight: 20 },
  tipBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, padding: 12, borderRadius: RADIUS.lg, backgroundColor: colors.purpleDim },
  tipTxt: { flex: 1, fontSize: 14, color: colors.white, fontStyle: 'italic', lineHeight: 20 },
  emptyBox: { alignItems: 'center', paddingVertical: 20, gap: 10 },
  emptyTxt: { fontSize: 14, color: colors.grayLight, textAlign: 'center', lineHeight: 20 },
});
