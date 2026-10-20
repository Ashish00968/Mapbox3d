import { STUDIO_CONFIG, state } from './store.js';
import { Studio } from './event-bus.js';
import { haversineDistance, shortestArcBearing } from './geo.js';

// ── Cinematic Auto-Director Logic ──

export function applyAutoDirector() {
  const path = STUDIO_CONFIG.trekPath;
  if (!path || path.length < 2) {
    Studio.bus.emit('status', { 
      level: 'error', 
      message: 'No trek path loaded. Please upload a GPX/KML file or place waypoints first.' 
    });
    return;
  }

  // Compute cumulative distance along the path to sample evenly
  const pathDistances = [0];
  let totalDistance = 0;
  for (let i = 1; i < path.length; i++) {
    const d = haversineDistance(path[i-1], path[i]);
    totalDistance += d;
    pathDistances.push(totalDistance);
  }

  // Interpolation helper
  const getPointAtT = (t) => {
    const targetDist = t * totalDistance;
    if (targetDist <= 0) return path[0];
    if (targetDist >= totalDistance) return path[path.length - 1];
    for (let i = 1; i < pathDistances.length; i++) {
      if (pathDistances[i] >= targetDist) {
        const prevDist = pathDistances[i-1];
        const segmentDist = pathDistances[i] - prevDist;
        const segmentT = segmentDist > 0 ? (targetDist - prevDist) / segmentDist : 0;
        const p1 = path[i-1];
        const p2 = path[i];
        return [
          p1[0] + (p2[0] - p1[0]) * segmentT,
          p1[1] + (p2[1] - p1[1]) * segmentT
        ];
      }
    }
    return path[path.length - 1];
  };

  // Helper to calculate camera bearing looking ahead
  const getForwardBearing = (t) => {
    const coordNow = getPointAtT(t);
    const lookAheadT = Math.min(1, t + 0.05);
    const coordAhead = getPointAtT(lookAheadT);
    return shortestArcBearing(coordNow, coordAhead);
  };

  // Helper to query elevation with fallback
  const getElevation = (coord) => {
    if (state.map && state.map.queryTerrainElevation) {
      const terrainEle = state.map.queryTerrainElevation(coord, { exaggerated: false });
      if (terrainEle !== null && terrainEle !== undefined) return terrainEle;
    }
    if (coord.length >= 3 && typeof coord[2] === 'number') {
      return coord[2];
    }
    // Fallback to waypoint elevation if close
    if (STUDIO_CONFIG.waypoints.length > 0) {
      let closestWp = null;
      let minDist = Infinity;
      for (const wp of STUDIO_CONFIG.waypoints) {
        if (wp.elevation !== null && wp.elevation !== undefined) {
          const d = haversineDistance(coord, wp.lngLat);
          if (d < minDist) {
            minDist = d;
            closestWp = wp;
          }
        }
      }
      if (closestWp && minDist < 1000) { // within 1km
        return closestWp.elevation;
      }
    }
    return 0;
  };

  // Sample points and build elevation profile
  const numSamples = 40;
  const samples = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const coord = getPointAtT(t);
    const ele = getElevation(coord);
    samples.push({ t, coord, ele });
  }

  // Smooth elevation profile
  const smoothedSamples = [];
  const windowSize = 3;
  for (let i = 0; i < samples.length; i++) {
    let sum = 0;
    let count = 0;
    for (let w = -windowSize; w <= windowSize; w++) {
      const idx = i + w;
      if (idx >= 0 && idx < samples.length) {
        sum += samples[idx].ele;
        count++;
      }
    }
    smoothedSamples.push({
      t: samples[i].t,
      coord: samples[i].coord,
      ele: sum / count
    });
  }

  // Find peaks and climbs/descents
  // We'll place keyframes at regular intervals (e.g. every 0.125 progress = 9 keyframes total)
  // to ensure camera follows path shape closely, but adjust their pitch/zoom based on the terrain
  const keyframeTs = [];
  const step = 0.125;
  for (let t = 0; t <= 1.0; t += step) {
    keyframeTs.push(t);
  }
  // Ensure exactly 1.0 is included at the end
  if (keyframeTs[keyframeTs.length - 1] < 1.0) {
    keyframeTs.push(1.0);
  }

  // Clear existing keyframes
  STUDIO_CONFIG.keyframes = [];
  window.keyframeIdCounter = window.keyframeIdCounter || 0;

  // Generate keyframe properties
  keyframeTs.forEach((t) => {
    const coord = getPointAtT(t);
    
    // Find closest smoothed sample elevation
    let sampleIdx = Math.round(t * numSamples);
    sampleIdx = Math.max(0, Math.min(numSamples, sampleIdx));
    const localEle = smoothedSamples[sampleIdx].ele;

    // Detect if we are climbing, descending, or on a peak
    // Let's look at slope by comparing elevation ahead and behind
    const prevIdx = Math.max(0, sampleIdx - 3);
    const nextIdx = Math.min(numSamples, sampleIdx + 3);
    const eleDiffPrev = localEle - smoothedSamples[prevIdx].ele;
    const eleDiffNext = smoothedSamples[nextIdx].ele - localEle;

    let zoom = 12.5;
    let pitch = 64;
    let typeLabel = "Cruise";

    const isStart = (t === 0);
    const isEnd = (t === 1);

    // Dynamic zoom and pitch selection based on slopes
    if (eleDiffPrev > 25 && eleDiffNext < -25) {
      // Peak: zoom out slightly, higher pitch to see surroundings
      zoom = 12.0;
      pitch = 68;
      typeLabel = "Peak View";
    } else if (eleDiffNext > 15) {
      // Climb: zoom in closer, high pitch to look up slope
      zoom = 13.2;
      pitch = 70;
      typeLabel = "Climb Focus";
    } else if (eleDiffNext < -15) {
      // Descent: zoom out slightly, lower pitch to look down valley
      zoom = 12.3;
      pitch = 58;
      typeLabel = "Descent View";
    }

    if (isStart) {
      zoom = 13.0;
      pitch = 60;
      typeLabel = "Start Point";
    } else if (isEnd) {
      zoom = 12.8;
      pitch = 65;
      typeLabel = "End Point";
    }

    // Dynamic environment (sunrise to sunset golden hours)
    // 9:00 AM -> 5:30 PM (17.5)
    const timeOfDay = 9.0 + 8.5 * t;

    STUDIO_CONFIG.keyframes.push({
      id: 'kf-auto-' + (window.keyframeIdCounter++),
      t,
      center: coord,
      pitch,
      zoom,
      bearing: getForwardBearing(t),
      terrainExag: STUDIO_CONFIG.terrainExaggeration || 1.8,
      timeOfDay,
      fogDensity: STUDIO_CONFIG.fogDensity || 0.2,
      easing: 'ease-in-out',
      label: typeLabel
    });
  });

  // Sort and apply keyframes
  STUDIO_CONFIG.keyframes.sort((a, b) => a.t - b.t);

  // Notify UI and refresh
  if (window.renderTracks) window.renderTracks();
  if (window.scrubCameraToTime) window.scrubCameraToTime(0);

  Studio.bus.emit('status', {
    level: 'info',
    message: `🎬 Auto-Director generated ${STUDIO_CONFIG.keyframes.length} terrain-aware keyframes!`
  });
}

// ── Event Listener Wiring ──
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-auto-director');
  if (btn) {
    btn.onclick = () => {
      if (confirm('This will replace your current camera keyframes with an automated, terrain-aware sequence. Proceed?')) {
        applyAutoDirector();
      }
    };
  }
});
