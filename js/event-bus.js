// event-bus.js — typed event bus + the `window.Studio` namespace backbone.
//
// This module is the centralization backbone for the pro-studio-overhaul
// (Requirement 8.1). It gives cross-module communication a *defined contract*
// to replace the ad-hoc `document.dispatchEvent(new CustomEvent(...))` calls
// and the implicit "call this global if it exists" pattern
// (`if (window.fn) window.fn()`).
//
// Two conventions live here:
//
//   1. `Studio.bus` — a tiny `EventTarget`-based event bus with a single,
//      enumerated set of event names (see `EVENTS`). Producers `emit`, and
//      consumers `on`/`once`/`off`.
//
//   2. `window.Studio` — a single namespace object that cross-module functions
//      migrate under (`Studio.camera.sample`, `Studio.capture.cancel`,
//      `Studio.route.rebuild`, `Studio.speed.remapT`, …). Legacy `window.*`
//      globals are kept as `@deprecated` thin aliases that forward to the
//      namespace, so call sites migrate opportunistically rather than in a mass
//      rewrite (see `registerLegacyAlias`).
//
// No DOM and no live Mapbox map are required, so this module is importable in
// the dev-only node test runner. `EventTarget` and `Event` are globals in
// modern Node; `CustomEvent` is used when available with a safe fallback.

// ── Enumerated event names (single source of truth) ──
// Every cross-module event in the Studio is named here. Do not dispatch ad-hoc
// string literals elsewhere — reference `EVENTS` (or `Studio.events`) instead.
export const EVENTS = Object.freeze({
  TREK_CHANGED: 'trek-changed',          // the Trek_Path / waypoint order changed (Req 3, 4.6)
  SELECTION_CHANGED: 'selection-changed', // a waypoint/keyframe selection changed (Req 4.5)
  EXPORT_PROGRESS: 'export-progress',     // { pct, step } during an export (Req 4.2)
  EXPORT_DONE: 'export-done',             // export finished; carries the ExportReport (Req 1)
  STATUS: 'status',                       // { level, message } status messages (Req 4.1, 8.5)
  CONFIG_CHANGED: 'config-changed'        // a STUDIO_CONFIG value changed (Req 8)
});

// Convenience: the flat list of valid event-name strings.
export const EVENT_NAMES = Object.freeze(Object.values(EVENTS));

// Build an event carrying an arbitrary `detail` payload, preferring the
// standard `CustomEvent` and falling back to a plain `Event` with an attached
// `detail` property when `CustomEvent` is not a global (older runtimes).
function makeEvent(type, detail) {
  if (typeof CustomEvent === 'function') {
    return new CustomEvent(type, { detail });
  }
  const ev = new Event(type);
  // Non-standard but functionally equivalent for our internal bus.
  try { ev.detail = detail; } catch { /* read-only in some impls; ignore */ }
  return ev;
}

// ── EventBus ──
// A thin wrapper over `EventTarget` that delivers the event `detail` directly to
// listener functions: `bus.on('status', (detail, event) => ...)`.
export class EventBus {
  constructor() {
    this._target = new EventTarget();
    // Maps a user listener fn -> (type -> wrapper) so `off` can find and remove
    // the exact wrapper that was registered for `on`.
    this._wrappers = new Map();
  }

  /**
   * Emit an event to all listeners.
   * @param {string} type one of EVENT_NAMES
   * @param {*} [detail] payload delivered to listeners
   */
  emit(type, detail) {
    this._target.dispatchEvent(makeEvent(type, detail));
  }

  /**
   * Subscribe to an event.
   * @param {string} type one of EVENT_NAMES
   * @param {(detail:*, event:Event) => void} fn
   * @returns {() => void} an unsubscribe function
   */
  on(type, fn) {
    if (typeof fn !== 'function') throw new TypeError('bus.on requires a function');
    const wrapper = (event) => fn(event && 'detail' in event ? event.detail : undefined, event);
    let byType = this._wrappers.get(fn);
    if (!byType) { byType = new Map(); this._wrappers.set(fn, byType); }
    byType.set(type, wrapper);
    this._target.addEventListener(type, wrapper);
    return () => this.off(type, fn);
  }

  /**
   * Subscribe to a single occurrence of an event, then auto-unsubscribe.
   * @param {string} type one of EVENT_NAMES
   * @param {(detail:*, event:Event) => void} fn
   * @returns {() => void} an unsubscribe function (in case it fires before you cancel)
   */
  once(type, fn) {
    if (typeof fn !== 'function') throw new TypeError('bus.once requires a function');
    const wrapper = (event) => fn(event && 'detail' in event ? event.detail : undefined, event);
    this._target.addEventListener(type, wrapper, { once: true });
    return () => this._target.removeEventListener(type, wrapper);
  }

