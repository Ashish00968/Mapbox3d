import { STUDIO_CONFIG, state } from './store.js';
import { Studio, EVENTS } from './event-bus.js';
import { validateForOperation, describeMissingInputs } from './validation.js';
import { awaitTilesOrDegrade } from './tile-await.js';
import { isBlankFrame } from './frame-quality.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — capture.js (Phase 5)
   Frame-exact PNG sequence capture and JSZip bundling
   ════════════════════════════════════════════════════════════ */

/* ════════════════════════════════════════════════════════════
   PURE FRAME PLANNER (Req 1.3, 1.7)
   ────────────────────────────────────────────────────────────
   Computes the EXACT number of frames an export will produce,
   before any rendering happens. It is the single source of truth
   for "planned frame count" so the produced count can be verified
   against it (design ExportReport.plannedFrames === producedFrames).

   Design rules (Req 1.3, 1.7):
     • Each non-orbit segment contributes round(duration × fps).
     • Each orbit contributes round(orbitDuration × fps) using the
       SAME fps as the segment that HOSTS the orbit — never a mix of
       first-segment fps for planning and per-segment fps for the
       actual loop (the legacy off-by-one + fps-mismatch bug).

   This block is PURE: no DOM, no map, no globals. It is exported so
   the property test (task 6.8) can import it in node without running
   a capture.
   ════════════════════════════════════════════════════════════ */

/**
 * Exact frame count for a (duration, fps) pair.
 *
 * Rounded so that floating-point durations/fps still yield an integer
 * frame count, and so the planned count matches the loop's iteration
 * count exactly. Negative/NaN inputs clamp to 0.
 *
 * @param {number} durationSeconds
 * @param {number} fps
 * @returns {number} non-negative integer frame count
 */
export function frameCountFor(durationSeconds, fps) {
  const d = Number(durationSeconds);
  const f = Number(fps);
  if (!Number.isFinite(d) || !Number.isFinite(f) || d <= 0 || f <= 0) return 0;
  return Math.round(d * f);
}

/**
 * Find the index of the segment that hosts a given path position `t`.
 *
 * A segment hosts `t` when `t` falls within its [pathStart, pathEnd]
 * range (inclusive, order-independent). Used to resolve the correct fps
 * for a mid-segment orbit triggered at a waypoint. Falls back to 0 when
 * no segment matches (e.g. the single default segment, or `t` out of any
 * declared range).
 *
 * Pure: depends only on its arguments.
 *
 * @param {Array<{pathStart?:number, pathEnd?:number}>} segments
 * @param {number} t path progress in [0,1]
 * @returns {number} hosting segment index (0 when none match)
 */
export function segmentIndexForT(segments, t) {
  if (!Array.isArray(segments) || segments.length === 0) return 0;
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i] || {};
    const a = Number.isFinite(s.pathStart) ? s.pathStart : 0;
    const b = Number.isFinite(s.pathEnd) ? s.pathEnd : 1;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (t >= lo && t <= hi) return i;
  }
  return 0;
}

/**
 * Pure frame planner — the exact planned frame count for an export.
 *
 * @param {Array<{duration:number, fps:number, type?:string, pathStart?:number, pathEnd?:number}>} segments
 *   The ordered capture segments. Orbit-type timeline segments are counted
 *   like any other segment (round(duration × fps)).
 * @param {{ orbits?: Array<{duration:number, segmentIndex?:number, fps?:number}>, defaultFps?:number }} [options]
 *   `orbits` are mid-segment orbits injected by waypoint triggers. Each uses
 *   the fps of its hosting segment (`segments[segmentIndex].fps`), or an
 *   explicit `fps`, or `defaultFps` as a last resort.
 * @returns {{
 *   perSegment: Array<{index:number, frames:number, fps:number}>,
 *   orbits: Array<{segmentIndex:number, frames:number, fps:number}>,
 *   segmentFrames:number,
 *   orbitFrames:number,
 *   totalFrames:number
 * }}
 */
