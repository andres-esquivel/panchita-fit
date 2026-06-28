/**
 * icons.js — Iconos inline como componentes React Native
 * Sin librerías externas. Geometría con Views + Text Unicode.
 */
import React from 'react';
import { View, Text } from 'react-native';

const D = 22; // tamaño por defecto

// Casa — para tab Inicio
export const IconHome = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'flex-end' }}>
    {/* Techo: triángulo con borders */}
    <View style={{
      width:0, height:0,
      borderLeftWidth:size*0.5, borderLeftColor:'transparent',
      borderRightWidth:size*0.5, borderRightColor:'transparent',
      borderBottomWidth:size*0.44, borderBottomColor:color,
      marginBottom:-1,
    }} />
    {/* Cuerpo */}
    <View style={{ width:size*0.7, height:size*0.44, backgroundColor:color, borderRadius:2, alignItems:'center', justifyContent:'flex-end' }}>
      {/* Puerta */}
      <View style={{ width:size*0.22, height:size*0.28, backgroundColor:'#0f0a1e', borderRadius:2, marginBottom:0 }} />
    </View>
  </View>
);

// Mancuerna — para tab Workout
export const IconDumbbell = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center', flexDirection:'row' }}>
    {/* Peso izq */}
    <View style={{ width:size*0.18, height:size*0.72, backgroundColor:color, borderRadius:3 }} />
    {/* Barra */}
    <View style={{ width:size*0.44, height:size*0.18, backgroundColor:color }} />
    {/* Peso der */}
    <View style={{ width:size*0.18, height:size*0.72, backgroundColor:color, borderRadius:3 }} />
  </View>
);

// Pata — para tab Coach
export const IconPaw = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    {/* Dedos */}
    <View style={{ flexDirection:'row', gap:size*0.06, marginBottom:size*0.06 }}>
      {[0,1,2,3].map(i => (
        <View key={i} style={{
          width:size*0.2, height:size*0.22,
          backgroundColor:color, borderRadius:size*0.1,
        }} />
      ))}
    </View>
    {/* Almohadilla */}
    <View style={{ width:size*0.6, height:size*0.44, backgroundColor:color, borderRadius:size*0.22 }} />
  </View>
);

// Check / OK
export const IconCheck = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{
      width:size*0.58, height:size*0.32,
      borderLeftWidth:Math.max(2,size*0.12), borderBottomWidth:Math.max(2,size*0.12),
      borderColor:color, transform:[{ rotate:'-45deg' }], marginTop:-size*0.08,
    }} />
  </View>
);

// Fuego (stats racha)
export const IconFire = ({ size = D, color = '#f97316' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'flex-end' }}>
    <View style={{
      width:size*0.55, height:size*0.8,
      backgroundColor:color, borderRadius:size*0.28,
      borderTopLeftRadius:size*0.5, borderTopRightRadius:size*0.1,
    }} />
    <View style={{
      position:'absolute', bottom:size*0.08, left:size*0.28,
      width:size*0.3, height:size*0.44,
      backgroundColor:'#fbbf24', borderRadius:size*0.15,
      borderTopRightRadius:size*0.4,
    }} />
  </View>
);

// Estrella
export const IconStar = ({ size = D, color = '#a3e635' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.42, height:size*0.42, backgroundColor:color, transform:[{ rotate:'45deg' }] }} />
    <View style={{ position:'absolute', width:size*0.42, height:size*0.42, backgroundColor:color, transform:[{ rotate:'0deg' }], opacity:0.95 }} />
  </View>
);

// Flecha derecha
export const IconArrow = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.45, height:size*0.45, borderRightWidth:2, borderTopWidth:2, borderColor:color, transform:[{ rotate:'45deg' }] }} />
  </View>
);

// Cerrar / X
export const IconClose = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ position:'absolute', width:size*0.72, height:2, borderRadius:1, backgroundColor:color, transform:[{ rotate:'45deg' }] }} />
    <View style={{ position:'absolute', width:size*0.72, height:2, borderRadius:1, backgroundColor:color, transform:[{ rotate:'-45deg' }] }} />
  </View>
);

// Más / Plus
export const IconPlus = ({ size = D, color = '#a78bfa' }) => (
  <Text style={{ fontSize:size*0.9, color, lineHeight:size*1.1, fontWeight:'400' }}>+</Text>
);

