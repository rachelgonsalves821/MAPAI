/**
 * Mapai — Sign In Screen
 * Dev bypass: auto-signs in via AuthContext. Placeholder for Supabase OAuth.
 */

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors } from '@/constants/theme';

export default function SignInScreen() {
  // Auth guard in AuthContext handles redirecting — this screen shows briefly
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.brandBlue} />
      <Text style={styles.text}>Signing in...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  text: {
    color: Colors.textSecondary,
    fontSize: 15,
    fontWeight: '500',
  },
});
