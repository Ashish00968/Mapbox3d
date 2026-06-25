import { STUDIO_CONFIG, state } from './store.js';

let targetModeActive = false;
let targetMarker = null;

export function initCameraTarget() {
  const btn = document.getElementById('btn-camera-target');
  if (!btn) return;

  btn.addEventListener('click', () => {
    targetModeActive = !targetModeActive;
    if (targetModeActive) {
      btn.classList.add('active');
      btn.style.color = 'var(--accent-base)';
      state.map.getCanvas().style.cursor = 'crosshair';
      if (window.updateStatus) window.updateStatus('Click on the map to set Camera Target');
    } else {
      btn.classList.remove('active');
      btn.style.color = '';
      state.map.getCanvas().style.cursor = '';
      if (window.updateStatus) window.updateStatus('Ready');
    }
  });

  btn.addEventListener('dblclick', () => {
    // Clear target
    STUDIO_CONFIG.cameraTarget = null;
    if (targetMarker) {
      targetMarker.remove();
      targetMarker = null;
    }
    targetModeActive = false;
    btn.classList.remove('active');
    btn.style.color = '';
    state.map.getCanvas().style.cursor = '';
    if (window.updateStatus) window.updateStatus('Camera Target cleared');
  });

  // Listen to map clicks
  state.map.on('click', (e) => {
    if (!targetModeActive) return;
    
    STUDIO_CONFIG.cameraTarget = [e.lngLat.lng, e.lngLat.lat];
    
    // Draw marker
    if (targetMarker) {
      targetMarker.setLngLat(STUDIO_CONFIG.cameraTarget);
    } else {
      const el = document.createElement('div');
      el.innerHTML = '<i class="ti ti-target" style="color:#10B981; font-size:24px; filter: drop-shadow(0 0 4px rgba(0,0,0,0.8));"></i>';
      el.style.transform = 'translate(-50%, -50%)'; // center the icon
      
      // We assume mapboxgl is available globally
      targetMarker = new mapboxgl.Marker({ element: el })
        .setLngLat(STUDIO_CONFIG.cameraTarget)
        .addTo(state.map);
    }
    
    targetModeActive = false;
    btn.classList.remove('active');
    btn.style.color = '#10B981'; // indicate it's set
    state.map.getCanvas().style.cursor = '';
    if (window.updateStatus) window.updateStatus('Camera Target set! (Double-click button to clear)');
  });
}

document.addEventListener('map-ready', () => {
  initCameraTarget();
});
