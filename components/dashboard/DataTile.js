import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RADIUS } from '../../constants/theme';

// Tarjeta de dato estilo MacroFactor: etiqueta pequeña, número grande, variación y mini gráfica.
export default function DataTile({ colors, label, value, unit, delta, deltaGood, caption, empty, children, onPress, style }) {
  const s = styles(colors);
  const deltaColor = deltaGood === undefined || deltaGood === null
    ? colors.grayLight
    : deltaGood ? (colors.lime || '#a3e635') : (colors.danger || '#ef4444');
  return (
    <TouchableOpacity style={[s.tile, style]} onPress={onPress} activeOpacity={0.75} disabled={!onPress}>
      <Text style={s.label} numberOfLines={1}>{label}</Text>
      {empty ? (
        <Text style={s.empty}>{empty}</Text>
      ) : (
        <>
          <View style={s.valueRow}>
            <Text style={s.value} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
            {!!unit && <Text style={s.unit}>{unit}</Text>}
          </View>
          {!!delta && <Text style={[s.delta, { color: deltaColor }]} numberOfLines={1}>{delta}</Text>}
          {!!caption && <Text style={s.caption} numberOfLines={2}>{caption}</Text>}
        </>
      )}
      <View style={s.chart}>{children}</View>
    </TouchableOpacity>
  );
}

const styles = (colors) => StyleSheet.create({
  tile: {
    backgroundColor: colors.bgCard, borderRadius: RADIUS.lg, padding: 14,
    minHeight: 148, justifyContent: 'flex-start',
    borderWidth: 1, borderColor: colors.purpleDim,
  },
  label: { fontSize: 11, fontWeight: '700', color: colors.gray, textTransform: 'uppercase', letterSpacing: 0.8 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 },
  value: { fontSize: 28, fontWeight: '800', color: colors.white, flexShrink: 1 },
  unit: { fontSize: 13, fontWeight: '600', color: colors.gray },
  delta: { fontSize: 12, fontWeight: '700', marginTop: 2 },
  caption: { fontSize: 12, color: colors.grayLight, marginTop: 2 },
  empty: { fontSize: 13, color: colors.grayLight, marginTop: 10, lineHeight: 18 },
  chart: { marginTop: 'auto', paddingTop: 10 },
});
