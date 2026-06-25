import { STUDIO_CONFIG, state } from './store.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — map.js (Phase 1)
   Core map init, terrain, camera sliders, global config.
   ════════════════════════════════════════════════════════════ */

// === GLOBAL CONFIG — read/written by all future phase scripts ===
Object.assign(STUDIO_CONFIG, {
  resolution: '4K',
  pixelRatio: 2,           // 1 = 1080p, 1.5 = 2K, 2 = 4K
  fps: 30,
  duration: 30,
  pitch: 60,
  zoom: 12,
  terrainExaggeration: 1.8,
  mapStyle: 'satellite-streets-v12',
  waypoints: [],           // [{id, lngLat:[lng,lat], name, elevation, triggers:[]}]
  trekPath: null,          // [lng, lat][] — populated by gpx-parser.js (Phase 2)
  // Phase 3 additions:
  bearingMode: 'follow',   // 'follow' or 'rotate'
  bearingSpeed: 10,        // degrees per second (for rotate mode)
  altitudeOffset: 500,     // height above ground in meters
  lookAhead: 5,            // points to look ahead for bearing calc
  smoothing: 0.85,         // path smoothing factor (0 = raw, 1 = max)
  easing: 'ease-in-out'    // camera progress easing
});

const PIXEL_RATIOS = { '1080p': 1, '2K': 1.5, '4K': 2 };

// ─────────────────────────────────────────────
// TOKEN — from travelglb/.env
// ─────────────────────────────────────────────
mapboxgl.accessToken = 'YOUR_MAPBOX_TOKEN';

// ─────────────────────────────────────────────
// MAP INIT
// preserveDrawingBuffer: true is NON-NEGOTIABLE.
// Without it, canvas.toDataURL() returns blank PNGs.
// Cannot be added after init.
// ─────────────────────────────────────────────
const map = new mapboxgl.Map({
  container: 'map',
  style: `mapbox://styles/mapbox/${STUDIO_CONFIG.mapStyle}`,
  center: [77.1025, 32.2432],   // Default: Himachal Pradesh
  zoom: STUDIO_CONFIG.zoom,
  pitch: STUDIO_CONFIG.pitch,
  bearing: 0,
  preserveDrawingBuffer: true,  // ⚠️ CRITICAL — frame capture depends on this
  antialias: true,
});

// Nav controls — bottom right, out of the way
map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

// Geocoder (Search Bar) — Appended to our custom floating toolbar instead of map
const geocoder = new MapboxGeocoder({
  accessToken: mapboxgl.accessToken,
  mapboxgl: mapboxgl,
  marker: false // Let the user use "Add at Center" to drop a pin
});
document.getElementById('geocoder-container').appendChild(geocoder.onAdd(map));

// When a user searches for a location, open the Context Panel so they can instantly save it
geocoder.on('result', (e) => {
  // e.result contains the feature
  // We can open the UI panel to allow them to add a waypoint there
  if (window.openWaypointPanelForCurrentLocation) {
    // We will define this helper in ui.js or just trigger the open panel logic
    // Give it a tiny delay so the camera starts moving first
    setTimeout(() => {
      window.openWaypointPanelForCurrentLocation(e.result.text);
    }, 500);
  }
});

// ─────────────────────────────────────────────
// TERRAIN + ATMOSPHERE
// ─────────────────────────────────────────────
function addTerrainAndAtmosphere() {
  // DEM source — same config as travelglb
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', {
      type: 'raster-dem',
      url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
      tileSize: 512,
      maxzoom: 14,
    });
  }

  // 3D terrain
  map.setTerrain({
    source: 'mapbox-dem',
    exaggeration: STUDIO_CONFIG.terrainExaggeration,
  });

  // Sky layer — atmospheric horizon
  if (!map.getLayer('sky')) {
    map.addLayer({
      id: 'sky',
      type: 'sky',
      paint: {
        'sky-type': 'atmosphere',
        'sky-atmosphere-sun': [0.0, 90.0],
        'sky-atmosphere-sun-intensity': 15,
      },
    });
  }

  // Fog — depth & atmosphere
  map.setFog({
    'color': 'rgb(186, 210, 235)',
    'high-color': 'rgb(36, 92, 223)',
    'horizon-blend': 0.02,
    'space-color': 'rgb(11, 11, 25)',
    'star-intensity': 0.6,
  });
}

// ─────────────────────────────────────────────
// MAP LOAD
// ─────────────────────────────────────────────

function init3DModel() {
  if (map.getSource('tracker-model')) return;

  map.addSource('tracker-model', {
    type: 'geojson',
    data: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { modelUri: STUDIO_CONFIG.model.url }
    }
  });

  map.addLayer({
    id: 'tracker-model-layer',
    type: 'model',
    source: 'tracker-model',
    layout: {
      'model-id': ['get', 'modelUri']
    },
    paint: {
      'model-scale': [STUDIO_CONFIG.model.scale, STUDIO_CONFIG.model.scale, STUDIO_CONFIG.model.scale],
      'model-rotation': [0, 0, 0],
      'model-color-mix-intensity': 0
    }
  });

  window.updateModelVisibility();
}

