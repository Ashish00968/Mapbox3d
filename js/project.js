import { STUDIO_CONFIG, state } from './store.js';
import { validateProject, migrateProject, serializeProject, deserializeProject, CURRENT_SCHEMA } from './project-schema.js';

export function saveProject() {
  // We need to carefully clone the configuration to remove complex objects if any.
  // We'll stringify STUDIO_CONFIG directly.
  
  const projectData = {
    schemaVersion: CURRENT_SCHEMA,
    timestamp: new Date().toISOString(),
    config: serializeProject(STUDIO_CONFIG)
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", "mapbox_studio_project.mbv");
  dlAnchorElem.click();
  
  if (window.updateStatus) window.updateStatus('Project saved to disk');
}

export function loadProject(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let data = JSON.parse(e.target.result);
      // Migrate from older schema versions
      data = migrateProject(data);
      // Validate the migrated data
      const result = validateProject(data);
      if (!result.ok) {
        if (window.updateStatus) window.updateStatus(`Invalid project file: ${result.error}`);
        return; // State unchanged on invalid file
      }
      const loadedConfig = result.value;
      if (loadedConfig.config) {
        // Deserialize and apply only the persisted fields
        const config = deserializeProject(loadedConfig.config);
        Object.assign(STUDIO_CONFIG, config);
        
        // Re-apply the loaded configuration to the UI and state
        
        // 1. Rebuild Trek Path
        if (window.rebuildTrekPath) window.rebuildTrekPath();
        
        // 2. Render waypoints
        if (window.renderWaypointList) window.renderWaypointList();
        
        // 3. Render keyframes/timeline
        if (window.renderTimeline) window.renderTimeline();
        if (window.renderTracks) window.renderTracks();
        if (window.renderStoryboard) window.renderStoryboard();
        
        // 4. Update aspect ratio
        if (window.applyAspectRatio && STUDIO_CONFIG.aspectRatio) {
          window.applyAspectRatio(STUDIO_CONFIG.aspectRatio);
        }
        
        // 5. Sync all UI inputs
        syncUIToConfig();
        
        if (window.updateStatus) window.updateStatus('Project loaded successfully');
      } else {
        if (window.updateStatus) window.updateStatus('Invalid project file format.');
      }
    } catch (err) {
      console.error(err);
      if (window.updateStatus) window.updateStatus('Error parsing project file.');
    }
  };
  reader.readAsText(file);
}

function initProjectUI() {
  document.getElementById('save-project-btn')?.addEventListener('click', saveProject);
  
  document.getElementById('load-project-btn')?.addEventListener('click', () => {
    document.getElementById('load-project-input').click();
  });
  
  document.getElementById('load-project-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadProject(file);
    e.target.value = ''; // Reset
  });
}

