/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — project-schema.js
   Project_Store schema: validation, migration, (de)serialization.
   Requirement 9 (save/load robustness).

   This module is intentionally PURE:
     • no DOM access, no Mapbox map reads, no `window` mutation of state
     • it NEVER mutates STUDIO_CONFIG (it only READS the centralized
       presets to know which fps / resolution values are supported)
   It is therefore importable directly in the no-build node test runner
   (Property 20 — schema validation soundness) and in the browser.

   A persisted ProjectFile (schema v2) has the shape:
     {
       schemaVersion: 2,       // integer, must be a supported version
       timestamp: string,      // ISO-8601, informational only
       config: { ...persisted STUDIO_CONFIG fields... }
     }

   NOTE: `validateProject` validates against the CURRENT schema. Older
   supported versions are upgraded by `migrateProject` (task 10.2) BEFORE
   validation, so a structurally-valid object reaching `validateProject`
   already declares the current schema version.
   ════════════════════════════════════════════════════════════ */

import { STUDIO_CONFIG } from './store.js';

// Current persisted project schema version (Req 9.1). Mirrors
// STUDIO_CONFIG.schemaVersion but is exported here as the schema module's
// own authoritative constant for save/migrate/validate.
export const CURRENT_SCHEMA = 2;

// Versions `validateProject` accepts directly. Migration brings older files
// up to CURRENT_SCHEMA before they reach validation, so only the current
// version is considered structurally valid here.
export const SUPPORTED_SCHEMAS = [CURRENT_SCHEMA];

// ── small, pure type predicates ───────────────────────────────
const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v);
const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isString = (v) => typeof v === 'string';
const isBoolean = (v) => typeof v === 'boolean';
const isArray = (v) => Array.isArray(v);
// A [lng, lat] pair: 2-element array of finite numbers.
const isLngLat = (v) =>
  Array.isArray(v) && v.length === 2 && isFiniteNumber(v[0]) && isFiniteNumber(v[1]);

// Allowed enum values for required config fields.
const RESOLUTIONS = Object.keys(STUDIO_CONFIG.presets.resolution); // ['1080p','2K','4K']
const SUPPORTED_FPS = STUDIO_CONFIG.presets.fps;                    // [24,30,60]
const EXPORT_MODES = ['webcodecs', 'zip'];
const ROUTING_MODES = ['straight-line', 'road-and-trail'];
const ROUTING_PROFILES = ['walking', 'cycling', 'driving'];
const ASPECT_RATIOS = ['16:9', '9:16', '1:1']; // optional field

const fail = (error) => ({ ok: false, error });

/**
 * Validate a parsed ProjectFile against the current schema.
 *
 * PURE: performs no side effects and NEVER applies anything to
 * STUDIO_CONFIG. On failure it simply returns `{ ok:false, error }`;
 * callers (project.js) are responsible for leaving state unchanged.
 *
 * Required config fields are exactly the fields that exist in the
 * STUDIO_CONFIG defaults (so a freshly-saved project always validates).
 * `aspectRatio` and `speedCurve` are optional and only type-checked when
 * present, because they have no default in STUDIO_CONFIG.
 *
 * @param {*} obj - the parsed ProjectFile (top-level object)
 * @returns {{ok:true, value:object} | {ok:false, error:string}}
 */