window.updateModelVisibility = function() {
  if (!map.getLayer('tracker-model-layer')) return;
  map.setLayoutProperty('tracker-model-layer', 'visibility', STUDIO_CONFIG.model.enabled ? 'visible' : 'none');
};

window.updateModelScale = function() {
  if (!map.getLayer('tracker-model-layer')) return;
  const s = STUDIO_CONFIG.model.scale;
  map.setPaintProperty('tracker-model-layer', 'model-scale', [s, s, s]);
};

window.updateModelUrl = function(url) {
  STUDIO_CONFIG.model.url = url;
  const source = map.getSource('tracker-model');
  if (source) {
    const coords = window.currentTrackerCoords || [0, 0];
    source.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: { modelUri: url }
    });
  }
};

window.updateTrackerPosition = function(coords, bearing = 0) {
  window.currentTrackerCoords = coords;
  const source = map.getSource('tracker-model');
  if (source) {
    source.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coords },
      properties: { modelUri: STUDIO_CONFIG.model.url }
    });
    // Set rotation on the layer
    if (map.getLayer('tracker-model-layer')) {
      // Mapbox model rotation: [x, y, z] in degrees. Z is bearing.
      map.setPaintProperty('tracker-model-layer', 'model-rotation', [0, 0, -bearing]);
    }
  }
};

map.on('load', () => {
  addTerrainAndAtmosphere();
  init3DModel();
  updateCanvasSizeDisplay();
  updateFrameCount();
  console.log('[Video Studio] Map loaded — terrain active, preserveDrawingBuffer:', map.getCanvas().getContext('webgl2')?.getContextAttributes()?.preserveDrawingBuffer ?? 'check webgl1');
});

// ─────────────────────────────────────────────
// RESOLUTION SELECTOR
// ─────────────────────────────────────────────
document.querySelectorAll('input[name="resolution"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    STUDIO_CONFIG.resolution = e.target.value;
    STUDIO_CONFIG.pixelRatio = PIXEL_RATIOS[e.target.value];
    updateCanvasSizeDisplay();
  });
});

function updateCanvasSizeDisplay() {
  const canvas = map.getCanvas();
  const ratio = STUDIO_CONFIG.pixelRatio / (window.devicePixelRatio || 1);
  const w = Math.round(canvas.width * ratio);
  const h = Math.round(canvas.height * ratio);
  const el = document.getElementById('canvas-size-out');
  if (el) el.textContent = `${w} × ${h} px`;
}

window.applyAspectRatio = function(ratioStr) {
  STUDIO_CONFIG.aspectRatio = ratioStr;
  const mapEl = document.getElementById('map');
  if (!mapEl) return;
  
  mapEl.style.position = 'absolute';
  mapEl.style.top = '50%';
  mapEl.style.left = '50%';
  mapEl.style.transform = 'translate(-50%, -50%)';
  
  if (ratioStr === '16:9') {
      mapEl.style.width = '100%';
      mapEl.style.height = '100%';
      mapEl.style.aspectRatio = 'auto';
  } else if (ratioStr === '9:16') {
      mapEl.style.width = 'auto';
      mapEl.style.height = '100%';
      mapEl.style.aspectRatio = '9/16';
  } else if (ratioStr === '1:1') {
      mapEl.style.width = 'auto';
      mapEl.style.height = '100%';
      mapEl.style.aspectRatio = '1/1';
  }
  
  setTimeout(() => {
      if (state.map) state.map.resize();
      window.updateCanvasSizeDisplay();
  }, 50);
};

document.querySelectorAll('input[name="aspectRatio"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
      window.applyAspectRatio(e.target.value);
  });
});

// Update on window resize too
window.addEventListener('resize', () => {
  updateCanvasSizeDisplay();
});

// ─────────────────────────────────────────────
// CAMERA SLIDERS — live map update on drag
// ─────────────────────────────────────────────
document.getElementById('pitch-slider').addEventListener('input', (e) => {
  STUDIO_CONFIG.pitch = Number(e.target.value);
  document.getElementById('pitch-val').textContent = `${e.target.value}°`;
  map.setPitch(STUDIO_CONFIG.pitch);
});

document.getElementById('zoom-slider').addEventListener('input', (e) => {
  STUDIO_CONFIG.zoom = Number(e.target.value);
  document.getElementById('zoom-val').textContent = e.target.value;
  map.setZoom(STUDIO_CONFIG.zoom);
});

document.getElementById('terrain-slider').addEventListener('input', (e) => {
  STUDIO_CONFIG.terrainExaggeration = Number(e.target.value);
  document.getElementById('terrain-val').textContent = `${e.target.value}×`;
  if (map.isStyleLoaded()) {
    map.setTerrain({
      source: 'mapbox-dem',
      exaggeration: STUDIO_CONFIG.terrainExaggeration,
    });
  }
});

