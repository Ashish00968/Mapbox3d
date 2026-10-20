import { STUDIO_CONFIG, state } from './store.js';
import { pathDistanceKm } from './geo.js';
import { Studio, EVENTS } from './event-bus.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — gpx-parser.js (Phase 2)
   Parses GPX/KML files, calculates stats, draws on map.

   Import is TRANSACTIONAL (Req 3.4, 3.5): the raw bytes are parsed into a
   TEMPORARY structure first, validated, and only committed to
   STUDIO_CONFIG.trekPath / waypoints on success. A file with zero valid
   coordinates is rejected with a descriptive error and the existing
   Trek_Path / waypoints are left UNCHANGED (no partial mutation).

   The pure string→coordinate parsers (`parseGPX`, `parseKML`,
   `parseTrackFile`) are exported so they can be exercised in the dev-only
   node test runner without the DOM/File APIs. They use `DOMParser` lazily at
   call time (the test harness provides one via jsdom; the shipped app uses the
   browser's native `DOMParser`).
   ════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// PARSERS (pure: string -> { coords, elevations, waypoints, name })
// ─────────────────────────────────────────────

// Resolve a DOMParser constructor from whichever global exposes one. Keeping
// this lazy means importing this module in node never requires a DOM; only
// actually parsing does (and the jsdom test harness supplies `DOMParser`).
function getDOMParser() {
  if (typeof DOMParser !== 'undefined') return DOMParser;
  if (typeof window !== 'undefined' && window.DOMParser) return window.DOMParser;
  if (typeof globalThis !== 'undefined' && globalThis.DOMParser) return globalThis.DOMParser;
  throw new Error('No DOMParser available to parse GPX/KML in this environment.');
}

export function parseGPX(xmlText) {
  const ParserCtor = getDOMParser();
  const parser = new ParserCtor();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  const trkpts = xmlDoc.getElementsByTagName("trkpt");
  const wptNodes = xmlDoc.getElementsByTagName("wpt");
  const coords = [];
  const elevations = [];
  const waypoints = [];

  for (let i = 0; i < trkpts.length; i++) {
    const pt = trkpts[i];
    const lat = parseFloat(pt.getAttribute("lat"));
    const lon = parseFloat(pt.getAttribute("lon"));

    if (!isNaN(lat) && !isNaN(lon)) {
      coords.push([lon, lat]);

      const eleNode = pt.getElementsByTagName("ele")[0];
      if (eleNode && eleNode.textContent) {
        elevations.push(parseFloat(eleNode.textContent));
      }
    }
  }

  for (let i = 0; i < wptNodes.length; i++) {
    const pt = wptNodes[i];
    const lat = parseFloat(pt.getAttribute("lat"));
    const lon = parseFloat(pt.getAttribute("lon"));
    if (!isNaN(lat) && !isNaN(lon)) {
      const nameNode = pt.getElementsByTagName("name")[0];
      const name = nameNode && nameNode.textContent ? nameNode.textContent.trim() : `Waypoint ${i+1}`;
      waypoints.push({ lngLat: [lon, lat], name });
    }
  }

  // Get name if available
  let name = "Custom Trek";
  const nameNode = xmlDoc.getElementsByTagName("name")[0];
  if (nameNode && nameNode.textContent) {
    name = nameNode.textContent.trim();
  }

  return { coords, elevations, waypoints, name };
}

export function parseKML(xmlText) {
  const ParserCtor = getDOMParser();
  const parser = new ParserCtor();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  const coords = [];
  const elevations = [];
  const waypoints = [];

  // Look for LineString coordinates first — preserve original point order.
  const lineStrings = xmlDoc.getElementsByTagName("LineString");
  if (lineStrings.length > 0) {
    const coordsEl = lineStrings[0].getElementsByTagName("coordinates")[0];
    const text = coordsEl && coordsEl.textContent ? coordsEl.textContent.trim() : "";
    if (text) {
      const pairs = text.split(/\s+/);
      pairs.forEach(pair => {
        const parts = pair.split(',');
        if (parts.length >= 2) {
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lon)) {
            coords.push([lon, lat]);
            if (parts.length >= 3 && !isNaN(parseFloat(parts[2]))) {
              elevations.push(parseFloat(parts[2]));
            }
          }
        }
      });
    }
  }

  // Look for Points (Placemarks with Point)
  const placemarks = xmlDoc.getElementsByTagName("Placemark");
  for (let i = 0; i < placemarks.length; i++) {
    const pm = placemarks[i];
    const pointNode = pm.getElementsByTagName("Point")[0];
    if (pointNode) {
      const coordNode = pointNode.getElementsByTagName("coordinates")[0];
      if (coordNode && coordNode.textContent) {
        const parts = coordNode.textContent.trim().split(',');
        if (parts.length >= 2) {
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lon)) {
            const nameNode = pm.getElementsByTagName("name")[0];
            const name = nameNode && nameNode.textContent ? nameNode.textContent.trim() : `Location ${i+1}`;
            waypoints.push({ lngLat: [lon, lat], name });
          }
        }
      }
    }
  }

  // Get name if available
  let name = "Custom Trek";
  const nameNode = xmlDoc.getElementsByTagName("name")[0];
  if (nameNode && nameNode.textContent) {
    name = nameNode.textContent.trim();
  }

  return { coords, elevations, waypoints, name };
}