export function validateProject(obj) {
  // ── top-level shape (Req 9.2) ──
  if (!isPlainObject(obj)) {
    return fail('Project file must be a JSON object.');
  }
  // schemaVersion present & supported.
  if (!isFiniteNumber(obj.schemaVersion)) {
    return fail('Missing or non-numeric "schemaVersion".');
  }
  if (!SUPPORTED_SCHEMAS.includes(obj.schemaVersion)) {
    return fail(
      `Unsupported schemaVersion ${obj.schemaVersion}; expected one of [${SUPPORTED_SCHEMAS.join(', ')}].`
    );
  }
  if (!isPlainObject(obj.config)) {
    return fail('Missing or invalid "config" object.');
  }

  const c = obj.config;

  // ── required scalar / enum config fields & types (Req 9.2) ──
  if (!isString(c.mapStyle)) return fail('config.mapStyle must be a string.');
  if (!RESOLUTIONS.includes(c.resolution)) {
    return fail(`config.resolution must be one of [${RESOLUTIONS.join(', ')}].`);
  }
  if (!isFiniteNumber(c.pixelRatio)) return fail('config.pixelRatio must be a number.');
  if (!isFiniteNumber(c.fps) || !SUPPORTED_FPS.includes(c.fps)) {
    return fail(`config.fps must be one of the preset values [${SUPPORTED_FPS.join(', ')}].`);
  }
  if (!isFiniteNumber(c.duration) || c.duration <= 0) {
    return fail('config.duration must be a number greater than 0.');
  }
  if (!isFiniteNumber(c.pitch)) return fail('config.pitch must be a number.');
  if (!isFiniteNumber(c.zoom)) return fail('config.zoom must be a number.');
  if (!isFiniteNumber(c.terrainExaggeration)) return fail('config.terrainExaggeration must be a number.');
  if (!isFiniteNumber(c.timeOfDay)) return fail('config.timeOfDay must be a number.');
  if (!isFiniteNumber(c.fogDensity)) return fail('config.fogDensity must be a number.');
  if (!EXPORT_MODES.includes(c.exportMode)) {
    return fail(`config.exportMode must be one of [${EXPORT_MODES.join(', ')}].`);
  }

  // ── routing object (Req 3 / 9.2) ──
  if (!isPlainObject(c.routing)) return fail('config.routing must be an object.');
  if (!ROUTING_MODES.includes(c.routing.mode)) {
    return fail(`config.routing.mode must be one of [${ROUTING_MODES.join(', ')}].`);
  }
  if (!ROUTING_PROFILES.includes(c.routing.profile)) {
    return fail(`config.routing.profile must be one of [${ROUTING_PROFILES.join(', ')}].`);
  }

  // ── ordered collections ──
  if (!isArray(c.trekPath)) return fail('config.trekPath must be an array.');
  for (let i = 0; i < c.trekPath.length; i++) {
    if (!isLngLat(c.trekPath[i])) {
      return fail(`config.trekPath[${i}] must be a [lng, lat] pair of numbers.`);
    }
  }

  if (!isArray(c.waypoints)) return fail('config.waypoints must be an array.');
  for (let i = 0; i < c.waypoints.length; i++) {
    const wp = c.waypoints[i];
    if (!isPlainObject(wp)) return fail(`config.waypoints[${i}] must be an object.`);
    if (!isLngLat(wp.lngLat)) {
      return fail(`config.waypoints[${i}].lngLat must be a [lng, lat] pair of numbers.`);
    }
    if (!isString(wp.name)) return fail(`config.waypoints[${i}].name must be a string.`);
    if (!(wp.elevation === null || isFiniteNumber(wp.elevation))) {
      return fail(`config.waypoints[${i}].elevation must be a number or null.`);
    }
  }

  if (!isArray(c.keyframes)) return fail('config.keyframes must be an array.');
  for (let i = 0; i < c.keyframes.length; i++) {
    const kf = c.keyframes[i];
    if (!isPlainObject(kf)) return fail(`config.keyframes[${i}] must be an object.`);
    if (!isFiniteNumber(kf.t) || kf.t < 0 || kf.t > 1) {
      return fail(`config.keyframes[${i}].t must be a number in [0, 1].`);
    }
    if (!isLngLat(kf.center)) {
      return fail(`config.keyframes[${i}].center must be a [lng, lat] pair of numbers.`);
    }
  }

  // ── required nested objects ──
  if (!isPlainObject(c.timeline)) return fail('config.timeline must be an object.');
  if (!isBoolean(c.timeline.enabled)) return fail('config.timeline.enabled must be a boolean.');

  if (!isPlainObject(c.overlays)) return fail('config.overlays must be an object.');

  if (!isPlainObject(c.model)) return fail('config.model must be an object.');
  if (!isBoolean(c.model.enabled)) return fail('config.model.enabled must be a boolean.');
  if (!isString(c.model.url)) return fail('config.model.url must be a string.');
  if (!isFiniteNumber(c.model.scale)) return fail('config.model.scale must be a number.');

  // ── optional fields: only type-checked when present ──
  if (c.aspectRatio !== undefined && !ASPECT_RATIOS.includes(c.aspectRatio)) {
    return fail(`config.aspectRatio, when present, must be one of [${ASPECT_RATIOS.join(', ')}].`);
  }
  if (c.speedCurve !== undefined && !isPlainObject(c.speedCurve)) {
    return fail('config.speedCurve, when present, must be an object.');
  }

  return { ok: true, value: obj };
}

// ── migration helpers ─────────────────────────────────────────
// Deep-clone a JSON-safe value. Prefer structuredClone (node 17+, browsers);
// fall back to JSON round-trip. Keeps migration PURE — neither the input
// object nor STUDIO_CONFIG is ever mutated.
function deepClone(v) {
  if (typeof structuredClone === 'function') return structuredClone(v);
  return JSON.parse(JSON.stringify(v));
}

