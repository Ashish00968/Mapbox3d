import { STUDIO_CONFIG, state } from './store.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — presets.js (Phase 6)
   Save and load camera presets per trek
   ════════════════════════════════════════════════════════════ */

const presetSelect = document.getElementById('preset-select');
const savePresetBtn = document.getElementById('save-preset-btn');
const loadPresetBtn = document.getElementById('load-preset-btn');

const STORAGE_KEY = 'video-studio-presets';

function getPresets() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : {};
}

function savePresets(presets) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function updatePresetDropdown() {
  const presets = getPresets();
  
  // Keep the first default option
  presetSelect.innerHTML = '<option value="">-- Saved Presets --</option>';
  
  for (const name of Object.keys(presets)) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    presetSelect.appendChild(opt);
  }
}

savePresetBtn.addEventListener('click', () => {
  const name = prompt("Enter a name for this preset (e.g., 'Patalsu Peak'):");
  if (!name) return;
  
  const map = state.map;
  const config = STUDIO_CONFIG;
  const center = map.getCenter();
  
  const presetData = {
    name: name,
    timestamp: Date.now(),
    camera: {
      lng: center.lng,
      lat: center.lat,
      pitch: map.getPitch(),
      zoom: map.getZoom(),
      bearing: map.getBearing()
    },
    config: {
      resolution: config.resolution,
      fps: config.fps,
      duration: config.duration,
      terrainExaggeration: config.terrainExaggeration,
      mapStyle: config.mapStyle,
      bearingMode: config.bearingMode,
      bearingSpeed: config.bearingSpeed,
      altitudeOffset: config.altitudeOffset,
      lookAhead: config.lookAhead,
      smoothing: config.smoothing,
      easing: config.easing
    }
  };
  
  const presets = getPresets();
  presets[name] = presetData;
  savePresets(presets);
  
  updatePresetDropdown();
  presetSelect.value = name;
  alert(`Preset "${name}" saved!`);
});

loadPresetBtn.addEventListener('click', () => {
  const name = presetSelect.value;
  if (!name) {
    alert("Please select a preset to load.");
    return;
  }
  
  const presets = getPresets();
  const preset = presets[name];
  
  if (!preset) return;
  
  // 1. Restore Map Camera
  state.map.flyTo({
    center: [preset.camera.lng, preset.camera.lat],
    pitch: preset.camera.pitch,
    zoom: preset.camera.zoom,
    bearing: preset.camera.bearing,
    duration: 2000,
    essential: true
  });
  
  // 2. Restore Global Config
  Object.assign(STUDIO_CONFIG, preset.config);
  
  // 3. Update Sliders UI
  const setVal = (id, val, textId, textVal) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
    if (textId) {
      const textEl = document.getElementById(textId);
      if (textEl) textEl.textContent = textVal;
    }
  };
  
  setVal('pitch-slider', preset.camera.pitch, 'pitch-val', `${Math.round(preset.camera.pitch)}°`);
  setVal('zoom-slider', preset.camera.zoom, 'zoom-val', preset.camera.zoom.toFixed(1));
  setVal('terrain-slider', preset.config.terrainExaggeration, 'terrain-val', `${preset.config.terrainExaggeration}x`);
  setVal('alt-offset-slider', preset.config.altitudeOffset, 'alt-offset-val', `${preset.config.altitudeOffset}m`);
  setVal('look-ahead-slider', preset.config.lookAhead, 'look-ahead-val', `${preset.config.lookAhead} pts`);
  setVal('smoothing-slider', preset.config.smoothing, 'smoothing-val', preset.config.smoothing);
  
  setVal('bearing-speed-slider', preset.config.bearingSpeed, 'bearing-speed-val', `${preset.config.bearingSpeed}°/s`);
  setVal('duration-input', preset.config.duration);
  
  const radio = document.querySelector(`input[name="resolution"][value="${preset.config.resolution}"]`);
  if (radio) radio.checked = true;
  
  const setSelect = (id, val) => {
    const sel = document.getElementById(id);
    if (sel) sel.value = val;
  };
  setSelect('style-select', preset.config.mapStyle);
  setSelect('fps-select', preset.config.fps);
  setSelect('bearing-mode-select', preset.config.bearingMode);
  setSelect('easing-select', preset.config.easing);
});

// Init
updatePresetDropdown();
