/**
 * Mapai — MFA Challenge Screen
 * 6-digit TOTP code entry with auto-advance, backup code toggle.
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

// Clerk — wrapped for web dev compatibility (mirrors sign-in.tsx pattern)
let clerkUseSignIn: any = null;
try {
  const clerk = require('@clerk/clerk-expo');
  clerkUseSignIn = clerk.useSignIn;
} catch {}

const CODE_LENGTH = 6;

export default function MfaChallengeScreen() {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [backupCode, setBackupCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  // Clerk hooks — called unconditionally (React rules of hooks)
  const signInHook = clerkUseSignIn
    ? clerkUseSignIn()
    : { signIn: null, setActive: null, isLoaded: false };

  const handleDigitChange = useCallback((text: string, index: number) => {
    // Accept only the last character typed (handles paste as single char)
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const nextCode = [...code];
    nextCode[index] = digit;
    setCode(nextCode);
    setError(null);

    // Auto-advance
    if (digit && index < CODE_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }, [code]);

  const handleKeyPress = useCallback(
    (e: NativeSyntheticEvent<TextInputKeyPressEventData>, index: number) => {
      if (e.nativeEvent.key === 'Backspace' && !code[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        const nextCode = [...code];
        nextCode[index - 1] = '';
        setCode(nextCode);
      }
    },
    [code]
  );

  async function handleVerify() {
    if (!signInHook.isLoaded || !signInHook.signIn) return;
    const fullCode = code.join('');
    if (fullCode.length !== CODE_LENGTH) {
      setError('Please enter the full 6-digit code.');
      return;
    }

    setVerifying(true);
    setError('');
    try {
      const result = await signInHook.signIn.attemptSecondFactor({
        strategy: 'totp',
        code: fullCode,
      });

      if (result.status === 'complete') {
        await signInHook.setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Verification incomplete. Please try again.');
      }
    } catch (err: any) {
      const clerkError = err?.errors?.[0];
      if (clerkError?.code === 'form_code_incorrect') {
        setError('Invalid code. Please try again.');
      } else if (clerkError?.code === 'verification_expired') {
        setError('Code expired. Please generate a new one.');
      } else {
        setError(clerkError?.message || 'Verification failed. Please try again.');
      }
      // Clear code inputs and refocus first box on error
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  }

  async function handleBackupVerify() {
    if (!signInHook.isLoaded || !signInHook.signIn) return;
    if (!backupCode.trim()) {
      setError('Please enter your backup code.');
      return;
    }

    setVerifying(true);
    setError('');
    try {
      const result = await signInHook.signIn.attemptSecondFactor({
        strategy: 'backup_code',
        code: backupCode.trim(),
      });

      if (result.status === 'complete') {
        await signInHook.setActive({ session: result.createdSessionId });
        router.replace('/(tabs)');
      } else {
        setError('Verification incomplete. Please try again.');
      }
    } catch (err: any) {
      const clerkError = err?.errors?.[0];
      setError(clerkError?.message || 'Invalid backup code. Please try again.');
    } finally {
      setVerifying(false);
    }
  }

  const isCodeComplete = code.every((d) => d !== '');

  // Show loading state while Clerk initialises
  if (!signInHook.isLoaded) {
    return (
      <SafeAreaView style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color="#0558E8" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Back arrow */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={24} color="#111827" />
          </TouchableOpacity>

          {/* Heading */}
          <Text style={styles.heading}>Verify your identity</Text>
          <Text style={styles.subtitle}>
            {useBackupCode
              ? 'Enter one of your saved backup codes'
              : 'Enter the code from your authenticator app'}
          </Text>

          {error && <Text style={styles.errorText}>{error}</Text>}

          {useBackupCode ? (
            /* Backup code single input */
            <View style={styles.backupInputWrap}>
              <TextInput
                style={styles.backupInput}
                placeholder="xxxxxxxx-xxxx-xxxx"
                placeholderTextColor="#9CA3AF"
                value={backupCode}
                onChangeText={(t) => {
                  setBackupCode(t);
                  setError(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                autoFocus
              />
            </View>
          ) : (
            /* 6-box code input */
            <View style={styles.codeRow}>
              {Array(CODE_LENGTH)
                .fill(null)
                .map((_, i) => (
                  <TextInput
                    key={i}
                    ref={(ref) => { inputRefs.current[i] = ref; }}
                    style={[styles.codeBox, code[i] ? styles.codeBoxFilled : null]}
                    value={code[i]}
                    onChangeText={(t) => handleDigitChange(t, i)}
                    onKeyPress={(e) => handleKeyPress(e, i)}
                    keyboardType="number-pad"
                    maxLength={1}
                    selectTextOnFocus
                    textAlign="center"
                    autoFocus={i === 0}
                  />
                ))}
            </View>
          )}

          {/* Verify button */}
          <TouchableOpacity
            style={[
              styles.verifyButton,
              ((!isCodeComplete && !useBackupCode) || verifying) && styles.verifyButtonDisabled,
            ]}
            onPress={useBackupCode ? handleBackupVerify : handleVerify}
            disabled={(!useBackupCode && !isCodeComplete) || verifying}
            activeOpacity={0.85}
          >
            {verifying ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text
                style={[
                  styles.verifyButtonText,
                  (!isCodeComplete && !useBackupCode) && styles.verifyButtonTextDisabled,
                ]}
              >
                Verify
              </Text>
            )}
          </TouchableOpacity>

          {/* Toggle backup code */}
          <TouchableOpacity
            style={styles.backupToggle}
            onPress={() => {
              setUseBackupCode((v) => !v);
              setError(null);
              setCode(Array(CODE_LENGTH).fill(''));
              setBackupCode('');
            }}
          >
            <Text style={styles.backupToggleText}>
              {useBackupCode ? 'Use authenticator app instead' : 'Use backup code instead'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 40,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    marginBottom: 24,
  },
  heading: {
    fontSize: 28,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    color: '#111827',
    marginBottom: 8,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 15,
    color: '#9CA3AF',
    marginBottom: 32,
    lineHeight: 22,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginBottom: 12,
  },
  codeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 32,
    justifyContent: 'center',
  },
  codeBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    backgroundColor: '#FAFAFA',
  },
  codeBoxFilled: {
    borderColor: '#0558E8',
    backgroundColor: '#FFFFFF',
  },
  backupInputWrap: {
    marginBottom: 32,
  },
  backupInput: {
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#FAFAFA',
  },
  verifyButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#0558E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  verifyButtonDisabled: {
    backgroundColor: '#E8E5F0',
  },
  verifyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  verifyButtonTextDisabled: {
    color: '#A8A3B8',
  },
  backupToggle: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backupToggleText: {
    fontSize: 14,
    color: '#0558E8',
    fontWeight: '500',
  },
});
