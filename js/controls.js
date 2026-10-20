import { STUDIO_CONFIG, state } from './store.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — controls.js (Phase 3)
   Advanced camera settings, bearing, and interpolation modes.
   ════════════════════════════════════════════════════════════ */

// Bearing Mode Toggle
const bearingModeSelect = document.getElementById('bearing-mode-select');
const bearingSpeedRow = document.getElementById('bearing-speed-row');

bearingModeSelect.addEventListener('change', (e) => {
  STUDIO_CONFIG.bearingMode = e.target.value;
  // Show speed slider only if auto rotate is selected
  if (e.target.value === 'rotate') {
    bearingSpeedRow.style.display = 'flex';
  } else {
    bearingSpeedRow.style.display = 'none';
  }
});

// Bearing Auto-Rotate Speed
const bearingSpeedSlider = document.getElementById('bearing-speed-slider');
const bearingSpeedVal = document.getElementById('bearing-speed-val');

bearingSpeedSlider.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  STUDIO_CONFIG.bearingSpeed = val;
  bearingSpeedVal.textContent = `${val}°/s`;
});

// Altitude Offset
const altOffsetSlider = document.getElementById('alt-offset-slider');
const altOffsetVal = document.getElementById('alt-offset-val');

altOffsetSlider.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  STUDIO_CONFIG.altitudeOffset = val;
  altOffsetVal.textContent = `${val}m`;
});

// Look Ahead
const lookAheadSlider = document.getElementById('look-ahead-slider');
const lookAheadVal = document.getElementById('look-ahead-val');

lookAheadSlider.addEventListener('input', (e) => {
  const val = Number(e.target.value);
  STUDIO_CONFIG.lookAhead = val;
  lookAheadVal.textContent = `${val} pts`;
});