// Calendario (semana)
export const IconCalendar = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.82, height:size*0.75, borderWidth:1.5, borderColor:color, borderRadius:3 }}>
      <View style={{ height:size*0.22, backgroundColor:color }} />
    </View>
    <View style={{ position:'absolute', top:size*0.04, flexDirection:'row', gap:size*0.28 }}>
      <View style={{ width:size*0.12, height:size*0.18, borderWidth:1.5, borderColor:color, borderRadius:size*0.06 }} />
      <View style={{ width:size*0.12, height:size*0.18, borderWidth:1.5, borderColor:color, borderRadius:size*0.06 }} />
    </View>
  </View>
);

// Trofeo / completado
export const IconTrophy = ({ size = D, color = '#a3e635' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    {/* Copa */}
    <View style={{ width:size*0.6, height:size*0.5, backgroundColor:color, borderRadius:size*0.12,
      borderBottomLeftRadius:size*0.3, borderBottomRightRadius:size*0.3}} />
    {/* Asas */}
    <View style={{ position:'absolute', left:size*0.06, top:size*0.08,
      width:size*0.2, height:size*0.3, borderWidth:2, borderColor:color,
      borderTopRightRadius:size*0.15, borderBottomRightRadius:size*0.15,
      borderLeftWidth:0 }} />
    <View style={{ position:'absolute', right:size*0.06, top:size*0.08,
      width:size*0.2, height:size*0.3, borderWidth:2, borderColor:color,
      borderTopLeftRadius:size*0.15, borderBottomLeftRadius:size*0.15,
      borderRightWidth:0 }} />
    {/* Base */}
    <View style={{ width:size*0.44, height:size*0.12, backgroundColor:color,
      borderRadius:2, marginTop:-1 }} />
    <View style={{ width:size*0.6, height:size*0.1, backgroundColor:color,
      borderRadius:2 }} />
  </View>
);

// Gráfica de barras ascendentes — para tab Progreso
export const IconChart = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width: size, height: size, justifyContent: 'flex-end', alignItems: 'center' }}>
    {/* Línea base */}
    <View style={{
      position: 'absolute', bottom: size * 0.08, left: size * 0.04, right: size * 0.04,
      height: 1.5, backgroundColor: color, opacity: 0.55, borderRadius: 1,
    }} />
    {/* Tres barras ascendentes */}
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: size * 0.1, paddingBottom: size * 0.1 }}>
      <View style={{ width: size * 0.2, height: size * 0.3,  backgroundColor: color, borderRadius: 2, opacity: 0.7 }} />
      <View style={{ width: size * 0.2, height: size * 0.52, backgroundColor: color, borderRadius: 2, opacity: 0.85 }} />
      <View style={{ width: size * 0.2, height: size * 0.75, backgroundColor: color, borderRadius: 2 }} />
    </View>
  </View>
);

// Compartir — flecha hacia arriba con caja
export const IconShare = ({ size = 20, color = '#a78bfa' }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {/* Caja */}
    <View style={{ position:'absolute', bottom:0, left:size*0.1, right:size*0.1, height:size*0.52, borderWidth:1.5, borderColor:color, borderTopWidth:0, borderBottomLeftRadius:3, borderBottomRightRadius:3 }} />
    {/* Flecha arriba */}
    <View style={{ position:'absolute', top:0, alignItems:'center' }}>
      <View style={{ width:0, height:0, borderLeftWidth:size*0.22, borderLeftColor:'transparent', borderRightWidth:size*0.22, borderRightColor:'transparent', borderBottomWidth:size*0.28, borderBottomColor:color }} />
      <View style={{ width:1.5, height:size*0.32, backgroundColor:color }} />
    </View>
  </View>
);

