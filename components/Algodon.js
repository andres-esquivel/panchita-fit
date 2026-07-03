/**
 * Algodon.js — mascota sprite sheet v1
 *
 * Algodón es el conejo angora blanco: fluffy, compacto, lentes teal,
 * headband lime y actitud de coach que te mira como si ya supiera que
 * saltaste pantorrilla. Usa un strip horizontal de 6 frames (1536×256).
 *
 * Props:
 *   state    : 'idle' | 'neutral' | 'wave' | 'happy' | 'angry' | 'thinking' | 'sleepy' | 'bounce'
 *   size     : número (lado del cuadro visible), default 180
 *   autoWave : bool (default true) — saluda/rebota al montar
 *   onIdle   : () => void — callback al volver a idle tras animación temporal
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Pressable } from 'react-native';

const IDLE_STRIP = require('../assets/algodon-pixel-idle-strip.png');
const FRAME_COUNT = 6;

const STATE_CONFIG = {
  idle:     { fps: 2, duration: null },
  neutral:  { fps: 2, duration: null },
  wave:     { fps: 4, duration: 2200 },
  happy:    { fps: 5, duration: 2600 },
  bounce:   { fps: 5, duration: 2600 },
  angry:    { fps: 6, duration: 1800 },
  thinking: { fps: 2, duration: null },
  sleepy:   { fps: 1.5, duration: null },
};

export default function Algodon({
  state = 'idle',
  size = 180,
  autoWave = true,
  onIdle,
}) {
  const [activeState, setActiveState] = useState('idle');
  const [frame, setFrame] = useState(0);

  const mountedRef = useRef(true);
  const intervalRef = useRef(null);
  const timerRef = useRef(null);
  const prevStateRef = useRef(state);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!autoWave) return;
    const t = setTimeout(() => {
      if (mountedRef.current) activate('wave');
    }, 900);
    return () => clearTimeout(t);
  }, [autoWave]);

  useEffect(() => {
    if (state === prevStateRef.current) return;
    prevStateRef.current = state;
    activate(state);
  }, [state]);

  const config = STATE_CONFIG[activeState] || STATE_CONFIG.idle;

  useEffect(() => {
    setFrame(0);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setFrame(f => (f + 1) % FRAME_COUNT);
    }, 1000 / config.fps);
    return () => clearInterval(intervalRef.current);
  }, [activeState, config.fps]);

  function activate(name) {
    if (!mountedRef.current) return;
    clearTimeout(timerRef.current);
    setActiveState(STATE_CONFIG[name] ? name : 'idle');

    const cfg = STATE_CONFIG[name] || STATE_CONFIG.idle;
    if (cfg.duration) {
      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        setActiveState('idle');
        onIdle?.();
      }, cfg.duration);
    }
  }

  function handleTap() {
    if (activeState === 'idle' || activeState === 'neutral') activate('bounce');
  }

  return (
    <Pressable onPress={handleTap} accessibilityRole="imagebutton" accessibilityLabel="Algodón, conejo angora coach">
      <View style={{ width: size, height: size, overflow: 'hidden' }}>
        <Image
          source={IDLE_STRIP}
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
