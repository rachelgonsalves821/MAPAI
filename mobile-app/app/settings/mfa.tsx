/**
 * Mapai — MFA / Two-Factor Authentication Settings Screen
 *
 * Route:  /settings/mfa
 * Access: authenticated users only (AuthContext guards the settings group)
 *
 * Feature flow:
 *   1. Not enrolled  → show Authenticator App + SMS cards
 *   2. Tap "Set up"  → show TOTP setup panel (QR + manual entry + 6-digit verify)
 *   3. Verified      → show "Protected" badge, active methods list, backup codes
 *
 * Clerk integration points are marked with  // CLERK:  comments so that the
 * real SDK calls can be wired once Clerk types fully resolve in the project.
 */

import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  Shield,
  Smartphone,
  Copy,
  Key,
} from 'lucide-react-native';

// CLERK: import { useUser } from '@clerk/clerk-expo';
// When Clerk types are wired, replace the mock below with the real hook.

// ─── Types ────────────────────────────────────────────────────────────────────

type MfaMethod = 'totp' | 'phone_code';

interface ActiveFactor {
  id: string;
  strategy: MfaMethod;
  label: string;
}

interface MockUser {
  twoFactorEnabled: boolean;
  phoneNumbers: { id: string; phoneNumber: string }[];
}

// ─── Dev mock — remove once @clerk/clerk-expo resolves ────────────────────────

function useMockUser() {
  const [mockUser, setMockUser] = useState<MockUser>({
    twoFactorEnabled: false,
    phoneNumbers: [],
  });
  return { user: mockUser, setMockUser };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BRAND_BLUE = '#1D3E91';
const TEXT_PRIMARY = '#111827';
const TEXT_SECONDARY = '#6B7280';
const TEXT_TERTIARY = '#9CA3AF';
const BORDER = '#E5E7EB';
const SUCCESS_BG = '#ECFDF5';
const SUCCESS_TEXT = '#059669';
const DANGER = '#EF4444';
const ICON_BG_BLUE = '#EBF2FF';

const CODE_LENGTH = 6;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single digit box used in the 6-digit TOTP verify input */
interface DigitBoxProps {
  value: string;
  inputRef: React.RefObject<TextInput | null>;
  onType: (text: string, index: number) => void;
  onKeyPress: (key: string, index: number) => void;
  index: number;
  focused: boolean;
}

function DigitBox({ value, inputRef, onType, onKeyPress, index, focused }: DigitBoxProps) {
  return (
    <TextInput
      ref={inputRef}
      style={[styles.digitBox, focused && styles.digitBoxFocused]}
      value={value}
      onChangeText={(text) => onType(text, index)}
      onKeyPress={({ nativeEvent }) => onKeyPress(nativeEvent.key, index)}
      keyboardType="number-pad"
      maxLength={1}
      textAlign="center"
      selectTextOnFocus
      accessible
      accessibilityLabel={`Digit ${index + 1}`}
    />
  );
}

/** Setup card shown when MFA is not yet enabled */
interface SetupCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  loading?: boolean;
}

function SetupCard({ icon, title, subtitle, onPress, loading }: SetupCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Set up ${title}`}
    >
      <View style={styles.cardIconCircle}>{icon}</View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={BRAND_BLUE} />
      ) : (
        <TouchableOpacity
          style={styles.setupButton}
          onPress={onPress}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Set up ${title}`}
        >
          <Text style={styles.setupButtonText}>Set up</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

/** Row showing an active MFA method with a remove option */
interface ActiveMethodRowProps {
  factor: ActiveFactor;
  onRemove: (id: string) => void;
  removing: boolean;
}

