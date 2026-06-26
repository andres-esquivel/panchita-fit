import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useTheme } from '../contexts/ThemeContext';
import { RADIUS } from '../constants/theme';
import Panchita from '../components/Panchita';

const ERROR_MAP = {
  'auth/invalid-email':          'El email no es v\u00e1lido.',
  'auth/user-not-found':         'No existe una cuenta con ese email.',
  'auth/wrong-password':         'Contrase\u00f1a incorrecta.',
  'auth/invalid-credential':     'Email o contrase\u00f1a incorrectos.',
  'auth/too-many-requests':      'Demasiados intentos. Intent\u00e1 m\u00e1s tarde.',
  'auth/network-request-failed': 'Sin conexi\u00f3n. Revis\u00e1 tu internet.',
};

function mapError(code) {
  return ERROR_MAP[code] || 'Ocurri\u00f3 un error. Intent\u00e1 de nuevo.';
}

export default function LoginScreen({ onGoRegister }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  async function handleLogin() {
    setError('');
    if (!email.trim()) { setError('Ingres\u00e1 tu email.'); return; }
    if (password.length < 6) { setError('La contrase\u00f1a debe tener al menos 6 caracteres.'); return; }
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(mapError(e.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.panchitaWrap}>
            <Panchita state="idle" size={140} />
          </View>

          <Text style={s.title}>{'¡'}Hola de nuevo!</Text>
          <Text style={s.subtitle}>Iniciá sesión para continuar</Text>

          <View style={s.form}>
            <TextInput
              style={s.input}
              placeholder="Email"
              placeholderTextColor={colors.gray}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={s.input}
              placeholder="Contraseña"
              placeholderTextColor={colors.gray}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            {!!error && <Text style={s.errorText}>{error}</Text>}

            <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Iniciar sesión</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={onGoRegister} style={s.linkWrap}>
              <Text style={s.link}>{'¿'}No tenés cuenta? <Text style={s.linkBold}>Registrate</Text></Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe:         { flex: 1, backgroundColor: colors.bg },
    scroll:       { flexGrow: 1, padding: 24, paddingTop: 16 },
    panchitaWrap: { alignItems: 'center', marginBottom: 8 },
    title:        { fontSize: 28, fontWeight: '700', color: colors.white, textAlign: 'center', marginBottom: 6 },
    subtitle:     { fontSize: 15, color: colors.gray, textAlign: 'center', marginBottom: 32 },
    form:         { gap: 14 },
    input:        {
      backgroundColor: colors.bgInput, borderRadius: RADIUS.md, paddingHorizontal: 16,
      paddingVertical: 14, fontSize: 15, color: colors.white,
      borderWidth: 1, borderColor: colors.purpleDim,
    },
    errorText:    { fontSize: 13, color: colors.danger, textAlign: 'center' },
    btn:          {
      backgroundColor: colors.purple, borderRadius: RADIUS.full,
      paddingVertical: 16, alignItems: 'center', marginTop: 4,
    },
    btnText:      { color: '#fff', fontWeight: '700', fontSize: 16 },
    linkWrap:     { alignItems: 'center', marginTop: 4 },
    link:         { fontSize: 14, color: colors.gray },
    linkBold:     { color: colors.purpleLight, fontWeight: '600' },
  });
}