  /**
   * Unsubscribe a listener previously registered with `on`.
   * @param {string} type one of EVENT_NAMES
   * @param {Function} fn the same function reference passed to `on`
   */
  off(type, fn) {
    const byType = this._wrappers.get(fn);
    const wrapper = byType && byType.get(type);
    if (wrapper) {
      this._target.removeEventListener(type, wrapper);
      byType.delete(type);
      if (byType.size === 0) this._wrappers.delete(fn);
    }
  }
}

// ── The Studio namespace ──
// A single, extensible object that all cross-module functions migrate under.
// Sub-namespaces are created as empty placeholders now and populated by later
// tasks (camera-sampler, capture, routing, speed-curve, project, ui, …).
export const Studio = {
  /** The typed event bus (see EventBus). */
  bus: new EventBus(),
  /** The enumerated event names, also reachable as `Studio.events`. */
  events: EVENTS,

  // Sub-namespaces — empty, extensible placeholders filled in by later tasks.
  camera: {},   // camera-sampler.js  -> sample, pathProgressToCamera (task 4.1)
  capture: {},  // capture.js         -> start, cancel (task 6.x)
  route: {},    // routing.js         -> buildTrekPath, rebuild (task 9.x)
  speed: {},    // speed-curve.js     -> remapT (task 4.3)
  project: {},  // project.js         -> save, load (task 10.x)
  ui: {},        // ui.js              -> status, selection (task 12.x)
  geo: {},      // geo.js             -> distance, bearing, geodesic (task 3.1)

  /**
   * Register a sub-namespace if it does not already exist, returning it.
   * Lets modules attach their API without clobbering an existing namespace:
   *   const ns = Studio.namespace('camera');
   *   ns.sample = sampleCamera;
   * @param {string} name
   * @returns {object}
   */
  namespace(name) {
    if (!this[name] || typeof this[name] !== 'object') this[name] = {};
    return this[name];
  }
};

// ── Legacy global aliases (the @deprecated forwarding convention) ──
//
// MIGRATION PATTERN (documented here, applied incrementally by later tasks):
//
//   The canonical implementation lives under the Studio namespace, e.g.
//     Studio.speed.remapT = remapT;
//   The legacy global is then kept as a thin, @deprecated forwarder so existing
//   call sites keep working until they are migrated:
//     registerLegacyAlias('remapT', 'speed.remapT');   // window.remapT -> Studio.speed.remapT
//
// `registerLegacyAlias` installs `window[legacyName]` as a function that, each
// time it is called, looks up the current namespace target and forwards to it.
// The lookup is lazy (resolved at call time, not registration time) so the
// namespace method can be assigned in any order relative to the alias.
//
// NOTE: As of this task the namespace methods are not yet populated, so no
// breaking forwarders are installed here. Modules that already expose a global
// (e.g. `window.remapT` in speed-curve.js) call `registerLegacyAlias` only
// AFTER assigning their namespace method, in their own task. This function
// establishes the convention and is exported for those modules to use.

/**
 * Install a `@deprecated` legacy global alias that forwards to a Studio
 * namespace method. Non-breaking: if the namespace target is missing at call
 * time, the alias is a no-op that warns once (dev aid), preserving today's
 * "call the global if it exists" tolerance.
 *
 * @param {string} legacyName the `window.<legacyName>` to install (e.g. 'remapT')
 * @param {string} nsPath dot path under Studio (e.g. 'speed.remapT')
 * @returns {Function} the installed forwarder
 */
export function registerLegacyAlias(legacyName, nsPath) {
  const parts = nsPath.split('.');
  let warned = false;
  const resolve = () => parts.reduce((o, k) => (o == null ? o : o[k]), Studio);

  /** @deprecated Use `Studio.${nsPath}` instead. Kept as a thin forwarder. */
  const alias = function (...args) {
    const target = resolve();
    if (typeof target === 'function') return target.apply(this, args);
    if (!warned && typeof console !== 'undefined') {
      warned = true;
      console.warn(
        `[Studio] window.${legacyName} is deprecated; Studio.${nsPath} is not available yet.`
      );
    }
    return undefined;
  };
  alias.__deprecated = `Studio.${nsPath}`;

  const root = (typeof window !== 'undefined') ? window
    : (typeof globalThis !== 'undefined') ? globalThis
      : undefined;
  if (root) root[legacyName] = alias;
  return alias;
}

// ── Attach to the global object ──
// In the browser the app reads `window.Studio` / `window.Studio.bus`. In the
// node test runner there is no `window`, so we also expose it on `globalThis`
// (and named exports are always available via `import`).
const globalRoot = (typeof window !== 'undefined') ? window
  : (typeof globalThis !== 'undefined') ? globalThis
    : undefined;

if (globalRoot) {
  // Preserve any sub-namespaces a module may have attached before this loaded.
  if (globalRoot.Studio && typeof globalRoot.Studio === 'object') {
    Object.assign(Studio, globalRoot.Studio, { bus: Studio.bus, events: Studio.events });
  }
  globalRoot.Studio = Studio;
}

export default Studio;