// ─────────────────────────────────────────────
// STYLE SWITCHER
// Style change wipes all sources + layers — re-add terrain after.
// ─────────────────────────────────────────────
document.getElementById('style-select').addEventListener('change', (e) => {
  const val = e.target.value;
  const customInput = document.getElementById('custom-style-input');
  
  if (val === 'custom') {
    customInput.style.display = 'block';
    return;
  } else {
    customInput.style.display = 'none';
  }
  
  STUDIO_CONFIG.mapStyle = val;
  applyMapStyle(`mapbox://styles/mapbox/${val}`);
});

document.getElementById('custom-style-input')?.addEventListener('change', (e) => {
  if (e.target.value) applyMapStyle(e.target.value);
});

function applyMapStyle(styleUrl) {
  map.setStyle(styleUrl);
  map.once('style.load', () => {
    addTerrainAndAtmosphere();
    if (window.redrawTrekPath) window.redrawTrekPath();
    if (window.updateMapLayers) window.updateMapLayers();
  });
}

window.updateMapLayers = function() {
  if (!map.isStyleLoaded()) return;
  const style = map.getStyle();
  if (!style || !style.layers) return;
  
  const config = STUDIO_CONFIG.mapLayers;

  style.layers.forEach(layer => {
    // Labels
    if (layer.type === 'symbol') {
      map.setLayoutProperty(layer.id, 'visibility', config.labels ? 'visible' : 'none');
    }
    // Roads
    if (layer.id.includes('road') || layer.id.includes('path') || layer.id.includes('trail') || layer.id.includes('tunnel') || layer.id.includes('bridge') || layer['source-layer'] === 'road') {
      if (layer.type === 'line' || layer.type === 'symbol') {
        map.setLayoutProperty(layer.id, 'visibility', config.roads ? 'visible' : 'none');
      }
    }
  });

  // 3D Buildings
  if (config.buildings3d) {
    if (!map.getLayer('3d-buildings') && map.getSource('composite')) {
       map.addLayer({
         'id': '3d-buildings',
         'source': 'composite',
         'source-layer': 'building',
         'filter': ['==', 'extrude', 'true'],
         'type': 'fill-extrusion',
         'minzoom': 14,
         'paint': {
           'fill-extrusion-color': '#aaa',
           'fill-extrusion-height': ['get', 'height'],
           'fill-extrusion-base': ['get', 'min_height'],
           'fill-extrusion-opacity': 0.6
         }
       });
    }
  } else {
    if (map.getLayer('3d-buildings')) {
      map.removeLayer('3d-buildings');
    }
  }
};

// ─────────────────────────────────────────────
// DURATION / FPS → frame count display
// ─────────────────────────────────────────────
function updateFrameCount() {
  const fps = Number(document.getElementById('fps-select').value);
  const dur = Number(document.getElementById('duration-input').value);
  STUDIO_CONFIG.fps = fps;
  STUDIO_CONFIG.duration = dur;
  const total = fps * dur;
  const el = document.getElementById('total-frames-out');
  if (el) el.textContent = `${total.toLocaleString()} frames`;
}

document.getElementById('fps-select').addEventListener('change', updateFrameCount);
document.getElementById('duration-input').addEventListener('input', updateFrameCount);

// ─────────────────────────────────────────────
// FILE INPUT — browse button + drop zone click
// (Full GPX/KML parsing added in Phase 2)
// ─────────────────────────────────────────────
const dropZone = document.getElementById('trek-drop-zone');
const fileInput = document.getElementById('trek-file-input');

document.getElementById('browse-btn').addEventListener('click', () => {
  fileInput.click();
});

dropZone.addEventListener('click', () => {
  fileInput.click();
});

// Drag & drop visual feedback
dropZone.addEventListener('dragenter', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  // Phase 2 will handle the actual file processing
  const files = e.dataTransfer.files;
  if (files.length > 0 && window.handleTrekFile) {
    window.handleTrekFile(files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file && window.handleTrekFile) {
    window.handleTrekFile(file);
  }
});

// ─────────────────────────────────────────────
// SYNC MAP → SLIDERS
// Keep sliders in sync when user interacts with
// the map directly (drag, scroll, right-click tilt)
// ─────────────────────────────────────────────
map.on('pitchend', () => {
  const pitch = Math.round(map.getPitch());
  STUDIO_CONFIG.pitch = pitch;
  document.getElementById('pitch-slider').value = pitch;
  document.getElementById('pitch-val').textContent = `${pitch}°`;
});

map.on('zoomend', () => {
  const zoom = Math.round(map.getZoom() * 2) / 2; // snap to 0.5
  STUDIO_CONFIG.zoom = zoom;
  document.getElementById('zoom-slider').value = zoom;
  document.getElementById('zoom-val').textContent = zoom;
});

// ─────────────────────────────────────────────
// EXPORTS — future phase scripts import via window
// ─────────────────────────────────────────────
state.map = map;
window.addTerrainAndAtmosphere = addTerrainAndAtmosphere;
window.updateCanvasSizeDisplay = updateCanvasSizeDisplay;
