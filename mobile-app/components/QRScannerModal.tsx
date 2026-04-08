/**
 * Mapai — QR Scanner Modal
 * Full-screen camera modal for scanning venue QR codes during check-in.
 * Passes the raw QR string to onScanSuccess for backend HMAC validation.
 * QR format: https://mapai.app/checkin/{place_id}?sig={hmac_hex}
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const SCAN_BOX = SCREEN_W * 0.7;

// Dynamic import for expo-camera (not available on web)
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const cam = require('expo-camera');
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch {}

interface QRScannerModalProps {
  visible: boolean;
  placeName: string;
  placeId: string;  // Kept for display purposes only — not used for validation
  onScanSuccess: (qrData: string) => void;  // Raw QR string for backend HMAC validation
  onClose: () => void;
}

export default function QRScannerModal({
  visible,
  placeName,
  placeId,
  onScanSuccess,
  onClose,
}: QRScannerModalProps) {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state each time the modal opens
  useEffect(() => {
    if (!visible) return;
    setScanned(false);
    setError(null);

    if (!useCameraPermissions) {
      // Web — no camera API available
      setHasPermission(false);
      return;
    }
  }, [visible]);

  // Use permission hook if available
  const permissionHook = useCameraPermissions ? useCameraPermissions() : [null, async () => ({ granted: false })];
  const [permission, requestPermission] = permissionHook;

  useEffect(() => {
    if (!visible || !useCameraPermissions) return;
    if (permission?.granted) {
      setHasPermission(true);
    } else if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission().then((result: any) => {
        setHasPermission(result?.granted ?? false);
      });
    } else if (permission && !permission.granted) {
      setHasPermission(false);
    }
  }, [visible, permission]);

  const handleBarCodeScanned = useCallback(({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);

    // Only accept Mapai check-in QR codes — backend will validate the HMAC signature
    if (data.includes('mapai.app/checkin/') || data.startsWith('mapai:checkin:')) {
      onScanSuccess(data);
    } else {
      setError('This is not a valid Mapai check-in code. Look for the Mapai QR code at the venue.');
    }
  }, [scanned, onScanSuccess]);

  // Web fallback — informational only, no manual check-in
  const renderFallback = () => (
    <View style={styles.fallbackContainer}>
      <View style={styles.fallbackIcon}>
        <Ionicons name="qr-code-outline" size={64} color={Colors.brandBlue} />
      </View>
      <Text style={styles.fallbackTitle}>Mobile App Required</Text>
      <Text style={styles.fallbackSubtitle}>
        QR code scanning requires the Mapai mobile app. Download it to check in and earn points.
      </Text>

      {hasPermission === false && Platform.OS !== 'web' && (
        <Text style={styles.permissionText}>
          Camera permission is required to scan QR codes.
          Enable it in your device settings.
        </Text>
      )}

      <TouchableOpacity style={styles.closeOutlineBtn} onPress={onClose}>
        <Text style={styles.closeOutlineBtnText}>Close</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Check In</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Camera or fallback */}
        {CameraView && hasPermission ? (
          <View style={styles.cameraContainer}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />

            {/* Scan overlay */}
            <View style={styles.overlay}>
              {/* Top dark area */}
              <View style={styles.overlayTop} />

              {/* Middle row: dark | scan box | dark */}
              <View style={styles.overlayMiddle}>
                <View style={styles.overlaySide} />
                <View style={styles.scanBox}>
                  {/* Corner brackets */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                </View>
                <View style={styles.overlaySide} />
              </View>

              {/* Bottom dark area */}
              <View style={styles.overlayBottom}>
                <Text style={styles.scanText}>
                  Point your camera at the{'\n'}Mapai QR code at {placeName}
                </Text>

                {scanned && !error && (
                  <View style={styles.scanningRow}>
                    <ActivityIndicator color="#FFFFFF" size="small" />
                    <Text style={styles.scanningText}>Verifying...</Text>
                  </View>
                )}

                {error && (
                  <>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity
                      style={styles.retryBtn}
                      onPress={() => { setScanned(false); setError(null); }}
                    >
                      <Text style={styles.retryBtnText}>Scan Again</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          </View>
        ) : (
          renderFallback()
        )}
      </View>
    </Modal>
  );
}

const CORNER_SIZE = 24;
const CORNER_WEIGHT = 3;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 10,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: Typography.sizes.lg,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cameraContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  overlayTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  overlayMiddle: {
    flexDirection: 'row',
    height: SCAN_BOX,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  scanBox: {
    width: SCAN_BOX,
    height: SCAN_BOX,
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
  },
  cornerTL: {
    top: 0, left: 0,
    borderTopWidth: CORNER_WEIGHT, borderLeftWidth: CORNER_WEIGHT,
    borderColor: Colors.brandBlue,
  },
  cornerTR: {
    top: 0, right: 0,
    borderTopWidth: CORNER_WEIGHT, borderRightWidth: CORNER_WEIGHT,
    borderColor: Colors.brandBlue,
  },
  cornerBL: {
    bottom: 0, left: 0,
    borderBottomWidth: CORNER_WEIGHT, borderLeftWidth: CORNER_WEIGHT,
    borderColor: Colors.brandBlue,
  },
  cornerBR: {
    bottom: 0, right: 0,
    borderBottomWidth: CORNER_WEIGHT, borderRightWidth: CORNER_WEIGHT,
    borderColor: Colors.brandBlue,
  },
  overlayBottom: {
    flex: 1.2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    paddingTop: Spacing.xl,
  },
  scanText: {
    fontSize: Typography.sizes.md,
    color: '#FFFFFF',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  scanningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: Spacing.sm,
  },
  scanningText: {
    color: '#FFFFFF',
    fontSize: Typography.sizes.sm,
  },
  errorText: {
    color: '#EF4444',
    fontSize: Typography.sizes.sm,
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    lineHeight: 20,
  },
  retryBtn: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: Typography.sizes.sm,
  },
  fallbackContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  fallbackIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: Colors.brandBlue + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  fallbackTitle: {
    fontSize: Typography.sizes.xl,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  fallbackSubtitle: {
    fontSize: Typography.sizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  permissionText: {
    fontSize: Typography.sizes.sm,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  closeOutlineBtn: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.brandBlue,
  },
  closeOutlineBtnText: {
    color: Colors.brandBlue,
    fontSize: Typography.sizes.md,
    fontWeight: '600',
  },
});
