// ── Context panel API ──
function openContextPanel(title, htmlContent) {
  const titleEl = document.getElementById('context-panel-title');
  const bodyEl = document.getElementById('context-panel-body');
  const panelEl = document.getElementById('context-panel');
  
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = htmlContent;
  if (panelEl) panelEl.classList.remove('hidden');
}

function closeContextPanel() {
  const panelEl = document.getElementById('context-panel');
  const bodyEl = document.getElementById('context-panel-body');
  
  if (panelEl) panelEl.classList.add('hidden');
  // Optional: clear body after transition
  setTimeout(() => {
    if (panelEl && panelEl.classList.contains('hidden') && bodyEl) {
      bodyEl.innerHTML = '';
    }
  }, 400);
}
window.openContextPanel  = openContextPanel;
window.closeContextPanel = closeContextPanel;

// ── Geocoder Hook ──
window.openWaypointPanelForCurrentLocation = (name) => {
  openContextPanel(`Add Waypoint: ${name}`, `
    <div style="margin-bottom: 12px; font-size: 12px; color: var(--text-secondary);">
      Do you want to add this location to the timeline?
    </div>
    <div style="display:flex; flex-direction:column; gap:8px;">
      <button class="btn btn-primary" onclick="if(window.addWaypointFromUI) window.addWaypointFromUI('${name}'); closeContextPanel();">
        <i class="ti ti-plus"></i> Add to Timeline
      </button>
      <button class="btn btn-ghost" onclick="closeContextPanel()">Cancel</button>
    </div>
  `);
};

// ── Left panel tab switching ──
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const tabEl = document.getElementById('tab-' + tab);
      if (tabEl) tabEl.classList.add('active');
    });
  });
});

// ── Status bar updates ──
function updateStatus(msg) {
  const statusEl = document.getElementById('status-text');
  if (statusEl) statusEl.textContent = msg;
}
window.updateStatus = updateStatus;  // overrides map.js version

// ── Canvas dims readout ──
document.addEventListener('map-ready', () => {
  if (typeof map === 'undefined' || !map) return;
  const updateDims = () => {
    const c = map.getCanvas();
    const dimsEl = document.getElementById('canvas-dims');
    if (dimsEl && c) {
      dimsEl.textContent = c.width + '×' + c.height + 'px';
    }
  };
  
  updateDims();
  map.on('resize', updateDims);
});

// ── Progress overlay (for capture) ──
window.showProgressOverlay  = () => {
  const el = document.getElementById('progress-overlay');
  if (el) el.style.display = 'block';
};
window.hideProgressOverlay  = () => {
  const el = document.getElementById('progress-overlay');
  if (el) el.style.display = 'none';
};

// ── FPS readout sync ──
document.addEventListener('DOMContentLoaded', () => {
  const fpsSelect = document.getElementById('fps-select');
  const readout = document.getElementById('fps-readout');
  if (fpsSelect && readout) {
    readout.textContent = fpsSelect.value + 'fps';
    fpsSelect.addEventListener('change', e => {
      readout.textContent = e.target.value + 'fps';
    });
  }
});

// ── Composition Guides ──
document.addEventListener('DOMContentLoaded', () => {
  const btnThirds = document.getElementById('btn-guide-thirds');
  const btnSafe = document.getElementById('btn-guide-safe');
  const guidesContainer = document.getElementById('composition-guides');

  if (btnThirds && guidesContainer) {
    btnThirds.addEventListener('click', () => {
      guidesContainer.classList.toggle('show-thirds');
      btnThirds.classList.toggle('active');
      if (btnThirds.classList.contains('active')) {
        btnThirds.style.color = 'var(--accent-base)';
      } else {
        btnThirds.style.color = '';
      }
    });
  }

  if (btnSafe && guidesContainer) {
    btnSafe.addEventListener('click', () => {
      guidesContainer.classList.toggle('show-safe');
      btnSafe.classList.toggle('active');
      if (btnSafe.classList.contains('active')) {
        btnSafe.style.color = 'var(--accent-base)';
      } else {
        btnSafe.style.color = '';
      }
    });
  }
});
