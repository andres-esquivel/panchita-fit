/**
 * PanchitaEditor.js — Editor visual de capas (DEV ONLY)
 * Solo se monta cuando __DEV__ === true.
 * Controles por capa: top, left, scale, rotation, speed, amplitude
 * Controles globales: armUpAngle, armTransitionSpeed
 * Botón "Copiar todos los valores" → clipboard JSON
 */
import React, { useState, useRef } from 'react';
import {
  View, Text, Image, TouchableOpacity, ScrollView,
  StyleSheet, Clipboard,
} from 'react-native';
import Panchita from '../components/Panchita';

if (!__DEV__) {
  // Exporta un no-op en producción — nunca se renderiza
  module.exports = () => null;
}

// ── Imágenes ─────────────────────────────────────────────────────────────────
const IMGS = {
  brazoIzq:   require('../assets/panchita-brazo-izquierdo.png'),
  cuerpo:     require('../assets/panchita-cuerpo.png'),
  brazoDer:   require('../assets/panchita-brazo-derecho.png'),
  brazoDerUp: require('../assets/panchita-brazo-derecho-saludo.png'),
  cabeza:     require('../assets/panchita-cabeza.png'),
};

const LAYER_NAMES  = ['brazoIzq', 'cuerpo', 'brazoDer', 'brazoDerUp', 'cabeza'];
const LAYER_LABELS = {
  brazoIzq:   '🦾 Brazo Izq',
  cuerpo:     '🐕 Cuerpo',
  brazoDer:   '💪 Brazo Der ↓',
  brazoDerUp: '🙋 Brazo Der ↑',
  cabeza:     '🐶 Cabeza',
};
const LAYER_COLORS = {
  brazoIzq:   '#f59e0b',
  cuerpo:     '#6366f1',
  brazoDer:   '#10b981',
  brazoDerUp: '#06b6d4',
  cabeza:     '#ec4899',
};
// Imagen a mostrar en canvas por capa
const LAYER_IMG_KEY = {
  brazoIzq:   'brazoIzq',
  cuerpo:     'cuerpo',
  brazoDer:   'brazoDer',
  brazoDerUp: 'brazoDerUp',
  cabeza:     'cabeza',
};

const BASE_SIZE = 340; // más grande para editar con comodidad

// Valores iniciales desde el último calibrado
const INIT = {
  brazoIzq:   { top: 0.3728, left: 0.0456, scale: 0.59, rotation: 12, speed: 1.0, amplitude: 1.05 },
  cuerpo:     { top: 0.1636, left: 0.0000, scale: 1.00, rotation:  0, speed: 1.0, amplitude: 1.00 },
  brazoDer:   { top: 0.3546, left: 0.3091, scale: 0.66, rotation:  0, speed: 1.0, amplitude: 1.05 },
  brazoDerUp: { top: 0.0846, left: 0.3001, scale: 0.66, rotation:  0, speed: 1.0, amplitude: 1.05 },
  cabeza:     { top: 0.0909, left: 0.1955, scale: 0.59, rotation:  0, speed: 1.0, amplitude: 1.00 },
};

// Globales de animación del brazo
const INIT_GLOBAL = {
  armUpAngle:           0,    // 0 = la imagen saludo ya tiene el brazo levantado, sin rotar
  armTransitionSpeed:   6,    // spring speed de la transición (1=lento, 20=rápido)
};

