import { STUDIO_CONFIG, state } from './store.js';

// ── Overlay canvas — sits exactly over the Mapbox WebGL canvas ──
// Uses position:absolute, pointer-events:none so it never blocks map interaction.
// In capture mode, compositor blits this onto the map canvas before toDataURL().

let overlayCanvas, overlayCtx;

function initOverlayCanvas() {
  overlayCanvas = document.createElement('canvas');
  overlayCanvas.style.cssText = [
    'position: absolute',
    'top: 0', 'left: 0',
    'width: 100%', 'height: 100%',
    'pointer-events: none',
    'z-index: 5',
  ].join(';');
  document.getElementById('map-wrap').appendChild(overlayCanvas);

  // Match canvas pixel dimensions to the Mapbox canvas
  function syncSize() {
    if (!state.map) return;
    const mapCanvas = state.map.getCanvas();
    if (!mapCanvas) return;
    overlayCanvas.width  = mapCanvas.width;
    overlayCanvas.height = mapCanvas.height;
  }
  syncSize();
  if (state.map) {
      state.map.on('resize', syncSize);
      // Wait for style load or idle to ensure canvas is sized
      state.map.on('idle', syncSize);
  }

  overlayCtx = overlayCanvas.getContext('2d');
}

// ── Overlay config ──
STUDIO_CONFIG.overlays = {
  title:     { enabled: false, text: 'Trek Name', subtitle: 'Region · Elevation', fadeInT: 0, fadeOutT: 0.15 },
  progress:  { enabled: false, color: '#4a9eff', height: 4, position: 'bottom' },
  compass:   { enabled: false, size: 60, position: 'top-right' },
  elevation: { enabled: false, values: [] },  // populated from GPX ele tags
  distance:  { enabled: false, totalKm: 0 },
  vignette:  { enabled: false },
  letterbox: { enabled: false, ratio: 2.35 },
  tiltShift: { enabled: false },
};