// Try to parse a flat JSON array of [lng, lat] pairs as a last resort.
function parseJSONTrack(text) {
  const arr = JSON.parse(text);
  if (Array.isArray(arr) && arr.length > 0 && Array.isArray(arr[0])) {
    const coords = arr.filter(p =>
      Array.isArray(p) && p.length >= 2 &&
      !isNaN(parseFloat(p[0])) && !isNaN(parseFloat(p[1]))
    ).map(p => [parseFloat(p[0]), parseFloat(p[1])]);
    return { coords, elevations: [], waypoints: [], name: 'JSON Trek' };
  }
  return null;
}

/**
 * Pure dispatch: parse a track document string into
 * `{ coords, elevations, waypoints, name }` based on its extension/format.
 * Returns `null` if the format is unsupported or cannot be parsed.
 * Coordinates are always returned in their ORIGINAL order (Req 3.4).
 *
 * @param {string} text  Raw file contents.
 * @param {string} [ext] File extension hint ('gpx' | 'kml' | 'json'); the
 *                       leading dot is optional and case is ignored.
 */
export function parseTrackFile(text, ext) {
  const e = (ext || '').toString().toLowerCase().replace(/^\./, '');
  if (e === 'gpx') return parseGPX(text);
  if (e === 'kml') return parseKML(text);
  if (e === 'json') {
    try { return parseJSONTrack(text); } catch { return null; }
  }
  // Unknown extension: try JSON as a forgiving fallback.
  try { return parseJSONTrack(text); } catch { return null; }
}

// ─────────────────────────────────────────────
// MATH UTILS
// ─────────────────────────────────────────────
// Total path distance in km — consolidated into geo.js
function calculateDistance(coords) {
  return pathDistanceKm(coords);
}

// ─────────────────────────────────────────────
// TRANSACTIONAL IMPORT (Req 3.4, 3.5)
// ─────────────────────────────────────────────

// Emit a descriptive, user-visible error for a rejected import WITHOUT mutating
// any existing Trek_Path / waypoint state. Routes through the Studio bus
// `status` channel.
function rejectImport(message) {
  try {
    Studio.bus.emit(EVENTS.STATUS, { level: 'error', message });
  } catch { /* bus unavailable in some import-only contexts; ignore */ }
  if (window.updateStatus) window.updateStatus(message);
  return { ok: false, error: message };
}

/**
 * Pure planner: turn a parsed `{ coords, elevations, waypoints, name }` into the
 * fully-formed import result (final coordinates + waypoint descriptors) WITHOUT
 * touching STUDIO_CONFIG. The caller validates the result and only commits on
 * success, so a rejected import can never leave partial state behind.
 *
 * @returns {{ ok:true, coords, elevations, waypoints, name, isPointOnly } |
 *           { ok:false, error:string }}
 */
export function planImport(parsed) {
  if (!parsed) {
    return { ok: false, error: 'Unsupported file format. Please use GPX or KML.' };
  }

  let coords = Array.isArray(parsed.coords) ? parsed.coords.slice() : [];
  const srcWaypoints = Array.isArray(parsed.waypoints) ? parsed.waypoints : [];
  let isPointOnly = false;

  // Point-only file (e.g. KML placemarks / GPX <wpt> with no track): build a
  // trek path from the waypoints, preserving their order.
  if (coords.length < 2 && srcWaypoints.length >= 2) {
    coords = srcWaypoints.map(wp => wp.lngLat);
    isPointOnly = true;
  }

  if (coords.length < 2) {
    return {
      ok: false,
      error: 'No valid track points found in the file (need at least 2 coordinates).'
    };
  }

  // Build waypoint descriptors (without ids — ids are assigned at commit time so
  // a rejected import never advances global state).
  let waypoints;
  if (srcWaypoints.length > 0) {
    waypoints = srcWaypoints.map(wp => ({
      lngLat: wp.lngLat,
      name: wp.name,
      endSegment: isPointOnly // break the path between point-only legs
    }));
  } else {
    // Auto-generate waypoints sampled along a long track.
    waypoints = [];
    const step = Math.max(1, Math.floor(coords.length / 40));
    for (let i = 0; i < coords.length; i += step) {
      waypoints.push({
        lngLat: coords[i],
        name: i === 0 ? 'Start'
          : (i + step >= coords.length ? 'End' : 'Point ' + (waypoints.length + 1)),
        endSegment: false
      });
    }
    // Always include the final point as End.
    const last = coords[coords.length - 1];
    const lastWp = waypoints[waypoints.length - 1];
    if (!lastWp || lastWp.lngLat !== last) {
      waypoints.push({ lngLat: last, name: 'End', endSegment: false });
    }
  }

  return {
    ok: true,
    coords,
    elevations: Array.isArray(parsed.elevations) ? parsed.elevations.slice() : [],
    waypoints,
    name: parsed.name || 'Custom Trek',
    isPointOnly
  };
}

