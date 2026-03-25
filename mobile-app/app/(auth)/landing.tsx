/**
 * Mapai — Landing Screen ("Know where to go")
 * Mockup 4 — first screen new users see. Dark theme.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin } from 'lucide-react-native';

export default function LandingScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0F1419" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Wordmark row */}
          <View style={styles.wordmarkRow}>
            <MapPin size={14} color="#9CA3AF" />
            <Text style={styles.wordmark}>MAPAI</Text>
          </View>

          {/* Photo pair */}
          <View style={styles.photoRow}>
            <View style={[styles.photoLeft, { backgroundColor: '#D4956A' }]} />
            <View style={styles.photoRightCol}>
              <View style={[styles.photoRight, { backgroundColor: '#8B9E6B' }]} />
              {/* Avatar row + social proof under right photo */}
              <View style={styles.avatarSocialRow}>
                <View style={styles.avatarOverlapRow}>
                  <View style={[styles.avatarCircle, { zIndex: 3 }]} />
                  <View style={[styles.avatarCircle, { zIndex: 2, marginLeft: -10 }]} />
                  <View style={[styles.avatarCircle, { zIndex: 1, marginLeft: -10 }]} />
                </View>
                <Text style={styles.socialProofSmall}>+2.4k</Text>
              </View>
            </View>
          </View>

          {/* Main heading */}
          <View style={styles.headingBlock}>
            <Text style={styles.headingRegular}>Know where</Text>
            <Text style={styles.headingItalic}>to go.</Text>
          </View>

          {/* Subtext bullets */}
          <View style={styles.subtextBlock}>
            <Text style={styles.subtext}>AI-powered recommendations.</Text>
            <Text style={styles.subtext}>See where friends go.</Text>
            <Text style={styles.subtext}>Navigate in one tap.</Text>
          </View>

          {/* Social proof row */}
          <View style={styles.socialProofRow}>
            <View style={styles.avatarOverlapRowSmall}>
              <View style={[styles.avatarCircleSmall, { zIndex: 2 }]} />
              <View style={[styles.avatarCircleSmall, { zIndex: 1, marginLeft: -8 }]} />
            </View>
            <Text style={styles.socialProofText}>12k+ people discovering spots</Text>
          </View>

          {/* CTA */}
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push('/(auth)/sign-in')}
            activeOpacity={0.85}
          >
            <Text style={styles.ctaText}>Get started  →</Text>
          </TouchableOpacity>

          {/* Footer */}
          <Text style={styles.footer}>Free to use · No credit card</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  wordmark: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 3,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
    height: 280,
  },
  photoLeft: {
    flex: 1,
    borderRadius: 16,
    height: 280,
  },
  photoRightCol: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  photoRight: {
    borderRadius: 16,
    height: 180,
    marginBottom: 12,
  },
  avatarSocialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
  },
  avatarOverlapRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4B5563',
    borderWidth: 2,
    borderColor: '#0F1419',
  },
  socialProofSmall: {
    fontSize: 13,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  headingBlock: {
    marginBottom: 16,
  },
  headingRegular: {
    fontSize: 36,
    fontWeight: '300',
    fontFamily: 'Georgia',
    color: '#FFFFFF',
    lineHeight: 44,
  },
  headingItalic: {
    fontSize: 36,
    fontWeight: '300',
    fontFamily: 'Georgia',
    fontStyle: 'italic',
    color: '#FFFFFF',
    lineHeight: 44,
  },
  subtextBlock: {
    marginBottom: 20,
    gap: 4,
  },
  subtext: {
    fontSize: 15,
    color: '#9CA3AF',
    lineHeight: 22,
  },
  socialProofRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 24,
  },
  avatarOverlapRowSmall: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircleSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4B5563',
    borderWidth: 2,
    borderColor: '#0F1419',
  },
  socialProofText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  ctaButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F1419',
  },
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: '#4B5563',
  },
});
