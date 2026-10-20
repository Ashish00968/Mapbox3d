
// ════════════════════════════════════════════════════════════
// Configuration_Manager — single source of truth (Req 8.1, 8.4)
// All runtime defaults, presets, the Mapbox token, and the project
// schema version live here and ONLY here. Other modules read from
// STUDIO_CONFIG / getMapboxToken() rather than redefining defaults.
// ════════════════════════════════════════════════════════════
export const STUDIO_CONFIG = {
  // ── Mapbox token (Req 8.1, 8.3) ──
  // Public-scoped (pk.*) token. A public token in client code is unavoidable
  // for a static client app; it MUST be restricted by a URL allowlist in the
  // Mapbox account. NEVER place a secret-scoped (sk.*) token in client code.
  // Can be overridden at runtime via window.MAPBOX_TOKEN or localStorage.
  mapboxToken: (typeof window !== 'undefined' && (window.MAPBOX_TOKEN || (window.localStorage && window.localStorage.getItem('mapbox_token')))) || 'YOUR_MAPBOX_TOKEN',

  // ── Project schema version (Req 9.1) ──
  schemaVersion: 2,

  // ── Centralized presets / named defaults (Req 8.4) ──
  presets: {
    // Maps a resolution label to its device-pixel-ratio.
    resolution: { '1080p': 1, '2K': 1.5, '4K': 2 },
    fps: [24, 30, 60],
    // Canonical initial map view (Himachal Pradesh).
    mapDefaults: { center: [77.1025, 32.2432], zoom: 12, pitch: 60, bearing: 0 },
    // PNG-sequence export chunk size (Req 6.3).
    pngChunkSize: 500,
    // Redundant-update suppression thresholds (Req 6.6): an update is skipped
    // when the change in the underlying value is within the threshold.
    updateThresholds: { terrain: 0.05, fog: 0.05, timeOfDay: 0.05 }
  },

  // ── Routing configuration (Req 3) ──
  routing: { mode: 'straight-line', profile: 'walking' },

  // NOTE: these top-level defaults were reconciled with the values map.js
  // previously applied via Object.assign (now removed). Those were the
  // effective runtime values, so they are kept here to preserve behavior.
  mapStyle: 'satellite-streets-v12',
  zoom: 12,
  pitch: 60,
  bearingMode: 'follow',
  bearingSpeed: 10,
  altitudeOffset: 500,
  lookAhead: 5,
  smoothing: 0.85,
  easing: 'ease-in-out',
  terrainExaggeration: 1.8,
  timeOfDay: 12.0,
  fogDensity: 0.2,
  resolution: '4K',
  pixelRatio: 2,
  fps: 30,
  duration: 30,
  exportMode: 'webcodecs',
  trekPath: [],
  waypoints: [],
  keyframes: [],
  timeline: { enabled: false },
  performanceMode: false,
  _captureMode: false,
  overlays: {
    title: { enabled: false, text: '', subtitle: '', color: '#ffffff', size: 48, position: 'bottom-left' },
    progress: { enabled: false, color: '#4a9eff', height: 4, position: 'bottom' },
    distance: { enabled: false, totalKm: 0 }
  },
  model: {
    enabled: false,
    url: 'https://docs.mapbox.com/mapbox-gl-js/assets/34M_17/34M_17.gltf', // Default airplane
    scale: 1.0
  },
  mapLayers: {
    labels: true,
    roads: true,
    buildings3d: false
  }
};

export const state = {
  map: null,
  isCapturing: false,
  isPlaying: false,
  waypointMarkers: {},
  animator: null
};

export function getMap() { return state.map; }
export function setMap(m) { state.map = m; }

// Returns the centralized public-scoped Mapbox token (Req 8.1).
// All subsystems should read the token through this accessor.
export function getMapboxToken() { return STUDIO_CONFIG.mapboxToken; }
