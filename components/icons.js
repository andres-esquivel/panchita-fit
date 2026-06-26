/** * icons.js — Iconos inline como componentes React Native * Sin librerías externas. Geometría con Views + Text Unicode. */import React from 'react';import { View, Text } from 'react-native';const D = 22; // tamaño por defecto// Casa — para tab Inicioexport const IconHome = ({ size = D, color = '#ffffff' }) => (  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'flex-end' }}>    {/* Techo: triángulo con borders */}    <View style={{      width:0, height:0,      borderLeftWidth:size*0.5, borderLeftColor:'transparent',      borderRightWidth:size*0.5, borderRightColor:'transparent',      borderBottomWidth:size*0.44, borderBottomColor:color,      marginBottom:-1,    }} />    {/* Cuerpo */}    <View style={{ width:size*0.7, height:size*0.44, backgroundColor:color, borderRadius:2, alignItems:'center', justifyContent:'flex-end' }}>      {/* Puerta */}      <View style={{ width:size*0.22, height:size*0.28, backgroundColor:'#0f0a1e', borderRadius:2, marginBottom:0 }} />    </View>  </View>);// Mancuerna — para tab Workoutexport const IconDumbbell = ({ size = D, color = '#ffffff' }) => (  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center', flexDirection:'row' }}>    {/* Peso izq */}    <View style={{ width:size*0.18, height:size*0.72, backgroundColor:color, borderRadius:3 }} />    {/* Barra */}    <View style={{ width:size*0.44, height:size*0.18, backgroundColor:color }} />    {/* Peso der */}    <View style={{ width:size*0.18, height:size*0.72, backgroundColor:color, borderRadius:3 }} />  </View>);// Pata — para tab Coachexport const IconPaw = ({ size = D, color = '#ffffff' }) => (  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>    {/* Dedos */}    <View style={{ flexDirection:'row', gap:size*0.06, marginBottom:size*0.06 }}>      {[0,1,2,3].map(i => (        <View key={i} style={{          width:size*0.2, height:size*0.22,          backgroundColor:color, borderRadius:size*0.1,        }} />      ))}    </View>    {/* Almohadilla */}    <View style={{ width:size*0.6, height:size*0.44, backgroundColor:color, borderRadius:size*0.22 }} />  </View>);// Check / OKexport const IconCheck = ({ size = D, color = '#ffffff' }) => (  <Text style={{ fontSize:size*0.82, color, lineHeight:size*1.1, fontWeight:'700' }}>?</Text>);// Fuego (stats racha)export const IconFire = ({ size = D, color = '#f97316' }) => (  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'flex-end' }}>    <View style={{      width:size*0.55, height:size*0.8,      backgroundColor:color, borderRadius:size*0.28,      borderTopLeftRadius:size*0.5, borderTopRightRadius:size*0.1,    }} />    <View style={{      position:'absolute', bottom:size*0.08, left:size*0.28,      width:size*0.3, height:size*0.44,      backgroundColor:'#fbbf24', borderRadius:size*0.15,      borderTopRightRadius:size*0.4,    }} />  </View>);// Estrellaexport const IconStar = ({ size = D, color = '#a3e635' }) => (  <Text style={{ fontSize:size*0.85, color, lineHeight:size*1.1 }}>?</Text>);// Flecha derechaexport const IconArrow = ({ size = D, color = '#ffffff' }) => (  <Text style={{ fontSize:size*0.8, color, lineHeight:size*1.1 }}>?</Text>);// Cerrar / Xexport const IconClose = ({ size = D, color = '#ffffff' }) => (  <Text style={{ fontSize:size*0.82, color, lineHeight:size*1.1, fontWeight:'300' }}>?</Text>);// Más / Plusexport const IconPlus = ({ size = D, color = '#a78bfa' }) => (  <Text style={{ fontSize:size*0.9, color, lineHeight:size*1.1, fontWeight:'400' }}>+</Text>);// Calendario (semana)export const IconCalendar = ({ size = D, color = '#ffffff' }) => (  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>    <View style={{ width:size*0.82, height:size*0.75, borderWidth:1.5, borderColor:color, borderRadius:3 }}>      <View style={{ height:size*0.22, backgroundColor:color }} />    </View>    <View style={{ position:'absolute', top:size*0.04, flexDirection:'row', gap:size*0.28 }}>      <View style={{ width:size*0.12, height:size*0.18, borderWidth:1.5, borderColor:color, borderRadius:size*0.06 }} />      <View style={{ width:size*0.12, height:size*0.18, borderWidth:1.5, borderColor:color, borderRadius:size*0.06 }} />    </View>  </View>);// Trofeo / completadoexport const IconTrophy = ({ size = D, color = '#a3e635' }) => (  <View style={{ width:size, height:size, alignItems:'center', justifyContent:'center' }}>    {/* Copa */}    <View style={{ width:size*0.6, height:size*0.5, backgroundColor:color, borderRadius:size*0.12,      borderBottomLeftRadius:size*0.3, borderBottomRightRadius:size*0.3}} />    {/* Asas */}    <View style={{ position:'absolute', left:size*0.06, top:size*0.08,      width:size*0.2, height:size*0.3, borderWidth:2, borderColor:color,      borderTopRightRadius:size*0.15, borderBottomRightRadius:size*0.15,      borderLeftWidth:0 }} />    <View style={{ position:'absolute', right:size*0.06, top:size*0.08,      width:size*0.2, height:size*0.3, borderWidth:2, borderColor:color,      borderTopLeftRadius:size*0.15, borderBottomLeftRadius:size*0.15,      borderRightWidth:0 }} />    {/* Base */}    <View style={{ width:size*0.44, height:size*0.12, backgroundColor:color,      borderRadius:2, marginTop:-1 }} />    <View style={{ width:size*0.6, height:size*0.1, backgroundColor:color,      borderRadius:2 }} />  </View>);// Gráfica de barras ascendentes — para tab Progresoexport const IconChart = ({ size = D, color = '#ffffff' }) => (  <View style={{ width: size, height: size, justifyContent: 'flex-end', alignItems: 'center' }}>    {/* Línea base */}    <View style={{      position: 'absolute', bottom: size * 0.08, left: size * 0.04, right: size * 0.04,      height: 1.5, backgroundColor: color, opacity: 0.55, borderRadius: 1,    }} />    {/* Tres barras ascendentes */}    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: size * 0.1, paddingBottom: size * 0.1 }}>      <View style={{ width: size * 0.2, height: size * 0.3,  backgroundColor: color, borderRadius: 2, opacity: 0.7 }} />      <View style={{ width: size * 0.2, height: size * 0.52, backgroundColor: color, borderRadius: 2, opacity: 0.85 }} />      <View style={{ width: size * 0.2, height: size * 0.75, backgroundColor: color, borderRadius: 2 }} />    </View>  </View>);

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
