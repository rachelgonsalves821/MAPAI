/**
 * Mapai — Distance Utilities
 * Haversine distance + walking time estimates for proximity scoring.
 */

/** Straight-line distance in km between two coordinates. */
export function haversineKm(
    lat1: number, lon1: number,
    lat2: number, lon2: number
): number {
    const R = 6371;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = ((lat2 - lat1) * Math.PI) / 180;
    const dLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(dPhi / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLambda / 2) ** 2;

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Estimated walking minutes at 4.8 km/h average pace. */
export function walkingMinutes(distanceKm: number): number {
    return (distanceKm / 4.8) * 60;
}

/** Human-readable distance label for place cards. */
export function distanceLabel(distanceKm: number): string {
    if (distanceKm < 0.1) return '< 1 min walk';
    if (distanceKm < 1.6) {
        const mins = Math.round(walkingMinutes(distanceKm));
        return `${mins} min walk`;
    }
    return `${distanceKm.toFixed(1)} km away`;
}

/**
 * Proximity score: 0.0–1.0
 * <= 5 min walk → 1.0
 * 20 min walk → 0.5
 * > 20 min → decays toward 0.1
 */
export function proximityScore(distanceKm: number): number {
    const mins = walkingMinutes(distanceKm);
    if (mins <= 5) return 1.0;
    if (mins <= 20) return 1.0 - (0.5 * (mins - 5)) / 15;
    return Math.max(0.1, 0.5 - 0.05 * (mins - 20));
}

/** Default 20-min walk radius in km. */
export const DEFAULT_WALK_RADIUS_KM = 1.6;
export const EXTENDED_RADIUS_KM = 5.0;
