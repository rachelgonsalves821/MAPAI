/**
 * Web stub for react-native-map-clustering.
 * Delegates to the react-native-maps web stub (iframe-based MapView).
 * Clustering props are accepted but ignored on web.
 */

import React from 'react';
import MapView from 'react-native-maps';

export default function ClusteredMapView(props: any) {
  const {
    // Strip clustering-specific props before passing to MapView
    clusterColor,
    clusterTextColor,
    clusterFontFamily,
    radius,
    maxZoom,
    minPoints,
    extent,
    animationEnabled,
    renderCluster,
    ...mapProps
  } = props;
  return <MapView {...mapProps} />;
}
