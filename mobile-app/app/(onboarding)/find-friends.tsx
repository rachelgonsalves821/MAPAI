/**
 * Mapai — Find Friends Screen
 * Step 3: Search, sync contacts card, suggested users list.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  FlatList,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import ProgressDots from '@/components/ProgressDots';
import { useOnboardingStore } from '@/store/onboardingStore';

interface SuggestedUser {
  id: string;
  name: string;
  username: string;
  avatar: string | null;
}

// Mock data — will be replaced with real API
const SUGGESTED_USERS: SuggestedUser[] = [
  { id: '1', name: 'Jake Chen', username: 'jakec', avatar: null },
  { id: '2', name: 'Lily Park', username: 'lilyp', avatar: null },
  { id: '3', name: 'Sam Rivera', username: 'samr', avatar: null },
  { id: '4', name: 'Priya Sharma', username: 'priya', avatar: null },
  { id: '5', name: 'Alex Kim', username: 'alexk', avatar: null },
];

export default function FindFriendsScreen() {
  const router = useRouter();
  const { selectedFriends, addFriend, removeFriend } = useOnboardingStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [hasContactsAccess, setHasContactsAccess] = useState(false);

  const filteredUsers = SUGGESTED_USERS.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleFriend = (id: string) => {
    if (selectedFriends.includes(id)) {
      removeFriend(id);
    } else {
      addFriend(id);
    }
  };

  const handleSyncContacts = () => {
    // Mock: in real app, request contacts permission + sync
    setHasContactsAccess(true);
  };

  const handleContinue = () => {
    router.push('/(onboarding)/complete');
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const renderUser = ({ item }: { item: SuggestedUser }) => {
    const isAdded = selectedFriends.includes(item.id);

    return (
      <View style={styles.userRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(item.name)}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userHandle}>@{item.username}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addButton, isAdded && styles.addedButton]}
          onPress={() => toggleFriend(item.id)}
          activeOpacity={0.7}
        >
          <Text style={[styles.addButtonText, isAdded && styles.addedButtonText]}>
            {isAdded ? 'Added' : 'Add'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ProgressDots currentStep={3} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Find your friends</Text>
        <Text style={styles.subtitle}>
          Mapai is better with friends. See where they go and what they love.
        </Text>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={Colors.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or username"
          placeholderTextColor={Colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Sync contacts card */}
      {!hasContactsAccess && (
        <TouchableOpacity style={styles.syncCard} onPress={handleSyncContacts} activeOpacity={0.8}>
          <View style={styles.syncIconWrap}>
            <Ionicons name="people" size={24} color={Colors.brandBlue} />
          </View>
          <View style={styles.syncTextWrap}>
            <Text style={styles.syncTitle}>Sync your contacts</Text>
            <Text style={styles.syncSubtitle}>Find friends already on Mapai</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
        </TouchableOpacity>
      )}

      {/* Suggested users */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>Suggested for you</Text>
      </View>

      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        renderItem={renderUser}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No users found</Text>
          </View>
        }
      />

      {/* Footer */}
      <View style={styles.footer}>
        {selectedFriends.length > 0 && (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              Continue with {selectedFriends.length} friend{selectedFriends.length !== 1 ? 's' : ''}
            </Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.textOnBrand} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.skipButton} onPress={handleContinue} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip for now</Text>
          <Ionicons name="arrow-forward" size={16} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.base,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginBottom: Spacing.base,
  },
  title: {
    fontWeight: '700',
    fontSize: Typography.sizes.xl,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.xl,
    marginTop: Spacing.base,
    marginBottom: Spacing.base,
    paddingHorizontal: Spacing.base,
    height: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    gap: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: Typography.sizes.base,
    color: Colors.textPrimary,
    height: 48,
  },
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.brandVioletLight,
    marginHorizontal: Spacing.xl,
    marginBottom: Spacing.lg,
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    gap: Spacing.md,
  },
  syncIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncTextWrap: {
    flex: 1,
  },
  syncTitle: {
    fontSize: Typography.sizes.base,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  syncSubtitle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  listHeader: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.sm,
  },
  listTitle: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  listContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.base,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: Typography.sizes.base,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  userHandle: {
    fontSize: Typography.sizes.sm,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  addButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.brandBlue,
  },
  addedButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  addButtonText: {
    fontSize: Typography.sizes.sm,
    fontWeight: '600',
    color: Colors.textOnBrand,
  },
  addedButtonText: {
    color: Colors.textSecondary,
  },
  emptyState: {
    paddingVertical: Spacing['3xl'],
    alignItems: 'center',
  },
  emptyText: {
    fontSize: Typography.sizes.base,
    color: Colors.textTertiary,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing['2xl'],
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
  primaryButton: {
    backgroundColor: Colors.brandBlue,
    height: 56,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    ...Shadows.md,
  },
  buttonText: {
    fontWeight: '600',
    fontSize: Typography.sizes.md,
    color: Colors.textOnBrand,
  },
  skipButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.xs,
  },
  skipText: {
    fontSize: Typography.sizes.base,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
