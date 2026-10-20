// routing.js — Route_Builder mode dispatch (Req 3).
//
// Constructs the Trek_Path from an ordered list of waypoints according to a
// routing mode:
//
//   - 'straight-line'  (THIS TASK, 9.1): connect the waypoints in order using
//     direct geodesic (great-circle) segments from `geo.js`. The resulting
//     path BEGINS at the first waypoint, ENDS at the last waypoint, and
//     preserves the waypoint order exactly (Property 11, Req 3.1 / 3.8).
//
//   - 'road-and-trail' (task 9.2): for each consecutive waypoint pair, request a
//     snapped route from the Mapbox Directions API with the configured profile
//     (walking/cycling/driving), and use the returned geometry as that leg's
//     path. If a leg's request fails or returns no route, that ONE leg falls
//     back to a straight-line geodesic segment and a single `status` warning is
//     emitted naming the leg (Property 12, Req 3.3). A failed leg never fails
//     the whole route. This mode is ASYNC: `buildTrekPath` returns a Promise of
//     [lng,lat][] when `mode === 'road-and-trail'`.
//
// The straight-line builder (`buildStraightLinePath`) and the per-leg assembler
// (`assembleRouteFromLegs`) are intentionally PURE: no DOM, no Mapbox map reads,
// no `window` usage, no network. They are importable directly in the dev-only
// node test runner (Property tests 9.5 / 9.6) and in the browser. The only
// impure parts of road-and-trail are the network `fetch` (Directions API) and
// emitting `status` events on the bus — both isolated so the assembly decision
// logic stays testable.
//
// TOKEN: Directions API requests authenticate with the centralized PUBLIC-scoped
// Mapbox token (`getMapboxToken()` from store.js). There is no secret token in
// client code; the public token is URL-allowlist restricted in the Mapbox
// account (see SECURITY notes / Req 8.2, 8.3).
//
// Coordinate convention: every point is a [lng, lat] pair in degrees, matching
// Mapbox GL and `geo.js`.
//
// _Requirements: 3.1, 3.2, 3.3, 3.8_

import {
  geodesicInterpolate,
  geodesicSegment,
  haversineDistance
} from './geo.js';
import Studio from './event-bus.js';
import { STUDIO_CONFIG, getMapboxToken } from './store.js';

// ── Defaults for straight-line densification ──
// A straight "as the crow flies" leg is the shortest great-circle arc between
// two waypoints. For short legs the arc is visually identical to two points; for
// long legs we sample intermediate points so the rendered line follows the
// curve of the Earth rather than cutting a chord across it. Densification never
// changes the endpoints or the order — original waypoints always land exactly on
// segment boundaries — so it cannot affect Property 11.
export const DEFAULT_POINT_SPACING_KM = 1;
export const DEFAULT_MAX_STEPS_PER_SEGMENT = 256;

/**
 * Normalize a single waypoint to a [lng, lat] degree pair.
 *
 * Accepts either of the two shapes used across the Studio:
 *   - a raw coordinate pair:           [lng, lat]
 *   - a waypoint object with `.lngLat`: { lngLat: [lng, lat], ... }
 * Also tolerates `{ lng, lat }` objects for convenience.
 *
 * @param {[number,number]|{lngLat:[number,number]}|{lng:number,lat:number}} wp
 * @returns {[number, number] | null} [lng, lat] or null if unrecognizable
 */
export function toLngLat(wp) {
  if (Array.isArray(wp)) {
    const [lng, lat] = wp;
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
    return null;
  }
  if (wp && Array.isArray(wp.lngLat)) {
    const [lng, lat] = wp.lngLat;
    if (Number.isFinite(lng) && Number.isFinite(lat)) return [lng, lat];
    return null;
  }
  if (wp && Number.isFinite(wp.lng) && Number.isFinite(wp.lat)) {
    return [wp.lng, wp.lat];
  }
  return null;
}

/**
 * Number of geodesic sub-steps for a leg, based on its length.
 * Returns at least 1 (so the leg contributes its two endpoints).
 *
 * @param {[number,number]} a - leg start [lng, lat]
 * @param {[number,number]} b - leg end [lng, lat]
 * @param {number} pointSpacingKm - desired spacing between sampled points (km)
 * @param {number} maxSteps - hard cap on sub-steps for a single leg
 * @returns {number} step count >= 1
 */
