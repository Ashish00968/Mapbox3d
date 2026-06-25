import { STUDIO_CONFIG, state } from './store.js';

// ── State ──
let waypointMode = false;
window.waypointIdCounter = 0;
const waypointMarkers = {};  // id → mapboxgl.Marker DOM element

// ── Toggle waypoint placement mode ──
function toggleWaypointMode(active) {
  waypointMode = active !== undefined ? active : !waypointMode;
  if (state.map) state.map.getCanvas().style.cursor = waypointMode ? 'crosshair' : '';
  const btn = document.getElementById('btn-add-waypoint');
  if (btn) {
    btn.style.background = waypointMode ? 'rgba(74,158,255,0.25)' : '';
  }
  updateStatus(waypointMode ? 'Click map to place a waypoint' : 'Ready');
}
window.toggleWaypointMode = toggleWaypointMode;

// ── Map click handler — place waypoint ──
if (state.map) {
  state.map.on('click', handleMapClick);
} else {
  // If map is not initialized yet, wait for load
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (state.map) state.map.on('click', handleMapClick);
    }, 1000);
  });
}

function handleMapClick(e) {
  if (!waypointMode) return;
  const lngLat = [e.lngLat.lng, e.lngLat.lat];
  const id = 'wp-' + (window.waypointIdCounter++);
  const num = STUDIO_CONFIG.waypoints.length + 1;

  // Auto-name, then let user rename via context panel
  const waypoint = { id, lngLat, name: 'Waypoint ' + num, elevation: null, triggers: [] };
  STUDIO_CONFIG.waypoints.push(waypoint);

  placeWaypointMarker(waypoint);
  rebuildTrekPath();
  renderWaypointList();
  openWaypointEditor(waypoint);
  document.dispatchEvent(new CustomEvent('waypoints-changed'));

  // Exit mode after placing (single-place workflow)
  // Exit mode after placing (single-place workflow)
  toggleWaypointMode(false);
}

// ── Place a Mapbox marker for a waypoint ──
function placeWaypointMarker(wp) {
  const num = STUDIO_CONFIG.waypoints.indexOf(wp) + 1;
  const el = document.createElement('div');
  el.style.cssText = [
    'width: 24px',
    'height: 24px',
    'border-radius: 50%',
    'background: var(--accent-base, #4a9eff)',
    'border: 2px solid #fff',
    'display: flex',
    'align-items: center',
    'justify-content: center',
    'font-size: 11px',
    'font-weight: 600',
    'color: #fff',
    'cursor: pointer',
    'box-shadow: 0 2px 6px rgba(0,0,0,0.4)',
    'transition: transform 160ms var(--ease-out)'
  ].join(';');
  el.textContent = num;
  el.title = wp.name;

  el.addEventListener('click', e => {
    e.stopPropagation();
    openWaypointEditor(wp);
  });

  const marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
    .setLngLat(wp.lngLat)
    .addTo(map);

  waypointMarkers[wp.id] = marker;

  // Fetch elevation from Mapbox Terrain
  fetchElevation(wp.lngLat).then(elev => {
    wp.elevation = elev;
    el.title = wp.name + ' · ' + elev + 'm';
    renderWaypointList();
  });
}
window.placeWaypointMarker = placeWaypointMarker;

