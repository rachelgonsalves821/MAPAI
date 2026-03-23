import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '@/constants/theme';

export default function SocialScreen() {
    const [activeTab, setActiveTab] = React.useState('Feed');

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Social</Text>
                <TouchableOpacity style={styles.friendPulse}>
                    <View style={styles.pulseDot} />
                </TouchableOpacity>
            </View>

            <View style={styles.tabRow}>
                {['Feed', 'Friends', 'Plans'].map((tab) => (
                    <TouchableOpacity 
                        key={tab} 
                        onPress={() => setActiveTab(tab)}
                        style={[styles.tab, activeTab === tab && styles.tabActive]}
                    >
                        <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={styles.content}>
                {activeTab === 'Feed' ? (
                    <View style={styles.emptyState}>
                         <Ionicons name="newspaper-outline" size={48} color="#D1D5DB" />
                         <Text style={styles.emptyTitle}>Nothing to see yet</Text>
                         <Text style={styles.emptySubtitle}>Your friends' activity will appear here.</Text>
                    </View>
                ) : activeTab === 'Friends' ? (
                    <View style={styles.emptyState}>
                         <Ionicons name="people-outline" size={48} color="#D1D5DB" />
                         <Text style={styles.emptyTitle}>No friends yet</Text>
                         <Text style={styles.emptySubtitle}>Find your crew to see where they're hanging out.</Text>
                         <TouchableOpacity style={styles.primaryButton}>
                            <Text style={styles.buttonText}>Find Friends</Text>
                         </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIcon}>
                            <Ionicons name="calendar" size={40} color="#0558E8" />
                        </View>
                        <Text style={styles.emptyTitle}>Your schedule is wide open</Text>
                        <Text style={styles.emptySubtitle}>
                            When you find spots or book rides, they'll show up here.
                        </Text>
                    </View>
                )}
            </View>
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
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingHorizontal: 20,
        paddingBottom: 16,
        gap: 12,
    },
    headerTitle: {
        fontSize: 24,
        fontFamily: 'ClashDisplay-Bold',
        color: Colors.textPrimary,
        letterSpacing: -0.5,
    },
    friendPulse: {
        marginTop: 6,
    },
    pulseDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10B981', // Mint pulse
    },
    tabRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 12,
        marginBottom: 20,
    },
    tab: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    tabActive: {
        backgroundColor: '#0558E8', // Electric Blue
    },
    tabText: {
        color: '#D1D5DB', // Cloud
        fontSize: 14,
        fontFamily: 'CabinetGrotesk-Medium',
    },
    tabTextActive: {
        color: '#FFFFFF',
    },
    content: {
        flex: 1,
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
        paddingBottom: 100,
    },
    emptyIcon: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(5, 88, 232, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    emptyTitle: {
        fontSize: 18,
        fontFamily: 'ClashDisplay-Bold',
        color: Colors.textPrimary,
        textAlign: 'center',
        marginBottom: 8,
        marginTop: 16,
    },
    emptySubtitle: {
        fontSize: 14,
        fontFamily: 'CabinetGrotesk-Regular',
        color: '#6B7280', // Stone
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    primaryButton: {
        backgroundColor: '#0558E8',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 12,
    },
    buttonText: {
        color: '#FFFFFF',
        fontFamily: 'CabinetGrotesk-SemiBold',
        fontSize: 14,
    },
});