export function syncUIToConfig() {
  const config = STUDIO_CONFIG;

  // 1. Sliders & Numeric Outputs
  const setSlider = (sliderId, val, valId, suffix = '') => {
    const el = document.getElementById(sliderId);
    if (el) {
      el.value = val;
      const valEl = document.getElementById(valId);
      if (valEl) valEl.textContent = val + suffix;
    }
  };

  setSlider('pitch-slider', config.pitch, 'pitch-val', '°');
  setSlider('zoom-slider', config.zoom, 'zoom-val');
  setSlider('terrain-slider', config.terrainExaggeration, 'terrain-val', '×');
  setSlider('bearing-speed-slider', config.bearingSpeed, 'bearing-speed-val', '°/s');
  setSlider('alt-offset-slider', config.altitudeOffset, 'alt-offset-val', 'm');
  setSlider('look-ahead-slider', config.lookAhead, 'look-ahead-val', ' pts');
  setSlider('smoothing-slider', config.smoothing, 'smoothing-val');
  setSlider('time-of-day-slider', config.timeOfDay, 'time-of-day-val');
  setSlider('fog-slider', config.fogDensity, 'fog-val');
  setSlider('model-scale-slider', config.model.scale, 'model-scale-val');
  
  const titleSizeVal = config.overlays?.title?.size || 48;
  setSlider('title-size-slider', titleSizeVal, 'title-size-val', 'px');

  // 2. Selects
  const setSelect = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setSelect('style-select', config.mapStyle);
  setSelect('bearing-mode-select', config.bearingMode);
  setSelect('easing-select', config.easing);
  setSelect('fps-select', config.fps);

  // 3. Text inputs
  const setTextInput = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };
  setTextInput('title-text-input', config.overlays?.title?.text);
  setTextInput('subtitle-text-input', config.overlays?.title?.subtitle);

  // 4. Checkboxes
  const setCheckbox = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };
  setCheckbox('toggle-labels', config.mapLayers?.labels);
  setCheckbox('toggle-roads', config.mapLayers?.roads);
  setCheckbox('toggle-3d-buildings', config.mapLayers?.buildings3d);
  setCheckbox('toggle-3d-model', config.model?.enabled);
  setCheckbox('toggle-title-card', config.overlays?.title?.enabled);
  setCheckbox('toggle-progress-bar', config.overlays?.progress?.enabled);
  setCheckbox('toggle-distance-counter', config.overlays?.distance?.enabled);
  setCheckbox('toggle-compass', config.overlays?.compass?.enabled);
  setCheckbox('toggle-vignette', config.overlays?.vignette?.enabled);
  setCheckbox('toggle-letterbox', config.overlays?.letterbox?.enabled);
  setCheckbox('toggle-tiltshift', config.overlays?.tiltShift?.enabled);

  // 5. Radios
  const checkRadio = (name, val) => {
    const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
    if (el) el.checked = true;
  };
  checkRadio('resolution', config.resolution);
  checkRadio('aspectRatio', config.aspectRatio || '16:9');

  // 6. Number inputs
  const setNumberInput = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  };
  setNumberInput('duration-input', config.duration);

  // 7. Visibilities depending on checkboxes
  const modelScaleRow = document.getElementById('model-scale-row');
  if (modelScaleRow) modelScaleRow.style.display = config.model?.enabled ? 'flex' : 'none';
  const modelUploadRow = document.getElementById('model-upload-row');
  if (modelUploadRow) modelUploadRow.style.display = config.model?.enabled ? 'block' : 'none';

  const titleCardSettings = document.getElementById('title-card-settings');
  if (titleCardSettings) titleCardSettings.style.display = config.overlays?.title?.enabled ? 'block' : 'none';

  const bearingSpeedRow = document.getElementById('bearing-speed-row');
  if (bearingSpeedRow) bearingSpeedRow.style.display = config.bearingMode === 'rotate' ? 'flex' : 'none';

  // 8. Custom style input visibilities
  const customStyleInput = document.getElementById('custom-style-input');
  if (customStyleInput) {
    if (config.mapStyle === 'custom') {
      customStyleInput.style.display = 'block';
      customStyleInput.value = config.customStyleUrl || '';
    } else {
      customStyleInput.style.display = 'none';
    }
  }

  // 9. Tilt-shift CSS class sync
  const overlayCanvas = document.getElementById('overlay-canvas');
  if (overlayCanvas) {
    if (config.overlays?.tiltShift?.enabled) overlayCanvas.classList.add('tilt-shift');
    else overlayCanvas.classList.remove('tilt-shift');
  }

  // 10. Update map layers & environment
  if (window.updateMapLayers) window.updateMapLayers();
  if (window.applyEnvironment) window.applyEnvironment();
  if (window.updateModelVisibility) window.updateModelVisibility();
  if (window.updateModelScale) window.updateModelScale();

  // 11. Refresh frame display
  const total = config.fps * config.duration;
  const frameOut = document.getElementById('total-frames-out');
  if (frameOut) frameOut.textContent = `${total.toLocaleString()} frames`;
  
  const fpsReadout = document.getElementById('fps-readout');
  if (fpsReadout) fpsReadout.textContent = config.fps + 'fps';
}
window.syncUIToConfig = syncUIToConfig;

document.addEventListener('DOMContentLoaded', () => {
  initProjectUI();
});
