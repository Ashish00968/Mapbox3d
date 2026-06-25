import { STUDIO_CONFIG, state } from './store.js';

// ── Data structure ──
// Each keyframe: { id, t, center: [lng, lat], pitch, zoom, bearing, terrainExag, easing }
// t ∈ [0, 1] = position along the total duration
// easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
// Keyframes are always stored sorted by t ascending.

STUDIO_CONFIG.keyframes = [];
window.keyframeIdCounter = 0;

// ── Easing functions ──
const EASINGS = {
  'linear':       t => t,
  'ease-in':      t => t * t * t,
  'ease-out':     t => 1 - Math.pow(1 - t, 3),
  'ease-in-out':  t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2,
  'cut':          t => t < 1 ? 0 : 1,
};

// ── Core interpolation: get camera values at any progress t ──
// Returns { pitch, zoom, bearing, terrainExag }
// Falls back to current slider values if < 2 keyframes exist.
function interpolateCameraAtT(t) {
  const kfs = STUDIO_CONFIG.keyframes;
  if (kfs.length === 0) {
    // No keyframe system active
    const currentCenter = state.map ? state.map.getCenter() : { lng: 0, lat: 0 };
    return { 
      center: [currentCenter.lng, currentCenter.lat],
      pitch: STUDIO_CONFIG.pitch || 60, 
      zoom: STUDIO_CONFIG.zoom || 12, 
      bearing: state.map ? state.map.getBearing() : 0, 
      terrainExag: STUDIO_CONFIG.terrainExaggeration || 1.8,
      timeOfDay: parseFloat(document.getElementById('time-of-day-slider')?.value || 12),
      fogDensity: parseFloat(document.getElementById('fog-slider')?.value || 0.2)
    };
  }
  if (kfs.length === 1) {
    return { ...kfs[0] };
  }

  // Clamp t
  const tc = Math.max(0, Math.min(t, 1));

  // Find surrounding keyframes
  let from = kfs[0];
  let to   = kfs[kfs.length - 1];
  for (let i = 0; i < kfs.length - 1; i++) {
    if (tc >= kfs[i].t && tc <= kfs[i + 1].t) {
      from = kfs[i];
      to   = kfs[i + 1];
      break;
    }
  }

  // Local progress within this segment
  const segLen = to.t - from.t;
  const segT   = segLen === 0 ? 0 : (tc - from.t) / segLen;
  const eased  = (EASINGS[from.easing] || EASINGS['ease-in-out'])(segT);

  // Lerp all properties
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Bearing lerp needs shortest-path wraparound
  function lerpBearing(a, b, t) {
    let diff = ((b - a) + 540) % 360 - 180; // shortest arc
    return (a + diff * t + 360) % 360;
  }

  // Find p0, p1, p2, p3 for Catmull-Rom Spline
  let i = kfs.indexOf(from);
  let p1 = from.center;
  let p2 = to.center;
  let p0 = i > 0 ? kfs[i-1].center : p1;
  let p3 = i < kfs.length - 2 ? kfs[i+2].center : p2;

  function catmullRom(p0, p1, p2, p3, t) {
      const v0x = (p2[0] - p0[0]) * 0.5;
      const v1x = (p3[0] - p1[0]) * 0.5;
      const t2 = t * t;
      const t3 = t * t2;
      const x = (2 * p1[0] - 2 * p2[0] + v0x + v1x) * t3 + (-3 * p1[0] + 3 * p2[0] - 2 * v0x - v1x) * t2 + v0x * t + p1[0];

      const v0y = (p2[1] - p0[1]) * 0.5;
      const v1y = (p3[1] - p1[1]) * 0.5;
      const y = (2 * p1[1] - 2 * p2[1] + v0y + v1y) * t3 + (-3 * p1[1] + 3 * p2[1] - 2 * v0y - v1y) * t2 + v0y * t + p1[1];
      
      return [x, y];
  }

  const splineCenter = catmullRom(p0, p1, p2, p3, eased);
  const linearCenter = [lerp(p1[0], p2[0], eased), lerp(p1[1], p2[1], eased)];
  
  const smoothing = STUDIO_CONFIG.smoothing !== undefined ? STUDIO_CONFIG.smoothing : 0.85;
  const finalCenter = [
    lerp(linearCenter[0], splineCenter[0], smoothing),
    lerp(linearCenter[1], splineCenter[1], smoothing)
  ];

  return {
    center:      finalCenter,
    pitch:       lerp(from.pitch,       to.pitch,       eased),
    zoom:        lerp(from.zoom,        to.zoom,        eased),
    bearing:     lerpBearing(from.bearing, to.bearing,  eased),
    terrainExag: lerp(from.terrainExag, to.terrainExag, eased),
    timeOfDay:   lerp(from.timeOfDay || 12, to.timeOfDay || 12, eased),
    fogDensity:  lerp(from.fogDensity !== undefined ? from.fogDensity : 0.2, to.fogDensity !== undefined ? to.fogDensity : 0.2, eased),
  };
}
window.interpolateCameraAtT = interpolateCameraAtT;

