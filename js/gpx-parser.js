import { STUDIO_CONFIG, state } from './store.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — gpx-parser.js (Phase 2)
   Parses GPX/KML files, calculates stats, draws on map.
   ════════════════════════════════════════════════════════════ */

// ─────────────────────────────────────────────
// PARSERS
// ─────────────────────────────────────────────
function parseGPX(xmlText) {
  const parser = new DOMParser();
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

function parseKML(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");
  
  const coords = [];
  const elevations = [];
  const waypoints = [];
  
  const coordNodes = xmlDoc.getElementsByTagName("coordinates");
  
  // Look for LineString coordinates first
  const lineStrings = xmlDoc.getElementsByTagName("LineString");
  if (lineStrings.length > 0) {
    const text = lineStrings[0].getElementsByTagName("coordinates")[0]?.textContent.trim();
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

// ─────────────────────────────────────────────
// MATH UTILS
// ─────────────────────────────────────────────
// Haversine formula to calculate distance between two lat/lon points in km
function haversineDist(coord1, coord2) {
  const R = 6371; // Earth's radius in km
  const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
  const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
  const lat1 = coord1[1] * Math.PI / 180;
  const lat2 = coord2[1] * Math.PI / 180;

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(lat1) * Math.cos(lat2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c;
}

function calculateDistance(coords) {
  let dist = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    dist += haversineDist(coords[i], coords[i+1]);
  }
  return dist;
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
  
  if (coords.length < 2) {
    alert("Not enough valid coordinates found in the file.");
    return;
  }

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

window.redrawTrekPath = function() {
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
};

// Main handler called from map.js when a file is dropped or selected
window.handleTrekFile = function(file) {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const text = e.target.result;
    let parsed = null;

    if (file.name.toLowerCase().endsWith('.gpx')) {
      parsed = parseGPX(text);
    } else if (file.name.toLowerCase().endsWith('.kml')) {
      parsed = parseKML(text);
    } else {
      // Try JSON array fallback
      try {
        const arr = JSON.parse(text);
        if (Array.isArray(arr) && arr.length > 0 && Array.isArray(arr[0])) {
          parsed = { coords: arr, elevations: [], name: 'JSON Trek' };
        }
      } catch (err) {
        alert("Unsupported file format. Please use GPX or KML.");
        return;
      }
    }

    if (parsed) {
      let isPointOnly = false;
      if (parsed.coords.length < 2 && parsed.waypoints && parsed.waypoints.length >= 2) {
        // Point-only file: Build a trek path from the waypoints
        parsed.coords = parsed.waypoints.map(wp => wp.lngLat);
        isPointOnly = true;
      }

      if (parsed.coords && parsed.coords.length >= 2) {
        // Update global config
        STUDIO_CONFIG.trekPath = parsed.coords;
        STUDIO_CONFIG.waypoints = [];
        window.waypointIdCounter = window.waypointIdCounter || 0;
        
        // Auto-keyframing for new imports
        if (!STUDIO_CONFIG.keyframes || STUDIO_CONFIG.keyframes.length === 0) {
          const midIdx = Math.floor(parsed.coords.length / 2);
          STUDIO_CONFIG.keyframes = [
            { id: 'kf-auto-1', t: 0,   center: parsed.coords[0], pitch: 60, zoom: 12.5, bearing: 0,  terrainExag: 1.8, timeOfDay: 10, easing: 'ease-in-out' },
            { id: 'kf-auto-2', t: 0.5, center: parsed.coords[midIdx], pitch: 65, zoom: 11.5, bearing: 45, terrainExag: 1.8, timeOfDay: 14, easing: 'ease-in-out' },
            { id: 'kf-auto-3', t: 1,   center: parsed.coords[parsed.coords.length - 1], pitch: 70, zoom: 13, bearing: 90, terrainExag: 1.8, timeOfDay: 18, easing: 'ease-in-out' }
          ];
          if (window.renderKeyframeStrip) window.renderKeyframeStrip();
        }
        
        if (parsed.waypoints && parsed.waypoints.length > 0) {
          // Use extracted waypoints
          parsed.waypoints.forEach(wp => {
            STUDIO_CONFIG.waypoints.push({
              id: 'gp-' + (window.waypointIdCounter++),
              lngLat: wp.lngLat,
              name: wp.name,
              elevation: null,
              triggers: [],
              endSegment: isPointOnly // break path if it's a point-only file!
            });
          });
        } else {
          // Fallback: auto-generate waypoints from long track
          const step = Math.max(1, Math.floor(parsed.coords.length / 40));
          for (let i = 0; i < parsed.coords.length; i += step) {
            const id = 'gp-' + (window.waypointIdCounter++);
            STUDIO_CONFIG.waypoints.push({
              id,
              lngLat: parsed.coords[i],
              name: i === 0 ? 'Start' : i + step >= parsed.coords.length ? 'End' : 'Point ' + (STUDIO_CONFIG.waypoints.length + 1),
              elevation: null,
              triggers: [],
              endSegment: false
            });
          }
          // Always include the last point as End
          if (STUDIO_CONFIG.waypoints[STUDIO_CONFIG.waypoints.length-1].lngLat !== parsed.coords[parsed.coords.length-1]) {
            const id = 'gp-end';
            STUDIO_CONFIG.waypoints.push({ 
              id, 
              lngLat: parsed.coords[parsed.coords.length-1], 
              name: 'End', 
              elevation: null, 
              triggers: [],
              endSegment: false
            });
          }
        }
      }
      
      if (window.renderWaypointList) window.renderWaypointList();
      
      // Place markers for waypoints
      if (window.placeWaypointMarker) {
        STUDIO_CONFIG.waypoints.forEach(wp => {
          window.placeWaypointMarker(wp);
        });
      }

      // Update UI and map
      updateTrekInfo(parsed);
      window.redrawTrekPath();

      // Fit map to bounds
      const bounds = new mapboxgl.LngLatBounds(parsed.coords[0], parsed.coords[0]);
      for (const coord of parsed.coords) {
        bounds.extend(coord);
      }
      
      state.map.fitBounds(bounds, {
        padding: { top: 80, bottom: 80, left: 360, right: 320 }, // Account for UI panels
        pitch: STUDIO_CONFIG.pitch,
        duration: 1500
      });
    } else {
      alert("No valid track points found in the file.");
    }
  };
  
  reader.readAsText(file);
};
