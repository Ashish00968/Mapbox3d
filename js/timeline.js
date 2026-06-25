import { STUDIO_CONFIG, state } from './store.js';

// ── Timeline strip UI ──
// Horizontal bar showing all segments as color blocks.
// Width of each block proportional to segment duration.
// Each block is draggable-resizable (simplified: just click to select for now).
// Selected segment's properties shown in an edit panel.

STUDIO_CONFIG.timeline = {
  enabled: false,
  segments: [],
  activeSegmentId: 'seg-0',
};

function initTimeline() {
  // Populate with one default segment if empty
  if (STUDIO_CONFIG.timeline.segments.length === 0) {
    const cfg = window.getCameraConfig ? window.getCameraConfig() : {};
    STUDIO_CONFIG.timeline.segments.push({
      id: 'seg-0', label: 'Segment 1',
      pathStart: 0, pathEnd: 1,
      duration: cfg.duration || STUDIO_CONFIG.duration || 30, 
      fps: cfg.fps || STUDIO_CONFIG.fps || 30,
      keyframes: [], speedCurve: null,
    });
  }
  renderTimeline();
}

const SEGMENT_COLORS = ['#4a9eff','#22c55e','#f59e0b','#ef4444','#a855f7','#14b8a6'];

function renderTimeline() {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  const segs      = STUDIO_CONFIG.timeline.segments;
  const totalDur  = segs.reduce((s, sg) => s + sg.duration, 0);
  const activeId  = STUDIO_CONFIG.timeline.activeSegmentId;

  // Segment blocks
  const blocksHtml = segs.map((seg, i) => {
    const pct    = (seg.duration / totalDur * 100).toFixed(1);
    const color  = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
    const active = seg.id === activeId;
    return `
      <div class="tl-segment"
        onclick="selectSegment('${seg.id}')"
        style="
          width: ${pct}%;
          background: ${active ? color : color + '66'};
          border: 1.5px solid ${active ? '#fff' : 'transparent'};
          border-radius: 4px;
          height: 28px;
          cursor: pointer;
          display: flex;
          align-items: center;
          padding: 0 6px;
          overflow: hidden;
          transition: background 0.15s;
          box-sizing: border-box;
        "
        title="${seg.label} (${seg.duration}s)"
      >
        <span style="font-size:10px; color:#fff; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${seg.label}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px">
      <p class="section-label" style="margin:0">Timeline</p>
      <div style="display:flex; gap:4px">
        <button class="btn-ghost" onclick="addSegment()" style="font-size:10px; padding:3px 8px">+ Add</button>
        <button class="btn-ghost" onclick="removeActiveSegment()" style="font-size:10px; padding:3px 8px; color:var(--danger, #ef4444)">Remove</button>
      </div>
    </div>
    <div id="tl-track" style="display:flex; gap:3px; background:var(--bg-panel-section); padding:4px; border-radius:6px; border:1px solid var(--border); min-height:40px">
      ${blocksHtml}
    </div>
    <div id="tl-segment-edit" style="margin-top:8px"></div>
    <div style="margin-top:8px" data-hide-in="editor">
      <label style="display:flex; align-items:center; gap:6px; font-size:11px; color:var(--text-secondary); cursor:pointer">
        <input type="checkbox" id="timeline-enabled" ${STUDIO_CONFIG.timeline.enabled ? 'checked' : ''}>
        Enable multi-segment mode
      </label>
    </div>
  `;

  document.getElementById('timeline-enabled').addEventListener('change', e => {
    STUDIO_CONFIG.timeline.enabled = e.target.checked;
  });

  renderSegmentEdit(activeId);
}

function renderSegmentEdit(segId) {
  const seg = STUDIO_CONFIG.timeline.segments.find(s => s.id === segId);
  const el  = document.getElementById('tl-segment-edit');
  if (!seg || !el) return;

  el.innerHTML = `
    <div style="background:var(--bg-panel-section); border:1px solid var(--border); border-radius:6px; padding:10px">
      <div class="slider-row" style="margin-bottom:8px">
        <span style="min-width:60px;">Label</span>
        <input id="tl-label" type="text" value="${seg.label}" class="select-input" style="flex:1; font-size:11px; padding:4px; background-image:none;">
      </div>
      <div class="slider-row">
        <span style="min-width:60px;">Path start</span>
        <input type="range" id="tl-pstart" min="0" max="100" step="1" value="${seg.pathStart*100}" ${seg.type==='orbit'?'disabled':''}>
        <span id="tl-pstart-val" class="val-out">${(seg.pathStart*100).toFixed(0)}%</span>
      </div>
      <div class="slider-row">
        <span style="min-width:60px;">Path end</span>
        <input type="range" id="tl-pend" min="0" max="100" step="1" value="${seg.pathEnd*100}" ${seg.type==='orbit'?'disabled':''}>
        <span id="tl-pend-val" class="val-out">${(seg.pathEnd*100).toFixed(0)}%</span>
      </div>
      
      ${seg.type === 'orbit' ? `
      <div class="slider-row" style="margin-top:8px">
        <span style="min-width:60px;">Degrees</span>
        <select id="tl-degrees" class="select-input-sm" style="width:70px;">
          <option value="90" ${seg.degrees===90?'selected':''}>90°</option>
          <option value="180" ${seg.degrees===180?'selected':''}>180°</option>
          <option value="360" ${seg.degrees===360?'selected':''}>360°</option>
        </select>
        <span style="min-width:60px; margin-left:12px;">Direction</span>
        <select id="tl-direction" class="select-input-sm" style="width:70px;">
          <option value="1" ${seg.direction===1?'selected':''}>CW</option>
          <option value="-1" ${seg.direction===-1?'selected':''}>CCW</option>
        </select>
      </div>
      ` : ''}
      <div class="slider-row" style="margin-top:8px">
        <span style="min-width:60px;">Duration</span>
        <input id="tl-dur" type="number" class="num-input" value="${seg.duration}" min="1" max="300" style="width:60px;">
        <span style="font-size:12px; color:var(--text-secondary);">sec</span>
      </div>
      <div class="slider-row">
        <span style="min-width:60px;">FPS</span>
        <select id="tl-fps" class="select-input-sm" style="width:60px;">
          ${[24,30,60].map(f => `<option value="${f}" ${f===seg.fps?'selected':''}>${f}</option>`).join('')}
        </select>
      </div>
      <p style="font-size:11px; color:var(--text-secondary); text-align:right; margin:4px 0 0 0;" id="tl-frame-count">
        ${seg.duration * seg.fps} frames
      </p>
    </div>
  `;

  // Wire live updates
  document.getElementById('tl-label').addEventListener('input', e => {
    seg.label = e.target.value; renderTimeline();
  });
  
  const bindRange = (id, valId, prop, scale=1) => {
    document.getElementById(id).addEventListener('input', e => {
      seg[prop] = parseFloat(e.target.value) / scale;
      document.getElementById(valId).textContent = prop.startsWith('path') ? (parseFloat(e.target.value)).toFixed(0)+'%' : e.target.value;
      if (['duration','fps'].includes(prop)) {
        const frames = seg.duration * seg.fps;
        document.getElementById('tl-frame-count').textContent = frames + ' frames';
      }
    });
  };
  
  bindRange('tl-pstart', 'tl-pstart-val', 'pathStart', 100);
  bindRange('tl-pend',   'tl-pend-val',   'pathEnd',   100);
  
  document.getElementById('tl-dur').addEventListener('input', e => {
    seg.duration = parseInt(e.target.value) || 1;
    document.getElementById('tl-frame-count').textContent = seg.duration * seg.fps + ' frames';
    renderTimeline(); // re-render track to update widths
  });
  
  document.getElementById('tl-fps').addEventListener('change', e => {
    seg.fps = parseInt(e.target.value) || 30;
    document.getElementById('tl-frame-count').textContent = seg.duration * seg.fps + ' frames';
  });

  if (seg.type === 'orbit') {
    document.getElementById('tl-degrees').addEventListener('change', e => {
      seg.degrees = parseInt(e.target.value) || 360;
    });
    document.getElementById('tl-direction').addEventListener('change', e => {
      seg.direction = parseInt(e.target.value) || 1;
    });
  }
}

function selectSegment(id) {
  STUDIO_CONFIG.timeline.activeSegmentId = id;
  renderTimeline();
}

function addSegment() {
  const n   = STUDIO_CONFIG.timeline.segments.length + 1;
  const cfg = window.getCameraConfig ? window.getCameraConfig() : {};
  const id  = 'seg-' + Date.now();
  STUDIO_CONFIG.timeline.segments.push({
    id, label: 'Segment ' + n,
    pathStart: 0, pathEnd: 1,
    duration: cfg.duration || STUDIO_CONFIG.duration || 10, 
    fps: cfg.fps || STUDIO_CONFIG.fps || 30,
    keyframes: [], speedCurve: null,
  });
  selectSegment(id);
}

function removeActiveSegment() {
  const segs = STUDIO_CONFIG.timeline.segments;
  if (segs.length <= 1) { alert('Cannot remove the last segment'); return; }
  const id  = STUDIO_CONFIG.timeline.activeSegmentId;
  STUDIO_CONFIG.timeline.segments = segs.filter(s => s.id !== id);
  STUDIO_CONFIG.timeline.activeSegmentId = STUDIO_CONFIG.timeline.segments[0].id;
  renderTimeline();
}

window.selectSegment        = selectSegment;
window.addSegment           = addSegment;
window.removeActiveSegment  = removeActiveSegment;

document.addEventListener('DOMContentLoaded', () => initTimeline());

// ── Exported: total frame count across all segments (for capture progress) ──
window.getTimelineTotalFrames = () =>
  STUDIO_CONFIG.timeline.segments.reduce((s, sg) => s + sg.duration * sg.fps, 0);

// ── Exported: iterate segments for capture.js ──
window.getTimelineSegments = () => STUDIO_CONFIG.timeline.segments;

// ── Audio Waveform Rendering ──
document.addEventListener('audio-loaded', () => {
  const canvas = document.getElementById('audio-waveform-canvas');
  const header = document.getElementById('track-header-audio');
  const lane = document.getElementById('track-lane-audio');
  
  if (!canvas || !header || !lane || !window.studioAudioBuf) return;
  
  header.style.display = 'flex';
  lane.style.display = 'block';
  
  const dpr = window.devicePixelRatio || 1;
  const width = lane.clientWidth;
  const height = lane.clientHeight;
  
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  
  // Use a nice gradient or color
  ctx.fillStyle = '#4a9eff'; // using our primary blue color
  
  const audioBuf = window.studioAudioBuf;
  const data = audioBuf.getChannelData(0);
  
  // The waveform should ideally be scaled to the timeline duration.
  // The timeline container has a fixed width of 2000px which represents the total duration.
  // Actually, we'll just draw the waveform scaled to the current total duration.
  const totalFrames = window.getTimelineTotalFrames();
  const fps = STUDIO_CONFIG.fps || 30;
  const totalDuration = totalFrames / fps;
  
  // Calculate how many audio samples correspond to the total video duration
  const targetSamples = Math.min(data.length, Math.ceil(totalDuration * audioBuf.sampleRate));
  
  const step = Math.ceil(targetSamples / width);
  const amp = height / 2;
  
  for(let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      const startIndex = i * step;
      // If we've passed the audio duration, stop drawing
      if (startIndex >= data.length) break;
      
      for (let j = 0; j < step; j++) {
          const datum = data[startIndex + j]; 
          if (datum !== undefined) {
            if (datum < min) min = datum;
            if (datum > max) max = datum;
          }
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
  }
});
