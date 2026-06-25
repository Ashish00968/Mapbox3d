import { STUDIO_CONFIG, state } from './store.js';

// ── Orbit popup state ──
let orbitPopupOpen = false;
let orbitPreviewRaf = null;

const DEFAULT_ORBIT = { degrees: 360, direction: 'cw', duration: 15 };
let orbitConfig = { ...DEFAULT_ORBIT };

// ── Open/close orbit popup ──
function openOrbitPopup() {
  closeOrbitPopup();
  orbitPopupOpen = true;

  const popup = document.createElement('div');
  popup.id = 'orbit-popup';
  popup.style.cssText = [
    'position: absolute',
    'top: 56px',
    'left: 50%',
    'transform: translateX(-50%)',
    'width: 240px',
    'background: rgba(15,15,15,0.95)',
    'backdrop-filter: blur(12px)',
    '-webkit-backdrop-filter: blur(12px)',
    'border: 0.5px solid rgba(255,255,255,0.12)',
    'border-radius: 10px',
    'padding: 14px',
    'z-index: 50',
    'box-shadow: 0 10px 40px rgba(0,0,0,0.5)',
  ].join(';');

  popup.innerHTML = `
    <p style="font-size:11px; font-weight:500; color:var(--text-primary); margin-bottom:10px">
      <i class="ti ti-rotate-clockwise" style="margin-right:5px" aria-hidden="true"></i>
      Orbit shot
    </p>

    <div class="control-row" style="margin-bottom:8px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-secondary);">
      <label>Degrees</label>
      <div style="display:flex; gap:4px">
        ${[90,180,270,360].map(d => `
          <button class="deg-btn${orbitConfig.degrees===d?' active':''}"
            onclick="setOrbitDeg(${d})"
            style="padding:3px 7px; font-size:11px; border-radius:4px; cursor:pointer;
                   background:${orbitConfig.degrees===d?'var(--accent-base)':'var(--bg-panel-section)'};
                   border:0.5px solid ${orbitConfig.degrees===d?'var(--accent-base)':'var(--border)'};
                   color:${orbitConfig.degrees===d?'#fff':'var(--text-muted)'}">${d}°</button>
        `).join('')}
      </div>
    </div>

    <div class="control-row" style="margin-bottom:8px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-secondary);">
      <label>Direction</label>
      <div style="display:flex; gap:4px">
        <button id="dir-cw" onclick="setOrbitDir('cw')"
          style="flex:1; padding:4px 8px; font-size:11px; border-radius:4px; cursor:pointer;
                 background:${orbitConfig.direction==='cw'?'var(--accent-base)':'var(--bg-panel-section)'};
                 border:0.5px solid ${orbitConfig.direction==='cw'?'var(--accent-base)':'var(--border)'};
                 color:${orbitConfig.direction==='cw'?'#fff':'var(--text-muted)'}">
          ↻ CW</button>
        <button id="dir-ccw" onclick="setOrbitDir('ccw')"
          style="flex:1; padding:4px 8px; font-size:11px; border-radius:4px; cursor:pointer;
                 background:${orbitConfig.direction==='ccw'?'var(--accent-base)':'var(--bg-panel-section)'};
                 border:0.5px solid ${orbitConfig.direction==='ccw'?'var(--accent-base)':'var(--border)'};
                 color:${orbitConfig.direction==='ccw'?'#fff':'var(--text-muted)'}">
          ↺ CCW</button>
      </div>
    </div>

    <div class="control-row" style="margin-bottom:12px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: var(--text-secondary);">
      <label>Duration</label>
      <span id="orbit-dur-val" style="font-family: 'JetBrains Mono', monospace; font-size: 11px; background: var(--bg-panel-section); padding: 2px 6px; border-radius: 4px; color: var(--text-primary);">${orbitConfig.duration}s</span>
    </div>
    <input type="range" id="orbit-dur" min="3" max="60" value="${orbitConfig.duration}"
      style="width:100%; margin-bottom:12px">

    <div style="display:flex; gap:6px">
      <button onclick="previewOrbit()"
        style="flex:1; padding:7px; background:transparent; border:1px solid var(--border);
               color:var(--text-primary); border-radius:6px; cursor:pointer; font-size:12px; transition: transform 160ms var(--ease-out);">
        ▶ Preview
      </button>
      <button onclick="addOrbitToTimeline()"
        style="flex:1; padding:7px; background:var(--accent-green-base); border:none;
               color:#fff; border-radius:6px; cursor:pointer; font-size:12px; transition: transform 160ms var(--ease-out);">
        + Add
      </button>
    </div>
    <button onclick="closeOrbitPopup()"
      style="width:100%; margin-top:6px; padding:5px; background:transparent;
             border:none; color:var(--text-muted); cursor:pointer; font-size:11px; transition: color 160ms var(--ease-out);">
      Cancel
    </button>
  `;

  document.getElementById('map-container').appendChild(popup);

  // Wire duration slider
  document.getElementById('orbit-dur').addEventListener('input', e => {
    orbitConfig.duration = parseInt(e.target.value);
    document.getElementById('orbit-dur-val').textContent = orbitConfig.duration + 's';
  });
}

