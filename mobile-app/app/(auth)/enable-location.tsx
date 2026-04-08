/**
 * Mapai — Enable Location Screen
 * Onboarding step between Create Identity and Find Friends.
 * Requests foreground location permission via expo-location,
 * stores coordinates in locationStore on grant, and navigates onward.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
  Alert,
  Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocationStore } from '@/store/locationStore';

export default function EnableLocationScreen() {
  const router = useRouter();
  const { setLocation, setAccuracy, setIsDefault } = useLocationStore();
  const [isRequesting, setIsRequesting] = useState(false);

  async function handleEnableLocation() {
    if (isRequesting) return;
    setIsRequesting(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status === 'granted') {
        try {
          const position = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
          setAccuracy(position.coords.accuracy ?? null);
          setIsDefault(false);
        } catch (positionError) {
          // Permission granted but position fetch failed — keep default coords
          console.warn('Could not fetch current position:', positionError);
        }
        router.push('/(auth)/find-friends');
      } else {
        Alert.alert(
          'Location Access',
          'Location permission was not granted. You can enable it later in your device Settings to get personalised nearby recommendations.',
          [
            {
              text: 'Open Settings',
              onPress: () => Linking.openSettings(),
            },
            {
              text: 'Continue',
              style: 'cancel',
              onPress: () => router.push('/(auth)/find-friends'),
            },
          ]
        );
      }
    } catch (error) {
      console.warn('Location permission request failed:', error);
      router.push('/(auth)/find-friends');
    } finally {
      setIsRequesting(false);
    }
  }

  function handleMaybeLater() {
    router.push('/(auth)/find-friends');
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Back arrow */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        activeOpacity={0.7}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={20} color="#111827" />
      </TouchableOpacity>

      <View style={styles.content}>
        {/* Map pin icon in circle */}
        <View style={styles.iconCircle}>
          <Ionicons name="location" size={64} color="#0558E8" />
        </View>

        {/* Heading */}
        <View style={styles.headingBlock}>
          <Text style={styles.headingRegular}>See what's</Text>
          <Text style={styles.headingItalic}>nearby.</Text>
        </View>

        {/* Explanation */}
        <Text style={styles.explanation}>
          Mapai uses your location to show you the best spots nearby and get
          walking directions. Your location is never shared with other users.
        </Text>

        {/* Primary CTA */}
        <TouchableOpacity
          style={[styles.ctaButton, isRequesting && styles.ctaButtonDisabled]}
          onPress={handleEnableLocation}
          disabled={isRequesting}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaButtonText}>Enable Location  →</Text>
        </TouchableOpacity>

        {/* Skip link */}
        <TouchableOpacity
          style={styles.skipTouchable}
          onPress={handleMaybeLater}
          activeOpacity={0.6}
        >
          <Text style={styles.skipText}>Maybe later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    marginTop: 56,
  },
  content: {
    flex: 1,
    alignItems: 'center',
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#EBF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 60,
  },
  headingBlock: {
    alignSelf: 'stretch',
    marginTop: 40,
  },
  headingRegular: {
    fontSize: 32,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }),
    color: '#1A1A2E',
    lineHeight: 40,
  },
  headingItalic: {
    fontSize: 32,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }),
    fontStyle: 'italic',
    color: '#1A1A2E',
    lineHeight: 40,
  },
  explanation: {
    alignSelf: 'stretch',
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 24,
    marginTop: 16,
  },
  ctaButton: {
    alignSelf: 'stretch',
    height: 56,
    borderRadius: 999,
    backgroundColor: '#0558E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  ctaButtonDisabled: {
    opacity: 0.6,
  },
  ctaButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  skipTouchable: {
    marginTop: 16,
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: 8,
  },
  skipText: {
    textAlign: 'center',
    fontSize: 15,
    color: '#9CA3AF',
  },
});
