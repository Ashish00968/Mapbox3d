import { STUDIO_CONFIG, state } from './store.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — animator.js (Phase 4)
   Preview animation using requestAnimationFrame
   ════════════════════════════════════════════════════════════ */

const previewBtn = document.getElementById('preview-btn');
const playPauseBtn = document.getElementById('timeline-play-pause');
const stopBtn = document.getElementById('timeline-stop');
const timeDisplay = document.getElementById('timeline-time-display');

let isPreviewing = false;
let isPaused = false;
let animationProgress = 0; // 0 to 1
let lastTimestamp = 0;
let rafId = null;

let audioSourceNode = null;

// Easing functions
const easings = {
  linear: t => t,
  'ease-in-out': t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  'ease-out': t => t * (2 - t)
};

// Math helpers
function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

// Haversine distance
function getDistance(p1, p2) {
  const R = 6371e3; // metres
  const φ1 = toRad(p1[1]), φ2 = toRad(p2[1]);
  const Δφ = toRad(p2[1] - p1[1]), Δλ = toRad(p2[0] - p1[0]);
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Compute path distances and cumulative distances for constant speed mapping
let pathDistances = [];
let totalDistance = 0;

function preparePathData() {
  const path = STUDIO_CONFIG.trekPath;
  if (!path || path.length < 2) return false;
  
  pathDistances = [0];
  totalDistance = 0;
  for (let i = 1; i < path.length; i++) {
    const d = getDistance(path[i-1], path[i]);
    totalDistance += d;
    pathDistances.push(totalDistance);
  }
  return true;
}

// Get interpolated point at normalized distance t (0 -> 1)
function getPointAtProgress(t) {
  const path = STUDIO_CONFIG.trekPath;
  const targetDist = t * totalDistance;
  
  if (targetDist <= 0) return path[0];
  if (targetDist >= totalDistance) return path[path.length - 1];
  
  // Find segment
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
}
// Bearing between two points
function getBearing(p1, p2) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return toDeg(Math.atan2(dx, dy));
}

window._lastTerrainExag = STUDIO_CONFIG.terrainExaggeration || 1.8;