// Commit a validated import result to STUDIO_CONFIG. Only runs after planImport
// has succeeded, so this is the single point where global state changes.
function commitImport(result) {
  window.waypointIdCounter = window.waypointIdCounter || 0;

  STUDIO_CONFIG.trekPath = result.coords;
  STUDIO_CONFIG.waypoints = result.waypoints.map(wp => ({
    id: 'gp-' + (window.waypointIdCounter++),
    lngLat: wp.lngLat,
    name: wp.name,
    elevation: null,
    triggers: [],
    endSegment: !!wp.endSegment
  }));

  // Auto-keyframing for fresh imports (only when none exist yet).
  if (!STUDIO_CONFIG.keyframes || STUDIO_CONFIG.keyframes.length === 0) {
    const coords = result.coords;
    const midIdx = Math.floor(coords.length / 2);
    STUDIO_CONFIG.keyframes = [
      { id: 'kf-auto-1', t: 0,   center: coords[0],                   pitch: 60, zoom: 12.5, bearing: 0,  terrainExag: 1.8, timeOfDay: 10, easing: 'ease-in-out' },
      { id: 'kf-auto-2', t: 0.5, center: coords[midIdx],              pitch: 65, zoom: 11.5, bearing: 45, terrainExag: 1.8, timeOfDay: 14, easing: 'ease-in-out' },
      { id: 'kf-auto-3', t: 1,   center: coords[coords.length - 1],   pitch: 70, zoom: 13,   bearing: 90, terrainExag: 1.8, timeOfDay: 18, easing: 'ease-in-out' }
    ];
    if (window.renderKeyframeStrip) window.renderKeyframeStrip();
  }
}

// ─────────────────────────────────────────────
// UI & MAP DRAWING
// ─────────────────────────────────────────────
let startMarker = null;
let endMarker = null;

function updateTrekInfo(parsedData) {
  const { coords, elevations, name } = parsedData;
  const dropZone = document.getElementById('trek-drop-zone');
  const trekInfo = document.getElementById('trek-info');

  // Calculate stats
  const distKm = calculateDistance(coords);

  let eleStr = "N/A";
  if (elevations.length > 0) {
    const minEle = Math.min(...elevations);
    const maxEle = Math.max(...elevations);
    eleStr = `${Math.round(minEle)}m - ${Math.round(maxEle)}m`;
  }

  // Update DOM
  dropZone.style.display = 'none';
  trekInfo.style.display = 'block';
  trekInfo.innerHTML = `
    <div class="trek-name">${name}</div>
    <div style="display:flex; justify-content:space-between; margin-top:6px;">
      <span>Points:</span> <span style="color:var(--text-primary)">${coords.length.toLocaleString()}</span>
    </div>
    <div style="display:flex; justify-content:space-between; margin-top:4px;">
      <span>Distance:</span> <span style="color:var(--text-primary)">${distKm.toFixed(1)} km</span>
    </div>
    <div style="display:flex; justify-content:space-between; margin-top:4px;">
      <span>Elevation:</span> <span style="color:var(--text-primary)">${eleStr}</span>
    </div>
    <div style="margin-top:10px; text-align:right;">
      <button class="btn-ghost" id="replace-file-btn" style="width:auto; padding:4px 8px; font-size:11px;">Change file</button>
    </div>
  `;

  document.getElementById('replace-file-btn').addEventListener('click', () => {
    document.getElementById('trek-file-input').click();
  });

  // Enable action buttons
  document.getElementById('preview-btn').disabled = false;
  document.getElementById('capture-btn').disabled = false;

  document.dispatchEvent(new CustomEvent('trek-loaded', {
    detail: { distanceKm: parseFloat(distKm) }
  }));
}

