import { STUDIO_CONFIG, state } from './store.js';
import { pathDistanceKm } from './geo.js';
import Studio from './event-bus.js';
// Side-effect import: registers Studio.route.buildTrekPath / buildStraightLinePath
// so this module can build the Trek_Path through the routing dispatcher (Req 3.1, 3.8).
import './routing.js';

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
document.addEventListener('map-ready', () => {
  if (state.map) state.map.on('click', handleMapClick);
});
if (state.map) {
  state.map.on('click', handleMapClick);
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
    .addTo(state.map);

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

// ── Rebuild the trek path from waypoints, ALWAYS in array order ──
//
// The Trek_Path is rebuilt by mapping STUDIO_CONFIG.waypoints in array order on
// every add/delete/reorder, so the path order mirrors the waypoint-array order
// exactly (Req 3.8). Building goes through the routing dispatcher
// (Studio.route.buildTrekPath) so the configured routing mode is honored:
//   • 'straight-line'  -> synchronous geodesic path (snappy)
//   • 'road-and-trail' -> may return a Promise (async snapped route)
// We therefore tolerate both a plain array and a thenable return value.
function rebuildTrekPath() {
  const waypoints = STUDIO_CONFIG.waypoints;
  const routing = STUDIO_CONFIG.routing || {};
  const mode = routing.mode || 'straight-line';
  const profile = routing.profile;

  // Direct, order-preserving fallback if the router is unavailable or throws
  // (e.g. a not-yet-implemented mode). Mirrors the waypoint array exactly.
  const directCoords = () => waypoints.map(w => w.lngLat);

  let result;
  try {
    if (Studio.route && typeof Studio.route.buildTrekPath === 'function') {
      result = Studio.route.buildTrekPath(waypoints, { mode, profile });
    } else {
      result = directCoords();
    }
  } catch (err) {
    console.warn('[waypoint-builder] routing build failed; using direct order', err);
    result = directCoords();
  }

  if (result && typeof result.then === 'function') {
    // Async mode (road-and-trail): apply when the snapped route resolves.
    result
      .then(coords => applyTrekPath(Array.isArray(coords) ? coords : directCoords()))
      .catch(err => {
        console.warn('[waypoint-builder] async routing failed; using direct order', err);
        applyTrekPath(directCoords());
      });
  } else {
    applyTrekPath(Array.isArray(result) ? result : directCoords());
  }
}
window.rebuildTrekPath = rebuildTrekPath;

// ── Apply a freshly built Trek_Path: update config, the map source, and notify ──
function applyTrekPath(coords) {
  coords = Array.isArray(coords) ? coords : [];
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

  // Announce the change; the trek-changed listener recomputes distance (Req 3.6).
  Studio.bus.emit(Studio.events.TREK_CHANGED, { trekPath: coords });
}

// ── On every trek change, recompute total distance (km) and update displays ──
// (Req 3.6) Distance is derived once, here, from the current Trek_Path via the
// single geo.js implementation, then mirrored into STUDIO_CONFIG and the status
// bar / distance overlay so all surfaces agree.
Studio.bus.on(Studio.events.TREK_CHANGED, () => {
  const coords = STUDIO_CONFIG.trekPath || [];
  const km = pathDistanceKm(coords);

  STUDIO_CONFIG.trekDistanceKm = km;
  if (STUDIO_CONFIG.overlays && STUDIO_CONFIG.overlays.distance) {
    STUDIO_CONFIG.overlays.distance.totalKm = km;
  }

  if (coords.length >= 2 && window.updateStatus) {
    window.updateStatus(STUDIO_CONFIG.waypoints.length + ' waypoints · ' + km.toFixed(1) + ' km');
  }
});

// ── Total path distance in km — consolidated into geo.js ──
function calcDistanceKm(coords) {
  return pathDistanceKm(coords);
}
window.calcDistanceKm = calcDistanceKm;

// ── Open waypoint editor in context panel ──
function openWaypointEditor(wp) {
  if (Studio && Studio.bus) {
    Studio.bus.emit(Studio.events.SELECTION_CHANGED, { kind: 'waypoint', id: wp.id });
  }
  const elev = wp.elevation ? wp.elevation + 'm' : '—';
  window.openContextPanel('Waypoint', `
    <div class="wp-edit__field">
      <label class="wp-edit__label">Name</label>
      <input id="wp-name-input" type="text" value="${wp.name}" class="wp-edit__input">
    </div>
    <p class="wp-edit__meta">
      Elevation: ${elev} &nbsp;·&nbsp;
      ${wp.lngLat[1].toFixed(4)}, ${wp.lngLat[0].toFixed(4)}
    </p>
    <div class="wp-edit__actions">
      <button onclick="deleteWaypoint('${wp.id}')" class="btn-danger">
        Delete
      </button>
      <button onclick="confirmWaypointName('${wp.id}')" class="btn-accent btn-accent--wide">
        Save name
      </button>
    </div>

    <div class="wp-edit__group">
      <p class="wp-edit__group-title">
        Camera Actions
      </p>
      <div class="wp-edit__group-stack">
        <button onclick="if(window.flyAndZoomToWaypoint) window.flyAndZoomToWaypoint('${wp.id}')"
          class="btn-ghost wp-edit__action-btn">
          <i class="ti ti-zoom-in"></i> Fly & Zoom Here
        </button>
        <button onclick="if(window.storyboardJump) window.storyboardJump('${wp.id}')"
          class="btn-ghost wp-edit__action-btn">
          <i class="ti ti-focus-2"></i> Jump Camera Here
        </button>
        <button onclick="window.addKeyframeAtWaypoint('${wp.id}')"
          class="btn-ghost wp-edit__action-btn">
          <i class="ti ti-camera-plus"></i> Add Keyframe Here
        </button>
        <button onclick="window.createOrbitAtWaypoint('${wp.id}')"
          class="btn-ghost wp-edit__action-btn">
          <i class="ti ti-rotate-360"></i> Create Orbit Segment
        </button>
      </div>
    </div>

    <div class="wp-edit__group">
      <p class="wp-edit__group-title">
        Path Actions
      </p>
      <label class="wp-edit__check">
        <input type="checkbox" onchange="window.toggleSegmentEnd('${wp.id}', this.checked)" ${wp.endSegment ? 'checked' : ''}>
        End Segment Here (Break line)
      </label>
    </div>

    <div id="wp-trigger-section">
      <p class="wp-edit__group-title">
        Animation triggers
      </p>
      <p class="wp-edit__hint">
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
    container.innerHTML = '<p class="wp-list__empty">No waypoints yet — click 📍 to add one, or upload a GPX file.</p>';
    return;
  }

  container.innerHTML = wps.map((wp, i) => `
    <div class="waypoint-row" data-id="${wp.id}"
      onclick="openWaypointEditorById('${wp.id}')">
      <div class="waypoint-row__num">${i+1}</div>
      <div class="waypoint-row__body">
        <p class="waypoint-row__name">${wp.name}</p>
        <p class="waypoint-row__elev">${wp.elevation ? wp.elevation + 'm' : '—'}</p>
      </div>
      <button onclick="event.stopPropagation(); deleteWaypoint('${wp.id}')"
        class="waypoint-row__del">
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
      <div class="section-label wp-list__header">
        WAYPOINTS
        <button onclick="clearAllWaypoints()"
          class="wp-list__clear">Clear all</button>
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

  // Notify: trek is now empty so distance recomputes to 0 (Req 3.6, 3.8).
  Studio.bus.emit(Studio.events.TREK_CHANGED, { trekPath: [] });

  updateStatus('Waypoints cleared');
}
window.clearAllWaypoints = clearAllWaypoints;