export function planSegmentFrames(segments, options = {}) {
  const segs = Array.isArray(segments) ? segments : [];
  const defaultFps = Number.isFinite(options.defaultFps) ? options.defaultFps : undefined;

  const perSegment = segs.map((seg, index) => {
    const fps = Number.isFinite(seg && seg.fps) ? seg.fps : defaultFps;
    return { index, frames: frameCountFor(seg && seg.duration, fps), fps };
  });

  const orbitSpecs = Array.isArray(options.orbits) ? options.orbits : [];
  const orbits = orbitSpecs.map((orbit) => {
    const idx = Number.isInteger(orbit && orbit.segmentIndex) ? orbit.segmentIndex : 0;
    const hostFps = (segs[idx] && Number.isFinite(segs[idx].fps)) ? segs[idx].fps : undefined;
    // Hosting-segment fps wins; then an explicit per-orbit fps; then default.
    const fps = Number.isFinite(hostFps) ? hostFps
      : (Number.isFinite(orbit && orbit.fps) ? orbit.fps : defaultFps);
    return { segmentIndex: idx, frames: frameCountFor(orbit && orbit.duration, fps), fps };
  });

  const segmentFrames = perSegment.reduce((sum, s) => sum + s.frames, 0);
  const orbitFrames = orbits.reduce((sum, o) => sum + o.frames, 0);

  return {
    perSegment,
    orbits,
    segmentFrames,
    orbitFrames,
    totalFrames: segmentFrames + orbitFrames
  };
}

/**
 * Collect the mid-segment orbits a capture will inject, resolving each to its
 * hosting segment so the planner can use the correct (hosting) fps.
 *
 * Reads waypoint `orbit-here` triggers and maps each to the segment that
 * contains the waypoint's cached path progress (`wp._t`). Impure only in that
 * it reads `STUDIO_CONFIG.waypoints`; kept out of `planSegmentFrames` so the
 * planner itself stays pure and unit-testable.
 *
 * @param {Array} segments
 * @returns {Array<{duration:number, segmentIndex:number}>}
 */
function collectCaptureOrbits(segments) {
  const orbits = [];
  const wps = STUDIO_CONFIG.waypoints || [];
  wps.forEach((wp) => {
    (wp.triggers || []).forEach((tr) => {
      if (tr.type === 'orbit-here') {
        const t = Number.isFinite(wp._t) ? wp._t : 0;
        orbits.push({
          duration: tr.duration || 8,
          segmentIndex: segmentIndexForT(segments, t)
        });
      }
    });
  });
  return orbits;
}

let isCapturing = false;
let captureCanceled = false;
let originalPixelRatio = (typeof window !== 'undefined') ? window.devicePixelRatio : 1;

async function startCapture() {
  // Operation input validation (Req 4.3): refuse to start when required inputs
  // are missing, surfacing exactly which ones via the status bus instead of a
  // blocking alert. Start is permitted iff the missing-input list is empty.
  const missing = validateForOperation('export', STUDIO_CONFIG);
  if (missing.length > 0) {
    const message = describeMissingInputs('export', STUDIO_CONFIG);
    Studio.bus.emit(EVENTS.STATUS, { level: 'warn', message });
    if (typeof window !== 'undefined' && typeof window.updateStatus === 'function') {
      window.updateStatus(message);
    }
    return;
  }

  isCapturing = true;
  captureCanceled = false;

  // Disable UI
  if (window.setStudioBusy) window.setStudioBusy(true);

  const overlay = document.getElementById('capture-overlay');
  overlay.style.display = 'flex';
  if (window.enableFocusTrap) window.enableFocusTrap('capture-overlay');

  document.getElementById('capture-title').textContent = "Pre-flight Pass";
  document.getElementById('capture-status').textContent = "Caching terrain tiles... (4x speed)";
  document.getElementById('capture-progress-bar').style.width = '0%';
  document.getElementById('ffmpeg-container').style.display = 'none';
  document.getElementById('capture-close-btn').style.display = 'none';
  document.getElementById('capture-cancel-btn').style.display = 'inline-block';

  window.studioAnimator.preparePathData();

  // Override pixel ratio for high-res capture
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: STUDIO_CONFIG.performanceMode ? 1 : STUDIO_CONFIG.pixelRatio,
      configurable: true
    });
    state.map.resize();
  } catch (e) {
    console.warn("Could not override devicePixelRatio:", e);
  }

  // Disable costly layers in performance mode
  if (STUDIO_CONFIG.performanceMode && state.map.getLayer('3d-buildings')) {
    state.map.setLayoutProperty('3d-buildings', 'visibility', 'none');
  }

  // 1. Pre-fly Pass
  // Pre-fly always runs the full path 0->1 to cache everything
  await runPreFlyPass();
  if (captureCanceled) { finishCapture(); return; }

  // Gather segments
  let segments = [];
  if (STUDIO_CONFIG.timeline && STUDIO_CONFIG.timeline.enabled) {
    segments = window.getTimelineSegments();
  } else {
    segments = [{
      pathStart: 0,
      pathEnd: 1,
      duration: STUDIO_CONFIG.duration,
      fps: STUDIO_CONFIG.fps
    }];
  }

  // Force 30fps if performance mode is enabled
  if (STUDIO_CONFIG.performanceMode) {
    segments.forEach(s => s.fps = 30);
  }
  
  // Exact planned frame count from the pure planner (Req 1.3, 1.7). Mid-segment
  // orbits use the fps of the segment that HOSTS them, not the first segment's
  // fps — this is the fix for the legacy fps-mismatch + off-by-one bug.
  const plan = planSegmentFrames(segments, {
    orbits: collectCaptureOrbits(segments),
    defaultFps: STUDIO_CONFIG.performanceMode ? 30 : STUDIO_CONFIG.fps
  });
  const totalFrames = plan.totalFrames;

  // 2. Capture Pass
  document.getElementById('capture-title').textContent = "Capturing Frames";
  
  if (STUDIO_CONFIG.exportMode === 'webcodecs' && window.EncoderAPI?.supported) {
    const canvas = state.map.getCanvas();
    const firstFps = segments[0] ? segments[0].fps : STUDIO_CONFIG.fps;
    await window.EncoderAPI.initEncoder(firstFps, canvas.width, canvas.height, 'avc1.4d0034');
    await runSegmentsCapture(segments, totalFrames);
    await window.EncoderAPI.finalizeAndDownload(firstFps, totalFrames);
  } else {
    await runSegmentsCapture(segments, totalFrames);
  }

  finishCapture();
}