function updateCamera(t, dt, seg = null, localT = 0) {
  const config = STUDIO_CONFIG;
  
  // If we have keyframes, use them!
  if (window.interpolateCameraAtT && config.keyframes && config.keyframes.length > 0) {
    const cam = window.interpolateCameraAtT(t);
    
    if (config.cameraTarget) {
      cam.bearing = getBearing(cam.center, config.cameraTarget);
    }
    
    state.map.jumpTo({
      center: cam.center,
      bearing: cam.bearing,
      pitch: cam.pitch,
      zoom: cam.zoom
    });
    
    // Update the 3D tracker position if enabled
    if (window.updateTrackerPosition && STUDIO_CONFIG.model && STUDIO_CONFIG.model.enabled) {
      window.updateTrackerPosition(cam.center, cam.bearing);
    }
    
    // Only update terrain if terrainExag changed significantly
    if (Math.abs(cam.terrainExag - window._lastTerrainExag) > 0.05) {
      state.map.setTerrain({ source: 'mapbox-dem', exaggeration: cam.terrainExag });
      window._lastTerrainExag = cam.terrainExag;
    }
    
    // Update Time of Day & Fog
    let envChanged = false;
    
    if (cam.timeOfDay !== undefined && Math.abs(config.timeOfDay - cam.timeOfDay) > 0.1) {
      config.timeOfDay = cam.timeOfDay;
      envChanged = true;
      
      const timeSlider = document.getElementById('time-of-day-slider');
      const timeVal = document.getElementById('time-of-day-val');
      if (timeSlider) timeSlider.value = cam.timeOfDay;
      if (timeVal) timeVal.innerText = cam.timeOfDay.toFixed(1);
    }
    
    if (cam.fogDensity !== undefined && Math.abs((config.fogDensity || 0.2) - cam.fogDensity) > 0.02) {
      config.fogDensity = cam.fogDensity;
      envChanged = true;
      
      const fogSlider = document.getElementById('fog-slider');
      const fogVal = document.getElementById('fog-val');
      if (fogSlider) fogSlider.value = cam.fogDensity;
      if (fogVal) fogVal.innerText = cam.fogDensity.toFixed(2);
    }
    
    if (envChanged && window.applyEnvironment) {
      window.applyEnvironment();
    }
  } else {
    // Fallback if no keyframes exist (just spin in place or do nothing)
    let currentBearing = state.map.getBearing();
    if (config.bearingMode === 'rotate') {
      currentBearing += config.bearingSpeed * (dt / 1000);
      state.map.setBearing(currentBearing);
    }
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateUI() {
  const duration = STUDIO_CONFIG.duration;
  const currentSec = animationProgress * duration;
  timeDisplay.textContent = `${formatTime(currentSec)} / ${formatTime(duration)}`;
  
  if (window.updateTimelinePlayhead) {
    window.updateTimelinePlayhead(animationProgress);
  }
}

function stopAnimation() {
  isPreviewing = false;
  isPaused = false;
  if (rafId) {
    cancelAnimationFrame(rafId);
  }
  if (playPauseBtn) playPauseBtn.innerHTML = '<i class="ti ti-player-play"></i>';
  previewBtn.disabled = false;
  
  // Reset camera to start
  if (STUDIO_CONFIG.keyframes && STUDIO_CONFIG.keyframes.length > 0) {
    animationProgress = 0;
    updateCamera(0, 0);
  }
  
  if (audioSourceNode) {
    try { audioSourceNode.stop(); } catch(e) {}
    audioSourceNode.disconnect();
    audioSourceNode = null;
  }
  if (window.studioAudioCtx && window.studioAudioCtx.state === 'suspended') {
    window.studioAudioCtx.resume();
  }
}

function togglePause() {
  if (!isPreviewing) return;
  isPaused = !isPaused;
  if (playPauseBtn) {
    playPauseBtn.innerHTML = isPaused ? '<i class="ti ti-player-play"></i>' : '<i class="ti ti-player-pause"></i>';
  }
  if (!isPaused) {
    lastTimestamp = performance.now();
    rafId = requestAnimationFrame(animate);
    if (window.studioAudioCtx && window.studioAudioCtx.state === 'suspended') {
      window.studioAudioCtx.resume();
    }
  } else {
    if (window.studioAudioCtx && window.studioAudioCtx.state === 'running') {
      window.studioAudioCtx.suspend();
    }
  }
}

function animate(timestamp) {
  if (!isPreviewing) return;
  if (isPaused) return; 
  
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  
  const config = STUDIO_CONFIG;
  let durationMs = config.duration * 1000;
  
  animationProgress += dt / durationMs;
  
  if (animationProgress >= 1) {
    animationProgress = 1;
    updateCamera(1, dt);
    updateUI();
    
    // Auto-stop at end
    setTimeout(stopAnimation, 100);
    return;
  }
  
  const remappedT = window.remapT ? window.remapT(animationProgress) : animationProgress;
  updateCamera(remappedT, dt);
  updateUI();
  
  rafId = requestAnimationFrame(animate);
}

function startPreview() {
  if (!STUDIO_CONFIG.keyframes || STUDIO_CONFIG.keyframes.length < 2) {
    alert("Please add at least 2 Keyframes to preview an animation.");
    return;
  }
  
  isPreviewing = true;
  isPaused = false;
  animationProgress = 0;
  lastTimestamp = performance.now();
  
  if (playPauseBtn) playPauseBtn.innerHTML = '<i class="ti ti-player-pause"></i>';
  previewBtn.disabled = true;
  
  if (window.studioAudioCtx && window.studioAudioBuf) {
    if (window.studioAudioCtx.state === 'suspended') window.studioAudioCtx.resume();
    audioSourceNode = window.studioAudioCtx.createBufferSource();
    audioSourceNode.buffer = window.studioAudioBuf;
    audioSourceNode.connect(window.studioAudioCtx.destination);
    audioSourceNode.start(0);
  }
  
  rafId = requestAnimationFrame(animate);
}

previewBtn.addEventListener('click', startPreview);
playPauseBtn.addEventListener('click', togglePause);
stopBtn.addEventListener('click', stopAnimation);

// Export for capture.js and storyboard
window.studioAnimator = {
  updateCamera,
  getProgress: () => animationProgress,
  setProgress: (p) => { animationProgress = p; updateUI(); },
  easings
};

window.scrubCameraToTime = function(progress) {
  animationProgress = Math.max(0, Math.min(1, progress));
  const remappedT = window.remapT ? window.remapT(animationProgress) : animationProgress;
  updateCamera(remappedT, 0);
  updateUI();
};

// ── Keyboard Shortcuts ──
document.addEventListener('keydown', (e) => {
  // Prevent firing if user is typing in an input or textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  if (e.code === 'Space') {
    e.preventDefault(); // prevent page scroll
    if (isPreviewing && !isPaused) {
      togglePause();
    } else if (isPreviewing && isPaused) {
      togglePause();
    } else {
      startPreview();
    }
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    if (isPreviewing && !isPaused) togglePause();
    // Scrub forward ~1 frame (assuming 30fps and default duration)
    const fps = STUDIO_CONFIG.fps || 30;
    const totalFrames = (STUDIO_CONFIG.duration || 30) * fps;
    window.scrubCameraToTime(animationProgress + (1 / totalFrames));
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    if (isPreviewing && !isPaused) togglePause();
    // Scrub backward ~1 frame
    const fps = STUDIO_CONFIG.fps || 30;
    const totalFrames = (STUDIO_CONFIG.duration || 30) * fps;
    window.scrubCameraToTime(animationProgress - (1 / totalFrames));
  }
});
