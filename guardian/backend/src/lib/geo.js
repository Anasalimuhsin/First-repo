// Geofencing helpers. Pure functions so they are easy to test.

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Decide whether a location fix means the child is inside a geofence.
 *
 * GPS fixes jitter, so the boundary has hysteresis: you must be clearly inside
 * (radius minus accuracy) to enter and clearly outside (radius plus a margin)
 * to exit. Fixes too inaccurate to tell keep the previous state.
 *
 * @returns {{ inside: boolean, event: 'enter' | 'exit' | null }}
 */
export function evaluateGeofence(fence, point, wasInside, { exitMarginM = 50 } = {}) {
  const d = distanceMeters({ lat: fence.lat, lng: fence.lng }, point);
  const accuracy = point.accuracyM ?? 0;

  if (accuracy > fence.radiusM * 2) return { inside: wasInside, event: null };

  if (!wasInside && d + accuracy <= fence.radiusM) return { inside: true, event: 'enter' };
  if (wasInside && d - accuracy > fence.radiusM + exitMarginM) return { inside: false, event: 'exit' };
  return { inside: wasInside, event: null };
}