// ── Capture current slider/config state as a keyframe ──
function snapshotCurrentCamera() {
  const cfg = window.getCameraConfig ? window.getCameraConfig() : {};
  let currentCenter = state.map ? state.map.getCenter() : { lng: 0, lat: 0 };
  let currentZoom = state.map ? state.map.getZoom() : (STUDIO_CONFIG.zoom || 12);
  let currentPitch = state.map ? state.map.getPitch() : (STUDIO_CONFIG.pitch || 60);
  let currentBearing = state.map ? state.map.getBearing() : 0;
  
  return {
    id:          'kf-' + (window.keyframeIdCounter++),
    center:      [currentCenter.lng, currentCenter.lat],
    pitch:       currentPitch,
    zoom:        currentZoom,
    bearing:     currentBearing,
    terrainExag: parseFloat(document.getElementById('terrain-slider')?.value || cfg.terrainExag || STUDIO_CONFIG.terrainExaggeration || 1.8),
    timeOfDay:   parseFloat(document.getElementById('time-of-day-slider')?.value || STUDIO_CONFIG.timeOfDay || 12),
    fogDensity:  parseFloat(document.getElementById('fog-slider')?.value || STUDIO_CONFIG.fogDensity || 0.2),
    easing:      document.getElementById('easing-select')?.value || 'ease-in-out',
  };
}

// ── Add a keyframe at progress t ──
function addKeyframe(t) {
  const existing = STUDIO_CONFIG.keyframes.find(k => Math.abs(k.t - t) < 0.01);
  if (existing) {
    // Update existing keyframe instead of creating duplicate
    Object.assign(existing, snapshotCurrentCamera());
  } else {
    STUDIO_CONFIG.keyframes.push({ t, ...snapshotCurrentCamera() });
    STUDIO_CONFIG.keyframes.sort((a, b) => a.t - b.t);
  }
  
  if (window.renderTracks) window.renderTracks();
}
window.addKeyframe = addKeyframe;

function removeKeyframe(t) {
  STUDIO_CONFIG.keyframes = STUDIO_CONFIG.keyframes.filter(k => Math.abs(k.t - t) > 0.005);
  renderKeyframeStrip();
  hideKeyframePanel();
}

function clearAllKeyframes() {
  STUDIO_CONFIG.keyframes = [];
  renderKeyframeStrip();
  hideKeyframePanel();
}

// ── Keyframe strip UI ──
let selectedKeyframeT = null;

function renderKeyframeStrip() {
  const strip = document.getElementById('keyframe-strip');
  if (!strip) return;

  // Clear existing markers
  strip.querySelectorAll('.kf-marker').forEach(el => el.remove());

  STUDIO_CONFIG.keyframes.forEach(kf => {
    const marker = document.createElement('div');
    marker.className = 'kf-marker';
    marker.style.cssText = [
      'position: absolute',
      'top: 50%',
      'transform: translate(-50%, -50%) rotate(45deg)',
      'width: 10px',
      'height: 10px',
      `left: ${kf.t * 100}%`,
      `background: ${selectedKeyframeT === kf.t ? '#fff' : '#4a9eff'}`,
      'border: 1.5px solid #fff',
      'cursor: pointer',
      'z-index: 10',
      'transition: background 0.1s',
    ].join(';');

    marker.addEventListener('click', e => {
      e.stopPropagation();
      selectedKeyframeT = kf.t;
      renderKeyframeStrip();
      updateKeyframePanel(kf.t);
      // Jump preview to this position
      if (STUDIO_CONFIG.trekPath?.length >= 2 && window.studioAnimator) {
        if (window.studioAnimator.preparePathData) {
           window.studioAnimator.preparePathData();
        }
        window.studioAnimator.updateCamera(kf.t, 0); // instantly jump
      }
    });

    marker.addEventListener('dblclick', e => {
      e.stopPropagation();
      if (confirm('Remove this keyframe?')) removeKeyframe(kf.t);
    });

    strip.appendChild(marker);
  });
}

