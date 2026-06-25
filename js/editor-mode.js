import { STUDIO_CONFIG, state } from './store.js';

// ── Editor Mode UI (Phase 14) ──

function initEditorMode() {
  const savedMode = localStorage.getItem('mapbox_studio_mode') || 'editor';
  setMode(savedMode);

  // Tab shortcut
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault();
      const current = document.body.classList.contains('editor-mode') ? 'editor' : 'advanced';
      setMode(current === 'editor' ? 'advanced' : 'editor');
    }
  });
}

function setMode(mode) {
  if (mode === 'editor') {
    document.body.classList.add('editor-mode');
    document.body.classList.remove('advanced-mode');
  } else {
    document.body.classList.remove('editor-mode');
    document.body.classList.add('advanced-mode');
  }
  localStorage.setItem('mapbox_studio_mode', mode);
  updateEditorToggleUI();
  updateCurrentShotCard();
}

function updateEditorToggleUI() {
  const btn = document.getElementById('editor-mode-toggle');
  if (!btn) return;
  const isEditor = document.body.classList.contains('editor-mode');
  btn.innerHTML = isEditor ? 'Editor Mode <span style="opacity:0.5; margin-left:4px">⇌ Adv</span>' : '<span style="opacity:0.5; margin-right:4px">Ed ⇌</span> Advanced Mode';
  btn.style.color = isEditor ? 'var(--accent-green-base)' : 'var(--accent-base)';
  btn.style.borderColor = isEditor ? 'var(--accent-green-glow)' : 'var(--accent-glow)';
}

function buildEditorToggle() {
  const panelLeft = document.getElementById('panel-left');
  if (!panelLeft) return;

  const wrap = document.createElement('div');
  wrap.style.padding = '12px 20px 0 20px';
  wrap.innerHTML = `
    <button id="editor-mode-toggle" class="btn-ghost" style="width: 100%; border: 1px solid var(--border); padding: 8px;">
      Editor Mode
    </button>
  `;
  wrap.querySelector('button').onclick = () => {
    const isEditor = document.body.classList.contains('editor-mode');
    setMode(isEditor ? 'advanced' : 'editor');
  };

  // Insert below logo
  panelLeft.insertBefore(wrap, panelLeft.children[1]);

  // Insert "Current Shot" card in panel-right
  const panelRight = document.getElementById('panel-right');
  if (panelRight) {
    const card = document.createElement('div');
    card.id = 'current-shot-card';
    card.className = 'panel-section';
    card.setAttribute('data-show-in', 'editor');
    card.innerHTML = `
      <p class="section-label" style="color:var(--accent-green-base);">Current Shot</p>
      <div style="background:var(--bg-panel-section); border:1px solid var(--border); border-radius:6px; padding:10px;">
        <div style="font-size:13px; font-weight:500; color:#fff; margin-bottom:4px;" id="cs-preset">Custom Shot</div>
        <div style="font-size:11px; color:var(--text-secondary); display:flex; justify-content:space-between;">
          <span id="cs-duration">30s</span>
          <span id="cs-ratio">16:9</span>
        </div>
      </div>
    `;
    panelRight.insertBefore(card, panelRight.firstChild);
  }
}

function updateCurrentShotCard() {
  const isEditor = document.body.classList.contains('editor-mode');
  if (!isEditor) return;

  // Attempt to guess preset from segments or just show generic
  let presetName = 'Custom Shot';
  if (STUDIO_CONFIG.timeline && STUDIO_CONFIG.timeline.enabled) {
    const activeSeg = STUDIO_CONFIG.timeline.segments.find(s => s.id === STUDIO_CONFIG.timeline.activeSegmentId);
    if (activeSeg && activeSeg.label) presetName = activeSeg.label;
  }
  
  const elPreset = document.getElementById('cs-preset');
  const elDur = document.getElementById('cs-duration');
  const elRatio = document.getElementById('cs-ratio');

  if (elPreset) elPreset.textContent = presetName;
  if (elDur) {
    const dur = window.getTimelineTotalFrames ? (window.getTimelineTotalFrames() / (STUDIO_CONFIG.fps || 30)) : STUDIO_CONFIG.duration;
    elDur.textContent = Math.round(dur) + 's';
  }
  if (elRatio) elRatio.textContent = STUDIO_CONFIG.aspectRatio || '16:9';
}

// Hook into applying presets to update the card
const originalApplyPreset = window.applyPreset;
window.applyPreset = (id) => {
  if (originalApplyPreset) originalApplyPreset(id);
  // Also rename active segment
  const activeSeg = STUDIO_CONFIG.timeline.segments.find(s => s.id === STUDIO_CONFIG.timeline.activeSegmentId);
  const p = window.SHOT_PRESETS?.find(x => x.id === id);
  if (activeSeg && p) activeSeg.label = p.name;
  if (window.renderTimeline) window.renderTimeline();
  updateCurrentShotCard();
};

document.addEventListener('DOMContentLoaded', () => {
  buildEditorToggle();
  initEditorMode();

  // Periodically update the shot card stats
  setInterval(updateCurrentShotCard, 1000);
});
