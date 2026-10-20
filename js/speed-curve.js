import { STUDIO_CONFIG, state } from './store.js';
import { Studio, registerLegacyAlias } from './event-bus.js';

// ── Speed curve: remaps linear t → cinematic t ──
// Uses a cubic bezier defined by 4 control points.
// P0 = (0,0) and P3 = (1,1) are fixed.
// P1 and P2 are user-draggable.

STUDIO_CONFIG.speedCurve = {
  enabled: false,
  // Control points as fractions [0,1]
  // Default: linear (P1 and P2 on the diagonal)
  p1: { x: 0.33, y: 0.33 },
  p2: { x: 0.67, y: 0.67 },
};

// ── Cubic bezier evaluation ──
// Solves for the y value at a given x using Newton-Raphson.
// This is the same algorithm used by CSS cubic-bezier().
function solveCubicBezier(x, p1x, p1y, p2x, p2y) {
  // Calculate t from x (Newton-Raphson, 8 iterations)
  let t = x;
  for (let i = 0; i < 8; i++) {
    const bx = 3*(1-t)*(1-t)*t*p1x + 3*(1-t)*t*t*p2x + t*t*t - x;
    const bx1 = 3*(1-t)*(1-t)*p1x + 6*(1-t)*t*(p2x-p1x) + 3*t*t*(1-p2x);
    if (Math.abs(bx1) < 1e-8) break;
    t -= bx / bx1;
  }
  t = Math.max(0, Math.min(1, t));
  // Calculate y from t
  return 3*(1-t)*(1-t)*t*p1y + 3*(1-t)*t*t*p2y + t*t*t;
}

// ── Monotone remap lookup table (Property 9: speed-curve validity) ──
//
// A raw cubic-bezier y(x) can dip below earlier values for control points in
// the unit square (e.g. the "dramatic"/"slow-mid" presets), which would make
// the camera briefly travel backwards. remapT must instead satisfy, for ANY
// P1/P2 in the unit square: remapT(0)=0, remapT(1)=1, output clamped to [0,1],
// and monotonically non-decreasing across [0,1].
//
// We guarantee this purely by sampling the raw curve on a fixed grid, clamping
// each sample to [0,1], and taking the running (prefix) maximum. A prefix-max
// table is non-decreasing by construction, so linearly interpolating between
// adjacent entries yields a monotone non-decreasing mapping with exact
// endpoints. The table is cached and rebuilt only when the control points
// change, keeping remapT cheap on the per-frame hot path while staying a pure
// function of (control points, input).
const LUT_SAMPLES = 256;
let _lut = null;   // Float64Array(LUT_SAMPLES + 1) of prefix-max y values
let _lutKey = '';

function buildMonotoneLUT(p1x, p1y, p2x, p2y) {
  const lut = new Float64Array(LUT_SAMPLES + 1);
  let run = 0; // running maximum → enforces non-decreasing output
  for (let i = 0; i <= LUT_SAMPLES; i++) {
    let y = solveCubicBezier(i / LUT_SAMPLES, p1x, p1y, p2x, p2y);
    if (y < 0) y = 0; else if (y > 1) y = 1; // clamp output to [0,1]
    if (y > run) run = y;
    lut[i] = run;
  }
  // Pin endpoints exactly (guards against float drift in the solve).
  lut[0] = 0;
  lut[LUT_SAMPLES] = 1;
  return lut;
}

// ── Remap linear t → curved t ──
// Pure and importable (consumed by the Property 9 test, task 4.10).
export function remapT(linearT) {
  const sc = STUDIO_CONFIG.speedCurve;
  if (!sc.enabled) return linearT;

  // Clamp the input domain and pin the endpoints exactly.
  const x = linearT <= 0 ? 0 : (linearT >= 1 ? 1 : linearT);
  if (x === 0) return 0;
  if (x === 1) return 1;

  // (Re)build the monotone lookup table when the curve changes.
  const key = sc.p1.x + ',' + sc.p1.y + ',' + sc.p2.x + ',' + sc.p2.y;
  if (_lut === null || key !== _lutKey) {
    _lut = buildMonotoneLUT(sc.p1.x, sc.p1.y, sc.p2.x, sc.p2.y);
    _lutKey = key;
  }

  // Linear interpolation between adjacent prefix-max samples. Both endpoints of
  // the segment are non-decreasing, so the interpolated result is monotone.
  const pos = x * LUT_SAMPLES;
  const i = Math.floor(pos);
  const frac = pos - i;
  const y = _lut[i] + (_lut[i + 1] - _lut[i]) * frac;
  return y < 0 ? 0 : (y > 1 ? 1 : y);
}