function ActiveMethodRow({ factor, onRemove, removing }: ActiveMethodRowProps) {
  const icon =
    factor.strategy === 'totp' ? (
      <Shield size={18} color={BRAND_BLUE} />
    ) : (
      <Smartphone size={18} color={BRAND_BLUE} />
    );

  return (
    <View style={styles.activeRow}>
      <View style={styles.activeRowIcon}>{icon}</View>
      <Text style={styles.activeRowLabel} numberOfLines={1}>
        {factor.label}
      </Text>
      {removing ? (
        <ActivityIndicator size="small" color={DANGER} />
      ) : (
        <TouchableOpacity
          onPress={() => onRemove(factor.id)}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${factor.label}`}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.removeText}>Remove</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── TOTP Setup Panel ────────────────────────────────────────────────────────

interface TOTPSetupPanelProps {
  onSuccess: () => void;
  onCancel: () => void;
}

function TOTPSetupPanel({ onSuccess, onCancel }: TOTPSetupPanelProps) {
  const [step, setStep] = useState<'qr' | 'verify'>('qr');
  const [totpUri, setTotpUri] = useState<string>('');
  const [secret, setSecret] = useState<string>('');
  const [code, setCode] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingSetup, setLoadingSetup] = useState(true);

  const inputRefs = useRef<(TextInput | null)[]>(Array(CODE_LENGTH).fill(null));

  // Initialise TOTP preparation on mount
  useEffect(() => {
    async function prepareTOTP() {
      try {
        // CLERK: const totp = await user.createTOTP();
        // CLERK: setTotpUri(totp.uri ?? '');
        // CLERK: setSecret(totp.secret ?? '');

        // Dev placeholder — replace with real Clerk values above
        setTotpUri('otpauth://totp/Mapai:dev@mapai.app?secret=JBSWY3DPEHPK3PXP&issuer=Mapai');
        setSecret('JBSWY3DPEHPK3PXP');
      } catch (err) {
        Alert.alert('Setup failed', 'Could not start TOTP setup. Please try again.');
        onCancel();
      } finally {
        setLoadingSetup(false);
      }
    }
    prepareTOTP();
  }, []);

  const handleCopySecret = useCallback(async () => {
    try {
      // Use Clipboard from react-native (available without extra package)
      const { Clipboard } = await import('react-native');
      Clipboard.setString(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — skip silently
    }
  }, [secret]);

  const handleDigitType = useCallback(
    (text: string, index: number) => {
      // Accept only digits
      const digit = text.replace(/[^0-9]/g, '').slice(-1);
      const next = [...code];
      next[index] = digit;
      setCode(next);

      if (digit && index < CODE_LENGTH - 1) {
        // Advance to next box
        inputRefs.current[index + 1]?.focus();
        setFocusedIndex(index + 1);
      }

      if (digit && index === CODE_LENGTH - 1) {
        // All digits filled — auto-verify
        const fullCode = [...next].join('');
        if (fullCode.length === CODE_LENGTH) {
          handleVerify(fullCode);
        }
      }
    },
    [code],
  );

  const handleKeyPress = useCallback(
    (key: string, index: number) => {
      if (key === 'Backspace' && !code[index] && index > 0) {
        // Step back on delete of empty box
        inputRefs.current[index - 1]?.focus();
        setFocusedIndex(index - 1);
      }
    },
    [code],
  );

  const handleVerify = useCallback(
    async (overrideCode?: string) => {
      const finalCode = overrideCode ?? code.join('');
      if (finalCode.length < CODE_LENGTH) {
        Alert.alert('Enter all 6 digits', 'Please complete the code before verifying.');
        return;
      }
      setVerifying(true);
      try {
        // CLERK: await user.verifyTOTP({ code: finalCode });
        // CLERK: The above call confirms the TOTP setup and enables the factor.

        // Dev simulation: treat any 6-digit code as success
        await new Promise<void>((res) => setTimeout(res, 800));
        onSuccess();
      } catch (err: any) {
        const message =
          err?.errors?.[0]?.longMessage ?? 'Incorrect code. Please try again.';
        Alert.alert('Verification failed', message);
        setCode(Array(CODE_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
        setFocusedIndex(0);
      } finally {
        setVerifying(false);
      }
    },
    [code, onSuccess],
  );

  if (loadingSetup) {
    return (
      <View style={styles.setupPanelLoading}>
        <ActivityIndicator size="large" color={BRAND_BLUE} />
        <Text style={styles.setupPanelLoadingText}>Preparing authenticator setup…</Text>
      </View>
    );
  }

  // ── Step 1: Show QR / manual secret ──
  if (step === 'qr') {
    return (
      <View style={styles.setupPanel}>
        <Text style={styles.setupPanelHeading}>Scan with your authenticator app</Text>
        <Text style={styles.setupPanelBody}>
          Open Google Authenticator, Authy, or any TOTP app and scan the QR code
          below. If you cannot scan, enter the secret key manually.
        </Text>

        {/* QR placeholder — in production render with react-native-qrcode-svg */}
        <View style={styles.qrPlaceholder} accessibilityLabel="QR code for authenticator setup">
          <Key size={40} color={TEXT_TERTIARY} />
          <Text style={styles.qrPlaceholderNote}>QR code renders here</Text>
          <Text style={styles.qrUri} numberOfLines={3} selectable>
            {totpUri}
          </Text>
        </View>

        <Text style={styles.secretLabel}>Manual entry key</Text>
        <TouchableOpacity
          style={styles.secretRow}
          onPress={handleCopySecret}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Copy secret key"
        >
          <Text style={styles.secretText} selectable>
            {secret}
          </Text>
          <Copy size={16} color={copied ? SUCCESS_TEXT : TEXT_TERTIARY} />
        </TouchableOpacity>
        {copied && <Text style={styles.copiedNote}>Copied to clipboard</Text>}

        <View style={styles.setupPanelActions}>
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel} activeOpacity={0.75}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setStep('verify')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>I've added it →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Step 2: Enter verification code ──
  return (
    <View style={styles.setupPanel}>
      <Text style={styles.setupPanelHeading}>Enter the 6-digit code</Text>
      <Text style={styles.setupPanelBody}>
        Open your authenticator app and enter the current code for Mapai.
      </Text>

      <View style={styles.codeRow}>
        {code.map((digit, i) => (
          <DigitBox
            key={i}
            value={digit}
            index={i}
            inputRef={{ current: inputRefs.current[i] } as React.RefObject<TextInput | null>}
            onType={handleDigitType}
            onKeyPress={handleKeyPress}
            focused={focusedIndex === i}
          />
        ))}
      </View>

      <View style={styles.setupPanelActions}>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => {
            setStep('qr');
            setCode(Array(CODE_LENGTH).fill(''));
          }}
          activeOpacity={0.75}
        >
          <Text style={styles.cancelButtonText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, verifying && styles.primaryButtonDisabled]}
          onPress={() => handleVerify()}
          disabled={verifying}
          activeOpacity={0.8}
        >
          {verifying ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>Verify</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Backup Codes Section ─────────────────────────────────────────────────────

interface BackupCodesSectionProps {
  codes: string[];
  onRegenerate: () => void;
  regenerating: boolean;
}

function BackupCodesSection({ codes, onRegenerate, regenerating }: BackupCodesSectionProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.backupSection}>
      <View style={styles.backupHeader}>
        <View>
          <Text style={styles.backupTitle}>Backup codes</Text>
          <Text style={styles.backupSubtitle}>
            Use these if you lose access to your authenticator app
          </Text>
        </View>
        <TouchableOpacity
          style={styles.revealButton}
          onPress={() => setRevealed((v) => !v)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={revealed ? 'Hide backup codes' : 'Show backup codes'}
        >
          <Key size={14} color={BRAND_BLUE} />
          <Text style={styles.revealButtonText}>{revealed ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      </View>

      {revealed && (
        <View style={styles.codeGrid}>
          {codes.map((c, i) => (
            <View key={i} style={styles.backupCode}>
              <Text style={styles.backupCodeText}>{c}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity
        style={styles.regenButton}
        onPress={onRegenerate}
        disabled={regenerating}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Regenerate backup codes"
      >
        {regenerating ? (
          <ActivityIndicator size="small" color={DANGER} />
        ) : (
          <Text style={styles.regenButtonText}>Regenerate codes</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function MFASettingsScreen() {
  const router = useRouter();

  // CLERK: const { user } = useUser();
  // Using mock hook for dev; swap for Clerk's useUser when types resolve.
  const { user, setMockUser } = useMockUser();

  const [showTOTPSetup, setShowTOTPSetup] = useState(false);
  const [showSMSSetup, setShowSMSSetup] = useState(false);
  const [loadingTotp, setLoadingTotp] = useState(false);
  const [loadingSMS, setLoadingSMS] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [regeneratingCodes, setRegeneratingCodes] = useState(false);

  // In a real integration these come from user.totpEnabled, user.phoneNumbers, etc.
  // CLERK: Derive activeMethods from user.totpEnabled and user.twoFactorEnabled
  const [activeMethods, setActiveMethods] = useState<ActiveFactor[]>([]);
  const [backupCodes, setBackupCodes] = useState<string[]>([
    'A1B2-C3D4',
    'E5F6-G7H8',
    'I9J0-K1L2',
    'M3N4-O5P6',
    'Q7R8-S9T0',
    'U1V2-W3X4',
  ]);

  const mfaEnabled = activeMethods.length > 0;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleTOTPSetupSuccess = useCallback(() => {
    setShowTOTPSetup(false);

    // CLERK: After verifyTOTP succeeds the factor is live on user.totpEnabled.
    // Refresh local active-methods list from Clerk user object here.

    setActiveMethods((prev) => [
      ...prev,
      {
        id: 'totp-' + Date.now(),
        strategy: 'totp',
        label: 'Authenticator app',
      },
    ]);
    setMockUser((u) => ({ ...u, twoFactorEnabled: true }));
    Alert.alert(
      'Authenticator enabled',
      'Two-factor authentication is now active on your account.',
    );
  }, [setMockUser]);

  const handleSMSSetup = useCallback(async () => {
    setLoadingSMS(true);
    try {
      // CLERK: const phone = user.phoneNumbers[0];
      // CLERK: await phone.setReservedForSecondFactor(true);
      // CLERK: await phone.prepareSecondFactor({ strategy: 'phone_code' });
      // For now simulate SMS enrolment with a simple alert flow.
      await new Promise<void>((res) => setTimeout(res, 600));
      setActiveMethods((prev) => [
        ...prev,
        {
          id: 'sms-' + Date.now(),
          strategy: 'phone_code',
          label: 'SMS ···· ···· 0000',
        },
      ]);
      setMockUser((u) => ({ ...u, twoFactorEnabled: true }));
      Alert.alert('SMS verification enabled', 'You will receive codes via text message.');
    } catch (err: any) {
      Alert.alert('SMS setup failed', err?.errors?.[0]?.longMessage ?? 'Please try again.');
    } finally {
      setLoadingSMS(false);
    }
  }, [setMockUser]);

  const handleRemoveMethod = useCallback(
    (id: string) => {
      Alert.alert(
        'Remove this method?',
        'You will be asked to re-enrol if you want MFA again.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setRemovingId(id);
              try {
                // CLERK: if (factor.strategy === 'totp') await user.disableTOTP();
                // CLERK: if (factor.strategy === 'phone_code') {
                // CLERK:   const phone = user.phoneNumbers.find(p => p.id === id);
                // CLERK:   await phone?.setReservedForSecondFactor(false);
                // CLERK: }
                await new Promise<void>((res) => setTimeout(res, 500));
                setActiveMethods((prev) => prev.filter((f) => f.id !== id));
              } catch (err: any) {
                Alert.alert('Failed to remove', err?.errors?.[0]?.longMessage ?? 'Try again.');
              } finally {
                setRemovingId(null);
              }
            },
          },
        ],
      );
    },
    [],
  );

  const handleRegenerateCodes = useCallback(async () => {
    Alert.alert(
      'Regenerate backup codes?',
      'Your current codes will be invalidated immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          style: 'destructive',
          onPress: async () => {
            setRegeneratingCodes(true);
            try {
              // CLERK: const result = await user.createBackupCode();
              // CLERK: setBackupCodes(result.codes);
              await new Promise<void>((res) => setTimeout(res, 700));
              setBackupCodes([
                'NEW1-CODE',
                'NEW2-CODE',
                'NEW3-CODE',
                'NEW4-CODE',
                'NEW5-CODE',
                'NEW6-CODE',
              ]);
            } catch {
              Alert.alert('Failed', 'Could not regenerate codes. Please try again.');
            } finally {
              setRegeneratingCodes(false);
            }
          },
        },
      ],
    );
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={20} color={TEXT_PRIMARY} />
        </TouchableOpacity>
        <Text style={styles.heading}>Security</Text>
        {/* Spacer to balance the back button */}
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Section label */}
        <Text style={styles.sectionLabel}>Two-factor authentication</Text>
        <Text style={styles.sectionDescription}>Add an extra layer of security to your account.</Text>

        {/* ── MFA not enabled: setup cards ─────────────────────────────────── */}
        {!mfaEnabled && (
          <View style={styles.cardStack}>
            {/* Authenticator app card */}
            <SetupCard
              icon={<Shield size={20} color={BRAND_BLUE} />}
              title="Authenticator app"
              subtitle="Google Authenticator, Authy, etc."
              loading={loadingTotp}
              onPress={() => {
                setShowTOTPSetup(true);
              }}
            />

            {/* SMS verification card */}
            <SetupCard
              icon={<Smartphone size={20} color={BRAND_BLUE} />}
              title="SMS verification"
              subtitle="Receive codes via text message"
              loading={loadingSMS}
              onPress={handleSMSSetup}
            />
          </View>
        )}

        {/* ── MFA enabled: protected badge + methods ───────────────────────── */}
        {mfaEnabled && (
          <>
            {/* Protected badge */}
            <View style={styles.protectedBadge} accessibilityRole="text">
              <Shield size={14} color={SUCCESS_TEXT} />
              <Text style={styles.protectedText}>Protected</Text>
            </View>

            {/* Active methods */}
            <Text style={styles.subsectionLabel}>Active methods</Text>
            <View style={styles.methodsCard}>
              {activeMethods.map((factor, idx) => (
                <React.Fragment key={factor.id}>
                  {idx > 0 && <View style={styles.divider} />}
                  <ActiveMethodRow
                    factor={factor}
                    onRemove={handleRemoveMethod}
                    removing={removingId === factor.id}
                  />
                </React.Fragment>
              ))}
            </View>

            {/* Add another method if only one is active */}
            {activeMethods.length < 2 && (
              <TouchableOpacity
                style={styles.addMethodButton}
                onPress={() => {
                  const hasTOTP = activeMethods.some((f) => f.strategy === 'totp');
                  if (hasTOTP) {
                    handleSMSSetup();
                  } else {
                    setShowTOTPSetup(true);
                  }
                }}
                activeOpacity={0.75}
              >
                <Text style={styles.addMethodText}>+ Add another method</Text>
              </TouchableOpacity>
            )}

            {/* Backup codes */}
            <BackupCodesSection
              codes={backupCodes}
              onRegenerate={handleRegenerateCodes}
              regenerating={regeneratingCodes}
            />
          </>
        )}

        {/* Info note */}
        <View style={styles.infoNote}>
          <Text style={styles.infoNoteText}>
            Two-factor authentication protects your account even if your password is compromised.
            You will be prompted for a code whenever you sign in on a new device.
          </Text>
        </View>
      </ScrollView>

      {/* TOTP Setup Modal */}
      <Modal
        visible={showTOTPSetup}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTOTPSetup(false)}
      >
        <SafeAreaView style={styles.modalSafeArea} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              onPress={() => setShowTOTPSetup(false)}
              accessibilityRole="button"
              accessibilityLabel="Close setup"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <ChevronLeft size={20} color={TEXT_PRIMARY} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Authenticator setup</Text>
            <View style={{ width: 20 }} />
          </View>
          <ScrollView
            contentContainerStyle={styles.modalScroll}
            keyboardShouldPersistTaps="handled"
          >
            <TOTPSetupPanel
              onSuccess={handleTOTPSetupSuccess}
              onCancel={() => setShowTOTPSetup(false)}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 8 : 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heading: {
    fontSize: 24,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    letterSpacing: -0.3,
  },

  // ── Scroll body ───────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 48,
  },

  // ── Section labels ────────────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  sectionDescription: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
    marginBottom: 24,
  },
  subsectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    marginTop: 20,
    marginBottom: 8,
  },

  // ── Setup cards ───────────────────────────────────────────────────────────
  cardStack: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
  },
  cardIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ICON_BG_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  cardSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },
  setupButton: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: BRAND_BLUE,
  },
  setupButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ── Protected badge ───────────────────────────────────────────────────────
  protectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: SUCCESS_BG,
    marginBottom: 4,
  },
  protectedText: {
    fontSize: 13,
    fontWeight: '600',
    color: SUCCESS_TEXT,
  },

  // ── Active methods card ───────────────────────────────────────────────────
  methodsCard: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  activeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  activeRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ICON_BG_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeRowLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_PRIMARY,
  },
  removeText: {
    fontSize: 13,
    fontWeight: '600',
    color: DANGER,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginHorizontal: 16,
  },
  addMethodButton: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addMethodText: {
    fontSize: 14,
    fontWeight: '600',
    color: BRAND_BLUE,
  },

  // ── Backup codes ──────────────────────────────────────────────────────────
  backupSection: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  backupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  backupTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  backupSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginTop: 2,
    lineHeight: 18,
    maxWidth: '80%',
  },
  revealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  revealButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: BRAND_BLUE,
  },
  codeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  backupCode: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: BORDER,
  },
  backupCodeText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    fontVariant: ['tabular-nums'],
  },
  regenButton: {
    marginTop: 16,
    paddingVertical: 8,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  regenButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: DANGER,
  },

  // ── Info note ─────────────────────────────────────────────────────────────
  infoNote: {
    marginTop: 28,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: BORDER,
  },
  infoNoteText: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 19,
  },

  // ── TOTP setup panel (rendered inside Modal) ──────────────────────────────
  setupPanel: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
  },
  setupPanelLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingTop: 80,
  },
  setupPanelLoadingText: {
    fontSize: 15,
    color: TEXT_SECONDARY,
  },
  setupPanelHeading: {
    fontSize: 20,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    marginBottom: 8,
  },
  setupPanelBody: {
    fontSize: 15,
    color: TEXT_SECONDARY,
    lineHeight: 22,
    marginBottom: 24,
  },

  // QR placeholder
  qrPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
    gap: 8,
  },
  qrPlaceholderNote: {
    fontSize: 12,
    color: TEXT_TERTIARY,
  },
  qrUri: {
    fontSize: 10,
    color: TEXT_TERTIARY,
    textAlign: 'center',
    marginTop: 4,
  },

  // Secret key row
  secretLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_SECONDARY,
    marginBottom: 6,
  },
  secretRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: '#F9FAFB',
    gap: 10,
  },
  secretText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    fontVariant: ['tabular-nums'],
    letterSpacing: 1,
  },
  copiedNote: {
    fontSize: 12,
    color: SUCCESS_TEXT,
    marginTop: 4,
    marginLeft: 2,
  },

  // ── 6-digit code input ────────────────────────────────────────────────────
  codeRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 24,
  },
  digitBox: {
    width: 48,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F9FAFB',
    fontSize: 24,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    textAlign: 'center',
  },
  digitBoxFocused: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#FFFFFF',
  },

  // Panel action buttons
  setupPanelActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_SECONDARY,
  },
  primaryButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ── Modal chrome ──────────────────────────────────────────────────────────
  modalSafeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_PRIMARY,
  },
  modalScroll: {
    flexGrow: 1,
    paddingTop: 16,
  },
});