// Sliders / Ajustes — para tab Ajustes
export const IconSettings = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width: size, height: size, justifyContent: 'center', gap: size * 0.19 }}>
    {[0.28, 0.62, 0.38].map((knobPos, i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', height: size * 0.16 }}>
        <View style={{ width: size * knobPos, height: 1.5, backgroundColor: color, opacity: 0.5 }} />
        <View style={{ width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09, backgroundColor: color, marginHorizontal: size * 0.06 }} />
        <View style={{ flex: 1, height: 1.5, backgroundColor: color, opacity: 0.5 }} />
      </View>
    ))}
  </View>
);
// Lápiz ‚Äî editar registro
export const IconEditar = ({ size = 20, color = '#a78bfa' }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {/* Cuerpo del lápiz, inclinado 45¬∞ */}
    <View style={{ transform: [{ rotate: '-45deg' }], alignItems: 'center' }}>
      {/* Punta */}
      <View style={{
        width: 0, height: 0,
        borderLeftWidth: size * 0.18, borderLeftColor: 'transparent',
        borderRightWidth: size * 0.18, borderRightColor: 'transparent',
        borderTopWidth: size * 0.22, borderTopColor: color,
        opacity: 0.75,
      }} />
      {/* Cuerpo */}
      <View style={{
        width: size * 0.36, height: size * 0.52,
        backgroundColor: color, borderTopLeftRadius: 2, borderTopRightRadius: 2,
      }} />
      {/* Base / goma */}
      <View style={{
        width: size * 0.36, height: size * 0.14,
        backgroundColor: color, opacity: 0.45,
        borderBottomLeftRadius: 2, borderBottomRightRadius: 2,
      }} />
    </View>
  </View>
);

// Papelera ‚Äî eliminar registro
export const IconEliminar = ({ size = 20, color = '#f87171' }) => (
  <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
    {/* Tapa */}
    <View style={{
      width: size * 0.72, height: size * 0.14,
      backgroundColor: color, borderRadius: 2,
      marginBottom: size * 0.05,
    }} />
    {/* Asa de la tapa */}
    <View style={{
      position: 'absolute', top: size * 0.02,
      width: size * 0.28, height: size * 0.1,
      borderWidth: size * 0.07, borderColor: color,
      borderBottomWidth: 0, borderTopLeftRadius: 3, borderTopRightRadius: 3,
    }} />
    {/* Cuerpo del bote */}
    <View style={{
      width: size * 0.6, height: size * 0.56,
      borderLeftWidth: size * 0.08, borderRightWidth: size * 0.08,
      borderBottomWidth: size * 0.08, borderColor: color,
      borderBottomLeftRadius: 3, borderBottomRightRadius: 3,
    }}>
      {/* Líneas internas */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: size * 0.08, height: '100%' }}>
        {[0,1,2].map(i => (
          <View key={i} style={{ width: size * 0.06, height: '78%', backgroundColor: color, opacity: 0.55, borderRadius: 2 }} />
        ))}
      </View>
    </View>
  </View>
);

// Iconos utilitarios nuevos — sin emojis ni librerías externas
export const IconBack = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, justifyContent:'center' }}>
    <View style={{ width:size*0.62, height:size*0.62, borderLeftWidth:2, borderBottomWidth:2, borderColor:color, transform:[{ rotate:'45deg' }], marginLeft:size*0.28 }} />
  </View>
);

export const IconMenuDots = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:size*0.12 }}>
    {[0,1,2].map(i => <View key={i} style={{ width:size*0.16, height:size*0.16, borderRadius:size*0.08, backgroundColor:color }} />)}
  </View>
);

export const IconBolt = ({ size = D, color = '#a3e635' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:0, height:0, borderLeftWidth:size*0.28, borderLeftColor:'transparent', borderRightWidth:size*0.05, borderRightColor:'transparent', borderTopWidth:size*0.48, borderTopColor:color, transform:[{ skewX:'-12deg' }] }} />
    <View style={{ position:'absolute', top:size*0.42, width:0, height:0, borderLeftWidth:size*0.05, borderLeftColor:'transparent', borderRightWidth:size*0.28, borderRightColor:'transparent', borderBottomWidth:size*0.48, borderBottomColor:color, transform:[{ skewX:'-12deg' }] }} />
  </View>
);

export const IconMoon = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.72, height:size*0.72, borderRadius:size*0.36, backgroundColor:color }} />
    <View style={{ position:'absolute', right:size*0.12, top:size*0.05, width:size*0.58, height:size*0.58, borderRadius:size*0.29, backgroundColor:'#0d0d1a' }} />
  </View>
);

