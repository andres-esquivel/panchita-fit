import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { RADIUS } from '../constants/theme';

/**
 * Reemplaza Alert.alert en React Native Web donde no funciona correctamente.
 * Usar siempre que se necesite confirmación del usuario.
 *
 * Props:
 *   visible          — bool
 *   title            — string
 *   message          — string | null
 *   onConfirm        — () => void
 *   onCancel         — () => void | null  (null = sin botón cancelar)
 *   confirmText      — string (default: 'Confirmar')
 *   confirmDestructive — bool (default: false → usa color accent; true → rojo)
 */
export default function ConfirmModal({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = 'Confirmar',
  confirmDestructive = false,
}) {
  const { colors } = useTheme();
  const s = createStyles(colors, confirmDestructive);

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onCancel || onConfirm}>
      <View style={s.overlay}>
        <View style={s.box}>
          {!!title && <Text style={s.title}>{title}</Text>}
          {!!message && <Text style={s.message}>{message}</Text>}

          <View style={[s.buttons, !onCancel && s.buttonsSingle]}>
            {!!onCancel && (
              <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.75}>
                <Text style={s.cancelText}>Cancelar</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.confirmBtn, !onCancel && s.confirmBtnFull]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text style={s.confirmText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors, destructive) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.78)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    box: {
      backgroundColor: colors.bgCard,
      borderRadius: RADIUS.xl,
      padding: 24,
      width: '100%',
      maxWidth: 360,
      borderWidth: 1,
      borderColor: destructive ? colors.danger : colors.purpleDim,
      shadowColor: destructive ? colors.danger : colors.purple,
      shadowOpacity: 0.4,
      shadowRadius: 16,
      elevation: 10,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.white,
      marginBottom: 8,
      textAlign: 'center',
    },
    message: {
      fontSize: 14,
      color: colors.grayLight,
      textAlign: 'center',
      lineHeight: 20,
      marginBottom: 20,
    },
    buttons: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    buttonsSingle: {
      justifyContent: 'center',
    },
    cancelBtn: {
      flex: 1,
      backgroundColor: colors.bgInput,
      borderRadius: RADIUS.full,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.purpleDim,
      minHeight: 48,
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.grayLight,
    },
    confirmBtn: {
      flex: 1,
      backgroundColor: destructive ? '#3f0f0f' : colors.purple,
      borderRadius: RADIUS.full,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: destructive ? colors.danger : colors.purple,
      minHeight: 48,
      justifyContent: 'center',
    },
    confirmBtnFull: {
      flex: undefined,
      paddingHorizontal: 32,
    },
    confirmText: {
      fontSize: 15,
      fontWeight: '700',
      color: destructive ? colors.danger : (colors.accentText || '#fff'),
    },
  });
}