// Path Smoothing
const smoothingSlider = document.getElementById('smoothing-slider');
smoothingSlider?.addEventListener('input', e => {
  const val = Number(e.target.value);
  document.getElementById('smoothing-val').innerText = val;
  STUDIO_CONFIG.smoothing = val;
});

  document.getElementById('easing-select')?.addEventListener('change', e => {
    STUDIO_CONFIG.easing = e.target.value;
  });

  // Environment Controls
  function applyEnvironment() {
    const map = state.map;
    if (!map || !map.isStyleLoaded()) return;
    
    const t = STUDIO_CONFIG.timeOfDay; // 0 to 24
    let lightColor = '#ffffff';
    let fogColor = '#ffffff';
    let intensity = 1.0;

    if (t < 5 || t >= 19.5) { 
      // Night
      lightColor = '#222244'; fogColor = '#050510'; intensity = 0.1; 
    } else if (t >= 5 && t < 7) { 
      // Dawn
      lightColor = '#ffaa55'; fogColor = '#ffbb77'; intensity = 0.5; 
    } else if (t >= 7 && t < 17) { 
      // Day
      lightColor = '#ffffff'; fogColor = '#88aaff'; intensity = 1.0; 
    } else if (t >= 17 && t < 19.5) { 
      // Dusk
      lightColor = '#ff7733'; fogColor = '#ff6633'; intensity = 0.6; 
    }

    map.setFog({
      'color': fogColor,
      'high-color': '#245cdf',
      'space-color': '#000000',
      'range': [0.5, Math.max(1, 10 - (STUDIO_CONFIG.fogDensity * 10))]
    });

    map.setLight({
      anchor: 'viewport',
      color: lightColor,
      intensity: intensity
    });
  }
  window.applyEnvironment = applyEnvironment;

  document.getElementById('time-of-day-slider')?.addEventListener('input', e => {
    const val = Number(e.target.value);
    document.getElementById('time-of-day-val').innerText = val.toFixed(1);
    STUDIO_CONFIG.timeOfDay = val;
    applyEnvironment();
  });

  document.getElementById('fog-slider')?.addEventListener('input', e => {
    const val = Number(e.target.value);
    document.getElementById('fog-val').innerText = val;
    STUDIO_CONFIG.fogDensity = val;
    applyEnvironment();
  });

  // ── 3D Model Controls ──
  document.getElementById('toggle-3d-model')?.addEventListener('change', e => {
    STUDIO_CONFIG.model.enabled = e.target.checked;
    document.getElementById('model-scale-row').style.display = e.target.checked ? 'flex' : 'none';
    const uploadRow = document.getElementById('model-upload-row');
    if (uploadRow) uploadRow.style.display = e.target.checked ? 'block' : 'none';
    if (window.updateModelVisibility) window.updateModelVisibility();
  });

  document.getElementById('model-scale-slider')?.addEventListener('input', e => {
    const val = Number(e.target.value);
    document.getElementById('model-scale-val').innerText = val.toFixed(1);
    STUDIO_CONFIG.model.scale = val;
    if (window.updateModelScale) window.updateModelScale();
  });

  document.getElementById('btn-upload-model')?.addEventListener('click', () => {
    document.getElementById('custom-model-upload')?.click();
  });

  document.getElementById('custom-model-upload')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (file && window.updateModelUrl) {
      const url = URL.createObjectURL(file);
      window.updateModelUrl(url);
    }
  });

  // ── Overlay Controls ──
  document.getElementById('toggle-title-card')?.addEventListener('change', e => {
    STUDIO_CONFIG.overlays.title.enabled = e.target.checked;
    document.getElementById('title-card-settings').style.display = e.target.checked ? 'block' : 'none';
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('title-text-input')?.addEventListener('input', e => {
    STUDIO_CONFIG.overlays.title.text = e.target.value;
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('subtitle-text-input')?.addEventListener('input', e => {
    STUDIO_CONFIG.overlays.title.subtitle = e.target.value;
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('title-size-slider')?.addEventListener('input', e => {
    STUDIO_CONFIG.overlays.title.size = Number(e.target.value);
    document.getElementById('title-size-val').innerText = e.target.value + 'px';
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('toggle-progress-bar')?.addEventListener('change', e => {
    STUDIO_CONFIG.overlays.progress.enabled = e.target.checked;
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('toggle-distance-counter')?.addEventListener('change', e => {
    STUDIO_CONFIG.overlays.distance.enabled = e.target.checked;
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('toggle-compass')?.addEventListener('change', e => {
    STUDIO_CONFIG.overlays.compass.enabled = e.target.checked;
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('toggle-vignette')?.addEventListener('change', e => {
    STUDIO_CONFIG.overlays.vignette.enabled = e.target.checked;
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('toggle-letterbox')?.addEventListener('change', e => {
    STUDIO_CONFIG.overlays.letterbox.enabled = e.target.checked;
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  const lutToggle = document.getElementById('toggle-lut');
  const lutSettings = document.getElementById('lut-settings');
  lutToggle?.addEventListener('change', e => {
    STUDIO_CONFIG.overlays.lut.enabled = e.target.checked;
    if (lutSettings) lutSettings.style.display = e.target.checked ? 'block' : 'none';
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('lut-type')?.addEventListener('change', e => {
    STUDIO_CONFIG.overlays.lut.type = e.target.value;
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  document.getElementById('toggle-tiltshift')?.addEventListener('change', e => {
    STUDIO_CONFIG.overlays.tiltShift.enabled = e.target.checked;
    const canvas = document.getElementById('overlay-canvas');
    if (canvas) {
      if (e.target.checked) canvas.classList.add('tilt-shift');
      else canvas.classList.remove('tilt-shift');
    }
    if (window.compositeOverlays) window.compositeOverlays(STUDIO_CONFIG.currentProgress || 0);
  });

  // ── Map Layer Toggles ──
  document.getElementById('toggle-labels')?.addEventListener('change', e => {
    STUDIO_CONFIG.mapLayers.labels = e.target.checked;
    if (window.updateMapLayers) window.updateMapLayers();
  });
  
  document.getElementById('toggle-roads')?.addEventListener('change', e => {
    STUDIO_CONFIG.mapLayers.roads = e.target.checked;
    if (window.updateMapLayers) window.updateMapLayers();
  });
  
  document.getElementById('toggle-3d-buildings')?.addEventListener('change', e => {
    STUDIO_CONFIG.mapLayers.buildings3d = e.target.checked;
    if (window.updateMapLayers) window.updateMapLayers();
  });