export default function PanchitaEditor({ onClose }) {
  const [layers,   setLayers]   = useState(() =>
    Object.fromEntries(LAYER_NAMES.map(k => [k, { ...INIT[k] }]))
  );
  const [global_,    setGlobal]    = useState({ ...INIT_GLOBAL });
  const [selected,   setSelected]  = useState('cabeza');
  const [armPreview, setArmPreview]= useState(false);
  const [copied,     setCopied]    = useState(false);
  const [showAnim,   setShowAnim]  = useState(false); // preview de animación real
  const [animState,  setAnimState] = useState('idle'); // estado para el preview

  function updateGlobal(field, delta, clamp) {
    setGlobal(prev => {
      const raw = prev[field] + delta;
      const val = clamp ? Math.max(clamp[0], Math.min(clamp[1], raw)) : raw;
      return { ...prev, [field]: parseFloat(val.toFixed(1)) };
    });
  }

  // ── Mutadores ─────────────────────────────────────────────────────────────
  function update(field, delta, clamp) {
    setLayers(prev => {
      const raw = prev[selected][field] + delta;
      const val = clamp ? Math.max(clamp[0], Math.min(clamp[1], raw)) : raw;
      return { ...prev, [selected]: { ...prev[selected], [field]: parseFloat(val.toFixed(4)) } };
    });
  }

  function set(field, val) {
    setLayers(prev => ({
      ...prev,
      [selected]: { ...prev[selected], [field]: parseFloat(val.toFixed(4)) },
    }));
  }

  function resetLayer() {
    setLayers(prev => ({ ...prev, [selected]: { ...INIT[selected] } }));
  }

  function resetAll() {
    setLayers(Object.fromEntries(LAYER_NAMES.map(k => [k, { ...INIT[k] }])));
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function buildJSON() {
    const out = {};
    for (const k of LAYER_NAMES) {
      const { top, left, scale, rotation, speed, amplitude } = layers[k];
      out[k] = { top, left, scale, rotation, speed, amplitude };
    }
    out._global = { ...global_ };
    return JSON.stringify(out, null, 2);
  }

  async function copyAll() {
    const json = buildJSON();
    try { await Clipboard.setStringAsync(json); } catch { Clipboard.setString(json); }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render de capas en canvas ─────────────────────────────────────────────
  const CANVAS_W = BASE_SIZE;
  const CANVAS_H = Math.round(BASE_SIZE * 1.385);

  function renderLayer(key) {
    const { top, left, scale, rotation } = layers[key];
    const w   = Math.round(BASE_SIZE * scale);
    const isSel = selected === key;

    // brazoDerUp: visible al 100% si está seleccionada o armPreview activo;
    // semitransparente si no para no confundir con brazoDer
    let opacity = 1;
    if (key === 'brazoDerUp' && !isSel && !armPreview) opacity = 0.25;
    if (key === 'brazoDer'   && (selected === 'brazoDerUp' && armPreview)) opacity = 0.25;

    // Imagen a renderizar (cada capa usa su propia imagen)
    const imgSrc = IMGS[LAYER_IMG_KEY[key]];

    // armUpAngle solo se aplica a brazoDerUp en preview (rotación de prueba)
    const extraRot = (key === 'brazoDerUp' && armPreview) ? global_.armUpAngle : 0;

    return (
      <TouchableOpacity
        key={key} activeOpacity={0.85}
        onPress={() => setSelected(key)}
        style={[styles.layerWrap, {
          top:    Math.round(BASE_SIZE * top),
          left:   Math.round(BASE_SIZE * left),
          width:  w,
          height: w,
          opacity,
          borderColor: isSel ? LAYER_COLORS[key] : 'transparent',
          borderWidth: isSel ? 2 : 0,
          transform: [{ rotate: `${rotation + extraRot}deg` }],
        }]}
      >
        <Image source={imgSrc} style={{ width: w, height: w }} resizeMode="contain" fadeDuration={0} />
      </TouchableOpacity>
    );
  }

  const sel = layers[selected];

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🔧 Panchita Editor</Text>
        <TouchableOpacity
          onPress={() => { setShowAnim(v => !v); setAnimState('idle'); }}
          style={[styles.animToggleBtn, showAnim && { backgroundColor:'#7c3aed' }]}
        >
          <Text style={styles.animToggleTxt}>{showAnim ? '🖼️ Editar' : '▶ Animar'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* ── CANVAS FIJO — siempre visible ── */}
      {showAnim ? (
        <View style={styles.animWrap}>
          <Panchita
            key={animState}
            state={animState}
            size={220}
            autoWave={false}
            onIdle={() => setAnimState('idle')}
            layerOverride={layers}
            globalOverride={global_}
          />
          <View style={styles.animBtns}>
            {['idle','wave','happy','angry'].map(s => (
              <TouchableOpacity key={s}
                style={[styles.animBtn, animState===s && styles.animBtnActive]}
                onPress={() => setAnimState(s)}
              >
                <Text style={[styles.animBtnTxt, animState===s && { color:'#fff' }]}>
                  {s==='idle'?'😴':s==='wave'?'👋':s==='happy'?'🎉':'😤'} {s}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.canvasWrap}>
          <View style={[styles.canvas, { width: CANVAS_W, height: CANVAS_H }]}>
            {LAYER_NAMES.map(renderLayer)}
          </View>
          <View style={styles.legend}>
            {LAYER_NAMES.map(k => (
              <TouchableOpacity key={k} onPress={() => setSelected(k)}
                style={[styles.legendItem, selected === k && { backgroundColor: LAYER_COLORS[k] + '33' }]}>
                <View style={[styles.legendDot, { backgroundColor: LAYER_COLORS[k] }]} />
                <Text style={[styles.legendTxt, selected === k && { color: LAYER_COLORS[k] }]}>
                  {LAYER_LABELS[k]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* ── CONTROLES CON SCROLL ── */}
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>

        {/* Panel de capa seleccionada */}
        <View style={styles.panel}>
          <Text style={[styles.panelTitle, { color: LAYER_COLORS[selected] }]}>
            {LAYER_LABELS[selected]}
          </Text>

          {/* Coordenadas live */}
          <View style={styles.coordRow}>
            {['top','left','scale'].map(f => (
              <Text key={f} style={styles.coordTxt}>
                {f}: <Text style={styles.coordVal}>{sel[f].toFixed(3)}</Text>
              </Text>
            ))}
          </View>

          {/* ── POSICIÓN: D-PAD ── */}
          <SectionLabel>Posición</SectionLabel>
          <View style={styles.dpad}>
            <View style={styles.dpadRow}>
              <Btn label="▲" onPress={() => update('top', -0.009)} onLong={() => update('top', -0.045)} />
            </View>
            <View style={styles.dpadRow}>
              <Btn label="◀" onPress={() => update('left', -0.009)} onLong={() => update('left', -0.045)} />
              <TouchableOpacity style={styles.resetMini} onPress={resetLayer}>
                <Text style={styles.resetMiniTxt}>↺</Text>
              </TouchableOpacity>
              <Btn label="▶" onPress={() => update('left', 0.009)} onLong={() => update('left', 0.045)} />
            </View>
            <View style={styles.dpadRow}>
              <Btn label="▼" onPress={() => update('top', 0.009)} onLong={() => update('top', 0.045)} />
            </View>
          </View>

          {/* ── TAMAÑO ── */}
          <SectionLabel>Tamaño (scale): {(sel.scale * 100).toFixed(0)}%</SectionLabel>
          <View style={styles.nudgeRow}>
            <Btn label="−−" onPress={() => update('scale', -0.05, [0.2, 1.5])} onLong={() => update('scale', -0.05, [0.2, 1.5])} />
            <Btn label="−"  onPress={() => update('scale', -0.01, [0.2, 1.5])} onLong={() => update('scale', -0.01, [0.2, 1.5])} />
            <View style={styles.nudgeVal}><Text style={[styles.nudgeValTxt, { color: LAYER_COLORS[selected] }]}>{(sel.scale*100).toFixed(0)}%</Text></View>
            <Btn label="+"  onPress={() => update('scale',  0.01, [0.2, 1.5])} onLong={() => update('scale',  0.01, [0.2, 1.5])} />
            <Btn label="++" onPress={() => update('scale',  0.05, [0.2, 1.5])} onLong={() => update('scale',  0.05, [0.2, 1.5])} />
          </View>
          <View style={styles.presetRow}>
            {[0.40,0.55,0.65,0.70,0.85,1.00].map(v => (
              <TouchableOpacity key={v} style={[styles.presetBtn, Math.abs(sel.scale-v)<0.005 && { backgroundColor: LAYER_COLORS[selected]+'55' }]}
                onPress={() => set('scale', v)}>
                <Text style={styles.presetTxt}>{(v*100).toFixed(0)}%</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── ROTACIÓN ── */}
          <SectionLabel>Rotación base: {sel.rotation.toFixed(0)}°</SectionLabel>
          <View style={styles.nudgeRow}>
            <Btn label="−15°" onPress={() => update('rotation', -15, [-180,180])} onLong={() => update('rotation', -15, [-180,180])} />
            <Btn label="−1°"  onPress={() => update('rotation',  -1, [-180,180])} onLong={() => update('rotation',  -1, [-180,180])} />
            <View style={styles.nudgeVal}><Text style={[styles.nudgeValTxt, { color: LAYER_COLORS[selected] }]}>{sel.rotation.toFixed(0)}°</Text></View>
            <Btn label="+1°"  onPress={() => update('rotation',   1, [-180,180])} onLong={() => update('rotation',   1, [-180,180])} />
            <Btn label="+15°" onPress={() => update('rotation',  15, [-180,180])} onLong={() => update('rotation',  15, [-180,180])} />
          </View>
          <View style={styles.presetRow}>
            {[-45,-15,0,15,45].map(v => (
              <TouchableOpacity key={v} style={[styles.presetBtn, Math.abs(sel.rotation-v)<0.5 && { backgroundColor: LAYER_COLORS[selected]+'55' }]}
                onPress={() => set('rotation', v)}>
                <Text style={styles.presetTxt}>{v}°</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── VELOCIDAD ── */}
          <SectionLabel>Velocidad anim: {sel.speed.toFixed(2)}×</SectionLabel>
          <View style={styles.nudgeRow}>
            <Btn label="−.25" onPress={() => update('speed', -0.25, [0.25,3])} onLong={() => update('speed', -0.25, [0.25,3])} />
            <Btn label="−.05" onPress={() => update('speed', -0.05, [0.25,3])} onLong={() => update('speed', -0.05, [0.25,3])} />
            <View style={styles.nudgeVal}><Text style={[styles.nudgeValTxt, { color: LAYER_COLORS[selected] }]}>{sel.speed.toFixed(2)}×</Text></View>
            <Btn label="+.05" onPress={() => update('speed',  0.05, [0.25,3])} onLong={() => update('speed',  0.05, [0.25,3])} />
            <Btn label="+.25" onPress={() => update('speed',  0.25, [0.25,3])} onLong={() => update('speed',  0.25, [0.25,3])} />
          </View>
          <View style={styles.presetRow}>
            {[0.5,0.75,1.0,1.5,2.0,3.0].map(v => (
              <TouchableOpacity key={v} style={[styles.presetBtn, Math.abs(sel.speed-v)<0.01 && { backgroundColor: LAYER_COLORS[selected]+'55' }]}
                onPress={() => set('speed', v)}>
                <Text style={styles.presetTxt}>{v}×</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── AMPLITUD ── */}
          <SectionLabel>Amplitud movim: {sel.amplitude.toFixed(2)}×</SectionLabel>
          <View style={styles.nudgeRow}>
            <Btn label="−.25" onPress={() => update('amplitude', -0.25, [0.25,3])} onLong={() => update('amplitude', -0.25, [0.25,3])} />
            <Btn label="−.05" onPress={() => update('amplitude', -0.05, [0.25,3])} onLong={() => update('amplitude', -0.05, [0.25,3])} />
            <View style={styles.nudgeVal}><Text style={[styles.nudgeValTxt, { color: LAYER_COLORS[selected] }]}>{sel.amplitude.toFixed(2)}×</Text></View>
            <Btn label="+.05" onPress={() => update('amplitude',  0.05, [0.25,3])} onLong={() => update('amplitude',  0.05, [0.25,3])} />
            <Btn label="+.25" onPress={() => update('amplitude',  0.25, [0.25,3])} onLong={() => update('amplitude',  0.25, [0.25,3])} />
          </View>
          <View style={styles.presetRow}>
            {[0.5,0.75,1.0,1.25,1.5,2.0].map(v => (
              <TouchableOpacity key={v} style={[styles.presetBtn, Math.abs(sel.amplitude-v)<0.01 && { backgroundColor: LAYER_COLORS[selected]+'55' }]}
                onPress={() => set('amplitude', v)}>
                <Text style={styles.presetTxt}>{v}×</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Panel global: brazo derecho ── */}
        <View style={[styles.panel, { borderColor:'#10b981' }]}>
          <Text style={[styles.panelTitle, { color:'#10b981' }]}>💪 Brazo Der — Animación</Text>

          {/* Toggle preview brazo abajo/saludo */}
          <TouchableOpacity
            style={[styles.presetBtn, { paddingHorizontal:20, paddingVertical:10, marginBottom:14, backgroundColor: armPreview ? '#10b98133' : '#241840' }]}
            onPress={() => setArmPreview(v => !v)}
          >
            <Text style={[styles.presetTxt, { color: armPreview ? '#10b981' : '#a78bfa' }]}>
              {armPreview ? '🙋 Viendo: brazo SALUDO' : '🙆 Viendo: brazo ABAJO'}
            </Text>
          </TouchableOpacity>

          {/* armUpAngle */}
          <SectionLabel>Ángulo posición saludo: {global_.armUpAngle.toFixed(0)}°</SectionLabel>
          <Text style={styles.hint}>Ajusta hasta que brazo-abajo (rotado) coincida visualmente con brazo-saludo</Text>
          <View style={styles.nudgeRow}>
            <Btn label="−10°" onPress={() => updateGlobal('armUpAngle', -10, [-180,0])} onLong={() => updateGlobal('armUpAngle', -10, [-180,0])} />
            <Btn label="−1°"  onPress={() => updateGlobal('armUpAngle',  -1, [-180,0])} onLong={() => updateGlobal('armUpAngle',  -1, [-180,0])} />
            <View style={styles.nudgeVal}><Text style={[styles.nudgeValTxt, { color:'#10b981' }]}>{global_.armUpAngle.toFixed(0)}°</Text></View>
            <Btn label="+1°"  onPress={() => updateGlobal('armUpAngle',   1, [-180,0])} onLong={() => updateGlobal('armUpAngle',   1, [-180,0])} />
            <Btn label="+10°" onPress={() => updateGlobal('armUpAngle',  10, [-180,0])} onLong={() => updateGlobal('armUpAngle',  10, [-180,0])} />
          </View>
          <View style={styles.presetRow}>
            {[-150,-130,-110,-90].map(v => (
              <TouchableOpacity key={v} style={[styles.presetBtn, Math.abs(global_.armUpAngle-v)<0.5 && { backgroundColor:'#10b98144' }]}
                onPress={() => setGlobal(p => ({ ...p, armUpAngle: v }))}>
                <Text style={styles.presetTxt}>{v}°</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* armTransitionSpeed */}
          <SectionLabel>Velocidad de transición: {global_.armTransitionSpeed.toFixed(1)}</SectionLabel>
          <View style={styles.nudgeRow}>
            <Btn label="−2"  onPress={() => updateGlobal('armTransitionSpeed', -2, [1,20])} onLong={() => updateGlobal('armTransitionSpeed', -2, [1,20])} />
            <Btn label="−0.5" onPress={() => updateGlobal('armTransitionSpeed', -0.5, [1,20])} onLong={() => updateGlobal('armTransitionSpeed', -0.5, [1,20])} />
            <View style={styles.nudgeVal}><Text style={[styles.nudgeValTxt, { color:'#10b981' }]}>{global_.armTransitionSpeed.toFixed(1)}</Text></View>
            <Btn label="+0.5" onPress={() => updateGlobal('armTransitionSpeed',  0.5, [1,20])} onLong={() => updateGlobal('armTransitionSpeed',  0.5, [1,20])} />
            <Btn label="+2"   onPress={() => updateGlobal('armTransitionSpeed',  2,   [1,20])} onLong={() => updateGlobal('armTransitionSpeed',  2,   [1,20])} />
          </View>
          <View style={styles.presetRow}>
            {[2,4,6,8,12,16].map(v => (
              <TouchableOpacity key={v} style={[styles.presetBtn, Math.abs(global_.armTransitionSpeed-v)<0.1 && { backgroundColor:'#10b98144' }]}
                onPress={() => setGlobal(p => ({ ...p, armTransitionSpeed: v }))}>
                <Text style={styles.presetTxt}>{v}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Botones globales */}
        <View style={styles.globalRow}>
          <TouchableOpacity style={styles.btnSec} onPress={resetAll}>
            <Text style={styles.btnSecTxt}>Reset todo</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btnPri, copied && styles.btnPriOk]} onPress={copyAll}>
            <Text style={styles.btnPriTxt}>{copied ? '✓ Copiado!' : '📋 Copiar todos'}</Text>
          </TouchableOpacity>
        </View>

        {/* JSON preview */}
        <View style={styles.jsonBox}>
          <Text style={styles.jsonTitle}>JSON (pegar en Panchita.js → const L)</Text>
          <Text style={styles.jsonTxt} selectable>{buildJSON()}</Text>
        </View>

        <View style={{ height: 48 }} />
      </ScrollView>
    </View>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function Btn({ label, onPress, onLong }) {
  const iv = useRef(null);
  function startLong() { iv.current = setInterval(onLong, 80); }
  function stopLong()  { if (iv.current) { clearInterval(iv.current); iv.current = null; } }
  return (
    <TouchableOpacity style={styles.btn} onPress={onPress}
      onLongPress={startLong} onPressOut={stopLong} delayLongPress={300}>
      <Text style={styles.btnTxt}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#0f0a1e' },
  header: { flexDirection:'row', alignItems:'center', justifyContent:'space-between',
            paddingHorizontal:20, paddingTop:56, paddingBottom:12,
            borderBottomWidth:1, borderBottomColor:'#3b1f72' },
  title:    { color:'#a78bfa', fontSize:18, fontWeight:'700' },
  closeBtn: { width:36, height:36, borderRadius:18, backgroundColor:'#241840', alignItems:'center', justifyContent:'center' },
  closeTxt: { color:'#fff', fontSize:16 },

  scroll: { padding: 16 },

  canvasWrap: { alignItems:'center', marginBottom:20 },
  canvas:     { backgroundColor:'#1a1130', borderRadius:16, position:'relative', overflow:'visible' },
  layerWrap:  { position:'absolute', borderRadius:4 },

  legend:     { flexDirection:'row', flexWrap:'wrap', justifyContent:'center', marginTop:12, gap:8 },
  legendItem: { flexDirection:'row', alignItems:'center', paddingHorizontal:10, paddingVertical:4, borderRadius:20, backgroundColor:'#1a1130' },
  legendDot:  { width:8, height:8, borderRadius:4, marginRight:6 },
  legendTxt:  { color:'#9ca3af', fontSize:12, fontWeight:'600' },

  panel: { backgroundColor:'#1a1130', borderRadius:16, padding:16, marginBottom:12, borderWidth:1, borderColor:'#3b1f72' },
  panelTitle: { fontSize:15, fontWeight:'700', marginBottom:10 },

  sectionLabel: { color:'#9ca3af', fontSize:12, fontWeight:'600', marginTop:14, marginBottom:6, textTransform:'uppercase', letterSpacing:0.5 },
  hint: { color:'#6b7280', fontSize:11, marginBottom:6, lineHeight:16 },

  coordRow: { flexDirection:'row', gap:12, marginBottom:8 },
  coordTxt: { color:'#9ca3af', fontSize:12 },
  coordVal: { color:'#fff', fontWeight:'700' },

  dpad:     { alignItems:'center', marginBottom:4 },
  dpadRow:  { flexDirection:'row', alignItems:'center', justifyContent:'center' },
  resetMini:{ width:40, height:40, backgroundColor:'#3b1f72', borderRadius:10, alignItems:'center', justifyContent:'center', margin:4 },
  resetMiniTxt:{ color:'#fff', fontSize:18 },

  nudgeRow: { flexDirection:'row', alignItems:'center', gap:4, marginBottom:8 },
  nudgeVal: { flex:1, alignItems:'center', justifyContent:'center', backgroundColor:'#0a0715', borderRadius:8, paddingVertical:8 },
  nudgeValTxt:{ fontSize:16, fontWeight:'800' },

  btn:    { minWidth:38, height:38, backgroundColor:'#241840', borderRadius:10, alignItems:'center', justifyContent:'center', paddingHorizontal:6, margin:2 },
  btnTxt: { color:'#a78bfa', fontSize:13, fontWeight:'700' },

  presetRow: { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:4 },
  presetBtn: { paddingHorizontal:10, paddingVertical:5, backgroundColor:'#241840', borderRadius:8, alignItems:'center' },
  presetTxt: { color:'#a78bfa', fontSize:11, fontWeight:'600' },

  globalRow: { flexDirection:'row', gap:12, marginBottom:12 },
  btnSec:    { flex:1, paddingVertical:12, backgroundColor:'#241840', borderRadius:12, alignItems:'center' },
  btnSecTxt: { color:'#9ca3af', fontWeight:'600' },
  btnPri:    { flex:2, paddingVertical:12, backgroundColor:'#7c3aed', borderRadius:12, alignItems:'center' },
  btnPriOk:  { backgroundColor:'#059669' },
  btnPriTxt: { color:'#fff', fontWeight:'700', fontSize:15 },

  jsonBox:   { backgroundColor:'#0a0715', borderRadius:12, padding:14, borderWidth:1, borderColor:'#3b1f72' },
  jsonTitle: { color:'#6b7280', fontSize:11, marginBottom:8 },
  jsonTxt:   { color:'#a3e635', fontSize:10, fontFamily:'monospace' },

  // header animation toggle
  animToggleBtn: { paddingHorizontal:14, paddingVertical:8, backgroundColor:'#241840', borderRadius:20, marginRight:8 },
  animToggleTxt: { color:'#a78bfa', fontWeight:'700', fontSize:13 },

  // animation preview panel
  animWrap: { alignItems:'center', marginBottom:20, backgroundColor:'#1a1130', borderRadius:16, padding:20 },
  animHint: { color:'#6b7280', fontSize:11, marginBottom:16 },
  animBtns: { flexDirection:'row', gap:8, marginTop:20, flexWrap:'wrap', justifyContent:'center' },
  animBtn:  { paddingHorizontal:14, paddingVertical:9, backgroundColor:'#241840', borderRadius:12 },
  animBtnActive: { backgroundColor:'#7c3aed' },
  animBtnTxt: { color:'#9ca3af', fontWeight:'600', fontSize:13 },
});
