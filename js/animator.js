import { STUDIO_CONFIG, state } from './store.js';
import { haversineDistance } from './geo.js';
import { Studio, EVENTS } from './event-bus.js';
import { validateForOperation, describeMissingInputs } from './validation.js';
import { sampleCamera } from './camera-sampler.js';

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

/* ────────────────────────────────────────────────────────────
   Time-proportional progress advance (Req 2.4)

   Preview must advance animation progress proportional to elapsed
   REAL time so playback speed is independent of the achieved frame
   rate: progress += dt / durationMs. A single slow frame (long stall
   or tab-switch) would otherwise push the camera a large distance in
   one step, so dt is clamped to MAX_FRAME_DT_MS before it is applied.

   `advanceProgress` is intentionally PURE (no DOM, no map, no globals)
   so it is importable directly in the no-build test runner — this is
   the function Property 8 (task 4.9) exercises.
   ──────────────────────────────────────────────────────────── */

// Largest single-frame delta (ms) honored when advancing progress.
// Anything larger is treated as a stall and clamped to this ceiling.
export const MAX_FRAME_DT_MS = 100;

/**
 * Advance normalized animation progress by elapsed real time.
 * @param {number} progress   current progress in [0, 1]
 * @param {number} dt         elapsed wall-clock time since the last frame, ms
 * @param {number} durationMs total animation duration, ms (> 0)
 * @returns {number} next progress, clamped to [0, 1]
 */
export function advanceProgress(progress, dt, durationMs) {
  // Guard against a missing/degenerate duration: progress cannot advance.
  if (!(durationMs > 0) || !isFinite(durationMs)) {
    return progress < 0 ? 0 : progress > 1 ? 1 : progress;
  }
  // Clamp dt to the stall ceiling and ignore negative/non-finite deltas.
  let clampedDt = dt;
  if (!isFinite(clampedDt) || clampedDt < 0) clampedDt = 0;
  if (clampedDt > MAX_FRAME_DT_MS) clampedDt = MAX_FRAME_DT_MS;

  let next = progress + clampedDt / durationMs;
  if (next > 1) next = 1;
  if (next < 0) next = 0;
  return next;
}

/* ────────────────────────────────────────────────────────────
   Redundant-update suppression (Req 6.6)

   Terrain, fog, and time-of-day style writes are expensive Mapbox
   operations. We only apply them when the underlying value actually
   moved beyond a configured threshold, so identical/within-threshold
   values never trigger a style write (idempotent under unchanged
   configuration). The thresholds live in STUDIO_CONFIG.presets
   .updateThresholds (terrain/fog/timeOfDay) — see store.js.

   `shouldWrite` is intentionally PURE (no DOM, no map, no globals) so
   it is importable directly in the no-build test runner — this is the
   function Property 18 (task 7.5) exercises.
   ──────────────────────────────────────────────────────────── */

/**
 * Decide whether a value change is large enough to warrant a style write.
 * @param {number} oldVal   previously applied value
 * @param {number} newVal   candidate new value
 * @param {number} threshold non-negative suppression threshold
 * @returns {boolean} true iff |newVal - oldVal| > threshold (equal values => false)
 */
export function shouldWrite(oldVal, newVal, threshold) {
  return Math.abs(newVal - oldVal) > threshold;
}

// Math helpers
function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

