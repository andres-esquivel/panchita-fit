/**
 * Panchita.js — Capas animadas v3
 *
 * Novedades:
 *  - Brazo derecho con 2 imágenes (abajo / saludo) + crossfade
 *  - Tamaño 260×360 (antes 220×300)
 *  - Idle: respiración + micro-acciones aleatorias (cabeceo, saludo, bounce)
 *  - Tap: reacción aleatoria (miniWave | nod | bounce)
 *
 * Layout calibrado a size=260 con PanchitaEditor:
 *   brazoIzq  top=38%  left=5%   scale=59%  rotation=12°
 *   cuerpo    top=16%  left=0%   scale=100%
 *   brazoDer  top=36%  left=31%  scale=65%
 *   cabeza    top=9%   left=20%  scale=59%
 *
 * Props:
 *   state    : 'idle' | 'wave' | 'happy' | 'angry'
 *   size     : número (ancho del container), default 260
 *   autoWave : bool (default true) — lanza wave al montar
 *   onIdle   : () => void — callback al volver a idle
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Animated, Easing, Pressable } from 'react-native';

// ── Assets ────────────────────────────────────────────────────────────────────
const IMGS = {
  brazoIzq:     require('../assets/panchita-brazo-izquierdo.png'),
  cuerpo:       require('../assets/panchita-cuerpo.png'),
  brazoDer:     require('../assets/panchita-brazo-derecho.png'),
  brazoDerUp:   require('../assets/panchita-brazo-derecho-saludo.png'),
  cabeza:       require('../assets/panchita-cabeza.png'),
};

// ── Layout por capa (fracciones de `size`) ────────────────────────────────────
const L = {
  brazoIzq:   { top: 0.3728, left: 0.0546, scale: 0.59, rotation: 17, amplitude: 1.00 },
  cuerpo:     { top: 0.1636, left: 0.0000, scale: 1.00, rotation:  0, amplitude: 1.00 },
  brazoDer:   { top: 0.3546, left: 0.3091, scale: 0.66, rotation:  0, amplitude: 1.05 },
  brazoDerUp: { top: 0.0846, left: 0.3001, scale: 0.66, rotation:  0, amplitude: 1.05 },
  cabeza:     { top: 0.0909, left: 0.1955, scale: 0.59, rotation:  0, amplitude: 1.00 },

  // Pivot hombro — centro del hombro en la imagen.
  // shoulderOY=0 → pivot en el centro exacto del layer (ajustar con editor si hace falta)
  shoulderOX:   0.0,
  shoulderOY:   0.0,

  shoulderUpOX:  0.0,
  shoulderUpOY:  0.0,

  // Pivot cuello
  neckOY: 0.113,

  // armUpAngle=0: la imagen saludo ya tiene el brazo levantado
  armUpAngle: 0,
  armTransitionSpeed: 6,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }

// ── Componente ────────────────────────────────────────────────────────────────
export default function Panchita({
  state         = 'idle',
  size          = 260,
  autoWave      = true,
  onIdle,
  layerOverride  = null,  // DEV: inyectar valores de PanchitaEditor
  globalOverride = null,  // DEV: inyectar armUpAngle / armTransitionSpeed
}) {
  // Merge de overrides (solo en __DEV__)
  const _L = {
    ...L,
    ...(layerOverride  || {}),
    armUpAngle:         globalOverride?.armUpAngle         ?? L.armUpAngle,
    armTransitionSpeed: globalOverride?.armTransitionSpeed ?? L.armTransitionSpeed,
  };
  const mounted       = useRef(true);
  const stateLoopRef  = useRef(null);   // animación de estado activo
  const stateTimerRef = useRef(null);   // timeout de estado
  const breathLoopRef = useRef(null);   // respiración idle (permanente)
  const idleTimerRef  = useRef(null);   // timer de acción aleatoria
  const idleAnimRef   = useRef(null);   // animación aleatoria en curso
  const skipRef       = useRef(autoWave);

  const [curState, setCurState]     = useState('idle');
  const [armUp,    setArmUp]        = useState(false); // qué imagen de brazo mostrar

  // ── Animated values ───────────────────────────────────────────────────────
  // Estado
  const rArmRot   = useRef(new Animated.Value(0)).current; // rotación brazo der (state)
  const headTilt  = useRef(new Animated.Value(0)).current;
  const wholeY    = useRef(new Animated.Value(0)).current;
  const armsOut   = useRef(new Animated.Value(0)).current;
  const wholeX    = useRef(new Animated.Value(0)).current;
  // Crossfade entre brazo-abajo y brazo-saludo
  const armDownOp = useRef(new Animated.Value(1)).current; // 1=visible, 0=oculto
  const armUpOp   = useRef(new Animated.Value(0)).current;

  // Idle micro-animaciones
  const idleBreath  = useRef(new Animated.Value(0)).current;
  const idleHeadRot = useRef(new Animated.Value(0)).current;
  const idleHeadX   = useRef(new Animated.Value(0)).current;
  const idleRArmR   = useRef(new Animated.Value(0)).current; // rotación brazo der (idle)
  const idleLArmR   = useRef(new Animated.Value(0)).current;
  const idleBodyS   = useRef(new Animated.Value(0)).current; // respiración notoria

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    mounted.current = true;
    go('idle');
    const t = autoWave ? setTimeout(() => { if (mounted.current) go('wave'); }, 1400) : null;
    return () => {
      mounted.current = false;
      if (t) clearTimeout(t);
      killAll();
    };
  }, []);

  useEffect(() => {
    if (skipRef.current) { skipRef.current = false; return; }
    go(state);
  }, [state]);

  // ── Kill helpers ──────────────────────────────────────────────────────────
  function killState() {
    stateLoopRef.current?.stop();  stateLoopRef.current  = null;
    if (stateTimerRef.current) { clearTimeout(stateTimerRef.current); stateTimerRef.current = null; }
    rArmRot.setValue(0); headTilt.setValue(0);
    wholeY.setValue(0);  armsOut.setValue(0); wholeX.setValue(0);
    // Brazo vuelve a "abajo" si estaba arriba
    armDownOp.setValue(1); armUpOp.setValue(0);
    setArmUp(false);
  }

  function killIdle() {
    breathLoopRef.current?.stop(); breathLoopRef.current = null;
    idleAnimRef.current?.stop();   idleAnimRef.current   = null;
    if (idleTimerRef.current) { clearTimeout(idleTimerRef.current); idleTimerRef.current = null; }
    idleBreath.setValue(0); idleHeadRot.setValue(0); idleHeadX.setValue(0);
    idleRArmR.setValue(0);  idleLArmR.setValue(0);   idleBodyS.setValue(0);
    armDownOp.setValue(1);  armUpOp.setValue(0);
    setArmUp(false);
  }

  function killAll() { killState(); killIdle(); }

  // ── Navegación ────────────────────────────────────────────────────────────
  function done() {
    if (!mounted.current) return;
    go('idle');
    onIdle?.();
  }

  function go(name) {
    if (!mounted.current) return;
    killAll();
    setCurState(name);
    switch (name) {
      case 'idle':  runIdle();  break;
      case 'wave':  runWave();  break;
      case 'happy': runHappy(); break;
      case 'angry': runAngry(); break;
    }
  }

  // ── Spring helper ─────────────────────────────────────────────────────────
  function sp(val, to, speed = 12, bounciness = 2) {
    return Animated.spring(val, { toValue: to, speed, bounciness, useNativeDriver: true });
  }
  function tm(val, to, ms, easing = Easing.inOut(Easing.ease)) {
    return Animated.timing(val, { toValue: to, duration: ms, easing, useNativeDriver: true });
  }

  // ── Crossfade helpers ─────────────────────────────────────────────────────
  function fadeToUp() {
    return Animated.parallel([
      tm(armDownOp, 0, 60),
      tm(armUpOp,   1, 60),
    ]);
  }
  function fadeToDown() {
    return Animated.parallel([
      tm(armDownOp, 1, 60),
      tm(armUpOp,   0, 60),
    ]);
  }

  // ── WAVE sequence (arm up/oscillate/down + crossfade) ─────────────────────
  function armWaveSequence(armRot, onUp, onDown) {
    // onUp / onDown son callbacks para setArmUp(true/false)
    return Animated.sequence([
      // 1. Subir brazo a armUpAngle
      sp(armRot, _L.armUpAngle, 6, 1),
      // 2. Crossfade a imagen-saludo
      Animated.parallel([
        fadeToUp(),
        Animated.delay(0),
      ]),
      // 3. Oscilar 3 veces — movimiento sutil
      Animated.sequence([
        sp(armRot, _L.armUpAngle + 6, 14, 3),
        sp(armRot, _L.armUpAngle - 6, 14, 3),
        sp(armRot, _L.armUpAngle + 6, 14, 3),
        sp(armRot, _L.armUpAngle - 6, 14, 3),
        sp(armRot, _L.armUpAngle + 6, 14, 3),
        sp(armRot, _L.armUpAngle - 6, 14, 3),
        sp(armRot, _L.armUpAngle, 10, 2),
      ]),
      // 4. Crossfade a imagen-abajo
      fadeToDown(),
      // 5. Bajar brazo
      sp(armRot, 0, 7, 1),
    ]);
  }

  // ── IDLE ──────────────────────────────────────────────────────────────────
  function runIdle() {
    // Respiración base — siempre en loop
    breathLoopRef.current = Animated.loop(Animated.sequence([
      tm(idleBreath, 1, 2000, Easing.inOut(Easing.sin)),
      tm(idleBreath, 0, 2000, Easing.inOut(Easing.sin)),
    ]));
    breathLoopRef.current.start();
    scheduleRandom();
  }

  function scheduleRandom() {
    if (!mounted.current) return;
    const ACTIONS = [
      { id: 'nod',       min: 5000,  max: 8000  },
      { id: 'look',      min: 8000,  max: 12000 },
      { id: 'miniWave',  min: 10000, max: 15000 },
      { id: 'larm',      min: 10000, max: 14000 },
      { id: 'bigBreathe',min: 8000,  max: 12000 },
    ];
    const action = ACTIONS[randInt(0, ACTIONS.length - 1)];
    const delay  = rand(action.min, action.max);

    idleTimerRef.current = setTimeout(() => {
      if (!mounted.current) return;
      const anim = buildIdleAnim(action.id);
      idleAnimRef.current = anim;
      anim.start(() => {
        idleAnimRef.current = null;
        if (mounted.current) scheduleRandom();
      });
    }, delay);
  }

  function buildIdleAnim(id) {
    const ampR = _L.brazoDer.amplitude;
    const ampL = _L.brazoIzq.amplitude;
    const ampH = _L.cabeza.amplitude;

    switch (id) {
      case 'nod':
        return Animated.sequence([
          sp(idleHeadRot, -8 * ampH, 10, 3),
          Animated.delay(180),
          sp(idleHeadRot, 0, 8, 2),
        ]);
      case 'look':
        return Animated.sequence([
          sp(idleHeadX, -6 * ampH, 10, 3),
          Animated.delay(400),
          sp(idleHeadX, 0, 8, 2),
        ]);
      case 'miniWave': {
        // Arm up/oscillate/down con crossfade — mismo flujo que runWave
        const seq = armWaveSequence(idleRArmR);
        // Sync arm image switch
        return Animated.sequence([
          // Necesitamos setArmUp via callbacks — usamos delay+setValue trick
          sp(idleRArmR, _L.armUpAngle, 6, 1),
          Animated.parallel([fadeToUp(), Animated.delay(0)]),
          Animated.sequence([
            sp(idleRArmR, _L.armUpAngle + 6 * ampR, 14, 3),
            sp(idleRArmR, _L.armUpAngle - 6 * ampR, 14, 3),
            sp(idleRArmR, _L.armUpAngle + 6 * ampR, 14, 3),
            sp(idleRArmR, _L.armUpAngle - 6 * ampR, 14, 3),
            sp(idleRArmR, _L.armUpAngle, 10, 2),
          ]),
          fadeToDown(),
          sp(idleRArmR, 0, 7, 1),
        ]);
      }
      case 'larm':
        return Animated.sequence([
          sp(idleLArmR, -18 * ampL, 8, 3),
          Animated.delay(300),
          sp(idleLArmR, 0, 6, 2),
        ]);
      case 'bigBreathe':
        return Animated.sequence([
          tm(idleBodyS, 1, 1200, Easing.inOut(Easing.sin)),
          tm(idleBodyS, 0, 1200, Easing.inOut(Easing.sin)),
        ]);
      default:
        return Animated.delay(500);
    }
  }

  // ── Tap reaction ──────────────────────────────────────────────────────────
  function handleTap() {
    if (curState !== 'idle') return; // no interrumpir animaciones activas
    killIdle();
    const opts = ['tapWave', 'tapNod', 'tapBounce'];
    const pick  = opts[randInt(0, opts.length - 1)];
    let anim;
    switch (pick) {
      case 'tapWave':
        anim = Animated.sequence([
          sp(idleRArmR, _L.armUpAngle, 6, 1),
          Animated.parallel([fadeToUp(), Animated.delay(0)]),
          sp(idleRArmR, _L.armUpAngle + 6, 18, 3),
          sp(idleRArmR, _L.armUpAngle - 6, 18, 3),
          sp(idleRArmR, _L.armUpAngle + 6, 18, 3),
          sp(idleRArmR, _L.armUpAngle, 10, 2),
          fadeToDown(),
          sp(idleRArmR, 0, 7, 1),
        ]);
        break;
      case 'tapNod':
        anim = Animated.sequence([
          sp(idleHeadRot, -12, 12, 4),
          Animated.delay(200),
          sp(idleHeadRot,   8, 10, 3),
          Animated.delay(100),
          sp(idleHeadRot,   0, 8,  2),
        ]);
        break;
      case 'tapBounce':
        anim = Animated.sequence([
          sp(wholeY, -18, 16, 6),
          sp(wholeY,   0, 12, 3),
        ]);
        break;
      default:
        anim = Animated.delay(100);
    }
    idleAnimRef.current = anim;
    anim.start(() => {
      idleAnimRef.current = null;
      if (mounted.current) {
        // Reiniciar idle
        wholeY.setValue(0);
        runIdle();
      }
    });
  }

  // ── WAVE (state) ──────────────────────────────────────────────────────────
  function runWave() {
    const ht = (to, ms) => tm(headTilt, to, ms);
    stateLoopRef.current = Animated.parallel([
      armWaveSequence(rArmRot),
      Animated.sequence([
        ht(8,200), ht(0,200), ht(8,200), ht(0,200),
        ht(8,200), ht(0,200), ht(8,200), ht(0,200),
      ]),
    ]);
    stateLoopRef.current.start(({ finished }) => { if (finished) done(); });
  }

  // ── HAPPY ─────────────────────────────────────────────────────────────────
  function runHappy() {
    stateLoopRef.current = Animated.loop(Animated.parallel([
      Animated.sequence([
        tm(wholeY, -22, 130), tm(wholeY, 0, 130),
      ]),
      Animated.sequence([
        tm(armsOut, 16, 130), tm(armsOut, 0, 130),
      ]),
    ]));
    stateLoopRef.current.start();
    stateTimerRef.current = setTimeout(() => { killAll(); done(); }, 2000);
  }

  // ── ANGRY ─────────────────────────────────────────────────────────────────
  function runAngry() {
    stateLoopRef.current = Animated.loop(Animated.parallel([
      Animated.sequence([
        tm(wholeX,   6, 75, Easing.linear),
        tm(wholeX,  -6, 75, Easing.linear),
      ]),
      Animated.sequence([
        tm(headTilt,  5, 75, Easing.linear),
        tm(headTilt, -5, 75, Easing.linear),
      ]),
    ]));
    stateLoopRef.current.start();
    stateTimerRef.current = setTimeout(() => { killAll(); done(); }, 2000);
  }

  // ── Dimensiones ───────────────────────────────────────────────────────────
  const S = size;
  const H = Math.round(S * 1.385); // 260 → 360

  const r  = k => Math.round(S * _L[k].scale);
  const lT = k => Math.round(S * _L[k].top);
  const lL = k => Math.round(S * _L[k].left);

  const headW  = r('cabeza');
  const armW   = r('brazoDer');
  const armUpW = r('brazoDerUp');
  const shOX   = armW   * _L.shoulderOX;
  const shOY   = armW   * _L.shoulderOY;
  const shUpOX = armUpW * _L.shoulderUpOX;
  const shUpOY = armUpW * _L.shoulderUpOY;
  const nkOY   = headW  * _L.neckOY;

  // ── Interpolaciones ───────────────────────────────────────────────────────
  const breathScaleY   = idleBreath.interpolate({ inputRange:[0,1], outputRange:[1, 1.015] });
  const breathBigScaleY= idleBodyS.interpolate({ inputRange:[0,1], outputRange:[1, 1.04] });
  const breathTY       = idleBreath.interpolate({ inputRange:[0,1], outputRange:[0, -1.5] });
  const headRotDeg     = idleHeadRot.interpolate({ inputRange:[-12,0,12], outputRange:['-12deg','0deg','12deg'] });
  // Rango fijo −180→180 para evitar inputRange inválido cuando armUpAngle=0
  const rArmIdleDeg    = idleRArmR.interpolate({ inputRange:[-180, 180], outputRange:['-180deg','180deg'] });
  const lArmIdleDeg    = idleLArmR.interpolate({ inputRange:[-180, 180], outputRange:['-180deg','180deg'] });

  const rArmStateDeg   = rArmRot.interpolate({ inputRange:[-180, 180], outputRange:['-180deg','180deg'] });
  // Rango unificado: cubre wave (0→8) y angry (±5) sin cambiar parámetros entre renders
  const headTiltDeg    = headTilt.interpolate({
    inputRange:  [-5, 0, 8],
    outputRange: ['-5deg', '0deg', '8deg'],
  });
  const rArmHappyDeg   = armsOut.interpolate({ inputRange:[0,16], outputRange:['0deg','-16deg'] });
  const lArmHappyDeg   = armsOut.interpolate({ inputRange:[0,16], outputRange:['0deg','16deg'] });

  // Combinar scale de respiración
  const cuerpoScaleY = Animated.add
    ? idleBreath.interpolate({ inputRange:[0,1], outputRange:[1,1] }) // placeholder
    : breathScaleY;
  // Usamos ambos como multiplicación aproximada via composición manual:
  // En idle: scaleY = 1 + (breathScaleY-1) + (breathBigScaleY-1)
  // Pero Animated no soporta multiplicación fácil, usamos el mayor de los dos
  const bodyScaleToUse = curState==='idle' ? breathBigScaleY : breathScaleY;

  // ── Pivot helper ──────────────────────────────────────────────────────────
  function pivot(deg, ox, oy) {
    return [{ translateX:ox },{ translateY:oy },{ rotate:deg },{ translateX:-ox },{ translateY:-oy }];
  }

  // ── Transforms por capa ───────────────────────────────────────────────────
  const isIdle  = curState==='idle';
  const isWave  = curState==='wave';
  const isHappy = curState==='happy';
  const isAngry = curState==='angry';

  // ── Happy/Angry: Animated.View envolvente mueve todo a la vez ──────────────
  // Las capas individuales solo necesitan manejar idle y wave.
  const wrapT = isHappy ? [{ translateY: wholeY }]
              : isAngry ? [{ translateX: wholeX }]
              : [];

  // Cuerpo (solo idle: respiración)
  const bodyT_ = isIdle ? [{ scaleY: breathScaleY }, { translateY: breathTY }] : [];

  // Cabeza
  const headT_ = [
    ...(isIdle ? [{ translateY: breathTY }, { translateX: idleHeadX }, { rotate: headRotDeg }] : []),
    ...(isWave || isAngry ? pivot(headTiltDeg, 0, nkOY) : []),
  ];

  // Brazo derecho (solo idle y wave — happy/angry lo mueve el wrapT)
  const rArmDeg_ = isIdle ? rArmIdleDeg : rArmStateDeg;
  const rArmT_   = (isIdle || isWave) ? pivot(rArmDeg_, shOX, shOY) : [];
  const rArmUpT_ = (isIdle || isWave) ? pivot(rArmDeg_, shUpOX, shUpOY) : [];

  // Brazo izquierdo (solo idle — happy/angry lo mueve el wrapT)
  const lArmT_   = isIdle ? pivot(lArmIdleDeg, -shOX, shOY) : [];

  // ── Layer style ───────────────────────────────────────────────────────────
  function layerStyle(key) {
    const w   = r(key);
    const rot = _L[key].rotation;
    const base = { position:'absolute', top:lT(key), left:lL(key), width:w, height:w };
    return rot ? { ...base, transform:[{ rotate:`${rot}deg` }] } : base;
  }

  // Combinar rotación base con transforms animados
  function merge(key, animT) {
    const rot = _L[key].rotation;
    const base = rot ? [{ rotate:`${rot}deg` }] : [];
    return [...base, ...animT];
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const armLayerBase   = { position:'absolute', top:lT('brazoDer'),   left:lL('brazoDer'),   width:armW,   height:armW   };
  const armUpLayerBase = { position:'absolute', top:lT('brazoDerUp'), left:lL('brazoDerUp'), width:armUpW, height:armUpW };

  return (
    <Pressable onPress={handleTap}>
      {/* Animated.View envolvente: mueve TODO el personaje en happy/angry */}
      <Animated.View style={{ width:S, height:H, transform: wrapT }}>

        {/* Capa 1 — brazo izquierdo (atrás) */}
        <Animated.Image source={IMGS.brazoIzq}
          style={[layerStyle('brazoIzq'), lArmT_.length ? { transform: merge('brazoIzq', lArmT_) } : null]}
          fadeDuration={0} resizeMode="contain" />

        {/* Capa 1b — brazo derecho SALUDO (detrás del cuerpo) */}
        <Animated.Image source={IMGS.brazoDerUp}
          style={[armUpLayerBase, { opacity:armUpOp }, rArmUpT_.length ? { transform: rArmUpT_ } : null]}
          fadeDuration={0} resizeMode="contain" />

        {/* Capa 2 — cuerpo */}
        <Animated.Image source={IMGS.cuerpo}
          style={[layerStyle('cuerpo'), bodyT_.length ? { transform:bodyT_ } : null]}
          fadeDuration={0} resizeMode="contain" />

        {/* Capa 3 — brazo derecho ABAJO (delante del cuerpo, visible cuando armDownOp=1) */}
        <Animated.Image source={IMGS.brazoDer}
          style={[armLayerBase, { opacity:armDownOp }, rArmT_.length ? { transform: rArmT_ } : null]}
          fadeDuration={0} resizeMode="contain" />

        {/* Capa 4 — cabeza */}
        <Animated.Image source={IMGS.cabeza}
          style={[layerStyle('cabeza'), headT_.length ? { transform:headT_ } : null]}
          fadeDuration={0} resizeMode="contain" />

      </Animated.View>
    </Pressable>
  );
}
