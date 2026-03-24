/**
 * Mapai — Profile Screen (standalone)
 * Shows user card, learned preferences from stores, and settings.
 * Accessible from HomeScreen header.
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Platform,
  ScrollView,
  TouchableOpacity,
  Share,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useAuthStore, UserPreferencesState } from '@/store/authStore';
import { useOnboardingStore } from '@/store/onboardingStore';

const DEFAULT_PREFS: UserPreferencesState = {
  categories: [],
  priceRange: [],
  ambiance: [],
  serviceSpeed: '',
  dietaryRestrictions: [],
};

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const authStoreUser = useAuthStore((s) => s.user);

  const prefs = authStoreUser?.preferences || DEFAULT_PREFS;
  const username = authStoreUser?.username;

  const handleShare = async () => {
    if (username) {
      await Share.share({
        message: `Check out my Mapai profile: mapai.app/u/${username}`,
      });
    }
  };

  const handleSignOut = async () => {
    useAuthStore.getState().logout();
    useOnboardingStore.getState().reset();
    await signOut();
  };

  // Build preference display cards from actual data
  const prefCards = [
    {
      category: 'Interests',
      icon: 'sparkles' as const,
      color: Colors.brandViolet,
      items: prefs.categories.length > 0
        ? [{ label: 'Selected', value: prefs.categories.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ') }]
        : [{ label: 'Selected', value: 'Not set yet' }],
    },
    {
      category: 'Price',
      icon: 'cash' as const,
      color: '#10B981',
      items: prefs.priceRange.length > 0
        ? [{ label: 'Comfort range', value: prefs.priceRange.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ') }]
        : [{ label: 'Comfort range', value: '$ – $$$' }],
    },
    {
      category: 'Ambiance',
      icon: 'musical-notes' as const,
      color: Colors.brandBlue,
      items: prefs.ambiance.length > 0
        ? [{ label: 'Prefers', value: prefs.ambiance.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ') }]
        : [{ label: 'Prefers', value: 'Not set yet' }],
    },
    {
      category: 'Service',
      icon: 'flash' as const,
      color: '#F59E0B',
      items: prefs.serviceSpeed
        ? [{ label: 'Speed preference', value: prefs.serviceSpeed.charAt(0).toUpperCase() + prefs.serviceSpeed.slice(1) }]
        : [{ label: 'Speed preference', value: 'Moderate' }],
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity style={styles.settingsButton} onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={22} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User card */}
        <View style={styles.userCard}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={32} color={Colors.brandViolet} />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user?.displayName || 'User'}</Text>
            {username && (
              <Text style={styles.userHandle}>@{username}</Text>
            )}
            <Text style={styles.userStatus}>Mapai Alpha · Boston</Text>
          </View>
          {username && (
            <TouchableOpacity style={styles.shareButton} onPress={handleShare}>
              <Ionicons name="share-outline" size={18} color={Colors.brandBlue} />
            </TouchableOpacity>
          )}
        </View>

        {/* Social stats */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{authStoreUser?.social?.friendsCount ?? 0}</Text>
            <Text style={styles.statLabel}>Friends</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{authStoreUser?.social?.mutuals ?? 0}</Text>
            <Text style={styles.statLabel}>Mutual</Text>
          </View>
        </View>

        {/* Memory section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Vibe</Text>
        </View>

        {prefCards.map((card) => (
          <View key={card.category} style={styles.prefCard}>
            <View style={styles.prefCardHeader}>
              <View style={[styles.iconBg, { backgroundColor: card.color + '20' }]}>
                <Ionicons name={card.icon} size={16} color={card.color} />
              </View>
              <Text style={[styles.prefCardTitle, { color: card.color }]}>
                {card.category}
              </Text>
            </View>

            {card.items.map((item, i) => (
              <View key={i} style={styles.prefItem}>
                <View style={styles.prefItemContent}>
                  <Text style={styles.prefLabel}>{item.label}</Text>
                  <Text style={styles.prefValue}>{item.value}</Text>
                </View>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 60,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    ...Shadows.md,
  },
  avatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  userHandle: {
    fontSize: 13,
    color: Colors.brandBlue,
    fontWeight: '600',
    marginTop: 2,
  },
  userStatus: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 4,
    fontWeight: '500',
  },
  shareButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  statItem: {
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.brandBlue,
  },
  statLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '500',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.surfaceBorder,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.textPrimary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  prefCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  prefCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  iconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prefCardTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  prefItem: {
    marginBottom: 8,
  },
  prefItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  prefLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  prefValue: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
});
