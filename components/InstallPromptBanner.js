import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { IconClose, IconDownload, IconShare, IconPlus } from './icons';

const DISMISS_KEY = 'panchita_install_prompt_dismissed_at';
const DISMISS_DAYS = 14;

function hasWindow() {
  return typeof window !== 'undefined';
}

function isStandalone() {
  if (!hasWindow()) return false;
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true;
}

function getAgent() {
  if (!hasWindow()) return '';
  return window.navigator?.userAgent || '';
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(getAgent());
}

function isAndroid() {
  return /android/i.test(getAgent());
}

function recentlyDismissed() {
  if (!hasWindow()) return true;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const then = Number(raw);
    if (!Number.isFinite(then)) return false;
    return Date.now() - then < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function saveDismissed() {
  if (!hasWindow()) return;
  try { window.localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
}

export default function InstallPromptBanner() {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [kind, setKind] = useState('generic');

  useEffect(() => {
    if (Platform.OS !== 'web' || !hasWindow() || isStandalone() || recentlyDismissed()) return;

    const uaIsIOS = isIOS();
    const uaIsAndroid = isAndroid();

    if (uaIsIOS) setKind('ios');
    else if (uaIsAndroid) setKind('android');

    const timer = setTimeout(() => {
      if (uaIsIOS || uaIsAndroid) setVisible(true);
    }, 2200);

    function onBeforeInstallPrompt(event) {
      event.preventDefault();
      setDeferredPrompt(event);
      setKind('native');
      setVisible(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    };
  }, []);

  if (!visible) return null;

  const title = kind === 'ios' ? 'Usá PanchitaFit como app' : 'Instalá PanchitaFit';
  const body = kind === 'ios'
    ? 'En iPhone tocá Compartir y luego “Añadir a pantalla de inicio”. Panchita queda con icono propio, bien presumida.'
    : kind === 'native'
      ? 'Guardala en tu pantalla principal para abrirla como app y ver el icono pixel de Panchita.'
      : 'Desde el menú del navegador podés agregarla a tu pantalla principal.';

  async function handleInstall() {
    if (!deferredPrompt) return;
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setVisible(false);
      saveDismissed();
    } catch {
      // Si el navegador cancela el prompt, dejamos el banner visible.
    }
  }

  function dismiss() {
    saveDismissed();
    setVisible(false);
  }

  return (
    <View pointerEvents="box-none" style={s.wrap}>
      <View style={s.card}>
        <View style={s.iconBubble}>
          {kind === 'ios' ? <IconShare size={18} color={colors.accentText || '#fff'} /> : <IconDownload size={18} color={colors.accentText || '#fff'} />}
        </View>

        <View style={s.textBlock}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.body}>{body}</Text>
        </View>

        {deferredPrompt ? (
          <TouchableOpacity style={s.installBtn} onPress={handleInstall} activeOpacity={0.8}>
            <IconPlus size={14} color={colors.accentText || '#fff'} />
            <Text style={s.installTxt}>Instalar</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity style={s.closeBtn} onPress={dismiss} activeOpacity={0.75}>
          <IconClose size={14} color={colors.grayLight || '#bbb'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: {
      position: 'absolute', left: 12, right: 12, bottom: 82,
      zIndex: 9999, elevation: 20,
      alignItems: 'center',
    },
    card: {
      width: '100%', maxWidth: 620,
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.bgCard,
      borderWidth: 1, borderColor: colors.purple,
      borderRadius: 18,
      paddingVertical: 12, paddingHorizontal: 12,
      shadowColor: colors.purple,
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
    },
    iconBubble: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: colors.purple,
      alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    },
    textBlock: { flex: 1, minWidth: 0 },
    title: { color: colors.white, fontSize: 13, fontWeight: '900', marginBottom: 2 },
    body: { color: colors.grayLight, fontSize: 11, lineHeight: 15, fontWeight: '600' },
    installBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: colors.purple,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 8,
      flexShrink: 0,
    },
    installTxt: { color: colors.accentText || '#fff', fontSize: 11, fontWeight: '900' },
    closeBtn: {
      width: 30, height: 30, borderRadius: 15,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.bgInput,
      flexShrink: 0,
    },
  });
}
