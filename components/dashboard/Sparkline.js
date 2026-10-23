import React from 'react';
import { View } from 'react-native';

// Mini gráfica de barras (sin librerías): la última barra va con el color de acento.
export default function Sparkline({ values = [], color, dimColor, height = 34, minBars = 2 }) {
  const data = values.filter(v => Number.isFinite(v));
  if (data.length < minBars) return <View style={{ height }} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const floor = min - (max - min) * 0.35; // deja ver diferencias pequeñas
  const range = max - floor || 1;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 3 }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(3, ((v - floor) / range) * height),
            borderRadius: 2,
            backgroundColor: i === data.length - 1 ? color : dimColor,
          }}
        />
      ))}
    </View>
  );
}
