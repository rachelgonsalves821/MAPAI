/**
 * Web stub for react-native-maps.
 * Used by Metro's resolveRequest when platform === 'web'.
 * MapView renders a Google Maps iframe; all other exports are no-ops.
 */

import React from 'react';

const GOOGLE_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = null;

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface MapViewProps {
  style?: any;
  initialRegion?: Region;
  region?: Region;
  children?: React.ReactNode;
  [key: string]: any;
}

const MapView = React.forwardRef<HTMLDivElement, MapViewProps>(
  ({ style, initialRegion, region, children }, ref) => {
    const activeRegion = region || initialRegion || {
      latitude: 42.3601,
      longitude: -71.0589,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    const center = `${activeRegion.latitude},${activeRegion.longitude}`;
    const zoom = Math.round(14 - Math.log2(activeRegion.latitudeDelta * 111));
    const clampedZoom = Math.max(1, Math.min(20, zoom));

    const src = GOOGLE_KEY
      ? `https://www.google.com/maps/embed/v1/view?key=${GOOGLE_KEY}&center=${center}&zoom=${clampedZoom}&maptype=roadmap`
      : `https://maps.google.com/maps?q=${center}&z=${clampedZoom}&output=embed`;

    const containerStyle: React.CSSProperties = {
      width: '100%',
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
      ...style,
    };

    return (
      <div ref={ref} style={containerStyle}>
        <iframe
          title="map"
          src={src}
          style={{ border: 0, width: '100%', height: '100%' }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
        {children}
      </div>
    );
  }
);

MapView.displayName = 'MapView';
export default MapView;

// No-op stubs for all other react-native-maps exports
export const Marker = (_props: any) => null;
export const Polyline = (_props: any) => null;
export const Circle = (_props: any) => null;
export const Polygon = (_props: any) => null;
export const Callout = (_props: any) => null;
export const CalloutSubview = (_props: any) => null;
export const Overlay = (_props: any) => null;
export const Heatmap = (_props: any) => null;
export const Geojson = (_props: any) => null;
export const UrlTile = (_props: any) => null;

export const AnimatedRegion = class {
  constructor(_region: any) {}
  timing(_config: any) { return { start: () => {} }; }
};

export const MAP_TYPES = {
  STANDARD: 'standard',
  SATELLITE: 'satellite',
  HYBRID: 'hybrid',
  TERRAIN: 'terrain',
  NONE: 'none',
  MUTEDSTANDARD: 'mutedStandard',
};
