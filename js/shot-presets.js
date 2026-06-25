import { STUDIO_CONFIG, state } from './store.js';

// ── Quick Start Templates (Phase III) ──

const SHOT_PRESETS = [
  {
    id: 'zoom-to',
    icon: '🎯',
    name: 'Zoom-To',
    desc: 'Starts high in the atmosphere and dives to the current location.'
  },
  {
    id: 'orbit',
    icon: '🔄',
    name: 'Orbit',
    desc: 'A smooth 360° circular orbit around the current location.'
  },
  {
    id: 'spiral',
    icon: '🌀',
    name: 'Spiral',
    desc: 'A descending, tightening orbit around the current location.'
  }
];

function applyPreset(presetId) {
  if (!confirm('This will clear existing keyframes. Proceed?')) return;

  STUDIO_CONFIG.keyframes = [];
  
  // Helper to add keyframe
  const addKF = (t, center, pitch, zoom, bearing) => {
    STUDIO_CONFIG.keyframes.push({
      id: 'kf-' + (window.keyframeIdCounter++),
      t, 
      center, 
      pitch, 
      zoom, 
      bearing, 
      terrainExag: STUDIO_CONFIG.terrainExaggeration || 1.8, 
      timeOfDay: STUDIO_CONFIG.timeOfDay || 12,
      easing: 'ease-in-out' 
    });
  };

  const center = state.map ? state.map.getCenter().toArray() : [0,0];
  const currentBearing = state.map ? state.map.getBearing() : 0;

  switch (presetId) {
    case 'zoom-to':
      addKF(0.0, center, 0, 4, currentBearing);
      addKF(1.0, center, 60, 15, currentBearing);
      break;

    case 'orbit':
      addKF(0.0, center, 60, 14, currentBearing);
      addKF(0.25, center, 60, 14, currentBearing + 90);
      addKF(0.5, center, 60, 14, currentBearing + 180);
      addKF(0.75, center, 60, 14, currentBearing + 270);
      addKF(1.0, center, 60, 14, currentBearing + 360);
      break;

    case 'spiral':
      addKF(0.0, center, 30, 9, currentBearing);
      addKF(0.33, center, 40, 11, currentBearing + 120);
      addKF(0.66, center, 50, 13, currentBearing + 240);
      addKF(1.0, center, 60, 15, currentBearing + 360);
      break;
  }

  // Sort global keyframes
  STUDIO_CONFIG.keyframes.sort((a, b) => a.t - b.t);

  if (window.renderTracks) window.renderTracks();
  if (window.scrubCameraToTime) window.scrubCameraToTime(0);
}

function buildShotPresetsUI() {
  const container = document.getElementById('shot-presets-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
      <span class="section-label" style="margin:0">Quick Start Templates</span>
    </div>
    <div id="presets-grid"></div>
  `;

  const grid = document.getElementById('presets-grid');

  SHOT_PRESETS.forEach(p => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.style.cssText = `
      background: rgba(255,255,255,0.03); border: 1px solid var(--border);
      border-radius: 8px; padding: 10px; cursor: pointer; transition: all 0.2s;
      margin-bottom: 8px; display: flex; align-items: center; gap: 12px;
    `;
    
    card.addEventListener('mouseover', () => {
      card.style.background = 'rgba(255,255,255,0.08)';
      card.style.borderColor = 'var(--accent-base)';
    });
    card.addEventListener('mouseout', () => {
      card.style.background = 'rgba(255,255,255,0.03)';
      card.style.borderColor = 'var(--border)';
    });
    card.addEventListener('click', () => applyPreset(p.id));

    card.innerHTML = `
      <div style="font-size: 20px;">${p.icon}</div>
      <div>
        <div style="font-size: 13px; font-weight: 500; color: #fff;">${p.name}</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">${p.desc}</div>
      </div>
    `;

    grid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  buildShotPresetsUI();
});