function stepsForLeg(a, b, pointSpacingKm, maxSteps) {
  const km = haversineDistance(a, b) / 1000;
  if (!(km > 0) || !(pointSpacingKm > 0)) return 1;
  const steps = Math.ceil(km / pointSpacingKm);
  return Math.min(Math.max(1, steps), maxSteps);
}

/**
 * Build a straight-line Trek_Path: connect the waypoints in order using direct
 * geodesic segments. PURE — no side effects, no I/O.
 *
 * Guarantees (Property 11, Req 3.1 / 3.8):
 *   - the returned path BEGINS exactly at the first valid waypoint,
 *   - the returned path ENDS exactly at the last valid waypoint,
 *   - the waypoints appear in the path in their original order.
 *
 * Edge cases:
 *   - 0 valid waypoints -> []
 *   - 1 valid waypoint  -> [point]
 *   - consecutive duplicate waypoints collapse to a single point (no zero-length
 *     spam), still preserving order.
 *
 * @param {Array} waypoints - ordered waypoints ([lng,lat] or {lngLat:[lng,lat]})
 * @param {object} [options]
 * @param {boolean} [options.densify=true] - sample intermediate great-circle points
 * @param {number}  [options.pointSpacingKm=DEFAULT_POINT_SPACING_KM]
 * @param {number}  [options.maxStepsPerSegment=DEFAULT_MAX_STEPS_PER_SEGMENT]
 * @returns {Array<[number, number]>} ordered [lng, lat] points
 */
export function buildStraightLinePath(waypoints, options = {}) {
  const {
    densify = true,
    pointSpacingKm = DEFAULT_POINT_SPACING_KM,
    maxStepsPerSegment = DEFAULT_MAX_STEPS_PER_SEGMENT
  } = options;

  if (!Array.isArray(waypoints) || waypoints.length === 0) return [];

  // Normalize and drop anything we can't read as a coordinate. This keeps the
  // builder total (never throws) while preserving the order of the valid points.
  const pts = [];
  for (const wp of waypoints) {
    const ll = toLngLat(wp);
    if (ll) pts.push(ll);
  }

  if (pts.length === 0) return [];
  if (pts.length === 1) return [[pts[0][0], pts[0][1]]];

  const path = [[pts[0][0], pts[0][1]]];  // begin exactly at the first waypoint

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];

    if (densify) {
      const steps = stepsForLeg(a, b, pointSpacingKm, maxStepsPerSegment);
      // geodesicSegment returns steps+1 points inclusive of both endpoints.
      // Skip index 0 — it duplicates the previous leg's endpoint (which is `a`,
      // already the last element of `path`).
      const seg = geodesicSegment(a, b, steps);
      for (let s = 1; s < seg.length; s++) {
        path.push([seg[s][0], seg[s][1]]);
      }
    } else {
      // No densification: connect endpoints directly. geodesicInterpolate at
      // fraction 1 returns `b` exactly.
      path.push(geodesicInterpolate(a, b, 1));
    }
  }

  return path;
}

// ── road-and-trail mode (Req 3.2 / 3.3, Property 12) ──

// Profiles accepted by the Mapbox Directions API (the ones this Studio exposes).
export const VALID_PROFILES = Object.freeze(['walking', 'cycling', 'driving']);

/**
 * Resolve the routing profile: explicit option > centralized config > 'walking'.
 * @param {string} [profile]
 * @returns {'walking'|'cycling'|'driving'}
 */
function normalizeProfile(profile) {
  if (VALID_PROFILES.includes(profile)) return profile;
  const cfg = STUDIO_CONFIG && STUDIO_CONFIG.routing && STUDIO_CONFIG.routing.profile;
  if (VALID_PROFILES.includes(cfg)) return cfg;
  return 'walking';
}

/**
 * Resolve `fetch` lazily, AT CALL TIME, so importing routing.js in node (the
 * dev-only test runner) never requires a global `fetch` at import time. Returns
 * null when no fetch is available — callers then treat every leg as a failure
 * and fall back to straight-line geodesic segments.
 * @returns {typeof fetch | null}
 */
function resolveFetch() {
  if (typeof fetch === 'function') return fetch;
  if (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function') {
    return globalThis.fetch.bind(globalThis);
  }
  return null;
}

