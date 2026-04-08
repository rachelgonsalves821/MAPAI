/**
 * Mapai — Landing Screen
 * White + navy blue theme per brand guidelines.
 * PRD §8.2: Primary #0558E8, Background #FFFFFF, Text #111827
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
  Image,
  Platform,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_W } = Dimensions.get('window');
const NAVY = '#0558E8';
const PHOTO_W = (SCREEN_W - 24 * 2 - 10) / 2; // 2 columns with gap

export default function LandingScreen() {
  const router = useRouter();

  return (
    <View style={s.root}>
      <StatusBar style="dark" />
      <SafeAreaView style={s.safe}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Wordmark ──────────────────────── */}
          <View style={s.wordmarkRow}>
            <View style={s.wordmarkDot} />
            <Text style={s.wordmark}>MAPAI</Text>
          </View>

          {/* ── Photo pair ────────────────────── */}
          <View style={s.photoRow}>
            <View style={s.photoLeftWrap}>
              <Image
                source={{ uri: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&q=80' }}
                style={s.photoLeftImg}
                resizeMode="cover"
              />
              {/* Blue tint overlay */}
              <View style={s.photoOverlay} />
            </View>
            <View style={s.photoRightCol}>
              <View style={s.photoRightWrap}>
                <Image
                  source={{ uri: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80' }}
                  style={s.photoRightImg}
                  resizeMode="cover"
                />
                <View style={s.photoOverlay} />
              </View>
              {/* Social proof avatars */}
              <View style={s.avatarRow}>
                <View style={[s.avatarCircle, { backgroundColor: NAVY }]}>
                  <Text style={s.avatarInit}>J</Text>
                </View>
                <View style={[s.avatarCircle, { backgroundColor: '#7C3AED', marginLeft: -10 }]}>
                  <Text style={s.avatarInit}>L</Text>
                </View>
                <View style={[s.avatarCircle, { backgroundColor: '#10B981', marginLeft: -10 }]}>
                  <Text style={s.avatarInit}>S</Text>
                </View>
                <Text style={s.avatarCount}>+2.4k</Text>
              </View>
            </View>
          </View>

          {/* ── Heading ───────────────────────── */}
          <Text style={s.headingLine1}>Know where</Text>
          <Text style={s.headingLine2}>to go.</Text>

          {/* ── Value props ───────────────────── */}
          <View style={s.propsBlock}>
            {[
              { icon: 'sparkles', text: 'AI-powered recommendations.' },
              { icon: 'people', text: 'See where friends go.' },
              { icon: 'navigate', text: 'Navigate in one tap.' },
            ].map((item) => (
              <View key={item.text} style={s.propRow}>
                <Ionicons name={item.icon as any} size={16} color={NAVY} />
                <Text style={s.propText}>{item.text}</Text>
              </View>
            ))}
          </View>

          {/* ── Social proof ──────────────────── */}
          <View style={s.socialRow}>
            <View style={s.socialDot} />
            <Text style={s.socialText}>12k+ people discovering spots in Boston</Text>
          </View>

          {/* ── CTA ───────────────────────────── */}
          <TouchableOpacity
            style={s.cta}
            onPress={() => router.push('/(auth)/sign-in')}
            activeOpacity={0.85}
          >
            <Text style={s.ctaText}>Get started</Text>
            <Ionicons name="arrow-forward" size={18} color="#FFFFFF" />
          </TouchableOpacity>

          {/* ── Footer ────────────────────────── */}
          <Text style={s.footer}>Free to use · No credit card</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 12 : 24,
    paddingBottom: 40,
  },

  // Wordmark
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  wordmarkDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: NAVY,
  },
  wordmark: {
    fontSize: 13,
    fontWeight: '700',
    color: NAVY,
    letterSpacing: 3,
  },

  // Photos
  photoRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
    height: 280,
  },
  photoLeftWrap: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E8ECF4',
  },
  photoLeftImg: {
    width: '100%',
    height: '100%',
  },
  photoRightCol: {
    flex: 1,
  },
  photoRightWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    height: 180,
    marginBottom: 12,
    backgroundColor: '#E8ECF4',
  },
  photoRightImg: {
    width: '100%',
    height: '100%',
  },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 88, 232, 0.08)',
  },

  // Avatar social proof
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
  },
  avatarCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarInit: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarCount: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 8,
  },

  // Heading
  headingLine1: {
    fontSize: 38,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }),
    color: '#111827',
    lineHeight: 46,
  },
  headingLine2: {
    fontSize: 38,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', default: 'serif' }),
    fontStyle: 'italic',
    color: NAVY,
    lineHeight: 46,
    marginBottom: 24,
  },

  // Value props
  propsBlock: {
    gap: 12,
    marginBottom: 24,
  },
  propRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  propText: {
    fontSize: 15,
    color: '#6B7280',
    lineHeight: 22,
  },

  // Social proof
  socialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 28,
  },
  socialDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  socialText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },

  // CTA
  cta: {
    height: 56,
    borderRadius: 999,
    backgroundColor: NAVY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Footer
  footer: {
    textAlign: 'center',
    fontSize: 13,
    color: '#9CA3AF',
  },
});