// The set of v2-required config fields with their canonical defaults, read
// (and deep-cloned) from the centralized STUDIO_CONFIG. Reading is allowed;
// we never mutate STUDIO_CONFIG. Used to fill any field absent in an older
// file so the migrated object passes validateProject.
function v2ConfigDefaults() {
  return {
    mapStyle: STUDIO_CONFIG.mapStyle,
    resolution: STUDIO_CONFIG.resolution,
    pixelRatio: STUDIO_CONFIG.pixelRatio,
    fps: STUDIO_CONFIG.fps,
    duration: STUDIO_CONFIG.duration,
    pitch: STUDIO_CONFIG.pitch,
    zoom: STUDIO_CONFIG.zoom,
    terrainExaggeration: STUDIO_CONFIG.terrainExaggeration,
    timeOfDay: STUDIO_CONFIG.timeOfDay,
    fogDensity: STUDIO_CONFIG.fogDensity,
    exportMode: STUDIO_CONFIG.exportMode,
    routing: deepClone(STUDIO_CONFIG.routing),
    trekPath: [],
    waypoints: [],
    keyframes: [],
    timeline: deepClone(STUDIO_CONFIG.timeline),
    overlays: deepClone(STUDIO_CONFIG.overlays),
    model: deepClone(STUDIO_CONFIG.model)
  };
}

// v1 -> v2 step. The legacy save format (see old project.js) was
// `{ version: 1, timestamp, config }` and predates the `routing` object and
// the `schemaVersion` field. We rename version -> schemaVersion, add a
// default routing block, and fill any other v2-required defaults absent in
// v1, all on a deep clone so the input is never mutated.
function migrateV1toV2(obj) {
  const srcConfig = isPlainObject(obj.config) ? deepClone(obj.config) : {};
  // Defaults provide the base; existing v1 values win where present.
  const config = { ...v2ConfigDefaults(), ...srcConfig };

  // Normalize routing (absent or partial in v1).
  if (!isPlainObject(config.routing)) {
    config.routing = deepClone(STUDIO_CONFIG.routing);
  } else {
    if (!ROUTING_MODES.includes(config.routing.mode)) {
      config.routing.mode = STUDIO_CONFIG.routing.mode;
    }
    if (!ROUTING_PROFILES.includes(config.routing.profile)) {
      config.routing.profile = STUDIO_CONFIG.routing.profile;
    }
  }

  return {
    schemaVersion: CURRENT_SCHEMA,
    timestamp: isString(obj.timestamp) ? obj.timestamp : '',
    config
  };
}

// Return an equivalent, deep-cloned copy of an already-current (v2) file with
// the schemaVersion field normalized. This is what makes migrateProject
// idempotent: re-migrating a v2 object yields an equivalent v2 object.
function normalizeCurrent(obj) {
  const clone = deepClone(obj);
  clone.schemaVersion = CURRENT_SCHEMA;
  if ('version' in clone) delete clone.version; // drop any legacy field
  return clone;
}

/**
 * Migrate an older supported ProjectFile up to CURRENT_SCHEMA.
 *
 * PURE: returns a new object; never mutates the input or STUDIO_CONFIG, and
 * touches no DOM. IDEMPOTENT: applying it to an already-current (v2) object
 * returns an equivalent v2 object. The result is designed to pass
 * `validateProject` (Property 21).
 *
 * Supported inputs:
 *   • v1 — `{ version: 1, timestamp?, config }` (legacy format)
 *   • v2 — `{ schemaVersion: 2, timestamp?, config }` (current)
 *
 * @param {object} obj - the parsed ProjectFile
 * @returns {object} a ProjectFile declaring CURRENT_SCHEMA
 */
export function migrateProject(obj) {
  if (!isPlainObject(obj)) {
    throw new Error('Cannot migrate: project file must be a JSON object.');
  }

  // Determine the declared version: v2 uses `schemaVersion`, v1 used `version`.
  let version;
  if (isFiniteNumber(obj.schemaVersion)) version = obj.schemaVersion;
  else if (isFiniteNumber(obj.version)) version = obj.version;
  else throw new Error('Cannot migrate: missing numeric "schemaVersion"/"version".');

  if (version === CURRENT_SCHEMA) {
    return normalizeCurrent(obj); // idempotent path
  }
  if (version < CURRENT_SCHEMA) {
    // Step-wise upgrade. Only v1 currently exists below v2.
    if (version <= 1) return migrateV1toV2(obj);
    // Defensive: any other sub-current version is unrecognized.
    throw new Error(`Cannot migrate from unrecognized schema version ${version}.`);
  }
  throw new Error(`Cannot migrate from unsupported future schema version ${version}.`);
}

