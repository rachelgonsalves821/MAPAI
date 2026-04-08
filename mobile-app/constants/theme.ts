/**
 * Mapai Design System — Theme Constants
 * Light-mode design with navy/violet palette per PRD §8.2
 */

export const Colors = {
    // Core palette (Light mode)
    background: '#FFFFFF',
    surface: '#F9FAFB',
    surfaceElevated: '#F3F4F6',
    surfaceBorder: 'rgba(0,0,0,0.08)',

    // Brand colors
    brandBlue: '#0558E8',         // Electric Blue (Primary)
    brandViolet: '#7C3AED',       // AI Violet
    brandVioletLight: '#F0F6FF',  // Mist (AI Bubble BG)
    accent: '#BBCFF7',            // Light blue accent

    // Text
    textPrimary: '#111827',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    textOnBrand: '#FFFFFF',

    // Status
    success: '#10B981',
    error: '#EF4444',
    accentNeon: '#10B981',        // Mint (kept for backward compat)

    // Match scores
    matchHigh: '#0558E8',         // Electric Blue high match (70+)
    matchMedium: '#4B6CB7',       // Medium (40-69)
    matchLow: '#9CA3AF',          // Low (<40)

    // Social / Friends
    friendPin: '#7C3AED',

    // Legacy tokens (kept for backward compat)
    glassBg: 'rgba(249, 250, 251, 0.9)',
    glassBorder: 'rgba(0, 0, 0, 0.08)',
    ink: '#111827',
    stone: '#6B7280',
    cloud: '#D1D5DB',
    sun: '#F59E0B',
    rose: '#EF4444',
};

export const Typography = {
    fontFamily: {
        heading: undefined as string | undefined,
        body: undefined as string | undefined,
        bodyMedium: undefined as string | undefined,
        bodySemiBold: undefined as string | undefined,
        regular: undefined as string | undefined,
        medium: undefined as string | undefined,
        semibold: undefined as string | undefined,
        bold: undefined as string | undefined,
    },
    sizes: {
        xs: 11,
        sm: 13,
        base: 15,
        md: 17,
        lg: 20,
        xl: 24,
        '2xl': 32,
        '3xl': 40,
    },
    lineHeights: {
        tight: 1.2,
        normal: 1.4,
        relaxed: 1.6,
    },
};

export const Spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    '2xl': 32,
    '3xl': 40,
    '4xl': 48,
};

export const BorderRadius = {
    sm: 8,
    md: 12,
    lg: 14,
    xl: 24,
    full: 999,
    pill: 24,
};

export const Shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.07,
        shadowRadius: 3,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.09,
        shadowRadius: 8,
        elevation: 5,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.10,
        shadowRadius: 16,
        elevation: 10,
    },
    glow: (color: string) => ({
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
        elevation: 8,
    }),
};

export const MapConfig = {
    initialRegion: {
        latitude: 42.3601,
        longitude: -71.0589,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    },
    // Empty array = Google Maps default light style
    darkMapStyle: [] as any[],
};
