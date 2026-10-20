// tile-await.js — Capture_Engine tile-readiness gate.
//
// Replaces the silent fixed 2500ms fallback in capture.js (`waitTilesLoaded`).
// Instead of resolving blindly after a fixed timer and silently shipping a
// blurry frame, this module waits for the map's visible tiles to finish
// loading and CLASSIFIES the result:
//   - { status: 'ok' }       tiles finished within the maximum budget
//   - { status: 'degraded' } tiles never finished by maxTimeoutMs
//
// The capture loop (task 6.5) uses the returned status to record degraded
// frame indices in the Export report rather than writing them silently.
//
// No build step: this is a hand-authored ES module with no dependencies.
//
// _Requirements: 1.1, 1.2_

// Default budgets. The soft `timeoutMs` is the point past which a frame is
// considered slow; the hard `maxTimeoutMs` is the absolute ceiling after which
// the frame is classified as degraded. Both are overridable per call.
export const DEFAULT_TIMEOUT_MS = 2500;
export const DEFAULT_MAX_TIMEOUT_MS = 8000;
export const DEFAULT_POLL_INTERVAL_MS = 50;

/**
 * Pure, side-effect-free readiness classifier.
 *
 * Given the elapsed time (ms, measured from the start of the wait) at which the
 * tiles became ready, decide whether the frame is 'ok' or 'degraded'.
 *
 * Contract (supports Property 1, task 6.10):
 *   degraded  iff  readyTime > maxTimeoutMs
 *   ok        otherwise (including readyTime > timeoutMs but <= maxTimeoutMs)
 *
 * `readyTime` of Infinity (or any value above the ceiling) means the tiles
 * never finished loading within the budget and yields 'degraded'. `timeoutMs`
 * is part of the contract signature (the soft checkpoint) but does not by
 * itself flip the classification — only the hard ceiling does.
 *
 * @param {number} readyTime    elapsed ms until tiles were ready (Infinity if never)
 * @param {number} timeoutMs    soft timeout checkpoint in ms
 * @param {number} maxTimeoutMs hard ceiling in ms
 * @returns {'ok'|'degraded'}
 */
export function classifyReadiness(readyTime, timeoutMs, maxTimeoutMs) {
  // Use a positive predicate so NaN / Infinity / undefined fall through to
  // 'degraded' rather than being mistaken for 'ok'.
  if (typeof readyTime === 'number' && readyTime <= maxTimeoutMs) {
    return 'ok';
  }
  return 'degraded';
}

function nowMs() {
  return (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

/**
 * Wait for the map's visible tiles to finish loading, degrading gracefully.
 *
 * Resolves `{ status: 'ok' }` as soon as `map.areTilesLoaded()` is true. If
 * tiles are not loaded by `timeoutMs`, it keeps waiting up to `maxTimeoutMs`.
 * If they are still not loaded by `maxTimeoutMs`, it resolves
 * `{ status: 'degraded' }`. The promise never rejects.
 *
 * Readiness is detected via both map events ('idle', 'sourcedata', 'render')
 * for responsiveness and a polling fallback for robustness in environments
 * where those events may not fire deterministically.
 *
 * @param {object} map Mapbox GL map (or a stub exposing areTilesLoaded/on/off)
 * @param {{timeoutMs?: number, maxTimeoutMs?: number, pollIntervalMs?: number}} [opts]
 * @returns {Promise<{status: 'ok'|'degraded', readyTime: number}>}
 */
export function awaitTilesOrDegrade(map, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxTimeoutMs = Number.isFinite(opts.maxTimeoutMs) ? opts.maxTimeoutMs : DEFAULT_MAX_TIMEOUT_MS;
  const pollIntervalMs = Number.isFinite(opts.pollIntervalMs) ? opts.pollIntervalMs : DEFAULT_POLL_INTERVAL_MS;

  return new Promise((resolve) => {
    const start = nowMs();
    const tilesLoaded = () => typeof map.areTilesLoaded === 'function' && map.areTilesLoaded();

    let settled = false;
    let pollTimer = null;
    let softTimer = null;
    let hardTimer = null;

    const cleanup = () => {
      if (typeof map.off === 'function') {
        map.off('idle', onMapSignal);
        map.off('sourcedata', onMapSignal);
        map.off('render', onMapSignal);
      }
      if (pollTimer !== null) clearTimeout(pollTimer);
      if (softTimer !== null) clearTimeout(softTimer);
      if (hardTimer !== null) clearTimeout(hardTimer);
    };

    const settle = (readyTime) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status: classifyReadiness(readyTime, timeoutMs, maxTimeoutMs), readyTime });
    };

    const checkNow = () => {
      if (settled) return;
      if (tilesLoaded()) {
        settle(nowMs() - start);
        return true;
      }
      return false;
    };

    const onMapSignal = () => { checkNow(); };

    const poll = () => {
      if (settled) return;
      if (checkNow()) return;
      if (nowMs() - start >= maxTimeoutMs) {
        // Never loaded within the budget -> degraded.
        settle(Infinity);
        return;
      }
      pollTimer = setTimeout(poll, pollIntervalMs);
    };

    // Fast path: tiles already loaded before we did any waiting.
    if (tilesLoaded()) {
      settle(0);
      return;
    }

    // Listen to the map's readiness signals for responsiveness.
    if (typeof map.on === 'function') {
      map.on('idle', onMapSignal);
      map.on('sourcedata', onMapSignal);
      map.on('render', onMapSignal);
    }

    // Soft checkpoint: nudge a repaint so tile loading keeps progressing while
    // we continue waiting toward the hard ceiling.
    softTimer = setTimeout(() => {
      if (settled) return;
      if (!checkNow() && typeof map.triggerRepaint === 'function') {
        map.triggerRepaint();
      }
    }, timeoutMs);

    // Hard ceiling: classify as degraded if still not loaded.
    hardTimer = setTimeout(() => { settle(Infinity); }, maxTimeoutMs);

    // Polling fallback in case map events do not fire.
    pollTimer = setTimeout(poll, pollIntervalMs);
  });
}

// Optional, non-breaking registration under the Studio namespace so call sites
// can migrate opportunistically (see design "Decoupling strategy"). Guarded so
// the module remains usable as a plain import in tests and in node.
if (typeof window !== 'undefined') {
  window.Studio = window.Studio || {};
  window.Studio.tiles = window.Studio.tiles || {};
  window.Studio.tiles.awaitTilesOrDegrade = awaitTilesOrDegrade;
  window.Studio.tiles.classifyReadiness = classifyReadiness;
}