// Haversine distance (meters) — consolidated into geo.js
function getDistance(p1, p2) {
  return haversineDistance(p1, p2);
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
  
  // Use the canonical camera sampler for Preview/Export parity (Req 2.6, task 4.5).
  // Both the preview RAF loop and the export capture loop now call sampleCamera(t)
  // so the same t value produces the identical camera state in both paths.
  if (config.keyframes && config.keyframes.length > 0) {
    const cam = sampleCamera(t);
    
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
    
    // Only update terrain if terrainExag changed beyond the configured threshold
    const thresholds = config.presets.updateThresholds;
    if (shouldWrite(window._lastTerrainExag, cam.terrainExag, thresholds.terrain)) {
      state.map.setTerrain({ source: 'mapbox-dem', exaggeration: cam.terrainExag });
      window._lastTerrainExag = cam.terrainExag;
    }
    
    // Update Time of Day & Fog
    let envChanged = false;
    
    if (cam.timeOfDay !== undefined && shouldWrite(config.timeOfDay, cam.timeOfDay, thresholds.timeOfDay)) {
      config.timeOfDay = cam.timeOfDay;
      envChanged = true;
      
      const timeSlider = document.getElementById('time-of-day-slider');
      const timeVal = document.getElementById('time-of-day-val');
      if (timeSlider) timeSlider.value = cam.timeOfDay;
      if (timeVal) timeVal.innerText = cam.timeOfDay.toFixed(1);
    }
    
    if (cam.fogDensity !== undefined && shouldWrite(config.fogDensity || 0.2, cam.fogDensity, thresholds.fog)) {
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
  if (window.setStudioBusy) window.setStudioBusy(false);
  
  const stopBtnMap = document.getElementById('btn-stop');
  if (stopBtnMap) stopBtnMap.style.display = 'none';
  
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
  if (!isPreviewing) {
    startPreview();
    return;
  }
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
  const rawDt = timestamp - lastTimestamp;
  lastTimestamp = timestamp;

  const config = STUDIO_CONFIG;
  const durationMs = config.duration * 1000;

  // Clamp dt so a long stall / tab-switch doesn't make the camera jump,
  // then reuse the same clamped value for any dt-driven camera motion.
  const dt = Math.min(Math.max(rawDt, 0), MAX_FRAME_DT_MS);

  // Advance progress proportional to elapsed REAL time so playback speed
  // is independent of the achieved frame rate (Req 2.4).
  animationProgress = advanceProgress(animationProgress, rawDt, durationMs);

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
  // Operation input validation (Req 4.3): refuse to start when required inputs
  // are missing, surfacing exactly which ones via the status bus instead of a
  // blocking alert. Start is permitted iff the missing-input list is empty.
  const missing = validateForOperation('preview', STUDIO_CONFIG);
  if (missing.length > 0) {
    const message = describeMissingInputs('preview', STUDIO_CONFIG);
    Studio.bus.emit(EVENTS.STATUS, { level: 'warn', message });
    if (typeof window !== 'undefined' && typeof window.updateStatus === 'function') {
      window.updateStatus(message);
    }
    return;
  }
  
  isPreviewing = true;
  isPaused = false;
  animationProgress = 0;
  lastTimestamp = performance.now();
  
  if (playPauseBtn) playPauseBtn.innerHTML = '<i class="ti ti-player-pause"></i>';
  if (window.setStudioBusy) window.setStudioBusy(true);
  
  const stopBtnMap = document.getElementById('btn-stop');
  if (stopBtnMap) stopBtnMap.style.display = 'inline-block';
  
  if (window.studioAudioCtx && window.studioAudioBuf) {
    if (window.studioAudioCtx.state === 'suspended') window.studioAudioCtx.resume();
    audioSourceNode = window.studioAudioCtx.createBufferSource();
    audioSourceNode.buffer = window.studioAudioBuf;
    audioSourceNode.connect(window.studioAudioCtx.destination);
    audioSourceNode.start(0);
  }
  
  rafId = requestAnimationFrame(animate);
}

if (previewBtn) previewBtn.addEventListener('click', startPreview);
if (playPauseBtn) playPauseBtn.addEventListener('click', togglePause);
if (stopBtn) stopBtn.addEventListener('click', stopAnimation);

const mapStopBtn = document.getElementById('btn-stop');
if (mapStopBtn) mapStopBtn.addEventListener('click', stopAnimation);

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
  } else if (e.code === 'KeyK') {
    e.preventDefault();
    if (isPreviewing && !isPaused) togglePause();
  } else if (e.code === 'KeyL') {
    e.preventDefault();
    if (!isPreviewing || isPaused) {
      if (!isPreviewing) startPreview();
      else togglePause();
    }
  } else if (e.code === 'KeyJ') {
    e.preventDefault();
    if (isPreviewing && !isPaused) togglePause();
    // Rewind by a larger amount, e.g. 1 second
    const duration = STUDIO_CONFIG.duration || 30;
    window.scrubCameraToTime(animationProgress - (1 / duration));
  }
});
