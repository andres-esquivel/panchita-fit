/**
 * Sisifo.js — mascota sprite sheet v1
 *
 * Sísifo es la mascota de fuerza constante: piedra/gólem con lentes teal
 * empujando su roca cuesta arriba. Usa el mismo patrón mental que Panchita:
 * un strip horizontal de 6 frames (1536×256) y estados semánticos simples.
 *
 * Props:
 *   state    : 'idle' | 'neutral' | 'push' | 'wave' | 'happy' | 'angry' | 'thinking' | 'tired'
 *   size     : número (lado del cuadro visible), default 180
 *   autoWave : bool (default true) — hace un empujón/saludo al montar
 *   onIdle   : () => void — callback al volver a idle tras animación temporal
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Pressable } from 'react-native';

const PUSH_STRIP = require('../assets/sisifo-pixel-push-strip.png');
const FRAME_COUNT = 6;

const STATE_CONFIG = {
  idle:     { fps: 2, duration: null },
  neutral:  { fps: 2, duration: null },
  push:     { fps: 5, duration: null },
  wave:     { fps: 6, duration: 1900 },
  happy:    { fps: 7, duration: 2400 },
  angry:    { fps: 8, duration: 1600 },
  thinking: { fps: 2, duration: null },
  tired:    { fps: 1.5, duration: null },
};

export default function Sisifo({
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
    }, 700);
    return () => clearTimeout(t);
  }, []);

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
    activate('push');
  }

  return (
    <Pressable onPress={handleTap} accessibilityRole="imagebutton" accessibilityLabel="Sísifo empujando la roca">
      <View style={{ width: size, height: size, overflow: 'hidden' }}>
        <Image
          source={PUSH_STRIP}
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
