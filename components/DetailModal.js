import React from 'react';
import { Modal, View, Text, TouchableOpacity, SafeAreaView, StyleSheet } from 'react-native';
import { IconBack } from './icons';

// Pantalla completa encima de las tabs, para abrir Progreso o Ajustes desde Dashboard / Más.
export default function DetailModal({ visible, onClose, colors, children, backLabel = 'Volver' }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={st.bar}>
          <TouchableOpacity onPress={onClose} style={st.back} activeOpacity={0.7}>
            <IconBack size={20} color={colors.purpleLight} />
            <Text style={[st.backTxt, { color: colors.purpleLight }]}>{backLabel}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>{visible ? children : null}</View>
      </SafeAreaView>
    </Modal>
  );
}

const st = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, alignSelf: 'flex-start', paddingRight: 12 },
  backTxt: { fontSize: 15, fontWeight: '700' },
});
