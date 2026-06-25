
export const STUDIO_CONFIG = {
  mapStyle: 'satellite-v9',
  zoom: 14,
  pitch: 60,
  bearingMode: 'manual',
  bearingSpeed: 1,
  altitudeOffset: 200,
  lookAhead: 0.1,
  smoothing: 0.5,
  easing: 'linear',
  terrainExaggeration: 1.5,
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
