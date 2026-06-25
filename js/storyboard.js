import { STUDIO_CONFIG, state } from './store.js';

// ── Storyboard strip ──
// Rendered inside #storyboard-strip (inserted between keyframe strip and player bar)

function renderStoryboard() {
  const strip = document.getElementById('storyboard-strip');
  if (!strip) return;
  const wps = STUDIO_CONFIG.waypoints;

  if (!wps?.length) {
    strip.innerHTML = '<p style="font-size:11px; color:var(--text-muted); padding:6px 12px; line-height:52px; text-align:center; margin:0">No waypoints — click 📍 to add route points</p>';
    return;
  }

  strip.innerHTML = `
    <div id="storyboard-cards"
      style="display:flex; gap:8px; padding:8px 12px; overflow-x:auto;
             scroll-behavior:smooth; height:100%; align-items:center; box-sizing: border-box;">
      ${wps.map((wp, i) => `
        <div class="sb-card" data-id="${wp.id}" data-i="${i}"
          draggable="true"
          onclick="storyboardJump('${wp.id}')"
          style="
            flex-shrink: 0;
            width: 120px;
            height: 56px;
            border-radius: 8px;
            background: rgba(255,255,255,0.06);
            border: 1px solid rgba(255,255,255,0.08);
            cursor: pointer;
            padding: 8px 10px;
            transition: border-color 160ms var(--ease-out), background 160ms var(--ease-out), transform 160ms var(--ease-out);
            user-select: none;
            box-sizing: border-box;
          "
        >
          <div style="display:flex; align-items:center; gap:6px; margin-bottom:4px">
            <span style="width:18px; height:18px; border-radius:50%; background:var(--accent-base);
                         color:#fff; font-size:10px; font-weight:600; display:flex;
                         align-items:center; justify-content:center; flex-shrink:0">${i+1}</span>
            <span style="font-size:11px; font-weight: 500; color:var(--text-primary); white-space:nowrap;
                         overflow:hidden; text-overflow:ellipsis; max-width:76px">${wp.name}</span>
          </div>
          <div style="display:flex; align-items:center; justify-content:space-between">
            <span style="font-size:10px; color:var(--text-muted)">${wp.elevation ? wp.elevation+'m' : '—'}</span>
            <span style="font-size:12px; display:flex; gap:2px">
              ${(wp.triggers||[]).map(t => ({
                'show-label': '🏷', 'slow-down': '🐢', 'orbit-here': '🔄'
              }[t.type] || '•')).join('')}
            </span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  initDragToReorder();
}
window.renderStoryboard = renderStoryboard;

// ── Jump camera to a waypoint's position ──
function storyboardJump(id) {
  const wp = STUDIO_CONFIG.waypoints.find(w => w.id === id);
  if (!wp) return;

  // Find this waypoint's t on the path
  if (wp._t !== undefined && STUDIO_CONFIG.trekPath?.length >= 2) {
    const center = window.studioAnimator && window.studioAnimator.getPointAtProgress ? window.studioAnimator.getPointAtProgress(wp._t) : wp.lngLat;
    const cam    = window.interpolateCameraAtT ? window.interpolateCameraAtT(wp._t)
                   : { pitch: map.getPitch(), zoom: map.getZoom(), bearing: map.getBearing() };
    map.flyTo({ center, pitch: cam.pitch, zoom: cam.zoom, bearing: cam.bearing, speed: 1.5 });
    
    // update animator progress
    if (window.studioAnimator) {
      window.studioAnimator.setProgress(wp._t);
    }
  } else {
    map.flyTo({ center: wp.lngLat, speed: 1.5 });
  }

  // Open waypoint editor in context panel
  if (window.openWaypointEditorById) window.openWaypointEditorById(id);
}
window.storyboardJump = storyboardJump;

// ── Highlight active card during preview ──
let lastActiveCardId = null;
function updateActiveCard(t) {
  const wps = STUDIO_CONFIG.waypoints;
  if (!wps?.length) return;

  // Find waypoint closest to current t
  let closest = wps[0];
  let minDist = Infinity;
  wps.forEach(wp => {
    if (wp._t === undefined) return;
    const d = Math.abs(wp._t - t);
    if (d < minDist) { minDist = d; closest = wp; }
  });

  if (closest.id === lastActiveCardId) return;
  lastActiveCardId = closest.id;

  document.querySelectorAll('.sb-card').forEach(card => {
    const isActive = card.dataset.id === closest.id;
    card.style.background = isActive ? 'rgba(74,158,255,0.18)' : 'rgba(255,255,255,0.06)';
    card.style.borderColor = isActive ? 'rgba(74,158,255,0.6)' : 'rgba(255,255,255,0.08)';
    card.style.transform = isActive ? 'scale(1.02)' : 'scale(1)';
  });

  // Scroll active card into view in the strip
  const activeEl = document.querySelector(`.sb-card[data-id="${closest.id}"]`);
  if (activeEl) {
    activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}
window.updateActiveCard = updateActiveCard;

// ── Drag to reorder waypoints ──
let dragSrcIndex = null;

function initDragToReorder() {
  const cards = document.querySelectorAll('.sb-card');
  cards.forEach(card => {
    card.addEventListener('dragstart', e => {
      dragSrcIndex = parseInt(card.dataset.i);
      card.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => { card.style.opacity = '1'; });
    card.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    card.addEventListener('drop', e => {
      e.preventDefault();
      const targetIndex = parseInt(card.dataset.i);
      if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
      // Reorder STUDIO_CONFIG.waypoints
      const wps = STUDIO_CONFIG.waypoints;
      const [moved] = wps.splice(dragSrcIndex, 1);
      wps.splice(targetIndex, 0, moved);
      dragSrcIndex = null;
      // Rebuild path and re-render
      if (window.rebuildTrekPath) window.rebuildTrekPath();
      if (window.buildWaypointProgressMap) window.buildWaypointProgressMap();
      renderStoryboard();
      if (window.renderWaypointList) window.renderWaypointList();
    });
  });
}

// ── Re-render storyboard when waypoints change ──
document.addEventListener('waypoints-changed', renderStoryboard);
document.addEventListener('trek-loaded', renderStoryboard);

// ── Init ──
document.addEventListener('map-ready', () => renderStoryboard());