// ── Fetch elevation via Mapbox queryTerrainElevation ──
function fetchElevation(lngLat) {
  return new Promise(resolve => {
    try {
      if (state.map && state.map.queryTerrainElevation) {
        const elev = state.map.queryTerrainElevation(lngLat, { exaggerated: false });
        resolve(elev ? Math.round(elev) : null);
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}

// ── Rebuild the trek path GeoJSON from waypoints in order ──
function rebuildTrekPath() {
  const coords = STUDIO_CONFIG.waypoints.map(w => w.lngLat);
  STUDIO_CONFIG.trekPath = coords;  // existing coordAtProgress reads this

  // Remove and re-add the trek path layers
  const geojson = {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: coords }
  };

  if (state.map && state.map.getSource('trek-path')) {
    state.map.getSource('trek-path').setData(geojson);
  } else if (window.renderTrekOnMap) {
    window.renderTrekOnMap(coords);
  } else if (window.redrawTrekPath) {
    window.redrawTrekPath();
  }

  // Update trek stats
  if (coords.length >= 2) {
    const km = calcDistanceKm(coords).toFixed(1);
    updateStatus(coords.length + ' waypoints · ' + km + ' km');
  }
}
window.rebuildTrekPath = rebuildTrekPath;

// ── Haversine distance (same as gpx-parser.js — keep DRY by sharing via window) ──
function calcDistanceKm(coords) {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lng1, lat1] = coords[i - 1];
    const [lng2, lat2] = coords[i];
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 +
              Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    total += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  return total;
}
window.calcDistanceKm = calcDistanceKm;

// ── Open waypoint editor in context panel ──
function openWaypointEditor(wp) {
  const elev = wp.elevation ? wp.elevation + 'm' : '—';
  window.openContextPanel('Waypoint', `
    <div style="margin-bottom:12px">
      <label style="font-size:11px; color:var(--text-muted); display:block; margin-bottom:4px">Name</label>
      <input id="wp-name-input" type="text" value="${wp.name}"
        style="width:100%; background:rgba(0,0,0,0.3); border:1px solid var(--border);
               color:var(--text-primary); border-radius:4px; padding:6px 8px; font-size:13px">
    </div>
    <p style="font-size:11px; color:var(--text-muted); margin-bottom:12px">
      Elevation: ${elev} &nbsp;·&nbsp;
      ${wp.lngLat[1].toFixed(4)}, ${wp.lngLat[0].toFixed(4)}
    </p>
    <div style="display:flex; gap:6px; margin-bottom:12px">
      <button onclick="deleteWaypoint('${wp.id}')"
        style="flex:1; padding:7px; background:transparent; border:1px solid var(--danger);
               color:var(--danger); border-radius:6px; cursor:pointer; font-size:12px">
        Delete
      </button>
      <button onclick="confirmWaypointName('${wp.id}')"
        style="flex:2; padding:7px; background:var(--accent-base); border:none;
               color:#fff; border-radius:6px; cursor:pointer; font-size:12px">
        Save name
      </button>
    </div>
    
    <div style="margin-bottom:12px">
      <p style="font-size:10px; font-weight:500; color:var(--text-muted);
                text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px">
        Camera Actions
      </p>
      <div style="display:flex; flex-direction:column; gap:6px">
        <button onclick="if(window.flyAndZoomToWaypoint) window.flyAndZoomToWaypoint('${wp.id}')"
          class="btn-ghost" style="padding:6px; font-size:11px; justify-content:flex-start">
          <i class="ti ti-zoom-in"></i> Fly & Zoom Here
        </button>
        <button onclick="if(window.storyboardJump) window.storyboardJump('${wp.id}')"
          class="btn-ghost" style="padding:6px; font-size:11px; justify-content:flex-start">
          <i class="ti ti-focus-2"></i> Jump Camera Here
        </button>
        <button onclick="window.addKeyframeAtWaypoint('${wp.id}')"
          class="btn-ghost" style="padding:6px; font-size:11px; justify-content:flex-start">
          <i class="ti ti-camera-plus"></i> Add Keyframe Here
        </button>
        <button onclick="window.createOrbitAtWaypoint('${wp.id}')"
          class="btn-ghost" style="padding:6px; font-size:11px; justify-content:flex-start">
          <i class="ti ti-rotate-360"></i> Create Orbit Segment
        </button>
      </div>
    </div>
    
    <div style="margin-bottom:12px">
      <p style="font-size:10px; font-weight:500; color:var(--text-muted);
                text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px">
        Path Actions
      </p>
      <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer">
        <input type="checkbox" onchange="window.toggleSegmentEnd('${wp.id}', this.checked)" ${wp.endSegment ? 'checked' : ''}>
        End Segment Here (Break line)
      </label>
    </div>

    <div id="wp-trigger-section">
      <p style="font-size:10px; font-weight:500; color:var(--text-muted);
                text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px">
        Animation triggers
      </p>
      <p style="font-size:11px; color:var(--text-muted)">
        Phase 19 will add triggers here.
      </p>
    </div>
  `);

  const input = document.getElementById('wp-name-input');
  if (input) {
    input.focus();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmWaypointName(wp.id);
    });
  }

  // Render trigger builder in context panel
  setTimeout(() => {
    if (window.renderTriggerBuilder) window.renderTriggerBuilder(wp);
  }, 50);
}

