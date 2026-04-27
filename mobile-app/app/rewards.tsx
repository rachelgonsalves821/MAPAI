/**
 * Mapai — Points & Rewards Screen
 * Matches mockup: dark balance card with tier, partner reward rows, activity feed.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, Platform, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';
import { BACKEND_URL } from '@/constants/api';
const NAVY = '#0558E8';

// ─── Types ──────────────────────────────────────────

interface BalanceData {
  balance: number;
  lifetime_earned: number;
  tier: { id: string; name: string; color: string };
  next_tier: { id: string; name: string; min: number } | null;
  pts_to_next_tier: number;
  tier_progress_pct: number;
  weekly_earned: number;
  streak_days: number;
}

interface Reward {
  id: string;
  title: string;
  description: string;
  partner_name?: string;
  points_required: number;
  reward_type: string;
  category?: string;
}

interface Transaction {
  id: string;
  points: number;
  description: string;
  reference_id?: string;
  created_at: string;
}

// ─── Category icon helper ───────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  coffee: 'cafe',
  food: 'restaurant',
  dessert: 'ice-cream',
  drinks: 'wine',
  discount: 'pricetag',
  experience: 'ticket',
};

function getCategoryIcon(reward: Reward): string {
  return CATEGORY_ICONS[reward.category || reward.reward_type] || 'gift';
}

function getCategoryColor(reward: Reward): string {
  const colors: Record<string, string> = {
    coffee: '#92400E',
    food: '#B91C1C',
    dessert: '#7C3AED',
    drinks: '#1D4ED8',
    discount: '#059669',
  };
  return colors[reward.category || ''] || NAVY;
}

// ─── Redemption Modal ───────────────────────────────

function RedemptionModal({ visible, code, reward, onClose }: {
  visible: boolean; code: string; reward: Reward | null; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalS.overlay}>
        <View style={modalS.sheet}>
          <Ionicons name="checkmark-circle" size={48} color="#059669" />
          <Text style={modalS.title}>Redeemed!</Text>
          <Text style={modalS.subtitle}>{reward?.title}</Text>
          {reward?.partner_name && (
            <Text style={modalS.partner}>at {reward.partner_name}</Text>
          )}
          <View style={modalS.codeBox}>
            <Text style={modalS.codeLabel}>YOUR CODE</Text>
            <Text style={modalS.code}>{code}</Text>
            <Text style={modalS.codeHint}>Show this to the cashier</Text>
          </View>
          <TouchableOpacity style={modalS.doneBtn} onPress={onClose}>
            <Text style={modalS.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const modalS = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  sheet: { backgroundColor: '#FFF', borderRadius: 20, padding: 24, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginTop: 12 },
  subtitle: { fontSize: 15, color: '#6B7280', marginTop: 4 },
  partner: { fontSize: 13, color: '#9CA3AF', marginTop: 2 },
  codeBox: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 16, width: '100%', alignItems: 'center', marginTop: 20, marginBottom: 16 },
  codeLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 1 },
  code: { fontSize: 28, fontWeight: '800', color: NAVY, letterSpacing: 4, marginVertical: 8 },
  codeHint: { fontSize: 11, color: '#9CA3AF' },
  doneBtn: { backgroundColor: NAVY, borderRadius: 999, paddingVertical: 14, width: '100%', alignItems: 'center' },
  doneBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});

// ─── Main Screen ────────────────────────────────────

export default function RewardsScreen() {
  const router = useRouter();
  const [balanceData, setBalanceData] = useState<BalanceData | null>(null);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [activity, setActivity] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Modal
  const [modalVisible, setModalVisible] = useState(false);
  const [redemptionCode, setRedemptionCode] = useState('');
  const [redeemedReward, setRedeemedReward] = useState<Reward | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [balRes, rewRes, actRes] = await Promise.all([
        fetch(`${BACKEND_URL}/v1/loyalty/balance`),
        fetch(`${BACKEND_URL}/v1/loyalty/rewards`),
        fetch(`${BACKEND_URL}/v1/loyalty/history?limit=10`),
      ]);
      const bal = await balRes.json();
      const rew = await rewRes.json();
      const act = await actRes.json();
      setBalanceData(bal.data);
      setRewards(rew.data?.rewards || []);
      setActivity(act.data?.transactions || []);
    } catch { /* keep defaults */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);
  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const handleRedeem = (reward: Reward) => {
    if (!balanceData || balanceData.balance < reward.points_required) return;
    Alert.alert('Redeem', `Use ${reward.points_required} pts for "${reward.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Redeem', onPress: async () => {
        try {
          const res = await fetch(`${BACKEND_URL}/v1/loyalty/rewards/${reward.id}/redeem`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
          });
          const d = (await res.json()).data;
          setRedemptionCode(d?.redemption_code || '--------');
          setRedeemedReward(reward);
          setModalVisible(true);
          fetchAll();
        } catch { Alert.alert('Error', 'Redemption failed'); }
      }},
    ]);
  };

  const b = balanceData;

  if (loading) {
    return (
      <View style={s.container}>
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="close" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Points & Rewards</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={NAVY} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#111827" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Points & Rewards</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} />}
      >
        {/* ── Balance Card (dark navy) ─────────────── */}
        <View style={s.balanceCard}>
          <View style={s.balRow}>
            <View>
              <Text style={s.balLabel}>BALANCE</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={s.balAmount}>{b?.balance ?? 0}</Text>
              </View>
              <Text style={s.balUnit}>points</Text>
            </View>
            <View style={[s.tierBadge, { backgroundColor: (b?.tier?.color || '#6B7280') + '30' }]}>
              <Ionicons name="gift" size={14} color={b?.tier?.color || '#6B7280'} />
              <Text style={[s.tierText, { color: b?.tier?.color || '#6B7280' }]}>
                {b?.tier?.name || 'Regular'}
              </Text>
            </View>
          </View>

          {/* Progress to next tier */}
          {b?.next_tier && (
            <View style={s.tierProgress}>
              <Text style={s.tierProgressText}>
                {b.pts_to_next_tier} pts to {b.next_tier.name}
              </Text>
              <Text style={s.tierProgressPct}>{b.tier_progress_pct}%</Text>
            </View>
          )}
          {b?.next_tier && (
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${b.tier_progress_pct}%` as any }]} />
            </View>
          )}

          {/* Weekly stats */}
          <View style={s.weeklyRow}>
            <Ionicons name="flame" size={14} color="#F59E0B" />
            <Text style={s.weeklyText}>
              +{b?.weekly_earned ?? 0} this week · {b?.streak_days ?? 0}-day streak
            </Text>
          </View>
        </View>

        {/* ── REDEEM Section ──────────────────────── */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>REDEEM</Text>
          <TouchableOpacity><Text style={s.seeAll}>See all</Text></TouchableOpacity>
        </View>

        {rewards.map((reward) => {
          const canAfford = (b?.balance ?? 0) >= reward.points_required;
          return (
            <TouchableOpacity
              key={reward.id}
              style={s.rewardRow}
              onPress={() => handleRedeem(reward)}
              disabled={!canAfford}
              activeOpacity={0.75}
            >
              <View style={[s.rewardIcon, { backgroundColor: getCategoryColor(reward) + '15' }]}>
                <Ionicons name={getCategoryIcon(reward) as any} size={20} color={getCategoryColor(reward)} />
              </View>
              <View style={s.rewardInfo}>
                <Text style={[s.rewardName, !canAfford && { color: '#9CA3AF' }]}>{reward.title}</Text>
                <Text style={s.rewardPartner}>{reward.partner_name || ''}</Text>
              </View>
              <View style={s.rewardCost}>
                <Text style={[s.costText, !canAfford && { color: '#9CA3AF' }]}>{reward.points_required}</Text>
                <Ionicons name="gift" size={16} color={canAfford ? NAVY : '#9CA3AF'} />
              </View>
            </TouchableOpacity>
          );
        })}

        {/* ── ACTIVITY Section ────────────────────── */}
        <Text style={[s.sectionTitle, { marginTop: 24 }]}>ACTIVITY</Text>

        {activity.length === 0 ? (
          <Text style={s.emptyActivity}>No activity yet. Start earning points!</Text>
        ) : (
          activity.map((tx) => (
            <View key={tx.id} style={s.activityRow}>
              <View style={[s.activityIcon, tx.points > 0 ? s.actIconPositive : s.actIconNegative]}>
                <Ionicons
                  name={tx.points > 0 ? 'trending-up' : 'gift'}
                  size={16}
                  color={tx.points > 0 ? '#059669' : '#DC2626'}
                />
              </View>
              <View style={s.activityInfo}>
                <Text style={s.activityTitle}>{tx.description}</Text>
                <Text style={s.activityTime}>
                  {formatTime(tx.created_at)}
                </Text>
              </View>
              <Text style={[s.activityPts, tx.points > 0 ? { color: '#059669' } : { color: '#DC2626' }]}>
                {tx.points > 0 ? '+' : ''}{tx.points}
              </Text>
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <RedemptionModal
        visible={modalVisible}
        code={redemptionCode}
        reward={redeemedReward}
        onClose={() => { setModalVisible(false); setRedemptionCode(''); setRedeemedReward(null); }}
      />
    </View>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffH = Math.floor(diffMs / 3600000);
  if (diffH < 1) return 'Just now';
  if (diffH < 24) return `${diffH}h ago`;
  if (diffH < 48) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Styles ─────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 36, paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: '#FFF', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827', letterSpacing: -0.3 },
  scrollContent: { padding: 16 },

  // Balance card (dark navy)
  balanceCard: {
    backgroundColor: '#1a1a2e', borderRadius: 16, padding: 20, marginBottom: 20,
  },
  balRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  balLabel: { fontSize: 11, fontWeight: '600', color: '#9CA3AF', letterSpacing: 0.8 },
  balAmount: { fontSize: 48, fontWeight: '800', color: '#FFF', marginTop: 2 },
  balUnit: { fontSize: 15, color: '#9CA3AF', marginTop: -4 },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  tierText: { fontSize: 13, fontWeight: '700' },
  tierProgress: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 16,
  },
  tierProgressText: { fontSize: 13, color: '#9CA3AF' },
  tierProgressPct: { fontSize: 13, color: '#9CA3AF' },
  progressTrack: {
    height: 6, backgroundColor: '#374151', borderRadius: 3, marginTop: 6, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 3 },
  weeklyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  weeklyText: { fontSize: 13, color: '#9CA3AF' },

  // Sections
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', letterSpacing: 0.8 },
  seeAll: { fontSize: 13, color: '#3B82F6', fontWeight: '600' },

  // Reward rows
  rewardRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF',
    borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)',
  },
  rewardIcon: {
    width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  rewardInfo: { flex: 1, marginLeft: 12 },
  rewardName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  rewardPartner: { fontSize: 13, color: '#6B7280', marginTop: 1 },
  rewardCost: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  costText: { fontSize: 16, fontWeight: '700', color: NAVY },

  // Activity
  emptyActivity: { fontSize: 13, color: '#9CA3AF', paddingVertical: 16, textAlign: 'center' },
  activityRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  activityIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  actIconPositive: { backgroundColor: '#D1FAE5' },
  actIconNegative: { backgroundColor: '#FEE2E2' },
  activityInfo: { flex: 1, marginLeft: 12 },
  activityTitle: { fontSize: 14, fontWeight: '500', color: '#111827' },
  activityTime: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  activityPts: { fontSize: 16, fontWeight: '700' },
});
