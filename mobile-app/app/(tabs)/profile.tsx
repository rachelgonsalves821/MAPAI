import React from 'react';
import {
    View,
    Text,
    StyleSheet,
    Platform,
    ScrollView,
    TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

const PREFERENCE_CARDS = [
    {
        category: 'Food',
        icon: 'restaurant' as const,
        color: Colors.brandViolet,
        items: [
            { label: 'Loves', value: 'Japanese, Italian, Vietnamese', confidence: 0.92 },
            { label: 'Avoids', value: 'Fast food', confidence: 0.85 },
        ],
    },
    {
        category: 'Service',
        icon: 'flash' as const,
        color: '#F59E0B',
        items: [
            { label: 'Speed preference', value: 'Fast service', confidence: 0.78 },
        ],
    },
    {
        category: 'Price',
        icon: 'cash' as const,
        color: '#10B981',
        items: [
            { label: 'Comfort range', value: '$ – $$$', confidence: 0.88 },
        ],
    },
    {
        category: 'Ambiance',
        icon: 'musical-notes' as const,
        color: Colors.brandBlue,
        items: [
            { label: 'Prefers', value: 'Quiet, cozy', confidence: 0.72 },
        ],
    },
];

export default function ProfileScreen() {
    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Profile</Text>
                <TouchableOpacity style={styles.settingsButton}>
                    <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
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
                        <Text style={styles.userName}>Rachel Gonsalves</Text>
                        <Text style={styles.userEmail}>Mapai Alpha · Boston</Text>
                    </View>
                </View>

                {/* Memory section */}
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Learned Vibe</Text>
                    <View style={styles.insightsPill}>
                       <Text style={styles.insightsText}>4 New Insights</Text>
                    </View>
                </View>

                {PREFERENCE_CARDS.map((card) => (
                    <View key={card.category} style={styles.prefCard}>
                        <View style={styles.prefCardHeader}>
                            <View style={[styles.iconBg, { backgroundColor: card.color + '20' }]}>
                                <Ionicons
                                    name={card.icon}
                                    size={16}
                                    color={card.color}
                                />
                            </View>
                            <Text style={[styles.prefCardTitle, { color: card.color }]}>{card.category}</Text>
                        </View>

                        {card.items.map((item, i) => (
                            <TouchableOpacity key={i} style={styles.prefItem} activeOpacity={0.7}>
                                <View style={styles.prefItemContent}>
                                    <Text style={styles.prefLabel}>{item.label}</Text>
                                    <Text style={styles.prefValue}>{item.value}</Text>
                                </View>
                                {/* Confidence bar */}
                                <View style={styles.confidenceBar}>
                                    <View
                                        style={[
                                            styles.confidenceFill,
                                            { width: `${item.confidence * 100}%`, backgroundColor: card.color },
                                        ]}
                                    />
                                </View>
                            </TouchableOpacity>
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
        paddingHorizontal: 20,
        paddingBottom: 16,
    },
    headerTitle: {
        fontSize: 24,
        fontWeight: '800',
        color: Colors.textPrimary,
        letterSpacing: -0.5,
    },
    settingsButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 100,
    },
    userCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(22, 22, 29, 0.9)',
        borderRadius: 24,
        padding: 20,
        marginBottom: 32,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
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
    userEmail: {
        fontSize: 13,
        color: Colors.textSecondary,
        marginTop: 4,
        fontWeight: '500',
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.textPrimary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    insightsPill: {
        backgroundColor: 'rgba(139, 92, 246, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    insightsText: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.brandViolet,
    },
    prefCard: {
        backgroundColor: 'rgba(22, 22, 29, 0.6)',
        borderRadius: 20,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    prefCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    iconBg: {
        width: 32,
        height: 32,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    prefCardTitle: {
        fontSize: 16,
        fontWeight: '700',
    },
    prefItem: {
        marginBottom: 16,
    },
    prefItemContent: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
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
    },
    confidenceBar: {
        height: 3,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 2,
        overflow: 'hidden',
    },
    confidenceFill: {
        height: '100%',
        borderRadius: 2,
    },
});
