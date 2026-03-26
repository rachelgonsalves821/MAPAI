/**
 * Mapai — Delete Account Screen
 * Apple App Store requirement: in-app account deletion.
 */

import React, { useState } from 'react';
import {
  StyleSheet, View, Text, TouchableOpacity, SafeAreaView,
  TextInput, ScrollView, ActivityIndicator, Linking,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useAuthStore } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';
import apiClient from '@/services/api/client';

const DELETION_ITEMS = [
  { icon: 'person-outline', text: 'User profile and preferences' },
  { icon: 'chatbubbles-outline', text: 'Conversation history' },
  { icon: 'bulb-outline', text: 'Memory model and stored preferences' },
  { icon: 'heart-outline', text: 'Loved places and saved locations' },
  { icon: 'people-outline', text: 'Friend connections (mutual removal)' },
];

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isConfirmed = confirmText === 'DELETE';

  async function handleDelete() {
    if (!isConfirmed) return;
    setLoading(true);
    setError('');
    try {
      await apiClient.delete('/v1/user/account');
      useAuthStore.getState().logout();
      useOnboardingStore.getState().reset();
      await signOut();
      router.replace('/(auth)/landing');
    } catch (err: any) {
      setError(err.response?.data?.error?.title || err.message || 'Deletion failed.');
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} style={s.back}>
              <Ionicons name="arrow-back" size={24} color="#111827" />
            </TouchableOpacity>
            <Text style={s.title}>Delete Account</Text>
          </View>

          <View style={s.warning}>
            <Ionicons name="warning" size={20} color="#B91C1C" />
            <Text style={s.warningText}>This action is permanent and cannot be undone.</Text>
          </View>

          <Text style={s.section}>What will be deleted</Text>
          {DELETION_ITEMS.map((item, i) => (
            <View key={i} style={s.itemRow}>
              <View style={s.itemIcon}><Ionicons name={item.icon as any} size={18} color="#B91C1C" /></View>
              <Text style={s.itemText}>{item.text}</Text>
            </View>
          ))}

          <Text style={s.confirmLabel}>
            Type <Text style={{ fontWeight: '700', color: '#B91C1C' }}>DELETE</Text> to confirm
          </Text>
          <TextInput
            style={[s.input, isConfirmed && s.inputValid]}
            value={confirmText}
            onChangeText={(t) => setConfirmText(t.toUpperCase())}
            placeholder="Type DELETE"
            placeholderTextColor="#D1D5DB"
            autoCapitalize="characters"
            editable={!loading}
          />

          {error ? (
            <View style={s.errorCard}>
              <Text style={s.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => Linking.openURL('mailto:support@mapai.app?subject=Account%20Deletion%20Issue')}>
                <Text style={s.support}>Contact support@mapai.app</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <TouchableOpacity style={[s.btn, !isConfirmed && s.btnDisabled]} onPress={handleDelete} disabled={!isConfirmed || loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : (
              <Text style={[s.btnText, !isConfirmed && s.btnTextDisabled]}>Delete My Account</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  scroll: { paddingHorizontal: 24, paddingBottom: 40 },
  header: { paddingTop: 16, paddingBottom: 24 },
  back: { width: 40, height: 40, justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF2F2', padding: 14, borderRadius: 12, marginBottom: 28 },
  warningText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#B91C1C' },
  section: { fontSize: 13, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  itemIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#FEE2E2', justifyContent: 'center', alignItems: 'center' },
  itemText: { flex: 1, fontSize: 15, color: '#111827' },
  confirmLabel: { fontSize: 15, color: '#6B7280', marginTop: 20, marginBottom: 10 },
  input: { height: 52, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 16, fontSize: 18, fontWeight: '600', color: '#111827', letterSpacing: 2, marginBottom: 24 },
  inputValid: { borderColor: '#B91C1C', backgroundColor: '#FEF2F2' },
  errorCard: { backgroundColor: '#FEF2F2', padding: 14, borderRadius: 12, marginBottom: 16 },
  errorText: { fontSize: 14, color: '#B91C1C', marginBottom: 8 },
  support: { fontSize: 14, fontWeight: '600', color: '#1D3E91', textDecorationLine: 'underline' },
  btn: { height: 56, borderRadius: 999, backgroundColor: '#B91C1C', justifyContent: 'center', alignItems: 'center' },
  btnDisabled: { backgroundColor: '#F3F4F6' },
  btnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  btnTextDisabled: { color: '#9CA3AF' },
});