function confirmWaypointName(id) {
  const wp = STUDIO_CONFIG.waypoints.find(w => w.id === id);
  if (!wp) return;
  const input = document.getElementById('wp-name-input');
  if (input) {
    wp.name = input.value.trim() || wp.name;
    // Update marker tooltip
    if (waypointMarkers[id]) waypointMarkers[id].getElement().title = wp.name;
  }
  renderWaypointList();
  window.closeContextPanel();
  if (window.updateStatus) window.updateStatus('Waypoint renamed: ' + wp.name);
}

// Helpers for Camera Actions
window.addKeyframeAtWaypoint = function(wpId) {
  const wp = STUDIO_CONFIG.waypoints.find(w => w.id === wpId);
  if (!wp) return;
  if (window.storyboardJump) window.storyboardJump(wpId);
  setTimeout(() => {
    if (window.addKeyframe) {
      const t = wp._t !== undefined ? wp._t : (STUDIO_CONFIG.currentProgress || 0);
      window.addKeyframe(t);
      if (window.updateStatus) window.updateStatus('Keyframe added at ' + wp.name);
    }
  }, 100);
};

window.createOrbitAtWaypoint = function(wpId) {
  if (window.storyboardJump) window.storyboardJump(wpId);
  setTimeout(() => {
    if (window.showOrbitPopup) window.showOrbitPopup();
  }, 100);
};

// ── Camera / Path Actions ──
window.flyAndZoomToWaypoint = function(id) {
  const wp = STUDIO_CONFIG.waypoints.find(w => w.id === id);
  if (wp && state.map) {
    state.map.flyTo({
      center: wp.lngLat,
      zoom: 15,
      pitch: 65,
      bearing: state.map.getBearing(),
      duration: 2000,
      essential: true
    });
  }
};

window.toggleSegmentEnd = function(wpId, isEnd) {
  const wp = STUDIO_CONFIG.waypoints.find(w => w.id === wpId);
  if (wp) {
    wp.endSegment = isEnd;
    if (window.rebuildTrekPath) window.rebuildTrekPath();
    if (window.redrawTrekPath) window.redrawTrekPath();
  }
};

window.confirmWaypointName = confirmWaypointName;

function deleteWaypoint(id) {
  STUDIO_CONFIG.waypoints = STUDIO_CONFIG.waypoints.filter(w => w.id !== id);
  if (waypointMarkers[id]) {
    waypointMarkers[id].remove();
    delete waypointMarkers[id];
  }
  rebuildTrekPath();
  renderWaypointList();
  window.closeContextPanel();
  // Re-number markers after deletion
  renumberMarkers();
}
window.deleteWaypoint = deleteWaypoint;

function renumberMarkers() {
  STUDIO_CONFIG.waypoints.forEach((wp, i) => {
    const el = waypointMarkers[wp.id]?.getElement();
    if (el) el.textContent = String(i + 1);
  });
}

