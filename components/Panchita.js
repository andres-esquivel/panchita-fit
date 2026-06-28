/**
 * Panchita.js — Sprite Sheet v4
 *
 * Reemplaza el sistema de capas animadas por sprite sheets pixel art de 6 frames.
 * Cada strip es 1536×256 (6 frames de 256×256).
 *
 * Props:
 *   state    : 'idle' | 'neutral' | 'wave' | 'happy' | 'angry' | 'thinking' |
 *              'flex' | 'celebrate' | 'sleepy' | 'tired' | 'bark'
 *   size     : número (lado del cuadrado visible), default 200
 *   autoWave : bool (default true) — lanza wave al montar
 *   onIdle   : () => void — callback al volver a idle tras animación
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Image, Pressable } from 'react-native';

// ── Assets ────────────────────────────────────────────────────────────────────
const STRIPS = {
  idle:     require('../assets/panchita-pixel-idle-v2-strip.png'),
  wave:     require('../assets/panchita-pixel-wave-strip.png'),
  bark:     require('../assets/panchita-pixel-bark-strip.png'),
  thinking: require('../assets/panchita-pixel-thinking-strip.png'),
  flex:     require('../assets/panchita-pixel-flex-strip.png'),
  sleepy:   require('../assets/panchita-pixel-sleepy-strip.png'),
};

const FRAME_COUNT = 6;

// ── Config por estado ─────────────────────────────────────────────────────────
// duration: null = loop infinito; número = ms hasta volver a idle
// fps de loops reducido a la mitad para que no sean tan rápidas
const STATE_CONFIG = {
  idle:      { strip: 'idle',     fps: 3,  duration: null },   // loop — 3fps (~333ms/frame)
  neutral:   { strip: 'idle',     fps: 3,  duration: null },   // loop
  waveLoop:  { strip: 'wave',     fps: 4,  duration: null },   // loop — para HomeScreen
  wave:      { strip: 'wave',     fps: 8,  duration: 2400 },   // one-shot
  happy:     { strip: 'wave',     fps: 8,  duration: 2000 },   // one-shot
  angry:     { strip: 'bark',     fps: 9,  duration: 2000 },   // one-shot
  bark:      { strip: 'bark',     fps: 9,  duration: 1200 },   // one-shot
  thinking:  { strip: 'thinking', fps: 3,  duration: null },   // loop — 3fps
  coach:     { strip: 'thinking', fps: 3,  duration: null },   // loop
  flex:      { strip: 'flex',     fps: 8,  duration: 2400 },   // one-shot
  celebrate: { strip: 'flex',     fps: 8,  duration: 2400 },   // one-shot
  sleepy:    { strip: 'sleepy',   fps: 2,  duration: null },   // loop — 2fps (muy suave)
  tired:     { strip: 'sleepy',   fps: 2,  duration: null },   // loop
};

// ── Componente ────────────────────────────────────────────────────────────────
export default function Panchita({
  state    = 'idle',
  size     = 200,
  autoWave = true,
  onIdle,
}) {
  const [activeState, setActiveState] = useState('idle');
  const [frame, setFrame]             = useState(0);

  const mountedRef   = useRef(true);
  const intervalRef  = useRef(null);
  const timerRef     = useRef(null);
  const prevStateRef = useRef(state);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(timerRef.current);
    };
  }, []);

  // Auto-wave al montar
  useEffect(() => {
    if (!autoWave) return;
    const t = setTimeout(() => {
      if (mountedRef.current) activate('wave');
    }, 1400);
    return () => clearTimeout(t);
  }, []);

  // Responder a cambios de prop `state` desde el padre
  useEffect(() => {
    if (state === prevStateRef.current) return;
    prevStateRef.current = state;
    activate(state);
  }, [state]);

  // Ticker de frames — se reinicia cuando cambia activeState
  const config = STATE_CONFIG[activeState] || STATE_CONFIG.idle;
  useEffect(() => {
    setFrame(0);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setFrame(f => (f + 1) % FRAME_COUNT);
    }, 1000 / config.fps);
    return () => clearInterval(intervalRef.current);
  }, [activeState]);

  // ── Activar un estado ─────────────────────────────────────────────────────
  function activate(name) {
    if (!mountedRef.current) return;
    clearTimeout(timerRef.current);
    setActiveState(name);
    const cfg = STATE_CONFIG[name] || STATE_CONFIG.idle;
    if (cfg.duration) {
      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setActiveState('idle');
        onIdle?.();
      }, cfg.duration);
    }
  }

  // Tap: bark breve
  function handleTap() {
    if (activeState !== 'idle' && activeState !== 'neutral') return;
    activate('bark');
  }

  const strip = STRIPS[config.strip] || STRIPS.idle;

  return (
    <Pressable onPress={handleTap}>
      <View style={{ width: size, height: size, overflow: 'hidden' }}>
        <Image
          source={strip}
          style={{
            width: size * FRAME_COUNT,
            height: size,
            transform: [{ translateX: -frame * size }],
          }}
          resizeMode="stretch"
          fadeDuration={0}
        />
      </View>
    </Pressable>
  );
}