function closeOrbitPopup() {
  const el = document.getElementById('orbit-popup');
  if (el) el.remove();
  stopOrbitPreview();
  orbitPopupOpen = false;
}
window.closeOrbitPopup = closeOrbitPopup;

function setOrbitDeg(d) {
  orbitConfig.degrees = d;
  openOrbitPopup(); // re-render popup with updated state
}
function setOrbitDir(dir) {
  orbitConfig.direction = dir;
  openOrbitPopup();
}
window.setOrbitDeg = setOrbitDeg;
window.setOrbitDir = setOrbitDir;

// ── Preview orbit in real time (rAF loop) ──
function previewOrbit() {
  stopOrbitPreview();
  const center    = [state.map.getCenter().lng, state.map.getCenter().lat];
  const zoom      = state.map.getZoom();
  const pitch     = state.map.getPitch();
  const startBear = state.map.getBearing();

  let t = 0;
  let lastTime = performance.now();

  function tick(now) {
    if (!orbitPopupOpen) return;
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    const speed = orbitConfig.degrees / orbitConfig.duration;
    const dir   = orbitConfig.direction === 'cw' ? 1 : -1;
    
    t += dt;
    const bearing = (startBear + t * speed * dir + 360) % 360;
    
    state.map.jumpTo({ center, zoom, pitch, bearing });
    orbitPreviewRaf = requestAnimationFrame(tick);
  }
  orbitPreviewRaf = requestAnimationFrame(tick);

  if (window.updateStatus) updateStatus('Orbit preview…');
}

function stopOrbitPreview() {
  if (orbitPreviewRaf) {
    cancelAnimationFrame(orbitPreviewRaf);
    orbitPreviewRaf = null;
    if (window.updateStatus) updateStatus('Ready');
  }
}

// ── Add orbit as a timeline segment ──
function addOrbitToTimeline() {
  stopOrbitPreview();
  const center    = [state.map.getCenter().lng, state.map.getCenter().lat];
  const startBear = state.map.getBearing();
  const fps       = STUDIO_CONFIG ? STUDIO_CONFIG.fps : 30;

  const seg = {
    id:            'orbit-' + Date.now(),
    type:          'orbit',         
    label:         orbitConfig.degrees + '° Orbit',
    center:        center,          // Matches animator.js expectation
    startBearing:  startBear,
    degrees:       orbitConfig.degrees,
    direction:     orbitConfig.direction === 'cw' ? 1 : -1,
    zoom:          state.map.getZoom(),
    pitch:         state.map.getPitch(),
    duration:      orbitConfig.duration,
    fps,
    // Not used by orbit:
    pathStart: 0, pathEnd: 1, keyframes: [], speedCurve: null,
  };

  if (!STUDIO_CONFIG.timeline) {
     STUDIO_CONFIG.timeline = { enabled: true, segments: [], activeSegmentId: '' };
  }
  STUDIO_CONFIG.timeline.enabled = true;
  STUDIO_CONFIG.timeline.segments.push(seg);
  STUDIO_CONFIG.timeline.activeSegmentId = seg.id;
  
  if (window.renderTimeline) {
    // Enable timeline tab if not active
    const timelineEnabledCheckbox = document.getElementById('timeline-enabled');
    if (timelineEnabledCheckbox) timelineEnabledCheckbox.checked = true;
    window.renderTimeline();
  }
  closeOrbitPopup();
  updateStatus('Orbit added to timeline (' + seg.label + ')');
}
window.addOrbitToTimeline = addOrbitToTimeline;

// ── Compute camera state at progress t for an orbit segment ──
function getOrbitCameraAtT(seg, t) {
  const bearing = (seg.startBearing + t * seg.degrees * seg.direction + 360) % 360;
  return {
    center:  seg.center,
    zoom:    seg.zoom,
    pitch:   seg.pitch,
    bearing,
  };
}
window.getOrbitCameraAtT = getOrbitCameraAtT;

// ── Wire toolbar button ──
document.addEventListener('DOMContentLoaded', () => {
  const btnOrbit = document.getElementById('btn-orbit');
  if (btnOrbit) {
    btnOrbit.onclick = () => {
      if (orbitPopupOpen) { closeOrbitPopup(); return; }
      openOrbitPopup();
    };
  }
});

// Close popup if user clicks outside it
document.addEventListener('click', e => {
  if (!orbitPopupOpen) return;
  const popup = document.getElementById('orbit-popup');
  const btn   = document.getElementById('btn-orbit');
  if (popup && !popup.contains(e.target) && btn && !btn.contains(e.target)) {
    closeOrbitPopup();
  }
});