/**
 * Build the Mapbox Directions API URL for a single leg.
 * Uses the centralized PUBLIC-scoped token (no secret token in client code).
 *
 * @param {[number,number]} a - leg start [lng, lat]
 * @param {[number,number]} b - leg end [lng, lat]
 * @param {'walking'|'cycling'|'driving'} profile
 * @param {string} token - public Mapbox access token
 * @returns {string}
 */
export function directionsUrl(a, b, profile, token) {
  const coords = `${a[0]},${a[1]};${b[0]},${b[1]}`;
  return (
    `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coords}` +
    `?geometries=geojson&overview=full&access_token=${token}`
  );
}

/**
 * Request a snapped route for ONE leg from the Mapbox Directions API.
 * Returns the route geometry as an ordered [lng,lat][], or null if the request
 * fails, the response is not OK, or no route geometry is returned. Never throws.
 *
 * @param {[number,number]} a - leg start [lng, lat]
 * @param {[number,number]} b - leg end [lng, lat]
 * @param {'walking'|'cycling'|'driving'} profile
 * @param {string} token - public Mapbox access token
 * @param {typeof fetch} fetchFn - resolved fetch implementation
 * @returns {Promise<Array<[number,number]> | null>}
 */
async function snapLeg(a, b, profile, token, fetchFn) {
  try {
    const res = await fetchFn(directionsUrl(a, b, profile, token));
    if (!res || !res.ok) return null;
    const data = await res.json();
    const route = data && Array.isArray(data.routes) ? data.routes[0] : null;
    const coords = route && route.geometry && route.geometry.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return null;
    // Defensive copy + coordinate-shape guard.
    const out = [];
    for (const c of coords) {
      if (Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
        out.push([c[0], c[1]]);
      }
    }
    return out.length >= 2 ? out : null;
  } catch {
    // Network error / abort / malformed JSON → treat as leg failure (fallback).
    return null;
  }
}

/**
 * PURE per-leg assembler (Property 12, Req 3.3). Given an ordered array of
 * per-leg outcomes, assemble the flattened Trek_Path AND the list of user
 * notifications. No I/O, no bus emission — the caller emits the returned
 * notifications. This isolation is what makes the fallback decision logic
 * testable independently of the network.
 *
 * Each leg outcome:
 *   { index:number, snapped:boolean, geometry:Array<[lng,lat]> }
 *   - `index` is the 0-based leg index (leg between waypoint index and index+1)
 *   - `snapped` true  -> geometry came from the Directions API
 *   - `snapped` false -> geometry is the straight-line geodesic fallback
 *
 * Joining: consecutive legs share a waypoint, so a leg's first point typically
 * duplicates the previous leg's last point. Exact duplicates at the join are
 * collapsed so the path has no zero-length spam, while order is preserved.
 *
 * Notifications: exactly one `status` warning per FAILED (non-snapped) leg,
 * naming the leg with 1-based waypoint numbers, e.g. "Leg 3→4 could not be
 * snapped; using straight line".
 *
 * @param {Array<{index:number, snapped:boolean, geometry:Array<[number,number]>}>} legs
 * @returns {{ path: Array<[number,number]>, notifications: Array<{level:string, message:string}> }}
 */
export function assembleRouteFromLegs(legs) {
  const path = [];
  const notifications = [];

  for (const leg of legs) {
    const geom = (leg && Array.isArray(leg.geometry)) ? leg.geometry : [];
    for (let s = 0; s < geom.length; s++) {
      const pt = geom[s];
      if (!Array.isArray(pt) || !Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) continue;
      if (path.length > 0) {
        const last = path[path.length - 1];
        if (last[0] === pt[0] && last[1] === pt[1]) continue; // collapse join duplicate
      }
      path.push([pt[0], pt[1]]);
    }

    if (leg && leg.snapped === false) {
      const from1 = (Number.isInteger(leg.index) ? leg.index : 0) + 1;
      notifications.push({
        level: 'warn',
        message: `Leg ${from1}→${from1 + 1} could not be snapped; using straight line`
      });
    }
  }

  return { path, notifications };
}

