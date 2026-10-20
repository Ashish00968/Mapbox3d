import { STUDIO_CONFIG, state } from './store.js';
import { bearingDelta } from './geo.js';

// ── Data structure ──
// Each keyframe: { id, t, center: [lng, lat], pitch, zoom, bearing, terrainExag, easing }
// t ∈ [0, 1] = position along the total duration
// easing: 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
// Keyframes are always stored sorted by t ascending.

STUDIO_CONFIG.keyframes = [];
window.keyframeIdCounter = 0;

// Default keyframe easing. `ease-in-out` has a zero derivative at both t=0 and
// t=1, so camera velocity meets at zero on both sides of every keyframe
// boundary — guaranteeing no instantaneous velocity jump (Req 2.2, Property 6).
export const DEFAULT_EASING = 'ease-in-out';

// ── Easing functions ──
// Each easing maps segment progress [0,1] -> eased progress [0,1] with
// f(0)=0 and f(1)=1. `ease-in-out` additionally has f'(0)=f'(1)=0 (cubic
// smoothstep-style), which zeroes boundary velocity for Req 2.2.
export const EASINGS = {
  'linear':       t => t,
  'ease-in':      t => t * t * t,                                  // f'(0)=0, f'(1)=3
  'ease-out':     t => 1 - Math.pow(1 - t, 3),                     // f'(0)=3, f'(1)=0
  'ease-in-out':  t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2, // f'(0)=f'(1)=0
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

  // Local progress within this segment, clamped to [0,1] so endpoints land
  // exactly on segT=0 (from) and segT=1 (to).
  const segLen = to.t - from.t;
  let segT     = segLen === 0 ? 0 : (tc - from.t) / segLen;
  segT = segT <= 0 ? 0 : segT >= 1 ? 1 : segT;
  const eased  = (EASINGS[from.easing] || EASINGS[DEFAULT_EASING])(segT);

  // Lerp all properties
  function lerp(a, b, t) { return a + (b - a) * t; }

  // Bearing lerp needs shortest-path wraparound (delegates to geo.js so the
  // shortest-arc contract lives in one place; Req 2.3, Property 7).
  function lerpBearing(a, b, t) {
    return (a + bearingDelta(a, b) * t + 360) % 360;
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

  function catmullRom1D(p0, p1, p2, p3, t) {
      const v0 = (p2 - p0) * 0.5;
      const v1 = (p3 - p1) * 0.5;
      const t2 = t * t;
      const t3 = t * t2;
      return (2 * p1 - 2 * p2 + v0 + v1) * t3 + (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 + v0 * t + p1;
  }

  const splineCenter = catmullRom(p0, p1, p2, p3, eased);
  const linearCenter = [lerp(p1[0], p2[0], eased), lerp(p1[1], p2[1], eased)];

  const smoothing = STUDIO_CONFIG.smoothing !== undefined ? STUDIO_CONFIG.smoothing : 0.85;
  // C0 position continuity (Req 2.1, Property 5): pin BOTH endpoints of every
  // segment exactly to the surrounding keyframe centers, regardless of the
  // `smoothing` blend factor. Because adjacent segments share a keyframe, the
  // right endpoint of segment [i-1,i] (p2 = kfs[i].center) equals the left
  // endpoint of segment [i,i+1] (p1 = kfs[i].center), so the sampled path has
  // no positional discontinuity at any boundary for any smoothing value.
  let finalCenter;
  if (eased <= 0) {
    finalCenter = [p1[0], p1[1]];
  } else if (eased >= 1) {
    finalCenter = [p2[0], p2[1]];
  } else {
    finalCenter = [
      lerp(linearCenter[0], splineCenter[0], smoothing),
      lerp(linearCenter[1], splineCenter[1], smoothing)
    ];
  }

  // Pitch
  let pitch1 = from.pitch, pitch2 = to.pitch;
  let pitch0 = i > 0 ? kfs[i-1].pitch : pitch1;
  let pitch3 = i < kfs.length - 2 ? kfs[i+2].pitch : pitch2;
  const splinePitch = catmullRom1D(pitch0, pitch1, pitch2, pitch3, eased);
  const finalPitch = lerp(lerp(pitch1, pitch2, eased), splinePitch, smoothing);

  // Zoom
  let zoom1 = from.zoom, zoom2 = to.zoom;
  let zoom0 = i > 0 ? kfs[i-1].zoom : zoom1;
  let zoom3 = i < kfs.length - 2 ? kfs[i+2].zoom : zoom2;
  const splineZoom = catmullRom1D(zoom0, zoom1, zoom2, zoom3, eased);
  const finalZoom = lerp(lerp(zoom1, zoom2, eased), splineZoom, smoothing);

  // Bearing — unwrap neighbour bearings onto the shortest arc from b1 so the
  // spline never takes a >180° reversal between consecutive samples (Req 2.3,
  // Property 7). All deltas go through geo.js bearingDelta.
  let b1 = from.bearing;
  let b2 = b1 + bearingDelta(b1, to.bearing);
  let b0 = i > 0 ? b1 + bearingDelta(b1, kfs[i-1].bearing) : b1;
  let b3 = i < kfs.length - 2 ? b2 + bearingDelta(b2, kfs[i+2].bearing) : b2;
  const splineBearing = catmullRom1D(b0, b1, b2, b3, eased);
  const finalBearing = (lerp(lerp(b1, b2, eased), splineBearing, smoothing) % 360 + 360) % 360;

  return {
    center:      finalCenter,
    pitch:       finalPitch,
    zoom:        finalZoom,
    bearing:     finalBearing,
    terrainExag: lerp(from.terrainExag, to.terrainExag, eased),
    timeOfDay:   lerp(from.timeOfDay || 12, to.timeOfDay || 12, eased),
    fogDensity:  lerp(from.fogDensity !== undefined ? from.fogDensity : 0.2, to.fogDensity !== undefined ? to.fogDensity : 0.2, eased),
  };
}
window.interpolateCameraAtT = interpolateCameraAtT;
// ES module export so pure consumers (camera-sampler.js, property tests) can
// import the sampler directly without relying on the window bridge.
export { interpolateCameraAtT };

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
    easing:      document.getElementById('easing-select')?.value || DEFAULT_EASING,
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
  updateKeyframePanel(t);
}
window.addKeyframe = addKeyframe;

function removeKeyframe(t) {
  STUDIO_CONFIG.keyframes = STUDIO_CONFIG.keyframes.filter(k => Math.abs(k.t - t) > 0.005);
  if (window.renderTracks) window.renderTracks();
  selectedKeyframeT = null;
}
window.removeKeyframe = removeKeyframe;

function clearAllKeyframes() {
  STUDIO_CONFIG.keyframes = [];
  if (window.renderTracks) window.renderTracks();
  selectedKeyframeT = null;
}
window.clearAllKeyframes = clearAllKeyframes;

// ── Keyframe strip UI ──
let selectedKeyframeT = null;

// ── Keyframe edit panel ──
function updateKeyframePanel(t) {
  const kf = STUDIO_CONFIG.keyframes.find(k => Math.abs(k.t - t) < 0.005);
  if (!kf) { window.closeContextPanel(); return; }

  selectedKeyframeT = kf.t;

  const htmlContent = `
    <div class="kf-edit">
      <p class="kf-edit__time">
        Time position: ${(kf.t * STUDIO_CONFIG.duration).toFixed(1)}s (${(kf.t * 100).toFixed(0)}%)
      </p>
      <div class="kf-edit__fields">
        ${kfSlider('Pitch',   'kf-pitch',   kf.pitch,       0,   75,  1)}
        ${kfSlider('Zoom',    'kf-zoom',    kf.zoom,        8,   16,  0.5)}
        ${kfSlider('Bearing', 'kf-bearing', kf.bearing,     0,  360,  1)}
        ${kfSlider('Terrain', 'kf-terrain', kf.terrainExag, 1,    3,  0.1)}
        ${kfSlider('Time',    'kf-timeOfDay', kf.timeOfDay || 12, 0, 24, 0.5)}
        ${kfSlider('Fog',     'kf-fogDensity', kf.fogDensity !== undefined ? kf.fogDensity : 0.2, 0, 1, 0.05)}

        <div class="kf-edit__easing">
          <label>Easing</label>
          <select id="kf-easing" class="select-input-sm kf-edit__easing-select">
            ${['linear','ease-in','ease-out','ease-in-out','cut']
              .map(e => `<option value="${e}" ${e===kf.easing?'selected':''}>${e}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="kf-edit__actions">
        <button onclick="window.removeKeyframe(${kf.t}); window.closeContextPanel();"
          class="btn-danger">
          Delete
        </button>
        <button onclick="window.closeContextPanel()"
          class="btn-accent">
          Close
        </button>
      </div>
    </div>
  `;

  window.openContextPanel(`Edit Keyframe`, htmlContent);

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
window.updateKeyframePanel = updateKeyframePanel;

function kfSlider(label, id, value, min, max, step) {
  const suffix = label === 'Terrain' ? 'x' : (label === 'Time' ? 'h' : '°');
  return `
    <div class="slider-row">
      <span class="slider-label">${label}</span>
      <input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}">
      <span class="val-out slider-label">${value}${suffix}</span>
    </div>
  `;
}

// ── Wire "Add Keyframe" button ──
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-add-keyframe');
  if (btn) btn.onclick = () => {
    // Current progress
    const t = window.studioAnimator && window.studioAnimator.getProgress ? window.studioAnimator.getProgress() : 0;
    addKeyframe(t);
  };

  const clearBtn = document.getElementById('btn-clear-keyframes');
  if (clearBtn) clearBtn.onclick = () => {
    if (confirm('Clear all keyframes?')) clearAllKeyframes();
  };
});
