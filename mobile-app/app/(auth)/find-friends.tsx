/**
 * Mapai — Find Friends Screen
 * Mockup 2 — search users via backend API, sync contacts, send friend requests.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useOnboardingStore } from '@/store/onboardingStore';
import { useAuth } from '@/context/AuthContext';
import apiClient from '@/services/api/client';

interface UserResult {
  clerk_user_id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
}

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
  const { getToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [contactMatches, setContactMatches] = useState<UserResult[]>([]);
  const [hasContactsAccess, setHasContactsAccess] = useState(false);
  const [sentRequests, setSentRequests] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Displayed users: search results take priority, then contact matches
  const displayedUsers = searchQuery.length >= 2 ? searchResults : contactMatches;
  const friendCount = contactMatches.length;

  // Debounced search against backend
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (text.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const token = await getToken();
        const res = await apiClient.get(`/v1/users/search`, {
          params: { q: text.trim() },
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        setSearchResults(res.data?.data?.users ?? []);
      } catch (err) {
        console.warn('User search failed:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, [getToken]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Sync contacts: request permission, extract emails, call match-contacts
  async function handleSyncContacts() {
    try {
      const Contacts = await import('expo-contacts');
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Contacts Access', 'Enable contacts access in Settings to find friends.');
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });

      const emails = data
        .flatMap((c) => c.emails?.map((e) => e.email) ?? [])
        .filter((e): e is string => !!e)
        .slice(0, 500);

      const phoneNumbers = data
        .flatMap((c) => c.phoneNumbers?.map((p) => p.number) ?? [])
        .filter((p): p is string => !!p)
        .slice(0, 500);

      if (emails.length === 0 && phoneNumbers.length === 0) {
        setHasContactsAccess(true);
        return;
      }

      const token = await getToken();
      const res = await apiClient.post(
        '/v1/friends/match-contacts',
        { emails, phoneNumbers },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const matches = res.data?.data ?? [];
      setContactMatches(matches);
      setHasContactsAccess(true);
    } catch (err) {
      console.warn('Contact sync failed:', err);
      setHasContactsAccess(true);
    }
  }

  // Send friend request via backend
  async function handleAddFriend(user: UserResult) {
    const userId = user.clerk_user_id;
    if (sentRequests.has(userId)) return;

    // Optimistic update
    setSentRequests((prev) => new Set(prev).add(userId));
    addFriend(userId);

    try {
      const token = await getToken();
      await apiClient.post(
        '/v1/social/request',
        { to_user_id: userId },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
    } catch (err: any) {
      // 409 = already exists — that's fine
      if (err.response?.status !== 409) {
        console.warn('Friend request failed:', err);
        // Revert optimistic update
        setSentRequests((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
        removeFriend(userId);
      }
    }
  }

  function renderUser({ item }: { item: UserResult }) {
    const isSent = sentRequests.has(item.clerk_user_id);
    return (
      <View style={styles.userRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(item.display_name)}</Text>
        </View>
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.display_name}</Text>
          <Text style={styles.userHandle}>@{item.username}</Text>
        </View>
        <TouchableOpacity
          style={[styles.addPill, isSent && styles.sentPill]}
          onPress={() => handleAddFriend(item)}
          disabled={isSent}
          activeOpacity={0.75}
        >
          <Text style={[styles.addPillText, isSent && styles.sentPillText]}>
            {isSent ? 'Sent' : 'Add'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Back arrow */}
      <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={24} color="#1A1A2E" />
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
        <Text style={styles.avatarCountText}>
          {friendCount} friend{friendCount !== 1 ? 's' : ''} on Mapai
        </Text>
      </View>

      {/* Search input */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or @username"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={handleSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {isSearching && <ActivityIndicator size="small" color="#9CA3AF" />}
      </View>

      {/* Sync contacts card */}
      {!hasContactsAccess && (
        <TouchableOpacity style={styles.syncCard} onPress={handleSyncContacts} activeOpacity={0.8}>
          <View style={styles.syncIconWrap}>
            <Ionicons name="phone-portrait-outline" size={22} color="#0558E8" />
          </View>
          <View style={styles.syncTextWrap}>
            <Text style={styles.syncTitle}>Sync contacts</Text>
            <Text style={styles.syncSubtitle}>Find friends from your phone</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* Results list */}
      <FlatList
        data={displayedUsers}
        keyExtractor={(item) => item.clerk_user_id}
        renderItem={renderUser}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          searchQuery.length >= 2 && !isSearching ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>No users found</Text>
            </View>
          ) : null
        }
      />

      {/* Bottom CTA */}
      <View style={styles.footer}>
        {sentRequests.size > 0 && (
          <TouchableOpacity
            style={[styles.skipButton, { backgroundColor: '#0558E8', marginBottom: 12 }]}
            onPress={() => router.push('/(auth)/ready')}
            activeOpacity={0.85}
          >
            <Text style={styles.skipButtonText}>
              Continue with {sentRequests.size} friend{sentRequests.size !== 1 ? 's' : ''}  →
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.skipButton, sentRequests.size > 0 && { backgroundColor: 'transparent' }]}
          onPress={() => router.push('/(auth)/ready')}
          activeOpacity={0.85}
        >
          <Text style={[styles.skipButtonText, sentRequests.size > 0 && { color: '#6B7280' }]}>
            Skip for now  →
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: 16, marginTop: 4 },
  headingBlock: { paddingHorizontal: 24, marginTop: 8, marginBottom: 16 },
  headingRegular: { fontSize: 36, fontWeight: '300', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }), color: '#1A1A2E', lineHeight: 44 },
  headingItalic: { fontSize: 36, fontWeight: '300', fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' }), fontStyle: 'italic', color: '#1A1A2E', lineHeight: 44 },
  avatarCountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, marginBottom: 20 },
  avatarOverlapRow: { flexDirection: 'row', alignItems: 'center' },
  avatarCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#D1D5DB', borderWidth: 2, borderColor: '#FFFFFF' },
  avatarCountText: { fontSize: 14, color: '#6B7280', fontWeight: '500' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 10, marginBottom: 16 },
  searchInput: { flex: 1, fontSize: 15, color: '#1A1A2E', paddingVertical: 4 },
  syncCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 24, marginBottom: 20, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 16 },
  syncIconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EBF2FF', justifyContent: 'center', alignItems: 'center' },
  syncTextWrap: { flex: 1 },
  syncTitle: { fontSize: 15, fontWeight: '600', color: '#1A1A2E' },
  syncSubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  listContent: { paddingHorizontal: 24, paddingBottom: 16 },
  userRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  userInfo: { flex: 1 },
  userName: { fontSize: 15, fontWeight: '500', color: '#1A1A2E' },
  userHandle: { fontSize: 13, color: '#9CA3AF', marginTop: 1 },
  addPill: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 999, backgroundColor: '#0558E8' },
  sentPill: { backgroundColor: '#F3F4F6' },
  addPillText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  sentPillText: { color: '#9CA3AF' },
  emptyState: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
  footer: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },
  skipButton: { height: 56, borderRadius: 999, backgroundColor: '#0558E8', alignItems: 'center', justifyContent: 'center' },
  skipButtonText: { fontSize: 16, fontWeight: '600', color: '#FFFFFF' },
});
