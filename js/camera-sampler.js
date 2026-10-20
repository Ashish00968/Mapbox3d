// camera-sampler.js — the single, deterministic source of camera state.
//
// This module is the *parity linchpin* for the pro-studio-overhaul
// (Requirement 2.6, Property 10): both Preview (`animator.js` RAF loop) and
// Export (`capture.js#runSegmentsCapture`) sample the camera through THIS
// module, so an identical progress value `t` always yields an identical camera.
// There is no second sampling path — that is what guarantees Preview/Export
// parity at every corresponding progress value.
//
// Contract:
//
//   • PURE & DETERMINISTIC. For `t` in [0,1] with ≥2 keyframes the output is a
//     function of (keyframes, t) only — no DOM reads, no map reads, no clock,
//     no randomness. The same input always produces the same `CameraSample`.
//     (The <2-keyframe fallback inside `interpolateCameraAtT` reads slider/map
//     state, but the camera *product* path — animations have ≥2 keyframes —
//     stays pure, so Preview and Export route through it identically.)
//
//   • `t` is the progress along the total duration in [0,1]. Callers that use a
//     speed curve must remap first (`Studio.speed.remapT(t)`) and pass the
//     remapped value in. This module does NOT apply the speed curve itself, so
//     exactly one place decides remapping and Preview/Export cannot diverge.
//
//   • REDUCED MOTION IS IGNORED ON PURPOSE. `prefers-reduced-motion` governs UI
//     chrome only (Req 5/7). The camera is the rendered product, not interface
//     animation (Req 2.7), so the sampler never consults the media query and
//     never damps or disables motion. Reduced-motion users still get the full
//     configured cinematic camera in both Preview and Export.
//
// No DOM and no live Mapbox map are required to import this module (the ≥2-kf
// path is pure), so it is importable in the dev-only node test runner.

import { interpolateCameraAtT } from './keyframes.js';
import { Studio, registerLegacyAlias } from './event-bus.js';

/**
 * @typedef {Object} CameraSample
 * @property {[number, number]} center [lng, lat] spline position along the trek path
 * @property {number} bearing  degrees, shortest-arc interpolated (no >180° reversals)
 * @property {number} pitch    degrees
 * @property {number} zoom     map zoom level
 * @property {number} terrainExag terrain exaggeration factor
 * @property {number} timeOfDay hour of day [0,24]
 * @property {number} fogDensity fog density [0,1]
 */

/**
 * Sample the full camera state at progress `t`.
 *
 * Delegates to `interpolateCameraAtT` (Catmull-Rom position + easing +
 * shortest-arc bearing in `keyframes.js`) and returns a normalized
 * `CameraSample`. This is the function both Preview and Export call.
 *
 * @param {number} t progress in [0,1] (already speed-curve-remapped by caller)
 * @returns {CameraSample}
 */
export function sampleCamera(t) {
  const c = interpolateCameraAtT(t);
  // Normalize to the documented CameraSample shape so every consumer (preview,
  // export, tests) sees exactly the same keys regardless of which
  // interpolation branch produced the values.
  return {
    center:      c.center,
    bearing:     c.bearing,
    pitch:       c.pitch,
    zoom:        c.zoom,
    terrainExag: c.terrainExag,
    timeOfDay:   c.timeOfDay,
    fogDensity:  c.fogDensity,
  };
}

/**
 * Spline position along the trek path at progress `t`.
 *
 * The trek-path position is the camera `center` produced by the same
 * Catmull-Rom interpolation used for the full sample, so this delegates to the
 * shared sampler and returns just the `[lng, lat]` position. Keeping it on top
 * of the same code path means the path position can never disagree with the
 * camera position used for rendering.
 *
 * @param {number} t progress in [0,1] (already speed-curve-remapped by caller)
 * @returns {[number, number]} [lng, lat]
 */
export function pathProgressToCamera(t) {
  return sampleCamera(t).center;
}

// ── Register under the Studio namespace (event-bus convention) ──
// Canonical home: `Studio.camera.sample` / `Studio.camera.pathProgressToCamera`.
// No legacy `window.sampleCamera` global existed before this module, so there
// is nothing to alias for backward compatibility; we expose the namespace as
// the single entry point. (registerLegacyAlias is imported to keep the
// convention visible and available should a forwarder be needed later.)
void registerLegacyAlias;
Studio.camera.sample = sampleCamera;
Studio.camera.pathProgressToCamera = pathProgressToCamera;

export default { sampleCamera, pathProgressToCamera };