function runPreFlyPass() {
  return new Promise(resolve => {
    let t = 0;
    const speed = 4; // 4x speed
    let lastTime = performance.now();

    function loop(now) {
      if (captureCanceled) return resolve();

      const dt = now - lastTime;
      lastTime = now;

      const durationMs = STUDIO_CONFIG.duration * 1000;
      t += (dt * speed) / durationMs;

      if (t >= 1) {
        t = 1;
        const remappedT = window.remapT ? window.remapT(1) : 1;
        window.studioAnimator.updateCamera(remappedT, dt * speed);
        document.getElementById('capture-progress-bar').style.width = '100%';
        // Wait a tiny bit for final tiles
        setTimeout(resolve, 500);
        return;
      }

      const remappedT = window.remapT ? window.remapT(t) : t;
      window.studioAnimator.updateCamera(remappedT, dt * speed);
      document.getElementById('capture-progress-bar').style.width = `${t * 100}%`;

      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  });
}

function waitRender() {
  return new Promise(resolve => {
    state.map.once('render', resolve);
    state.map.triggerRepaint();
  });
}

// Small helper to yield to the browser main thread
function yieldThread() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function padNumber(num, size) {
  let s = String(num);
  while (s.length < size) s = "0" + s;
  return s;
}

async function runSegmentsCapture(segments, totalFrames) {
  const map = state.map;
  const canvas = map.getCanvas();

  // Use centralized chunk size (Req 6.3, task 7.1)
  const CHUNK_SIZE = STUDIO_CONFIG.presets.pngChunkSize || 500;
  let zip = new JSZip();
  let zipIndex = 1;
  const totalZips = Math.ceil(totalFrames / CHUNK_SIZE);

  // ExportReport accumulates degraded/blank frame indices (Req 1.2, 1.6)
  const exportReport = { degradedFrames: [], blankFrames: [], totalFrames };

  let globalFrame = 0;

  for (const seg of segments) {
    // Exact, rounded frame count — matches the planner (Req 1.3, 1.7).
    const segFrames = frameCountFor(seg.duration, seg.fps);
    const dt = 1000 / seg.fps;

    for (let f = 0; f < segFrames; f++) {
      if (captureCanceled) return;

      const localT = f / Math.max(1, segFrames - 1);
      const pathT = seg.pathStart + (seg.pathEnd - seg.pathStart) * localT;
      const remappedT = window.remapT ? window.remapT(pathT) : pathT;

      STUDIO_CONFIG._captureMode = true;
      if (window.checkWaypointTriggers) window.checkWaypointTriggers(remappedT);

      // Set camera
      window.studioAnimator.updateCamera(remappedT, dt, seg, localT);

      const isWebCodecs = STUDIO_CONFIG.exportMode === 'webcodecs' && window.EncoderAPI?.supported;

      if (window._pendingCaptureOrbit) {
         const orbitConf = window._pendingCaptureOrbit;
         window._pendingCaptureOrbit = null; 
         
         const orbitFrames = frameCountFor(orbitConf.duration, seg.fps);
         const startBearing = state.map.getBearing();
         const orbitZoom = state.map.getZoom();
         const orbitPitch = state.map.getPitch();

         // Off-by-one fix (Req 1.7): iterate `< orbitFrames` so the loop
         // produces EXACTLY orbitFrames frames (legacy `<=` produced one extra).
         for(let ofrm = 0; ofrm < orbitFrames; ofrm++) {
             if (captureCanceled) return;
             const orbitT = ofrm / Math.max(1, orbitFrames);
             const dirMult = orbitConf.direction === 'cw' ? 1 : -1;
             const curBearing = (startBearing + orbitT * orbitConf.degrees * dirMult + 360) % 360;
             
             state.map.jumpTo({ center: orbitConf.center, zoom: orbitZoom, pitch: orbitPitch, bearing: curBearing });
             const orbitReady = await awaitTilesOrDegrade(state.map);
             if (orbitReady.status === 'degraded') exportReport.degradedFrames.push(globalFrame);
             await waitRender();
             await yieldThread();
             
             if (window.compositeOverlays) {
                 window.compositeOverlays(remappedT); 
                 const mapCanvas = map.getCanvas();
                 const ctx2d = mapCanvas.getContext('2d');
                 const overlayEl = document.querySelector('#map-container canvas:last-child');
                 if (overlayEl && ctx2d) ctx2d.drawImage(overlayEl, 0, 0);
             }

             if (isWebCodecs) {
                 const bitmap = await createImageBitmap(canvas);
                 await window.EncoderAPI.encodeFrameRaw(bitmap, seg.fps);
             } else {
                 const dataURL = canvas.toDataURL('image/png');
                 const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
                 const frameName = `frame_${padNumber(globalFrame + 1, 5)}.png`;
                 zip.file(frameName, base64Data, {base64: true});
             }
             // Blank-frame detection (Req 1.6)
             if (isBlankFrame(canvas)) exportReport.blankFrames.push(globalFrame);
             globalFrame++;
             
             const pct = (globalFrame / totalFrames) * 100;
             document.getElementById('capture-progress-bar').style.width = `${pct}%`;
             document.getElementById('capture-status').textContent = `Capturing orbit frame ${globalFrame} / ${totalFrames} (${Math.round(pct)}%)`;
             Studio.bus.emit(EVENTS.EXPORT_PROGRESS, { pct, step: `Orbit frame ${globalFrame}/${totalFrames}` });
             
             if (!isWebCodecs) {
               if (globalFrame % CHUNK_SIZE === 0 || globalFrame === totalFrames) {
                 document.getElementById('capture-status').textContent = `Zipping chunk ${zipIndex} of ${totalZips}...`;
                 await yieldThread();
                 const content = await zip.generateAsync({type:"blob"});
                 const zipName = totalZips > 1 ? `trek_frames_part${zipIndex}.zip` : `trek_frames.zip`;
                 saveAs(content, zipName);
                 zip = new JSZip();
                 zipIndex++;
               }
             }
         }
         
         // Restore path camera position before proceeding to next normal frame
         window.studioAnimator.updateCamera(remappedT, dt, seg, localT);
      }

      // Wait for Mapbox to render the frame (tile-await replaces the old 2500ms fallback)
      const readiness = await awaitTilesOrDegrade(state.map);
      if (readiness.status === 'degraded') exportReport.degradedFrames.push(globalFrame);
      await waitRender();
      
      // Extra yield to ensure DOM and GPU are in sync
      await yieldThread();

      // Composite overlays onto map canvas
      if (window.compositeOverlays) {
        window.compositeOverlays(remappedT);
        const mapCanvas    = map.getCanvas();
        const ctx2d        = mapCanvas.getContext('2d');
        // Look for the overlay canvas we created
        const overlayEl    = document.querySelector('#map-container canvas:last-child');
        if (overlayEl && ctx2d) ctx2d.drawImage(overlayEl, 0, 0);
      }

      if (isWebCodecs) {
        // OPTIMIZATION: Bypass slow toDataURL and use raw ImageBitmap directly
        const bitmap = await createImageBitmap(canvas);
        await window.EncoderAPI.encodeFrameRaw(bitmap, seg.fps);
      } else {
        // Fallback for zip download
        const dataURL = canvas.toDataURL('image/png');
        const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
        const frameName = `frame_${padNumber(globalFrame + 1, 5)}.png`;
        zip.file(frameName, base64Data, {base64: true});
      }

      // Blank-frame detection (Req 1.6)
      if (isBlankFrame(canvas)) exportReport.blankFrames.push(globalFrame);
      globalFrame++;

      // UI Progress + bus event (Req 4.2)
      const pct = (globalFrame / totalFrames) * 100;
      document.getElementById('capture-progress-bar').style.width = `${pct}%`;
      document.getElementById('capture-status').textContent = `Capturing frame ${globalFrame} / ${totalFrames} (${Math.round(pct)}%)`;
      Studio.bus.emit(EVENTS.EXPORT_PROGRESS, { pct, step: `Frame ${globalFrame}/${totalFrames}` });

      // Check chunking
      if (!isWebCodecs) {
        if (globalFrame % CHUNK_SIZE === 0 || globalFrame === totalFrames) {
          document.getElementById('capture-status').textContent = `Zipping chunk ${zipIndex} of ${totalZips}...`;
          
          // Let UI update
          await yieldThread();

          const content = await zip.generateAsync({type:"blob"});
          const zipName = totalZips > 1 ? `trek_frames_part${zipIndex}.zip` : `trek_frames.zip`;
          saveAs(content, zipName);

          // Reset JSZip for next chunk
          zip = new JSZip();
          zipIndex++;
        }
      }
    }
  }

  document.getElementById('capture-status').textContent = "Capture complete!";
  document.getElementById('capture-title').textContent = "Done";
  document.getElementById('capture-cancel-btn').style.display = 'none';
  document.getElementById('capture-close-btn').style.display = 'inline-block';
  document.getElementById('ffmpeg-container').style.display = 'block';

  // Emit export-done with the full report (Req 1.2, 1.6)
  exportReport.producedFrames = globalFrame;
  Studio.bus.emit(EVENTS.EXPORT_DONE, { report: exportReport });
  if (exportReport.degradedFrames.length > 0 || exportReport.blankFrames.length > 0) {
    const msg = `Export complete. ${exportReport.degradedFrames.length} degraded, ${exportReport.blankFrames.length} blank frames detected.`;
    Studio.bus.emit(EVENTS.STATUS, { level: 'warn', message: msg });
  }
  
  // Update FFmpeg command text for the user
  const firstFps = segments[0] ? segments[0].fps : STUDIO_CONFIG.fps;
  if (STUDIO_CONFIG.exportMode === 'webcodecs' && window.EncoderAPI?.supported) {
      document.getElementById('ffmpeg-command').textContent = "MP4 encoded directly in browser.";
  } else if (window.updateFFmpegCommand) {
      window.updateFFmpegCommand();
  } else {
      document.getElementById('ffmpeg-command').textContent = `ffmpeg -framerate ${firstFps} -i frame_%05d.png -c:v libx264 -pix_fmt yuv420p -crf 18 output.mp4`;
  }
}

function finishCapture() {
  isCapturing = false;
  STUDIO_CONFIG._captureMode = false;
  
  // Restore original pixel ratio
  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      value: originalPixelRatio,
      configurable: true
    });
    state.map.resize();
  } catch (e) {}

  // Restore 3d-buildings if disabled
  if (STUDIO_CONFIG.performanceMode && state.map.getLayer('3d-buildings')) {
    state.map.setLayoutProperty('3d-buildings', 'visibility', 'visible');
  }

  // Release encoder resources on cancel so memory returns to baseline (Req 1.8, 1.10)
  if (captureCanceled) {
    if (window.EncoderAPI && typeof window.EncoderAPI.dispose === 'function') {
      window.EncoderAPI.dispose();
    }
    document.getElementById('capture-overlay').style.display = 'none';
    if (window.disableFocusTrap) window.disableFocusTrap();
    if (window.setStudioBusy) window.setStudioBusy(false);
  }
}