/**
 * Build a road-and-trail Trek_Path: snap each consecutive waypoint pair via the
 * Mapbox Directions API, with per-leg straight-line geodesic fallback (Req 3.2,
 * 3.3, Property 12). ASYNC — returns a Promise of [lng,lat][]. Never throws: a
 * failed/empty leg degrades only that leg and emits exactly one `status`
 * warning naming the leg; one bad leg never fails the whole route.
 *
 * @param {Array} waypoints - ordered waypoints ([lng,lat] or {lngLat:[lng,lat]})
 * @param {object} [options]
 * @param {'walking'|'cycling'|'driving'} [options.profile] - defaults to config
 * @param {string} [options.token] - override token (defaults to getMapboxToken())
 * @param {object} [options.bus] - override event bus (defaults to Studio.bus)
 * @param {typeof fetch} [options.fetchImpl] - override fetch (defaults to global)
 * @returns {Promise<Array<[number,number]>>}
 */
export async function buildRoadAndTrailPath(waypoints, options = {}) {
  // Normalize + drop unreadable coordinates, preserving order (same as straight-line).
  const pts = [];
  if (Array.isArray(waypoints)) {
    for (const wp of waypoints) {
      const ll = toLngLat(wp);
      if (ll) pts.push(ll);
    }
  }
  if (pts.length === 0) return [];
  if (pts.length === 1) return [[pts[0][0], pts[0][1]]];

  const profile = normalizeProfile(options.profile);
  const token = options.token || getMapboxToken();
  const bus = options.bus || (Studio && Studio.bus);
  const fetchFn = options.fetchImpl || resolveFetch();

  // Request each leg pairwise so a single failing leg degrades only that leg.
  const legs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];

    let snappedGeom = null;
    if (fetchFn && token) {
      snappedGeom = await snapLeg(a, b, profile, token, fetchFn);
    }

    if (snappedGeom && snappedGeom.length >= 2) {
      legs.push({ index: i, snapped: true, geometry: snappedGeom });
    } else {
      // Fallback: reuse the pure straight-line geodesic builder for this pair.
      legs.push({ index: i, snapped: false, geometry: buildStraightLinePath([a, b], options) });
    }
  }

  const { path, notifications } = assembleRouteFromLegs(legs);

  // Emit exactly one status warning per failed leg (Req 3.3, Property 12).
  if (bus && typeof bus.emit === 'function') {
    for (const note of notifications) bus.emit('status', note);
  }

  return path;
}

/**
 * Build the Trek_Path for the given waypoints according to the routing mode.
 *
 *   - 'straight-line'  -> SYNC, returns Array<[lng,lat]> (pure geodesic).
 *   - 'road-and-trail' -> ASYNC, returns Promise<Array<[lng,lat]>> (Directions
 *     API per leg with per-leg geodesic fallback).
 *
 * Callers that always `await` the result work for both modes (awaiting a
 * non-Promise returns the value unchanged).
 *
 * @param {Array} waypoints - ordered waypoints ([lng,lat] or {lngLat:[lng,lat]})
 * @param {object} [options]
 * @param {'straight-line'|'road-and-trail'} [options.mode='straight-line']
 * @param {'walking'|'cycling'|'driving'} [options.profile] - road-and-trail only
 * @returns {Array<[number,number]> | Promise<Array<[number,number]>>}
 */
export function buildTrekPath(waypoints, options = {}) {
  const { mode = 'straight-line' } = options;

  if (mode === 'straight-line') {
    return buildStraightLinePath(waypoints, options);
  }

  if (mode === 'road-and-trail') {
    return buildRoadAndTrailPath(waypoints, options);
  }

  throw new Error('routing: unknown mode "' + String(mode) + '"');
}

// ── Register under the Studio namespace (Studio.route) ──
// Canonical entry points live under the namespace; call sites migrate here
// opportunistically (see event-bus.js migration convention).
const route = Studio.namespace ? Studio.namespace('route') : (Studio.route = Studio.route || {});
route.buildTrekPath = buildTrekPath;
route.buildStraightLinePath = buildStraightLinePath;
route.buildRoadAndTrailPath = buildRoadAndTrailPath;
route.assembleRouteFromLegs = assembleRouteFromLegs;

export default {
  buildTrekPath,
  buildStraightLinePath,
  buildRoadAndTrailPath,
  assembleRouteFromLegs,
  toLngLat
};