function redrawTrekPath() {
  const path = STUDIO_CONFIG.trekPath;
  if (!path || path.length < 2) return;
  const map = state.map;

  // Clean up existing
  if (map.getLayer('trek-glow')) map.removeLayer('trek-glow');
  if (map.getLayer('trek-line')) map.removeLayer('trek-line');
  if (map.getSource('trek-path')) map.removeSource('trek-path');

  // Break path into segments based on waypoints with endSegment=true
  const lines = [];
  let currentLine = [];

  for (let i = 0; i < path.length; i++) {
    const pt = path[i];
    currentLine.push(pt);

    const isEnd = STUDIO_CONFIG.waypoints.some(w =>
      w.endSegment && Math.abs(w.lngLat[0] - pt[0]) < 1e-6 && Math.abs(w.lngLat[1] - pt[1]) < 1e-6
    );

    if (isEnd && i < path.length - 1) {
      if (currentLine.length > 1) lines.push(currentLine);
      currentLine = [];
    }
  }
  if (currentLine.length > 1) lines.push(currentLine);

  const geojson = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'MultiLineString',
      coordinates: lines
    }
  };

  map.addSource('trek-path', {
    type: 'geojson',
    data: geojson
  });

  // Outer glow
  map.addLayer({
    id: 'trek-glow',
    type: 'line',
    source: 'trek-path',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#4aff9e',
      'line-width': 12,
      'line-opacity': 0.2
    }
  });

  // Inner core
  map.addLayer({
    id: 'trek-line',
    type: 'line',
    source: 'trek-path',
    layout: {
      'line-join': 'round',
      'line-cap': 'round'
    },
    paint: {
      'line-color': '#4aff9e',
      'line-width': 3,
      'line-opacity': 0.9
    }
  });

  // Handle start/end markers
  if (startMarker) startMarker.remove();
  if (endMarker) endMarker.remove();

  // Create custom marker elements
  const createDot = (color) => {
    const el = document.createElement('div');
    el.style.width = '14px';
    el.style.height = '14px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = color;
    el.style.border = '2px solid #fff';
    el.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
    return el;
  };

  startMarker = new mapboxgl.Marker({ element: createDot('#4aff9e') })
    .setLngLat(path[0])
    .addTo(map);

  endMarker = new mapboxgl.Marker({ element: createDot('#ff4a4a') })
    .setLngLat(path[path.length - 1])
    .addTo(map);
}

// Main handler called from map.js when a file is dropped or selected.
// Reads the file, parses into a temporary structure, validates, and commits to
// STUDIO_CONFIG only on success (Req 3.4, 3.5).
function handleTrekFile(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    const lower = (file.name || '').toLowerCase();
    let ext = 'json';
    if (lower.endsWith('.gpx')) ext = 'gpx';
    else if (lower.endsWith('.kml')) ext = 'kml';

    const parsed = parseTrackFile(text, ext);
    const result = planImport(parsed);

    if (!result.ok) {
      // Reject: descriptive error, existing Trek_Path / waypoints untouched.
      rejectImport(result.error);
      return;
    }

    // ── Commit point: mutate global state only now that validation passed. ──
    commitImport(result);

    if (window.renderWaypointList) window.renderWaypointList();

    // Place markers for waypoints
    if (window.placeWaypointMarker) {
      STUDIO_CONFIG.waypoints.forEach(wp => {
        window.placeWaypointMarker(wp);
      });
    }

    // Update UI and map
    updateTrekInfo({ coords: result.coords, elevations: result.elevations, name: result.name });
    redrawTrekPath();

    // Notify (Req 4.1) that a trek was successfully imported.
    try {
      Studio.bus.emit(EVENTS.STATUS, {
        level: 'info',
        message: `Imported "${result.name}" — ${result.coords.length.toLocaleString()} points.`
      });
      Studio.bus.emit(EVENTS.TREK_CHANGED, { source: 'import' });
    } catch { /* bus optional */ }

    // Fit map to bounds
    const bounds = new mapboxgl.LngLatBounds(result.coords[0], result.coords[0]);
    for (const coord of result.coords) {
      bounds.extend(coord);
    }

    state.map.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 360, right: 320 }, // Account for UI panels
      pitch: STUDIO_CONFIG.pitch,
      duration: 1500
    });
  };

  reader.readAsText(file);
}

// ─────────────────────────────────────────────
// Browser wiring + Studio namespace registration.
// Guarded so the pure parsers remain importable in the node test runner
// (which has no `window`).
// ─────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.handleTrekFile = handleTrekFile;
  window.redrawTrekPath = redrawTrekPath;

  window.Studio = window.Studio || {};
  window.Studio.route = window.Studio.route || {};
  window.Studio.route.parseTrackFile = parseTrackFile;
  window.Studio.route.parseGPX = parseGPX;
  window.Studio.route.parseKML = parseKML;
  window.Studio.route.planImport = planImport;
  window.Studio.route.handleTrekFile = handleTrekFile;
}