// ── (de)serialization over the persisted field set ───────────
// The exact set of STUDIO_CONFIG fields that are PERSISTED in a v2
// ProjectFile.config (see design "Persisted project schema (v2)"). Anything
// NOT in this list — `_captureMode`, `currentTrackerCoords`, transient drag
// state, DOM/marker references, AudioBuffer, `mapboxToken`, `presets`,
// `schemaVersion`, `bearingMode`, `mapLayers`, and any function-valued
// fields — is runtime-only and intentionally excluded so the round-trip
// (Property 22) is well-defined over exactly these fields.
export const PERSISTED_FIELDS = [
  // map / render
  'mapStyle',
  'resolution',
  'pixelRatio',
  'fps',
  'duration',
  'pitch',
  'zoom',
  'terrainExaggeration',
  'timeOfDay',
  'fogDensity',
  'aspectRatio',
  'exportMode',
  // route
  'routing',
  'trekPath',
  'waypoints',
  // motion
  'keyframes',
  'speedCurve',
  'timeline',
  // presentation
  'overlays',
  'model'
];

// Clone a value to a guaranteed JSON-safe form. The JSON round-trip is what
// strips runtime-only baggage that may be nested inside a persisted field:
//   • function-valued properties are dropped,
//   • `undefined` properties are dropped,
//   • non-finite numbers (NaN/Infinity) become null,
//   • class instances / DOM / marker refs collapse to plain data.
// We deliberately use JSON (not structuredClone) here because structuredClone
// THROWS on functions, whereas serialization must tolerate and strip them.
function jsonSafeClone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Project an arbitrary config-shaped object down to ONLY the persisted
// fields, deep-cloned into a JSON-safe snapshot. Fields that are absent
// (`undefined`) are omitted so optional fields (e.g. `aspectRatio`,
// `speedCurve`) don't appear as `null`. PURE: reads `source`, never mutates
// it or STUDIO_CONFIG, and touches no DOM. This single projection is shared
// by `serializeProject` and `deserializeProject`, which makes them exact
// inverses over the persisted field set.
function projectPersisted(source, who) {
  if (!isPlainObject(source)) {
    throw new Error(`${who} expects a plain config object.`);
  }
  const picked = {};
  for (const key of PERSISTED_FIELDS) {
    const v = source[key];
    if (v === undefined) continue;       // omit absent optional fields
    if (typeof v === 'function') continue; // strip top-level function fields
    picked[key] = v;
  }
  // One JSON round-trip strips any nested runtime-only baggage and yields a
  // fully detached, JSON-safe deep clone.
  return jsonSafeClone(picked);
}

/**
 * Produce a JSON-safe, deep-cloned snapshot of a config containing ONLY the
 * persisted fields (Req 9.1). Runtime-only and function-valued fields are
 * stripped per the design's persisted v2 data model, so the snapshot is
 * exactly what is written to `ProjectFile.config`.
 *
 * PURE: never mutates the input or STUDIO_CONFIG and performs no DOM access.
 *
 * @param {object} config - a STUDIO_CONFIG-shaped object
 * @returns {object} JSON-safe snapshot of the persisted fields
 */
export function serializeProject(config) {
  return projectPersisted(config, 'serializeProject');
}

/**
 * Inverse of {@link serializeProject} (Req 9.6): take a persisted snapshot
 * and return a config object ready to apply (e.g. `Object.assign` into
 * STUDIO_CONFIG). It projects over the same persisted field set and
 * deep-clones, so the returned object shares no references with `snapshot`.
 *
 * Because both functions project over the identical {@link PERSISTED_FIELDS}
 * set, `deserializeProject(serializeProject(config))` is equivalent to
 * `config` over all persisted fields (excluding the informational timestamp
 * and runtime-only fields) — Property 22.
 *
 * PURE: never mutates the input or STUDIO_CONFIG and performs no DOM access.
 *
 * @param {object} snapshot - a persisted config snapshot
 * @returns {object} a config object restoring the persisted fields
 */
export function deserializeProject(snapshot) {
  return projectPersisted(snapshot, 'deserializeProject');
}

// ── Optional Studio-namespace registration ───────────────────
// Mirrors the convention used by the other new pure modules so call sites
// can migrate opportunistically (see design "Decoupling strategy"). Guarded
// so the module remains usable as a plain import in tests and in node.
if (typeof window !== 'undefined') {
  window.Studio = window.Studio || {};
  window.Studio.project = window.Studio.project || {};
  window.Studio.project.CURRENT_SCHEMA = CURRENT_SCHEMA;
  window.Studio.project.validateProject = validateProject;
  window.Studio.project.migrateProject = migrateProject;
  window.Studio.project.serializeProject = serializeProject;
  window.Studio.project.deserializeProject = deserializeProject;
}
