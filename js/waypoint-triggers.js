import { STUDIO_CONFIG, state } from './store.js';

// ── Compute the progress t for each waypoint on the path ──
// Called once when waypoints or trekPath changes.
function buildWaypointProgressMap() {
  const path = STUDIO_CONFIG.trekPath;
  const wps  = STUDIO_CONFIG.waypoints;
  if (!path?.length || !wps?.length) return;

  // For each waypoint, find the closest point on the path
  wps.forEach(wp => {
    let minDist = Infinity;
    let bestT   = 0;
    path.forEach((coord, i) => {
      const dx = coord[0] - wp.lngLat[0];
      const dy = coord[1] - wp.lngLat[1];
      const d  = Math.sqrt(dx*dx + dy*dy);
      if (d < minDist) { minDist = d; bestT = i / (path.length - 1); }
    });
    wp._t = bestT;  // cached path progress [0,1] for this waypoint
  });
}
window.buildWaypointProgressMap = buildWaypointProgressMap;

// Rebuild whenever trekPath or waypoints change
document.addEventListener('trek-loaded', buildWaypointProgressMap);
document.addEventListener('waypoints-changed', buildWaypointProgressMap);

// ── Per-frame trigger check ──
// Call this from animator.js and capture.js each frame.
// Returns: active overlay text for this frame (or null)
let lastFiredWpId = null;

function checkWaypointTriggers(t) {
  const wps = STUDIO_CONFIG.waypoints;
  if (!wps?.length) return null;

  const PROXIMITY = 0.025; // fire when within 2.5% of path progress
  let overlayText = null;

  for (const wp of wps) {
    if (wp._t === undefined) continue;
    const dist = Math.abs(t - wp._t);
    if (dist > PROXIMITY) continue;

    // Already fired for this waypoint in this pass — avoid re-firing
    if (lastFiredWpId === wp.id && dist > 0.005) {
      lastFiredWpId = null; // reset when we've moved past
      continue;
    }
    if (lastFiredWpId === wp.id) continue;
    lastFiredWpId = wp.id;

    // Fire each trigger
    for (const trigger of (wp.triggers || [])) {
      switch (trigger.type) {
        case 'show-label':
          overlayText = wp.name;
          if (STUDIO_CONFIG.overlays && STUDIO_CONFIG.overlays.title) {
            STUDIO_CONFIG.overlays.title.enabled = true;
            STUDIO_CONFIG.overlays.title.text    = wp.name;
            STUDIO_CONFIG.overlays.title.subtitle = wp.elevation ? wp.elevation + 'm' : '';
            // Auto-disable after trigger.duration seconds
            setTimeout(() => {
              STUDIO_CONFIG.overlays.title.enabled = false;
            }, (trigger.duration || 3) * 1000);
          }
          break;

        case 'slow-down':
          // Temporarily modify speed curve for the vicinity
          window._waypointSpeedBoost = trigger.factor || 0.3;
          setTimeout(() => { window._waypointSpeedBoost = null; }, 2000);
          break;

        case 'orbit-here':
          // For preview: queue a brief orbit (Phase 20 engine)
          if (!STUDIO_CONFIG._captureMode && window.previewOrbit) {
            // Set orbit config directly
            if (window.orbitConfig) {
               window.orbitConfig.degrees = trigger.degrees || 180;
               window.orbitConfig.direction = trigger.direction || 'cw';
               window.orbitConfig.duration = trigger.duration || 8;
            }
            window.previewOrbit();
          } else if (STUDIO_CONFIG._captureMode) {
            window._pendingCaptureOrbit = {
               center: wp.lngLat,
               degrees: trigger.degrees || 180,
               direction: trigger.direction || 'cw',
               duration: trigger.duration || 8
            };
          }
          break;
      }
    }
    break; // only fire one waypoint per frame
  }

  return overlayText;
}
window.checkWaypointTriggers = checkWaypointTriggers;

// ── Speed modifier for slow-down trigger ──
// Called in remapT chain; multiplies output to slow camera
const _origRemapT = window.remapT;
window.remapT = function(t) {
  const base = _origRemapT ? _origRemapT(t) : t;
  if (window._waypointSpeedBoost !== null && window._waypointSpeedBoost !== undefined) {
    // Blend toward stopped: output barely moves
    return base * (window._waypointSpeedBoost);
  }
  return base;
};

// ── Trigger builder UI — injected into the waypoint context panel ──
function renderTriggerBuilder(wp) {
  const section = document.getElementById('wp-trigger-section');
  if (!section) return;

  section.innerHTML = `
    <p style="font-size:10px; font-weight:500; color:var(--text-muted);
              text-transform:uppercase; letter-spacing:.06em; margin-bottom:8px">
      Triggers when camera arrives
    </p>
    <div id="trigger-list" style="margin-bottom:8px">
      ${(wp.triggers || []).map((tr, i) => renderTriggerRow(tr, i, wp.id)).join('')}
    </div>
    <div style="display:flex; flex-wrap:wrap; gap:4px">
      <button onclick="addTrigger('${wp.id}','show-label')"
        class="btn-ghost" style="font-size:10px; padding:4px 8px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-primary); cursor: pointer; transition: background 160ms var(--ease-out);">🏷 Show label</button>
      <button onclick="addTrigger('${wp.id}','slow-down')"
        class="btn-ghost" style="font-size:10px; padding:4px 8px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-primary); cursor: pointer; transition: background 160ms var(--ease-out);">🐢 Slow down</button>
      <button onclick="addTrigger('${wp.id}','orbit-here')"
        class="btn-ghost" style="font-size:10px; padding:4px 8px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text-primary); cursor: pointer; transition: background 160ms var(--ease-out);">🔄 Orbit here</button>
    </div>
  `;
}
window.renderTriggerBuilder = renderTriggerBuilder;

function renderTriggerRow(tr, idx, wpId) {
  const labels = { 'show-label': '🏷 Show label', 'slow-down': '🐢 Slow down', 'orbit-here': '🔄 Orbit' };
  return `
    <div style="display:flex; align-items:center; gap:6px; padding:4px 0;
                border-bottom:0.5px solid var(--border)">
      <span style="flex:1; font-size:11px; color:var(--text-primary)">${labels[tr.type] || tr.type}</span>
      <button onclick="removeTrigger('${wpId}',${idx})"
        style="background:transparent; border:none; color:var(--text-muted);
               cursor:pointer; font-size:13px; transition: color 160ms var(--ease-out);">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  `;
}

function addTrigger(wpId, type) {
  const wp = STUDIO_CONFIG.waypoints.find(w => w.id === wpId);
  if (!wp) return;
  const defaults = {
    'show-label': { type: 'show-label', duration: 3 },
    'slow-down':  { type: 'slow-down',  factor: 0.25 },
    'orbit-here': { type: 'orbit-here', degrees: 180, direction: 'cw', duration: 8 },
  };
  wp.triggers.push({ ...defaults[type] });
  renderTriggerBuilder(wp);
  document.dispatchEvent(new CustomEvent('waypoints-changed'));
}
window.addTrigger = addTrigger;

function removeTrigger(wpId, idx) {
  const wp = STUDIO_CONFIG.waypoints.find(w => w.id === wpId);
  if (!wp) return;
  wp.triggers.splice(idx, 1);
  renderTriggerBuilder(wp);
  document.dispatchEvent(new CustomEvent('waypoints-changed'));
}
window.removeTrigger = removeTrigger;
