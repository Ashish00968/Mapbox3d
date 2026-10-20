// validation.js — operation input validation for Preview and Export (Req 4.3).
//
// Before a Preview or Export starts, the Editor_UI must verify the minimum
// required inputs are present. If any are missing, the operation MUST NOT start
// and the user MUST be told which inputs are missing (Req 4.3). This module
// centralizes that check behind a single PURE function so the rule lives in one
// place and is unit/property testable in the no-build node runner.
//
// Design contract (supports Property 16, task 12.8):
//   An operation is permitted to start  iff  validateForOperation(op, config)
//   returns an EMPTY list. A non-empty list enumerates the missing inputs in a
//   human-readable form (e.g. "needs a trek path", "needs at least 2 keyframes").
//
// The core check is pure: it reads only its `config` argument (falling back to
// STUDIO_CONFIG when omitted) and performs no DOM/map access, so it imports
// cleanly in node. UI wiring (surfacing the messages, refusing to start) lives
// in the call sites (capture.js, animator.js) — this module only decides.
//
// _Requirements: 4.3_

import { STUDIO_CONFIG } from './store.js';

// Minimum-input thresholds, named so the rule is self-documenting and shared.
export const MIN_KEYFRAMES = 2;     // an animation needs at least a start and end
export const MIN_TREK_POINTS = 2;   // a path needs at least two coordinates

// The operations this module validates. Anything else is treated as unknown
// and therefore not permitted to start.
export const OPERATIONS = Object.freeze(['preview', 'export']);

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

/**
 * Return the LIST of missing required inputs for an operation.
 *
 * Pure: depends only on `op` and the provided `config` (defaults to the
 * centralized STUDIO_CONFIG). No DOM, no map, no globals.
 *
 *   • 'preview' requires at least MIN_KEYFRAMES keyframes (the camera animation
 *     is keyframe-driven), mirroring the legacy
 *     "Please add at least 2 Keyframes" precondition.
 *   • 'export'  requires a trek path of at least MIN_TREK_POINTS coordinates,
 *     mirroring the legacy "Please load a trek path first" precondition.
 *
 * An empty list ⇒ the operation is permitted to start (Property 16). A non-empty
 * list enumerates the missing inputs as human-readable phrases. An unknown `op`
 * yields a single descriptive entry so it is never silently permitted.
 *
 * @param {'preview'|'export'} op
 * @param {object} [config] defaults to STUDIO_CONFIG
 * @returns {string[]} missing-input messages (empty ⇒ allowed)
 */
export function validateForOperation(op, config) {
  const cfg = config || STUDIO_CONFIG || {};
  const missing = [];

  const keyframes = asArray(cfg.keyframes);
  const trekPath = asArray(cfg.trekPath);

  switch (op) {
    case 'preview':
      if (keyframes.length < MIN_KEYFRAMES) {
        missing.push(`needs at least ${MIN_KEYFRAMES} keyframes`);
      }
      break;
    case 'export':
      if (trekPath.length < MIN_TREK_POINTS) {
        missing.push('needs a trek path');
      }
      break;
    default:
      missing.push(`unknown operation: ${String(op)}`);
      break;
  }

  return missing;
}

/**
 * Convenience predicate: is the operation permitted to start?
 * Permitted iff `validateForOperation` returns an empty list (Property 16).
 *
 * @param {'preview'|'export'} op
 * @param {object} [config]
 * @returns {boolean}
 */
export function canStartOperation(op, config) {
  return validateForOperation(op, config).length === 0;
}

/**
 * Build a single human-readable sentence describing the missing inputs, suitable
 * for a status message. Returns '' when nothing is missing.
 *
 * @param {'preview'|'export'} op
 * @param {object} [config]
 * @returns {string}
 */
export function describeMissingInputs(op, config) {
  const missing = validateForOperation(op, config);
  if (missing.length === 0) return '';
  const label = op === 'export' ? 'Export' : op === 'preview' ? 'Preview' : String(op);
  return `Cannot start ${label}: ${missing.join('; ')}.`;
}

// ── Register under the Studio namespace (Studio.validate) ──
// Canonical entry points live under the namespace; call sites use them directly
// (see event-bus.js migration convention). Guarded so the module remains a plain
// importable ES module in the dev-only node test runner.
if (typeof window !== 'undefined' && window.Studio) {
  const ns = typeof window.Studio.namespace === 'function'
    ? window.Studio.namespace('validate')
    : (window.Studio.validate = window.Studio.validate || {});
  ns.forOperation = validateForOperation;
  ns.canStart = canStartOperation;
  ns.describeMissing = describeMissingInputs;
}
