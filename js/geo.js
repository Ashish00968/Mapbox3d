/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — geo.js
   Pure geodesic / geometry helpers (Req 3.1, 3.6).

   This module is intentionally PURE: no DOM access, no Mapbox map
   reads, no `window` usage. It is importable directly in node tests
   (no-build ES-module runner) and in the browser.

   Coordinate convention: every point is a [lng, lat] pair in degrees
   (the same order Mapbox GL uses).

   UNITS (documented contract — do not change without updating callers):
     • haversineDistance(a, b)  -> METERS
     • pathDistanceKm(points)   -> KILOMETERS (total along the path)
     • geodesicInterpolate / geodesicSegment -> [lng, lat] degree points
     • shortestArcBearing(a, b) -> initial great-circle bearing, [0, 360)
     • bearingDelta(from, to)   -> signed shortest-arc delta, (-180, 180]
   ════════════════════════════════════════════════════════════ */

// Mean Earth radius in meters (WGS-84 mean radius, R1).
export const EARTH_RADIUS_M = 6371000;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

function toRad(deg) { return deg * DEG2RAD; }
function toDeg(rad) { return rad * RAD2DEG; }

/**
 * Great-circle (haversine) distance between two [lng, lat] points.
 * @param {[number, number]} a - [lng, lat] in degrees
 * @param {[number, number]} b - [lng, lat] in degrees
 * @returns {number} distance in METERS
 */
export function haversineDistance(a, b) {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);

  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_M * c;
}

/**
 * Total length of an ordered path, summing haversine distances.
 * @param {Array<[number, number]>} points - ordered [lng, lat] points
 * @returns {number} total distance in KILOMETERS
 */
export function pathDistanceKm(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    meters += haversineDistance(points[i - 1], points[i]);
  }
  return meters / 1000;
}

/**
 * Great-circle (slerp) interpolation between two [lng, lat] points.
 * Returns the point that lies `fraction` of the way along the shortest
 * great-circle arc from `a` to `b`. fraction is clamped to [0, 1].
 *
 * Falls back gracefully to the endpoints when the two points coincide.
 * @param {[number, number]} a - start [lng, lat] in degrees
 * @param {[number, number]} b - end [lng, lat] in degrees
 * @param {number} fraction - 0 -> a, 1 -> b
 * @returns {[number, number]} interpolated [lng, lat] in degrees
 */
export function geodesicInterpolate(a, b, fraction) {
  const f = fraction <= 0 ? 0 : fraction >= 1 ? 1 : fraction;
  if (f === 0) return [a[0], a[1]];
  if (f === 1) return [b[0], b[1]];

  const lat1 = toRad(a[1]);
  const lng1 = toRad(a[0]);
  const lat2 = toRad(b[1]);
  const lng2 = toRad(b[0]);

  // Angular distance between the two points (haversine form).
  const dLat = lat2 - lat1;
  const dLng = lng2 - lng1;
  const h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1) * Math.cos(lat2) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const delta = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));

  // Coincident (or effectively coincident) points: nothing to interpolate.
  if (delta === 0 || !isFinite(delta)) return [a[0], a[1]];

  const sinDelta = Math.sin(delta);
  const A = Math.sin((1 - f) * delta) / sinDelta;
  const B = Math.sin(f * delta) / sinDelta;

  // Convert to 3D cartesian, blend, convert back.
  const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
  const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
  const z = A * Math.sin(lat1) + B * Math.sin(lat2);

  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lng = Math.atan2(y, x);

  return [toDeg(lng), toDeg(lat)];
}

/**
 * Produce an array of points sampled along the great-circle arc from
 * `a` to `b`, inclusive of both endpoints.
 * @param {[number, number]} a - start [lng, lat] in degrees
 * @param {[number, number]} b - end [lng, lat] in degrees
 * @param {number} steps - number of segments (>= 1). steps=1 -> [a, b].
 * @returns {Array<[number, number]>} steps+1 points from a to b
 */
export function geodesicSegment(a, b, steps) {
  const n = Math.max(1, Math.floor(steps));
  const out = new Array(n + 1);
  for (let i = 0; i <= n; i++) {
    out[i] = geodesicInterpolate(a, b, i / n);
  }
  return out;
}

/**
 * Initial bearing of the great-circle arc from `a` to `b`.
 * @param {[number, number]} a - start [lng, lat] in degrees
 * @param {[number, number]} b - end [lng, lat] in degrees
 * @returns {number} bearing in degrees, normalized to [0, 360)
 */
export function shortestArcBearing(a, b) {
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const dLng = toRad(b[0] - a[0]);

  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = toDeg(Math.atan2(y, x));
  return (brng % 360 + 360) % 360;
}

/**
 * Signed shortest-arc difference between two bearings (degrees).
 * Uses the ((to - from) + 540) % 360 - 180 form so the result is always
 * the shortest rotation and never exceeds 180 degrees in magnitude.
 * @param {number} from - starting bearing in degrees
 * @param {number} to - target bearing in degrees
 * @returns {number} signed delta in degrees, range (-180, 180]
 */
export function bearingDelta(from, to) {
  return ((to - from) % 360 + 540) % 360 - 180;
}
