import { STUDIO_CONFIG, state } from './store.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — capture.js (Phase 5)
   Frame-exact PNG sequence capture and JSZip bundling
   ════════════════════════════════════════════════════════════ */

let isCapturing = false;
let captureCanceled = false;
let originalPixelRatio = window.devicePixelRatio;

async function startCapture() {
  if (!STUDIO_CONFIG.trekPath || STUDIO_CONFIG.trekPath.length < 2) {
    alert("Please load a trek path first.");
    return;
  }

  isCapturing = true;
  captureCanceled = false;

  // Disable UI
  document.getElementById('capture-btn').disabled = true;
  document.getElementById('preview-btn').disabled = true;

  const overlay = document.getElementById('capture-overlay');
  overlay.style.display = 'flex';

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
      value: STUDIO_CONFIG.pixelRatio,
      configurable: true
    });
    state.map.resize();
  } catch (e) {
    console.warn("Could not override devicePixelRatio:", e);
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
  
  let extraOrbitFrames = 0;
  if (STUDIO_CONFIG.waypoints) {
      STUDIO_CONFIG.waypoints.forEach(wp => {
         if (wp.triggers) {
             wp.triggers.forEach(tr => {
                 if (tr.type === 'orbit-here') {
                     const firstFps = segments[0] ? segments[0].fps : STUDIO_CONFIG.fps;
                     extraOrbitFrames += (tr.duration || 8) * firstFps;
                 }
             });
         }
      });
  }

  const totalFrames = segments.reduce((sum, seg) => sum + seg.duration * seg.fps, 0) + extraOrbitFrames;

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

function waitTilesLoaded() {
  return new Promise(resolve => {
    if (state.map.areTilesLoaded()) {
      resolve();
      return;
    }
    
    let to;
    const check = () => {
      if (state.map.areTilesLoaded()) {
        state.map.off('sourcedata', check);
        clearTimeout(to);
        resolve();
      }
    };
    state.map.on('sourcedata', check);
    
    // Safety fallback
    to = setTimeout(() => {
      state.map.off('sourcedata', check);
      resolve();
    }, 2500);
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

  const CHUNK_SIZE = 500;
  let zip = new JSZip();
  let zipIndex = 1;
  const totalZips = Math.ceil(totalFrames / CHUNK_SIZE);

  let globalFrame = 0;

  for (const seg of segments) {
    const segFrames = seg.duration * seg.fps;
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
         
         const orbitFrames = orbitConf.duration * seg.fps;
         const startBearing = state.map.getBearing();
         const orbitZoom = state.map.getZoom();
         const orbitPitch = state.map.getPitch();

         for(let ofrm = 0; ofrm <= orbitFrames; ofrm++) {
             if (captureCanceled) return;
             const orbitT = ofrm / Math.max(1, orbitFrames);
             const dirMult = orbitConf.direction === 'cw' ? 1 : -1;
             const curBearing = (startBearing + orbitT * orbitConf.degrees * dirMult + 360) % 360;
             
             state.map.jumpTo({ center: orbitConf.center, zoom: orbitZoom, pitch: orbitPitch, bearing: curBearing });
             await waitTilesLoaded();
             await waitRender();
             await yieldThread();
             
             if (window.compositeOverlays) {
                 window.compositeOverlays(remappedT); 
                 const mapCanvas = map.getCanvas();
                 const ctx2d = mapCanvas.getContext('2d');
                 const overlayEl = document.querySelector('#map-wrap canvas:last-child');
                 if (overlayEl && ctx2d) ctx2d.drawImage(overlayEl, 0, 0);
             }

             if (isWebCodecs) {
                 const bitmap = await createImageBitmap(canvas);
                 await window.EncoderAPI.encodeFrameRaw(bitmap, seg.fps);
             } else {
                 const dataURL = canvas.toDataURL('image/png');
                 const base64Data = dataURL.replace(/^data:image\\/png;base64,/, "");
                 const frameName = `frame_${padNumber(globalFrame + 1, 5)}.png`;
                 zip.file(frameName, base64Data, {base64: true});
             }
             globalFrame++;
             
             const pct = (globalFrame / totalFrames) * 100;
             document.getElementById('capture-progress-bar').style.width = `${pct}%`;
             document.getElementById('capture-status').textContent = `Capturing orbit frame ${globalFrame} / ${totalFrames} (${Math.round(pct)}%)`;
             
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

      // Wait for Mapbox to render the frame
      await waitTilesLoaded();
      await waitRender();
      
      // Extra yield to ensure DOM and GPU are in sync
      await yieldThread();

      // Composite overlays onto map canvas
      if (window.compositeOverlays) {
        window.compositeOverlays(remappedT);
        const mapCanvas    = map.getCanvas();
        const ctx2d        = mapCanvas.getContext('2d');
        // Look for the overlay canvas we created
        const overlayEl    = document.querySelector('#map-wrap canvas:last-child');
        if (overlayEl && ctx2d) ctx2d.drawImage(overlayEl, 0, 0);
      }

      const isWebCodecs = STUDIO_CONFIG.exportMode === 'webcodecs' && window.EncoderAPI?.supported;

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

      globalFrame++;

      // UI Progress
      const pct = (globalFrame / totalFrames) * 100;
      document.getElementById('capture-progress-bar').style.width = `${pct}%`;
      document.getElementById('capture-status').textContent = `Capturing frame ${globalFrame} / ${totalFrames} (${Math.round(pct)}%)`;

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

  if (captureCanceled) {
    document.getElementById('capture-overlay').style.display = 'none';
    document.getElementById('capture-btn').disabled = false;
    document.getElementById('preview-btn').disabled = false;
  }
}

document.getElementById('capture-btn').addEventListener('click', startCapture);

document.getElementById('capture-cancel-btn').addEventListener('click', () => {
  captureCanceled = true;
  document.getElementById('capture-status').textContent = "Canceling...";
});

document.getElementById('capture-close-btn').addEventListener('click', () => {
  document.getElementById('capture-overlay').style.display = 'none';
  document.getElementById('capture-btn').disabled = false;
  document.getElementById('preview-btn').disabled = false;
});
