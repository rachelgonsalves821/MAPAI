/**
 * Mapai Design System — Theme Constants
 * Dark-mode-first design with blue/violet palette per PRD §8.2
 */

export const Colors = {
    // Core palette (Modern Gen Z Dark)
    background: '#0A0A0F',        // Deeper space black
    surface: '#16161D',           // Glassy surface
    surfaceElevated: '#1C1C26',   // Elevated surfaces
    surfaceBorder: 'rgba(255, 255, 255, 0.08)', // Faint border for depth

    // Brand colors (Per Brand Guide v1.0)
    brandBlue: '#0558E8',         // Electric Blue (Primary)
    brandViolet: '#7C3AED',       // AI Violet
    brandVioletLight: '#F0F6FF',  // Mist (AI Bubble BG)
    accentNeon: '#10B981',        // Mint (Success)
    ink: '#111827',               // Dark Ink (Text)
    stone: '#6B7280',             // Secondary Text
    cloud: '#D1D5DB',             // Borders/Inactive
    sun: '#F59E0B',               // Gold/Loyalty
    rose: '#EF4444',              // Error

    // Match scores (Per Brand Guide pin logic)
    matchHigh: '#0558E8',         // High match (70+)
    matchMedium: '#1E7FFF',       // Medium (40-69)
    matchLow: '#6B7280',          // Low (<40)

    // Social / Friends
    friendPin: '#7C3AED',         // Friends use AI Violet per some contexts

    // Text & Surfaces (Modern Premium)
    textPrimary: '#FFFFFF',       
    textSecondary: '#D1D5DB',     // Cloud for secondary text in dark mode
    textTertiary: '#6B7280',      // Stone
    textOnBrand: '#FFFFFF',

    // Glassmorphism tokens
    glassBg: 'rgba(22, 22, 29, 0.7)',
    glassBorder: 'rgba(209, 213, 219, 0.1)', // Cloud based border
};

export const Typography = {
    // Brand Fonts per Guide v1.0
    // Clash Display for Headings, Cabinet Grotesk for Body
    fontFamily: {
        heading: 'ClashDisplay-Bold',
        body: 'CabinetGrotesk-Regular',
        bodyMedium: 'CabinetGrotesk-Medium',
        bodySemiBold: 'CabinetGrotesk-SemiBold',
        // Fallbacks are handled in the font loader or system default
        regular: 'CabinetGrotesk-Regular',
        medium: 'CabinetGrotesk-Medium',
        semibold: 'CabinetGrotesk-SemiBold',
        bold: 'ClashDisplay-Bold',
    },
    sizes: {
        xs: 11,   // Caption
        sm: 13,   // Body Small
        base: 15, // Body Default
        md: 17,   // Body Large / UI label
        lg: 20,   // H3
        xl: 24,   // H2
        '2xl': 32, // H1
        '3xl': 40, // Display
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
    sm: 6,
    md: 10,
    lg: 14,
    xl: 20,
    full: 999,
    pill: 24,
};

export const Shadows = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.25,
        shadowRadius: 3,
        elevation: 2,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    lg: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 10,
    },
    glow: (color: string) => ({
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
    }),
};

export const MapConfig = {
    // Boston center coordinates
    initialRegion: {
        latitude: 42.3601,
        longitude: -71.0589,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
    },
    // Dark map style for Apple Maps
    // For Google Maps on Android, use customMapStyle JSON
    darkMapStyle: [
        { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1a2e' }] },
        { elementType: 'labels.text.fill', stylers: [{ color: '#6b7280' }] },
        {
            featureType: 'road',
            elementType: 'geometry',
            stylers: [{ color: '#2a2a3e' }],
        },
        {
            featureType: 'road',
            elementType: 'labels.text.fill',
            stylers: [{ color: '#9ca3af' }],
        },
        {
            featureType: 'water',
            elementType: 'geometry',
            stylers: [{ color: '#0e1a2b' }],
        },
        {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }],
        },
        {
            featureType: 'poi.park',
            elementType: 'geometry',
            stylers: [{ color: '#1a2e1a' }],
        },
        {
            featureType: 'transit',
            stylers: [{ visibility: 'off' }],
        },
    ],
};