export const IconSun = ({ size = D, color = '#f59e0b' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.46, height:size*0.46, borderRadius:size*0.23, backgroundColor:color }} />
    {[0,1,2,3].map(i => <View key={i} style={{ position:'absolute', width:size*0.1, height:size*0.9, backgroundColor:color, borderRadius:size*0.05, transform:[{ rotate:`${i*45}deg` }], opacity:0.55 }} />)}
  </View>
);

export const IconWater = ({ size = D, color = '#38bdf8' }) => (
  <View style={{ width:size, height:size, justifyContent:'center' }}>
    {[0,1,2].map(i => <View key={i} style={{ height:2, width:size*(0.55+i*0.12), backgroundColor:color, borderRadius:2, marginVertical:size*0.07, marginLeft:i%2?size*0.18:0 }} />)}
  </View>
);

export const IconLeaf = ({ size = D, color = '#4ade80' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.62, height:size*0.42, backgroundColor:color, borderTopLeftRadius:size*0.35, borderBottomRightRadius:size*0.35, transform:[{ rotate:'-35deg' }] }} />
    <View style={{ position:'absolute', width:size*0.55, height:1.5, backgroundColor:'#0a1a0a', transform:[{ rotate:'-35deg' }], opacity:0.55 }} />
  </View>
);

export const IconScale = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.78, height:size*0.68, borderRadius:size*0.16, borderWidth:2, borderColor:color }} />
    <View style={{ position:'absolute', top:size*0.25, width:size*0.36, height:size*0.18, borderTopWidth:2, borderColor:color, borderRadius:size*0.18 }} />
  </View>
);

export const IconSleep = ({ size = D, color = '#94a3b8' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.7, height:size*0.36, borderRadius:size*0.18, backgroundColor:color, opacity:0.7 }} />
    <View style={{ position:'absolute', right:size*0.1, top:size*0.1, width:size*0.22, height:size*0.22, borderRadius:size*0.11, backgroundColor:color }} />
  </View>
);

export const IconMuscle = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.58, height:size*0.38, borderRadius:size*0.22, backgroundColor:color, transform:[{ rotate:'-18deg' }] }} />
    <View style={{ position:'absolute', right:size*0.12, bottom:size*0.24, width:size*0.36, height:size*0.22, borderRadius:size*0.11, backgroundColor:color }} />
  </View>
);

export const IconTimer = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.68, height:size*0.68, borderRadius:size*0.34, borderWidth:2, borderColor:color }} />
    <View style={{ position:'absolute', top:size*0.02, width:size*0.28, height:size*0.12, borderRadius:2, backgroundColor:color }} />
    <View style={{ position:'absolute', width:2, height:size*0.25, backgroundColor:color, top:size*0.28 }} />
    <View style={{ position:'absolute', width:size*0.22, height:2, backgroundColor:color, left:size*0.5, top:size*0.5 }} />
  </View>
);

export const IconWarning = ({ size = D, color = '#f59e0b' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:0, height:0, borderLeftWidth:size*0.44, borderLeftColor:'transparent', borderRightWidth:size*0.44, borderRightColor:'transparent', borderBottomWidth:size*0.78, borderBottomColor:color }} />
    <View style={{ position:'absolute', top:size*0.35, width:2, height:size*0.22, backgroundColor:'#0f0a1e' }} />
    <View style={{ position:'absolute', bottom:size*0.18, width:3, height:3, borderRadius:2, backgroundColor:'#0f0a1e' }} />
  </View>
);

export const IconHistory = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.72, height:size*0.72, borderRadius:size*0.36, borderWidth:2, borderColor:color }} />
    <View style={{ position:'absolute', width:2, height:size*0.25, backgroundColor:color, top:size*0.28 }} />
    <View style={{ position:'absolute', width:size*0.22, height:2, backgroundColor:color, left:size*0.48, top:size*0.5 }} />
  </View>
);

export const IconCopy = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ position:'absolute', left:size*0.25, top:size*0.18, width:size*0.48, height:size*0.56, borderWidth:1.8, borderColor:color, borderRadius:3, opacity:0.55 }} />
    <View style={{ position:'absolute', left:size*0.12, top:size*0.3, width:size*0.48, height:size*0.56, borderWidth:1.8, borderColor:color, borderRadius:3 }} />
  </View>
);

