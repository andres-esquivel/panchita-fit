import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator,
} from 'react-native';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../config/firebase';
import { useTheme } from '../contexts/ThemeContext';
import { RADIUS } from '../constants/theme';
import Panchita from '../components/Panchita';

const ERROR_MAP = {
  'auth/invalid-email':        'El email no es v\u00e1lido.',
  'auth/email-already-in-use': 'Ya existe una cuenta con ese email.',
  'auth/weak-password':        'La contrase\u00f1a debe tener al menos 6 caracteres.',
  'auth/network-request-failed': 'Sin conexi\u00f3n. Revis\u00e1 tu internet.',
};

function mapError(code) {
  return ERROR_MAP[code] || 'Ocurri\u00f3 un error. Intent\u00e1 de nuevo.';
}

export default function RegisterScreen({ onGoLogin }) {
  const { colors } = useTheme();
  const s = useMemo(() => createStyles(colors), [colors]);

  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);

  async function handleRegister() {
    setError('');
    if (!email.trim()) { setError('Ingres\u00e1 tu email.'); return; }
    if (password.length < 6) { setError('La contrase\u00f1a debe tener al menos 6 caracteres.'); return; }
    if (password !== confirmPass) { setError('Las contrase\u00f1as no coinciden.'); return; }
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      console.log('Firebase error:', e.code, e.message);
      setError(e.code + ': ' + e.message);
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

          <Text style={s.title}>{'¡'}Creá tu cuenta!</Text>
          <Text style={s.subtitle}>Panchita te está esperando</Text>

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
            <TextInput
              style={s.input}
              placeholder="Confirmá la contraseña"
              placeholderTextColor={colors.gray}
              secureTextEntry
              value={confirmPass}
              onChangeText={setConfirmPass}
            />

            {!!error && <Text style={s.errorText}>{error}</Text>}

            <TouchableOpacity style={s.btn} onPress={handleRegister} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.btnText}>Crear cuenta</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity onPress={onGoLogin} style={s.linkWrap}>
              <Text style={s.link}>{'¿'}Ya tenés cuenta? <Text style={s.linkBold}>Iniciá sesión</Text></Text>
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