// ── Click on strip empty space to add keyframe ──
function initKeyframeStripClickHandler() {
  const strip = document.getElementById('keyframe-strip');
  if (!strip) return;
  strip.addEventListener('click', e => {
    if (e.target.classList.contains('kf-marker')) return;
    const rect = strip.getBoundingClientRect();
    const t    = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1));
    // Jump camera to this position first
    if (STUDIO_CONFIG.trekPath?.length >= 2 && window.studioAnimator) {
      if (window.studioAnimator.preparePathData) {
         window.studioAnimator.preparePathData();
      }
      window.studioAnimator.updateCamera(t, 0);
    }
    addKeyframe(t);
  });
}

// ── Keyframe edit panel ──
function updateKeyframePanel(t) {
  const panel = document.getElementById('keyframe-edit-panel');
  if (!panel) return;
  const kf = STUDIO_CONFIG.keyframes.find(k => Math.abs(k.t - t) < 0.005);
  if (!kf) { hideKeyframePanel(); return; }

  panel.style.display = 'block';
  panel.innerHTML = `
    <p class="section-label" style="margin-bottom:8px">
      Keyframe @ ${(kf.t * 100).toFixed(0)}%
      <button onclick="removeKeyframe(${kf.t})"
        style="float:right; background:transparent; border:none; color:#ef4444;
               cursor:pointer; font-size:11px">Remove</button>
    </p>
    ${kfSlider('Pitch',   'kf-pitch',   kf.pitch,       0,   75,  1)}
    ${kfSlider('Zoom',    'kf-zoom',    kf.zoom,        8,   16,  0.5)}
    ${kfSlider('Bearing', 'kf-bearing', kf.bearing,     0,  360,  1)}
    ${kfSlider('Terrain', 'kf-terrain', kf.terrainExag, 1,    3,  0.1)}
    ${kfSlider('Time',    'kf-timeOfDay', kf.timeOfDay || 12, 0, 24, 0.5)}
    ${kfSlider('Fog',     'kf-fogDensity', kf.fogDensity !== undefined ? kf.fogDensity : 0.2, 0, 1, 0.05)}
    <div class="control-row" style="margin-top:6px">
      <label>Easing</label>
      <select id="kf-easing" class="select-input-sm" style="width:120px">
        ${['linear','ease-in','ease-out','ease-in-out','cut']
          .map(e => `<option value="${e}" ${e===kf.easing?'selected':''}>${e}</option>`).join('')}
      </select>
    </div>
  `;

  // Wire live updates
  ['pitch','zoom','bearing','terrain','timeOfDay','fogDensity'].forEach(prop => {
    const el = document.getElementById('kf-' + prop);
    if (!el) return;
    el.addEventListener('input', () => {
      const propMap = { pitch:'pitch', zoom:'zoom', bearing:'bearing', terrain:'terrainExag', timeOfDay:'timeOfDay', fogDensity:'fogDensity' };
      kf[propMap[prop]] = parseFloat(el.value);
      const suffix = prop === 'terrain' ? 'x' : (prop === 'timeOfDay' ? 'h' : (prop === 'fogDensity' ? '' : '°'));
      el.nextElementSibling.textContent = el.value + suffix;
      // Instantly apply changes to the camera
      if (selectedKeyframeT !== null && window.studioAnimator) {
        window.studioAnimator.updateCamera(selectedKeyframeT, 0);
      }
    });
  });
  document.getElementById('kf-easing').addEventListener('change', e => {
    kf.easing = e.target.value;
  });
}

function kfSlider(label, id, value, min, max, step) {
  const suffix = label === 'Terrain' ? 'x' : (label === 'Time' ? 'h' : '°');
  return `
    <div class="slider-row">
      <span>${label}</span>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      <span class="val-out">${value}${suffix}</span>
    </div>
  `;
}

function hideKeyframePanel() {
  const panel = document.getElementById('keyframe-edit-panel');
  if (panel) panel.style.display = 'none';
  selectedKeyframeT = null;
}

// ── Wire "Add Keyframe" button ──
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-add-keyframe');
  if (btn) btn.onclick = () => {
    // Current progress
    const durationMs = STUDIO_CONFIG.duration * 1000;
    // We don't have a global progress tracker easily available here, so default to 0 if not previewing
    // However, if we scrub, animationProgress is local to animator.js.
    // Let's rely on animator.js exporting progress if needed, or default to 0.
    const t = window.studioAnimator && window.studioAnimator.getProgress ? window.studioAnimator.getProgress() : 0;
    addKeyframe(t);
  };

  const clearBtn = document.getElementById('btn-clear-keyframes');
  if (clearBtn) clearBtn.onclick = () => {
    if (confirm('Clear all keyframes?')) clearAllKeyframes();
  };

  initKeyframeStripClickHandler();
  renderKeyframeStrip();
});

window.addKeyframe    = addKeyframe;
window.removeKeyframe = removeKeyframe;
window.renderKeyframeStrip = renderKeyframeStrip;