// Canonical home under the Studio namespace; the legacy `window.remapT` global
// (used by animator.js / capture.js / waypoint-triggers.js) is kept working via
// a thin @deprecated forwarder registered AFTER the namespace assignment.
Studio.speed.remapT = remapT;
registerLegacyAlias('remapT', 'speed.remapT');

// ── SVG Speed Curve Editor ──
const CURVE_W = 160;
const CURVE_H = 120;
let dragging  = null; // 'p1' | 'p2' | null

function buildCurveEditor() {
  const container = document.getElementById('speed-curve-container');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px">
      <p class="section-label" style="margin:0">Speed Curve</p>
      <label style="display:flex; align-items:center; gap:6px; font-size:11px;
                    color:var(--text-secondary); cursor:pointer">
        <input type="checkbox" id="speed-curve-enabled"> Enable
      </label>
    </div>
    <svg id="speed-curve-svg" viewBox="0 0 ${CURVE_W} ${CURVE_H}"
      width="${CURVE_W}" height="${CURVE_H}"
      style="background:var(--bg-panel-section); border:1px solid var(--border); border-radius:6px;
             cursor:crosshair; display:block; margin:0 auto; overflow:visible;">

      <!-- Grid lines -->
      <line x1="${CURVE_W*0.33}" y1="0" x2="${CURVE_W*0.33}" y2="${CURVE_H}"
            stroke="var(--border)" stroke-width="0.5"/>
      <line x1="${CURVE_W*0.67}" y1="0" x2="${CURVE_W*0.67}" y2="${CURVE_H}"
            stroke="var(--border)" stroke-width="0.5"/>
      <line x1="0" y1="${CURVE_H*0.33}" x2="${CURVE_W}" y2="${CURVE_H*0.33}"
            stroke="var(--border)" stroke-width="0.5"/>
      <line x1="0" y1="${CURVE_H*0.67}" x2="${CURVE_W}" y2="${CURVE_H*0.67}"
            stroke="var(--border)" stroke-width="0.5"/>

      <!-- Diagonal reference (linear) -->
      <line id="scv-diag" x1="0" y1="${CURVE_H}" x2="${CURVE_W}" y2="0"
            stroke="var(--text-secondary)" stroke-width="1" stroke-dasharray="3,3"/>

      <!-- Control point arms -->
      <line id="scv-arm1" stroke="var(--accent)" stroke-width="1.5" opacity="0.6"/>
      <line id="scv-arm2" stroke="var(--accent)" stroke-width="1.5" opacity="0.6"/>

      <!-- Bezier curve -->
      <path id="scv-path" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>

      <!-- Control point handles -->
      <circle id="scv-p1" r="6" fill="var(--accent)" stroke="var(--bg-panel)" stroke-width="2"
              cursor="grab" style="transition: r 0.2s;"/>
      <circle id="scv-p2" r="6" fill="var(--accent)" stroke="var(--bg-panel)" stroke-width="2"
              cursor="grab" style="transition: r 0.2s;"/>
    </svg>
    <div style="display:flex; gap:4px; margin-top:8px">
      <button class="btn-ghost" style="flex:1; font-size:10px; padding:4px"
        onclick="setCurvePreset('linear')">Linear</button>
      <button class="btn-ghost" style="flex:1; font-size:10px; padding:4px"
        onclick="setCurvePreset('ease')">Ease</button>
      <button class="btn-ghost" style="flex:1; font-size:10px; padding:4px"
        onclick="setCurvePreset('slow-mid')">Slow Mid</button>
      <button class="btn-ghost" style="flex:1; font-size:10px; padding:4px"
        onclick="setCurvePreset('dramatic')">Dramatic</button>
    </div>
  `;

  document.getElementById('speed-curve-enabled').addEventListener('change', e => {
    STUDIO_CONFIG.speedCurve.enabled = e.target.checked;
    updateCurveSVG();
  });

  // Mouse drag on SVG control points
  const svg = document.getElementById('speed-curve-svg');
  svg.addEventListener('mousedown', e => {
    const p1el = document.getElementById('scv-p1');
    const p2el = document.getElementById('scv-p2');
    const r1   = p1el.getBoundingClientRect();
    const r2   = p2el.getBoundingClientRect();
    const near = (rect) => Math.hypot(e.clientX - rect.left - 6, e.clientY - rect.top - 6) < 14;
    
    if (near(r1)) {
        dragging = 'p1';
        p1el.setAttribute('r', '8');
    } else if (near(r2)) {
        dragging = 'p2';
        p2el.setAttribute('r', '8');
    }
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = document.getElementById('speed-curve-svg').getBoundingClientRect();
    const x = Math.max(0, Math.min((e.clientX - rect.left) / rect.width,  1));
    const y = Math.max(0, Math.min((e.clientY - rect.top)  / rect.height, 1));
    // SVG y is inverted: top = fast, bottom = slow
    STUDIO_CONFIG.speedCurve[dragging] = { x, y: 1 - y };
    updateCurveSVG();
  });

  document.addEventListener('mouseup', () => { 
    if (dragging) {
        document.getElementById('scv-' + dragging).setAttribute('r', '6');
    }
    dragging = null; 
  });

  updateCurveSVG();
}

function updateCurveSVG() {
  const sc = STUDIO_CONFIG.speedCurve;
  const W  = CURVE_W;
  const H  = CURVE_H;

  // Convert [0,1] to SVG coords (y is inverted)
  const toSVG = (pt) => ({ x: pt.x * W, y: (1 - pt.y) * H });
  const p0 = { x: 0,   y: H };  // fixed
  const p1 = toSVG(sc.p1);
  const p2 = toSVG(sc.p2);
  const p3 = { x: W,   y: 0 };  // fixed

  // Update path
  document.getElementById('scv-path').setAttribute('d',
    `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`);

  // Update arms
  document.getElementById('scv-arm1').setAttribute('x1', p0.x);
  document.getElementById('scv-arm1').setAttribute('y1', p0.y);
  document.getElementById('scv-arm1').setAttribute('x2', p1.x);
  document.getElementById('scv-arm1').setAttribute('y2', p1.y);

  document.getElementById('scv-arm2').setAttribute('x1', p3.x);
  document.getElementById('scv-arm2').setAttribute('y1', p3.y);
  document.getElementById('scv-arm2').setAttribute('x2', p2.x);
  document.getElementById('scv-arm2').setAttribute('y2', p2.y);

  // Update handles
  document.getElementById('scv-p1').setAttribute('cx', p1.x);
  document.getElementById('scv-p1').setAttribute('cy', p1.y);
  document.getElementById('scv-p2').setAttribute('cx', p2.x);
  document.getElementById('scv-p2').setAttribute('cy', p2.y);

  // Dim curve when disabled
  document.getElementById('speed-curve-svg').style.opacity =
    STUDIO_CONFIG.speedCurve.enabled ? '1' : '0.4';
}

// ── Curve presets ──
function setCurvePreset(name) {
  const presets = {
    'linear':   { p1: {x:0.33, y:0.33}, p2: {x:0.67, y:0.67} },
    'ease':     { p1: {x:0.25, y:0.1},  p2: {x:0.25, y:1.0} },
    'slow-mid': { p1: {x:0.1,  y:0.5},  p2: {x:0.9,  y:0.5} },  // very slow in middle
    'dramatic': { p1: {x:0.0,  y:0.8},  p2: {x:0.0,  y:1.0} },  // rush then slam
  };
  const p = presets[name];
  if (!p) return;
  STUDIO_CONFIG.speedCurve.p1 = p.p1;
  STUDIO_CONFIG.speedCurve.p2 = p.p2;
  updateCurveSVG();
}
window.setCurvePreset = setCurvePreset;

document.addEventListener('DOMContentLoaded', () => buildCurveEditor());