// ── Module-level DOM wiring (browser only) ──
// Guarded so the module can be imported in the dev-only node test runner
// (which has no `document`) to exercise the pure planner without running a
// capture. In the browser these bind the capture controls as before.
if (typeof document !== 'undefined') {
  const captureBtn = document.getElementById('capture-btn');
  if (captureBtn) captureBtn.addEventListener('click', startCapture);

  const cancelBtn = document.getElementById('capture-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    captureCanceled = true;
    document.getElementById('capture-status').textContent = "Canceling...";
  });

  const closeBtn = document.getElementById('capture-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', () => {
    document.getElementById('capture-overlay').style.display = 'none';
    if (window.disableFocusTrap) window.disableFocusTrap();
    if (window.setStudioBusy) window.setStudioBusy(false);
  });
}

// Optional, non-breaking registration of the pure planner under the Studio
// namespace so call sites can migrate opportunistically (design "Decoupling
// strategy"). Guarded so the module stays usable as a plain import in node.
if (typeof window !== 'undefined') {
  window.Studio = window.Studio || {};
  window.Studio.capture = window.Studio.capture || {};
  window.Studio.capture.planSegmentFrames = planSegmentFrames;
  window.Studio.capture.frameCountFor = frameCountFor;
  window.Studio.capture.segmentIndexForT = segmentIndexForT;
}