export const IconDocument = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.62, height:size*0.78, borderWidth:1.8, borderColor:color, borderRadius:3 }}>
      {[0,1,2].map(i => <View key={i} style={{ height:1.6, width:size*(0.34 + i*0.06), backgroundColor:color, borderRadius:1, marginTop:size*0.14, marginLeft:size*0.1, opacity:0.75 }} />)}
    </View>
  </View>
);

export const IconRepeat = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ position:'absolute', top:size*0.22, left:size*0.16, right:size*0.16, height:size*0.24, borderTopWidth:2, borderLeftWidth:2, borderColor:color, borderTopLeftRadius:size*0.18 }} />
    <View style={{ position:'absolute', bottom:size*0.22, left:size*0.16, right:size*0.16, height:size*0.24, borderBottomWidth:2, borderRightWidth:2, borderColor:color, borderBottomRightRadius:size*0.18 }} />
    <View style={{ position:'absolute', right:size*0.08, top:size*0.12, width:0, height:0, borderTopWidth:size*0.14, borderTopColor:'transparent', borderBottomWidth:size*0.14, borderBottomColor:'transparent', borderLeftWidth:size*0.18, borderLeftColor:color }} />
    <View style={{ position:'absolute', left:size*0.08, bottom:size*0.12, width:0, height:0, borderTopWidth:size*0.14, borderTopColor:'transparent', borderBottomWidth:size*0.14, borderBottomColor:'transparent', borderRightWidth:size*0.18, borderRightColor:color }} />
  </View>
);

export const IconDownload = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:2, height:size*0.44, backgroundColor:color, borderRadius:1 }} />
    <View style={{ position:'absolute', top:size*0.46, width:size*0.34, height:size*0.34, borderRightWidth:2, borderBottomWidth:2, borderColor:color, transform:[{ rotate:'45deg' }] }} />
    <View style={{ position:'absolute', bottom:size*0.14, width:size*0.72, height:2, backgroundColor:color, borderRadius:1 }} />
  </View>
);

export const IconArrowUp = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.44, height:size*0.44, borderLeftWidth:2, borderTopWidth:2, borderColor:color, transform:[{ rotate:'45deg' }], marginTop:size*0.16 }} />
  </View>
);

export const IconArrowDown = ({ size = D, color = '#ffffff' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.44, height:size*0.44, borderRightWidth:2, borderBottomWidth:2, borderColor:color, transform:[{ rotate:'45deg' }], marginBottom:size*0.16 }} />
  </View>
);

export const IconSearch = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.5, height:size*0.5, borderRadius:size*0.25, borderWidth:2, borderColor:color, marginLeft:-size*0.08, marginTop:-size*0.08 }} />
    <View style={{ position:'absolute', right:size*0.16, bottom:size*0.16, width:size*0.28, height:2, backgroundColor:color, borderRadius:1, transform:[{ rotate:'45deg' }] }} />
  </View>
);

export const IconRefresh = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.66, height:size*0.66, borderRadius:size*0.33, borderWidth:2, borderRightColor:'transparent', borderColor:color, transform:[{ rotate:'25deg' }] }} />
    <View style={{ position:'absolute', right:size*0.08, top:size*0.2, width:0, height:0, borderTopWidth:size*0.13, borderTopColor:'transparent', borderBottomWidth:size*0.13, borderBottomColor:'transparent', borderLeftWidth:size*0.18, borderLeftColor:color }} />
  </View>
);

export const IconMessage = ({ size = D, color = '#a78bfa' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    <View style={{ width:size*0.78, height:size*0.56, borderWidth:1.8, borderColor:color, borderRadius:size*0.14 }} />
    <View style={{ position:'absolute', left:size*0.2, bottom:size*0.14, width:size*0.22, height:size*0.22, borderLeftWidth:1.8, borderBottomWidth:1.8, borderColor:color, transform:[{ rotate:'-35deg' }], backgroundColor:'transparent' }} />
  </View>
);

export const IconTarget = ({ size = D, color = '#a3e635' }) => (
  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>
    {[0.78,0.5,0.22].map((k,i) => (
      <View key={i} style={{ position:'absolute', width:size*k, height:size*k, borderRadius:size*k/2, borderWidth: i === 2 ? 0 : 1.8, borderColor:color, backgroundColor: i === 2 ? color : 'transparent', opacity: i === 0 ? 0.75 : 1 }} />
    ))}
  </View>
);
