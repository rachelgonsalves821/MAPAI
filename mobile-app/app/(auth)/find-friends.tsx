/**
 * Mapai — Find Friends Screen
 * Mockup 2 — search users, sync contacts card, add friends.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Search } from 'lucide-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOnboardingStore } from '@/store/onboardingStore';

interface SuggestedUser {
  id: string;
  name: string;
  username: string;
}

const SUGGESTED_USERS: SuggestedUser[] = [
  { id: '1', name: 'Jake Chen', username: 'jakec' },
  { id: '2', name: 'Lily Park', username: 'lilyp' },
  { id: '3', name: 'Sam Rivera', username: 'samr' },
  { id: '4', name: 'Priya Sharma', username: 'priya' },
  { id: '5', name: 'Alex Kim', username: 'alexk' },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function FindFriendsScreen() {
  const router = useRouter();
  const { selectedFriends, addFriend, removeFriend } = useOnboardingStore();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredUsers = SUGGESTED_USERS.filter(
    (u) =>
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function toggleFriend(id: string) {
    if (selectedFriends.includes(id)) {
      removeFriend(id);
    } else {
      addFriend(id);
    }
  }

  function renderUser({ item }: { item: SuggestedUser }) {
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
          style={[styles.addPill, isAdded && styles.sentPill]}
          onPress={() => toggleFriend(item.id)}
          activeOpacity={0.75}
        >
          <Text style={[styles.addPillText, isAdded && styles.sentPillText]}>
            {isAdded ? 'Sent' : 'Add'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Back arrow */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <ChevronLeft size={24} color="#1A1A2E" />
      </TouchableOpacity>

      {/* Heading */}
      <View style={styles.headingBlock}>
        <Text style={styles.headingRegular}>Better with</Text>
        <Text style={styles.headingItalic}>friends.</Text>
      </View>

      {/* Avatar row + count */}
      <View style={styles.avatarCountRow}>
        <View style={styles.avatarOverlapRow}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.avatarCircle,
                i > 0 && { marginLeft: -8 },
                { zIndex: 4 - i },
              ]}
            />
          ))}
        </View>
        <Text style={styles.avatarCountText}>5 friends on Mapai</Text>
      </View>

      {/* Search input */}
      <View style={styles.searchRow}>
        <Search size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or username"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Sync contacts card */}
      <TouchableOpacity style={styles.syncCard} activeOpacity={0.8}>
        <View style={styles.syncIconWrap}>
          <Ionicons name="phone-portrait-outline" size={22} color="#1D3E91" />
        </View>
        <View style={styles.syncTextWrap}>
          <Text style={styles.syncTitle}>Sync contacts</Text>
          <Text style={styles.syncSubtitle}>Find friends from your phone</Text>
        </View>
      </TouchableOpacity>

      {/* Results list */}
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

      {/* Bottom CTA */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.skipButton}
          onPress={() => router.push('/(auth)/ready')}
          activeOpacity={0.85}
        >
          <Text style={styles.skipButtonText}>Skip for now  →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 16,
    marginTop: 4,
  },
  headingBlock: {
    paddingHorizontal: 24,
    marginTop: 8,
    marginBottom: 16,
  },
  headingRegular: {
    fontSize: 36,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    color: '#1A1A2E',
    lineHeight: 44,
  },
  headingItalic: {
    fontSize: 36,
    fontWeight: '300',
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }),
    fontStyle: 'italic',
    color: '#1A1A2E',
    lineHeight: 44,
  },
  avatarCountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  avatarOverlapRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D1D5DB',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarCountText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingBottom: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#1A1A2E',
    paddingVertical: 4,
  },
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
  },
  syncIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EBF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  syncTextWrap: {
    flex: 1,
  },
  syncTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A2E',
  },
  syncSubtitle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A2E',
  },
  userHandle: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 1,
  },
  addPill: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#1D3E91',
  },
  sentPill: {
    backgroundColor: '#F3F4F6',
  },
  addPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  sentPillText: {
    color: '#9CA3AF',
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: '#9CA3AF',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 8,
  },
  skipButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#1D3E91',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