// ── Master compositor — called once per frame during capture ──
// t = current progress [0,1] through the trek
function compositeOverlays(t) {
  if (!overlayCtx || !overlayCanvas) return;
  const ctx = overlayCtx;
  const W   = overlayCanvas.width;
  const H   = overlayCanvas.height;
  const ov  = STUDIO_CONFIG.overlays;
  const dpr = window.devicePixelRatio || 1;

  ctx.clearRect(0, 0, W, H);
  
  if (!ov.title.enabled && !ov.progress.enabled && !ov.compass.enabled && !ov.distance.enabled && !ov.vignette.enabled && !ov.letterbox.enabled) {
      return;
  }

  ctx.save();

  // ── Title card ──
  if (ov.title.enabled) {
    const fadeIn  = Math.min(1, t / Math.max(ov.title.fadeInT,  0.001));
    const fadeOut = t > (1 - ov.title.fadeOutT)
      ? 1 - (t - (1 - ov.title.fadeOutT)) / Math.max(ov.title.fadeOutT, 0.001)
      : 1;
    const alpha = Math.min(fadeIn, fadeOut);

    if (alpha > 0) {
        // Caching optimization for text rendering
        if (!window._titleCacheCanvas || window._titleCacheDirty || window._titleCacheW !== W || window._titleCacheH !== H) {
            window._titleCacheCanvas = document.createElement('canvas');
            window._titleCacheCanvas.width = W;
            window._titleCacheCanvas.height = H;
            const cctx = window._titleCacheCanvas.getContext('2d');
            
            const grad = cctx.createLinearGradient(0, H * 0.62, 0, H);
            grad.addColorStop(0, 'rgba(0,0,0,0)');
            grad.addColorStop(1, 'rgba(0,0,0,0.85)');
            cctx.fillStyle = grad;
            cctx.fillRect(0, H * 0.62, W, H * 0.38);

            cctx.fillStyle = ov.title.color || '#ffffff';
            cctx.font      = `600 ${Math.round((ov.title.size || 48) * dpr)}px 'Inter', -apple-system, sans-serif`;
            cctx.fillText(ov.title.text, 48 * dpr, H - 70 * dpr);
            
            cctx.globalAlpha = 0.7;
            cctx.font        = `400 ${Math.round((ov.title.size || 48) * 0.5 * dpr)}px 'Inter', -apple-system, sans-serif`;
            cctx.fillText(ov.title.subtitle, 48 * dpr, H - 40 * dpr);
            
            window._titleCacheDirty = false;
            window._titleCacheW = W;
            window._titleCacheH = H;
        }
        
        ctx.globalAlpha = alpha;
        ctx.drawImage(window._titleCacheCanvas, 0, 0);
        ctx.globalAlpha = 1;
    }
  }

  // ── Progress bar ──
  if (ov.progress.enabled) {
    const barH = ov.progress.height * dpr;
    const y    = ov.progress.position === 'bottom' ? H - barH : 0;
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, y, W, barH);
    ctx.fillStyle = ov.progress.color;
    ctx.fillRect(0, y, W * t, barH);
  }

  // ── Compass rose ──
  if (ov.compass.enabled && state.map) {
    const sz      = ov.compass.size * dpr;
    const bearing = state.map.getBearing();
    const pad     = 24 * dpr;

    let cx, cy;
    switch (ov.compass.position) {
      case 'top-left':     cx = pad + sz/2; cy = pad + sz/2; break;
      case 'bottom-right': cx = W - pad - sz/2; cy = H - pad - sz/2; break;
      default:             cx = W - pad - sz/2; cy = pad + sz/2; break; // top-right
    }

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((-bearing * Math.PI) / 180);

    // Outer ring
    ctx.beginPath();
    ctx.arc(0, 0, sz/2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth   = 1.5 * dpr;
    ctx.stroke();

    // North arrow (red)
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(0, -sz * 0.38);
    ctx.lineTo(-sz * 0.08, 0);
    ctx.lineTo(sz * 0.08, 0);
    ctx.closePath();
    ctx.fill();

    // South arrow (white)
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(0, sz * 0.38);
    ctx.lineTo(-sz * 0.08, 0);
    ctx.lineTo(sz * 0.08, 0);
    ctx.closePath();
    ctx.fill();

    // N label
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(11 * dpr)}px 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, cy - sz * 0.48);
    ctx.textAlign = 'left';
  }

  // ── Distance counter ──
  if (ov.distance.enabled && ov.distance.totalKm > 0) {
    const elapsed = (t * ov.distance.totalKm).toFixed(1);
    const pad     = 24 * dpr;
    ctx.fillStyle  = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(pad, pad, 110 * dpr, 40 * dpr, 8 * dpr);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font      = `700 ${Math.round(20 * dpr)}px 'Inter', -apple-system, sans-serif`;
    ctx.fillText(elapsed + ' km', pad + 14 * dpr, pad + 28 * dpr);
  }

  // ── Vignette ──
  if (ov.vignette.enabled) {
    const grad = ctx.createRadialGradient(W/2, H/2, Math.max(W, H) * 0.2, W/2, H/2, Math.max(W, H) * 0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ── Cinematic Letterboxing ──
  if (ov.letterbox.enabled && ov.letterbox.ratio) {
    const targetRatio = ov.letterbox.ratio;
    const currentRatio = W / H;
    
    ctx.fillStyle = '#000000';
    if (currentRatio < targetRatio) {
      // Screen is too tall, add horizontal bars (top & bottom)
      const targetHeight = W / targetRatio;
      const barHeight = (H - targetHeight) / 2;
      ctx.fillRect(0, 0, W, barHeight);
      ctx.fillRect(0, H - barHeight, W, barHeight);
    } else {
      // Screen is too wide, add vertical bars (sides)
      const targetWidth = H * targetRatio;
      const barWidth = (W - targetWidth) / 2;
      ctx.fillRect(0, 0, barWidth, H);
      ctx.fillRect(W - barWidth, 0, barWidth, H);
    }
  }

  ctx.restore();
}
window.compositeOverlays = compositeOverlays;

// ── Preview overlay — drawn on every rAF frame (not just captures) ──
function drawPreviewOverlay(t) {
  compositeOverlays(t);
}
window.drawPreviewOverlay = drawPreviewOverlay;

// ── Overlay settings UI ──
function buildOverlayUI() {
  const container = document.getElementById('overlay-settings');
  if (!container) return;
  const ov = STUDIO_CONFIG.overlays;

  container.innerHTML = `
    <p class="section-label" style="margin-bottom:8px;">Overlays</p>

    <!-- Title card -->
    <div style="margin-bottom:12px; padding:12px; background:var(--bg-panel-section);
                border-radius:6px; border:1px solid var(--border)">
      <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; font-weight:500; cursor:pointer;">
        <input type="checkbox" id="ov-title-enabled"> Title Card
      </label>
      <input id="ov-title-text" type="text" class="select-input" value="${ov.title.text}"
        placeholder="Trek name" style="width:100%; margin-bottom:6px; cursor:text; background-image:none;">
      <input id="ov-title-sub" type="text" class="select-input" value="${ov.title.subtitle}"
        placeholder="Subtitle" style="width:100%; cursor:text; background-image:none;">
    </div>

    <!-- Progress bar -->
    <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer;">
      <input type="checkbox" id="ov-progress-enabled"> Progress bar
    </label>

    <!-- Compass -->
    <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer;">
      <input type="checkbox" id="ov-compass-enabled"> Compass rose
    </label>

    <!-- Distance counter -->
    <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer;">
      <input type="checkbox" id="ov-distance-enabled"> Distance counter
    </label>

    <div style="border-top:1px solid var(--border); margin:12px 0;"></div>
    <p class="section-label" style="margin-bottom:8px;">Cinematic Effects</p>

    <!-- Vignette -->
    <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer;">
      <input type="checkbox" id="ov-vignette-enabled"> Vignette
    </label>

    <!-- Letterbox -->
    <label style="display:flex; align-items:center; gap:6px; margin-bottom:8px; cursor:pointer;">
      <input type="checkbox" id="ov-letterbox-enabled"> Widescreen Mattes (2.35:1)
    </label>

    <!-- Tilt-Shift -->
    <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
      <input type="checkbox" id="ov-tiltshift-enabled"> Tilt-Shift Depth of Field
    </label>
  `;

  // Wire checkboxes
  const wire = (id, prop, subProp) => {
    document.getElementById(id).addEventListener('change', e => {
      STUDIO_CONFIG.overlays[prop][subProp] = e.target.checked;
      
      // Special handling for tilt-shift CSS class
      if (prop === 'tiltShift') {
        if (e.target.checked) overlayCanvas.classList.add('tilt-shift');
        else overlayCanvas.classList.remove('tilt-shift');
      }

      drawPreviewOverlay(window.studioAnimator && window.studioAnimator.getProgress ? window.studioAnimator.getProgress() : 0);
    });
    document.getElementById(id).checked = STUDIO_CONFIG.overlays[prop][subProp];
  };
  wire('ov-title-enabled',    'title',    'enabled');
  wire('ov-progress-enabled', 'progress', 'enabled');
  wire('ov-compass-enabled',  'compass',  'enabled');
  wire('ov-distance-enabled', 'distance', 'enabled');
  wire('ov-vignette-enabled', 'vignette', 'enabled');
  wire('ov-letterbox-enabled', 'letterbox', 'enabled');
  wire('ov-tiltshift-enabled', 'tiltShift', 'enabled');

  document.getElementById('ov-title-text').addEventListener('input', e => {
    STUDIO_CONFIG.overlays.title.text = e.target.value;
    window._titleCacheDirty = true;
    drawPreviewOverlay(window.studioAnimator && window.studioAnimator.getProgress ? window.studioAnimator.getProgress() : 0);
  });
  document.getElementById('ov-title-sub').addEventListener('input', e => {
    STUDIO_CONFIG.overlays.title.subtitle = e.target.value;
    window._titleCacheDirty = true;
    drawPreviewOverlay(window.studioAnimator && window.studioAnimator.getProgress ? window.studioAnimator.getProgress() : 0);
  });
}

// ── Populate totalKm when trek loads (hook into existing trek load event) ──
document.addEventListener('trek-loaded', e => {
  STUDIO_CONFIG.overlays.distance.totalKm = e.detail?.distanceKm || 0;
});

// Since the map might already be loaded, check
if (state.map && state.map.isStyleLoaded()) {
    initOverlayCanvas();
    buildOverlayUI();
} else {
    // Wait for map
    const interval = setInterval(() => {
        if (state.map && state.map.isStyleLoaded()) {
            clearInterval(interval);
            initOverlayCanvas();
            buildOverlayUI();
        }
    }, 100);
}
