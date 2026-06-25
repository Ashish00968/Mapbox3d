import { STUDIO_CONFIG, state } from './store.js';

/* ════════════════════════════════════════════════════════════
   MAPBOX VIDEO STUDIO — timeline-editor.js
   Video-editor style timeline for scrub and keyframes
   ════════════════════════════════════════════════════════════ */

const container = document.getElementById('timeline-tracks-area');
const scrollContent = document.getElementById('timeline-scroll-content');
const rulerCanvas = document.getElementById('ruler-canvas');
const playhead = document.getElementById('timeline-playhead');
const playheadHandle = document.getElementById('playhead-handle');
const timeDisplay = document.getElementById('timeline-time-display');
const trackPos = document.getElementById('track-lane-position');

let isScrubbing = false;
let duration = STUDIO_CONFIG.duration || 30;
let currentTime = 0;
const pixelsPerSecond = 100; // zoom level essentially

function initTimeline() {
  if (!container) return;

  // Set total width
  const totalWidth = duration * pixelsPerSecond;
  scrollContent.style.width = `${totalWidth}px`;

  renderRuler(totalWidth);
  renderTracks();

  // Playhead dragging
  playheadHandle.addEventListener('mousedown', onScrubStart);
  container.addEventListener('mousedown', onTimelineClick);
}

function renderRuler(width) {
  if (!rulerCanvas) return;
  // Make canvas crisp
  const dpr = window.devicePixelRatio || 1;
  rulerCanvas.width = width * dpr;
  rulerCanvas.height = 30 * dpr;
  const ctx = rulerCanvas.getContext('2d');
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, 30);
  ctx.fillStyle = '#64748B'; // Muted grey for text
  ctx.font = '10px "Inter", sans-serif';
  ctx.textAlign = 'center';

  for (let s = 0; s <= duration; s++) {
    const x = s * pixelsPerSecond;
    // Major tick every 5 seconds, minor every 1 second
    if (s % 5 === 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.fillRect(x - 0.5, 18, 1, 12);
      ctx.fillStyle = '#94A3B8';
      ctx.fillText(`${s}s`, x, 12);
    } else {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(x - 0.5, 24, 1, 6);
    }
  }
}

function renderTracks() {
  if (!trackPos) return;
  trackPos.innerHTML = '';
  
  const kfs = STUDIO_CONFIG.keyframes || [];

  kfs.forEach((kf, i) => {
    // kf.t is normalized 0 -> 1
    const t = kf.t * duration;
    const x = t * pixelsPerSecond;

    const el = document.createElement('div');
    el.className = 'keyframe-diamond';
    el.style.left = `${x}px`;
    
    // Custom tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'keyframe-tooltip';
    tooltip.innerHTML = `<div class="keyframe-tooltip-inner">
      <span style="color:var(--text-muted); font-size:9px">${t.toFixed(1)}s</span>
      <span>Keyframe</span>
    </div>`;
    el.appendChild(tooltip);
    
    // Clicking a keyframe jumps to it
    el.onclick = (e) => {
      e.stopPropagation();
      setPlayheadTime(t);
      if (window.scrubCameraToTime) window.scrubCameraToTime(kf.t);
    };

    trackPos.appendChild(el);
  });
}
window.renderTracks = renderTracks;

// ── Scrubbing Logic ──

function onScrubStart(e) {
  isScrubbing = true;
  document.addEventListener('mousemove', onScrubMove);
  document.addEventListener('mouseup', onScrubEnd);
}

function onScrubMove(e) {
  if (!isScrubbing) return;
  const rect = scrollContent.getBoundingClientRect();
  let x = e.clientX - rect.left;
  x = Math.max(0, Math.min(x, rect.width));
  const t = x / pixelsPerSecond;
  setPlayheadTime(t);
  
  // Update Map preview via animator
  if (window.scrubCameraToTime) {
    window.scrubCameraToTime(t / duration);
  }
}

function onScrubEnd() {
  isScrubbing = false;
  document.removeEventListener('mousemove', onScrubMove);
  document.removeEventListener('mouseup', onScrubEnd);
}

function onTimelineClick(e) {
  if (e.target === playheadHandle || e.target.classList.contains('timeline-keyframe')) return;
  const rect = scrollContent.getBoundingClientRect();
  let x = e.clientX - rect.left;
  const t = Math.max(0, Math.min(x / pixelsPerSecond, duration));
  setPlayheadTime(t);
  
  if (window.scrubCameraToTime) {
    window.scrubCameraToTime(t / duration);
  }
}

export function setPlayheadTime(t) {
  currentTime = Math.max(0, Math.min(t, duration));
  const x = currentTime * pixelsPerSecond;
  if (playhead) playhead.style.left = `${x}px`;
  
  // Format MM:SS
  const mins = Math.floor(currentTime / 60);
  const secs = Math.floor(currentTime % 60).toString().padStart(2, '0');
  const dMins = Math.floor(duration / 60);
  const dSecs = Math.floor(duration % 60).toString().padStart(2, '0');
  
  if (timeDisplay) timeDisplay.textContent = `0${mins}:${secs} / 0${dMins}:${dSecs}`;
}

// Global update (called from animator.js during playback)
window.updateTimelinePlayhead = function(progress) {
  // progress is 0.0 to 1.0
  if (!isScrubbing) {
    setPlayheadTime(progress * duration);
  }
};

// Listeners
document.addEventListener('waypoints-changed', () => {
  renderTracks();
});

document.addEventListener('DOMContentLoaded', () => {
  initTimeline();
  
  // Wire "Add Keyframe" button (formerly Add Waypoint)
  const addBtn = document.getElementById('btn-add-waypoint');
  if (addBtn) {
    // Override whatever waypoint-builder does
    addBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.addKeyframe) {
        // Add keyframe at current normalized time
        const normTime = currentTime / duration;
        window.addKeyframe(normTime);
      }
    };
  }
});