// ── Waypoint list in Route tab ──
function renderWaypointList() {
  const container = document.getElementById('waypoint-list');
  if (!container) return;
  const wps = STUDIO_CONFIG.waypoints;

  if (wps.length === 0) {
    container.innerHTML = '<p style="font-size:11px; color:var(--text-muted); padding:8px 0">No waypoints yet — click 📍 to add one, or upload a GPX file.</p>';
    return;
  }

  container.innerHTML = wps.map((wp, i) => `
    <div class="waypoint-row" data-id="${wp.id}"
      style="display:flex; align-items:center; gap:8px; padding:6px 0;
             border-bottom:0.5px solid var(--border); cursor:pointer"
      onclick="openWaypointEditorById('${wp.id}')">
      <div style="width:20px; height:20px; border-radius:50%; background:var(--accent-base);
                  color:#fff; font-size:10px; font-weight:600; display:flex;
                  align-items:center; justify-content:center; flex-shrink:0">${i+1}</div>
      <div style="flex:1; min-width:0">
        <p style="font-size:12px; color:var(--text-primary); white-space:nowrap;
                  overflow:hidden; text-overflow:ellipsis; margin: 0 0 2px 0;">${wp.name}</p>
        <p style="font-size:10px; color:var(--text-muted); margin: 0;">${wp.elevation ? wp.elevation + 'm' : '—'}</p>
      </div>
      <button onclick="event.stopPropagation(); deleteWaypoint('${wp.id}')"
        style="background:transparent; border:none; color:var(--text-muted);
               cursor:pointer; font-size:14px; padding:2px">
        <i class="ti ti-x" aria-hidden="true"></i>
      </button>
    </div>
  `).join('');
}
window.renderWaypointList = renderWaypointList;

function openWaypointEditorById(id) {
  const wp = STUDIO_CONFIG.waypoints.find(w => w.id === id);
  if (wp) openWaypointEditor(wp);
}
window.openWaypointEditorById = openWaypointEditorById;

// ── Wire Add Waypoint button ──
document.addEventListener('DOMContentLoaded', () => {
  // We no longer bind 'btn-add-waypoint' here. It is handled by timeline-editor.js as "Add Keyframe"


  // Render empty state in Route tab
  const routeTab = document.getElementById('tab-route');
  if (routeTab) {
    const listSection = document.createElement('div');
    listSection.className = 'panel-section';
    listSection.innerHTML = `
      <div class="section-label" style="display:flex; align-items:center; justify-content:space-between">
        WAYPOINTS
        <button onclick="clearAllWaypoints()"
          style="font-size:10px; color:var(--danger); background:transparent;
                 border:none; cursor:pointer; text-transform:none; letter-spacing:0; padding:0;">Clear all</button>
      </div>
      <div id="waypoint-list"></div>
    `;
    // Insert BEFORE the existing trek stats section if present
    const firstSection = routeTab.querySelector('.panel-section');
    if (firstSection) routeTab.insertBefore(listSection, firstSection);
    else routeTab.appendChild(listSection);
    
    renderWaypointList();
  }
});

function clearAllWaypoints() {
  if (!confirm('Clear all waypoints?')) return;
  STUDIO_CONFIG.waypoints.forEach(wp => {
    if (waypointMarkers[wp.id]) waypointMarkers[wp.id].remove();
  });
  STUDIO_CONFIG.waypoints = [];
  STUDIO_CONFIG.trekPath  = [];
  // Can't assign length to constant
  for (let key in waypointMarkers) delete waypointMarkers[key];
  window.waypointIdCounter = 0;
  renderWaypointList();
  
  // Remove trek path from map
  if (state.map && state.map.getLayer('trek-line')) state.map.removeLayer('trek-line');
  if (state.map && state.map.getLayer('trek-glow')) state.map.removeLayer('trek-glow');
  if (state.map && state.map.getSource('trek-path')) state.map.removeSource('trek-path');
  
  updateStatus('Waypoints cleared');
}
window.clearAllWaypoints = clearAllWaypoints;
