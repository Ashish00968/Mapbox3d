import { STUDIO_CONFIG, state } from './store.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — photo-mode.js (Phase 6)
   Single frame export, WebGL pins, Keyboard shortcuts
   ════════════════════════════════════════════════════════════ */

// 1. PHOTO MODE
const photoBtn = document.getElementById('photo-btn');

async function takePhoto() {
  const map = state.map;
  const originalRatio = window.devicePixelRatio;
  
  photoBtn.textContent = "📸 Capturing...";
  photoBtn.disabled = true;

  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: STUDIO_CONFIG.pixelRatio,
      configurable: true
    });
    map.resize();
  } catch (e) {}

  await new Promise(resolve => {
    map.once('render', resolve);
    map.triggerRepaint();
  });
  
  // Give it an extra tick to ensure GPU flush
  await new Promise(r => setTimeout(r, 100));

  const canvas = map.getCanvas();
  canvas.toBlob(blob => {
    saveAs(blob, "mapbox_studio_photo.png");
    
    // Restore
    try {
      Object.defineProperty(window, 'devicePixelRatio', {
        value: originalRatio,
        configurable: true
      });
      map.resize();
    } catch (e) {}

    photoBtn.textContent = "📸 Photo Mode";
    photoBtn.disabled = false;
  }, "image/png");
}

photoBtn.addEventListener('click', takePhoto);


// 2. LOCATION PINS
const addPinBtn = document.getElementById('add-pin-btn');
const clearPinsBtn = document.getElementById('clear-pins-btn');
const pinInput = document.getElementById('pin-text-input');

let pinsGeoJSON = {
  type: 'FeatureCollection',
  features: []
};

function initPinsLayer() {
  const map = state.map;
  if (!map.getSource('custom-pins')) {
    map.addSource('custom-pins', {
      type: 'geojson',
      data: pinsGeoJSON
    });

    map.addLayer({
      id: 'custom-pins-layer',
      type: 'symbol',
      source: 'custom-pins',
      layout: {
        'text-field': ['get', 'title'],
        'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
        'text-size': 18,
        'text-offset': [0, 0.8],
        'text-anchor': 'top'
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 2
      }
    });
    
    // Also add a little circle dot for the pin
    map.addLayer({
      id: 'custom-pins-dot',
      type: 'circle',
      source: 'custom-pins',
      paint: {
        'circle-radius': 6,
        'circle-color': '#ff4a4a',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff'
      }
    });
  }
}

// Ensure layer initializes when map styles change or loads
state.map.on('style.load', initPinsLayer);
if (state.map.isStyleLoaded()) {
  initPinsLayer();
}

addPinBtn.addEventListener('click', () => {
  const text = pinInput.value.trim();
  if (!text) {
    if (window.updateStatus) window.updateStatus('Please enter a label for the pin.');
    return;
  }
  
  const center = state.map.getCenter();
  
  pinsGeoJSON.features.push({
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [center.lng, center.lat]
    },
    properties: {
      title: text
    }
  });
  
  state.map.getSource('custom-pins').setData(pinsGeoJSON);
  pinInput.value = '';
});

clearPinsBtn.addEventListener('click', () => {
  pinsGeoJSON.features = [];
  state.map.getSource('custom-pins').setData(pinsGeoJSON);
});


// 3. KEYBOARD SHORTCUTS
document.addEventListener('keydown', (e) => {
  // Ignore if user is typing in an input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
    return;
  }
  
  switch(e.key.toLowerCase()) {
    case ' ':
      e.preventDefault(); // Prevent scrolling
      const playPauseBtn = document.getElementById('player-play-pause');
      const previewBtn = document.getElementById('preview-btn');
      
      // If player is open, toggle play/pause
      if (document.getElementById('player-overlay').style.display === 'flex') {
        playPauseBtn.click();
      } else if (!previewBtn.disabled) {
        previewBtn.click();
      }
      break;
      
    case 'c':
      const captureBtn = document.getElementById('capture-btn');
      if (!captureBtn.disabled) {
        captureBtn.click();
      }
      break;
      
    case 'p':
      if (!photoBtn.disabled) {
        photoBtn.click();
      }
      break;
      
    case 'escape':
      // Stop preview
      const stopBtn = document.getElementById('player-stop');
      if (document.getElementById('player-overlay').style.display === 'flex') {
        stopBtn.click();
      }
      
      // Cancel capture
      const cancelCaptureBtn = document.getElementById('capture-cancel-btn');
      if (document.getElementById('capture-overlay').style.display === 'flex') {
        cancelCaptureBtn.click();
      }
      break;
  }
});
