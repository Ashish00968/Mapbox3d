import { STUDIO_CONFIG, state } from './store.js';

// ── Aspect Ratio Engine (Phase 12) ──
// Manages map container dimensions without requiring a page reload.

STUDIO_CONFIG.aspectRatio = '16:9'; // Default

const RATIOS = {
  '16:9':   { width: 1920, height: 1080, css: '16 / 9' },
  '9:16':   { width: 1080, height: 1920, css: '9 / 16' },
  '4:3':    { width: 1440, height: 1080, css: '4 / 3' },
  '1:1':    { width: 1080, height: 1080, css: '1 / 1' },
  '2.39:1': { width: 2581, height: 1080, css: '2.39 / 1' }
};

function applyAspectRatio(ratioStr) {
  if (!RATIOS[ratioStr]) return;
  STUDIO_CONFIG.aspectRatio = ratioStr;
  
  const mapWrap = document.getElementById('map-wrap');
  const mapEl = document.getElementById('map');
  const ratioData = RATIOS[ratioStr];

  // Set aspect ratio on the map element
  mapEl.style.aspectRatio = ratioData.css;

  // Center the map element if it doesn't fill the wrap (e.g. 9:16)
  mapWrap.style.display = 'flex';
  mapWrap.style.justifyContent = 'center';
  mapWrap.style.alignItems = 'center';
  mapWrap.style.background = '#000'; // black letterboxing

  // Handle portrait specifically to constrain height and narrow width
  if (ratioData.width < ratioData.height) {
    mapEl.style.height = '100%';
    mapEl.style.width = 'auto';
  } else {
    mapEl.style.width = '100%';
    mapEl.style.height = 'auto';
  }

  // Trigger map resize so WebGL canvas updates
  if (state.map) {
    state.map.resize();
  }
  
  updateDimensionReadout();
  updateFFmpegCommand();
}

function updateDimensionReadout() {
  const el = document.getElementById('ar-dimension-readout');
  if (!el) return;
  const ratio = RATIOS[STUDIO_CONFIG.aspectRatio];
  const mult = STUDIO_CONFIG.pixelRatio || window.devicePixelRatio;
  const w = Math.round(ratio.width * mult);
  const h = Math.round(ratio.height * mult);
  el.textContent = `${w} × ${h}px`;
}

function updateFFmpegCommand() {
  const el = document.getElementById('ffmpeg-command');
  if (!el || STUDIO_CONFIG.exportMode === 'webcodecs') return;
  
  const ratio = RATIOS[STUDIO_CONFIG.aspectRatio];
  const mult = STUDIO_CONFIG.pixelRatio || window.devicePixelRatio;
  const w = Math.round(ratio.width * mult);
  // Ensure even height/width for h264
  const h = Math.round(ratio.height * mult) + (Math.round(ratio.height * mult) % 2);
  const trueW = w + (w % 2);

  const fps = window.getTimelineSegments ? (window.getTimelineSegments()[0]?.fps || 30) : 30;
  
  el.textContent = `ffmpeg -framerate ${fps} -i frame_%05d.png -s ${trueW}x${h} -c:v libx264 -pix_fmt yuv420p -crf 18 output.mp4`;
}

function buildAspectRatioUI() {
  const container = document.getElementById('aspect-ratio-container');
  if (!container) return;

  container.innerHTML = `
    <div class="slider-row" style="margin-bottom:6px">
      <span style="min-width:70px;">Aspect</span>
      <select id="ar-select" class="select-input" style="flex:1;">
        <option value="16:9">16:9 (Landscape)</option>
        <option value="9:16">9:16 (Portrait)</option>
        <option value="4:3">4:3 (Standard)</option>
        <option value="1:1">1:1 (Square)</option>
        <option value="2.39:1">2.39:1 (Cinemascope)</option>
      </select>
    </div>
    <div class="slider-row" style="margin-top:0">
      <span style="min-width:70px;">Size</span>
      <span id="ar-dimension-readout" style="color:var(--text-primary); font-size:12px; font-variant-numeric:tabular-nums;"></span>
    </div>
  `;

  const sel = document.getElementById('ar-select');
  sel.value = STUDIO_CONFIG.aspectRatio;
  sel.addEventListener('change', e => {
    applyAspectRatio(e.target.value);
  });

  applyAspectRatio(STUDIO_CONFIG.aspectRatio);
}

document.addEventListener('DOMContentLoaded', () => {
  buildAspectRatioUI();
  // Update on pixel ratio change (requires reload usually, but good for initial load)
  updateDimensionReadout();
});

window.applyAspectRatio = applyAspectRatio;
window.getOutputResolution = () => {
  const ratio = RATIOS[STUDIO_CONFIG.aspectRatio];
  const mult = STUDIO_CONFIG.pixelRatio || window.devicePixelRatio;
  return { w: Math.round(ratio.width * mult), h: Math.round(ratio.height * mult) };
};
