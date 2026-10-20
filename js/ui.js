// ui.js — Editor_UI: context panel, tabs, and the status bar.
//
// Status handling (Requirement 4.1): every state-changing action surfaces a
// status message through the single `Studio.bus` STATUS channel. The status bar
// (`#status-text`) is the sole consumer/renderer of those events, so messages
// emitted from any module (map auth errors, routing fallbacks, GPX import
// failures, export progress, …) all converge on one rendering path with a
// level used for styling.

import { Studio, EVENTS } from './event-bus.js';

// ── Context panel API ──
function openContextPanel(title, htmlContent) {
  const titleEl = document.getElementById('context-panel-title');
  const bodyEl = document.getElementById('context-panel-body');
  const panelEl = document.getElementById('context-panel');
  
  if (titleEl) titleEl.textContent = title;
  if (bodyEl) bodyEl.innerHTML = htmlContent;
  if (panelEl) panelEl.classList.remove('hidden');
  
  if (window.enableFocusTrap) window.enableFocusTrap('context-panel');
}

function closeContextPanel() {
  if (window.disableFocusTrap) window.disableFocusTrap();
  
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
window.closeContextPanel = closeContextPanel;

// ── Focus Trap (Task 14.2) ──
let focusTrapListener = null;

window.enableFocusTrap = function(containerId) {
  if (window.disableFocusTrap) window.disableFocusTrap();
  const container = document.getElementById(containerId);
  if (!container) return;

  focusTrapListener = (e) => {
    if (e.key === 'Tab') {
      // Find all focusable elements (we use a standard selector)
      const focusable = Array.from(container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
                             .filter(el => !el.disabled && el.offsetParent !== null);
      if (focusable.length === 0) return;
      
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // If active element is not inside container, force it in
      if (!container.contains(document.activeElement)) {
        first.focus();
        e.preventDefault();
        return;
      }

      if (e.shiftKey) {
        if (document.activeElement === first) {
          last.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    }
  };
  document.addEventListener('keydown', focusTrapListener);
  
  // Set initial focus
  setTimeout(() => {
    const firstInput = container.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
    else {
      const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusable.length > 0) focusable[0].focus();
    }
  }, 100);
};

window.disableFocusTrap = function() {
  if (focusTrapListener) {
    document.removeEventListener('keydown', focusTrapListener);
    focusTrapListener = null;
  }
};

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
// Implements the WAI-ARIA Tabs keyboard pattern (Task 14.1):
//   • Only the active tab is in the natural Tab order (tabindex="0").
//   • Inactive tabs are skipped by Tab (tabindex="-1").
//   • ArrowLeft / ArrowRight move focus AND activate tabs.
//   • Home / End jump to the first / last tab.
document.addEventListener('DOMContentLoaded', () => {
  const tabBtns = Array.from(document.querySelectorAll('.tab-btn'));

  // Activate a tab by index: update classes, aria, tabindex, and panel visibility.
  function activateTab(index) {
    tabBtns.forEach((b, i) => {
      const isActive = i === index;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', String(isActive));
      // Roving tabindex: only the active tab is reachable by Tab key.
      b.setAttribute('tabindex', isActive ? '0' : '-1');
      const panelEl = document.getElementById('tab-' + b.dataset.tab);
      if (panelEl) panelEl.classList.toggle('active', isActive);
    });
    tabBtns[index].focus();
  }

  // Initial roving-tabindex setup — active tab starts at tabindex="0".
  tabBtns.forEach((btn, i) => {
    const isActive = btn.classList.contains('active');
    btn.setAttribute('tabindex', isActive ? '0' : '-1');

    // Click: activate the clicked tab.
    btn.addEventListener('click', () => activateTab(i));

    // Keyboard: arrow keys within the tablist (Task 14.1).
    btn.addEventListener('keydown', (e) => {
      let next = null;
      if (e.key === 'ArrowRight') {
        next = (i + 1) % tabBtns.length;
      } else if (e.key === 'ArrowLeft') {
        next = (i - 1 + tabBtns.length) % tabBtns.length;
      } else if (e.key === 'Home') {
        next = 0;
      } else if (e.key === 'End') {
        next = tabBtns.length - 1;
      }
      if (next !== null) {
        e.preventDefault();
        activateTab(next);
      }
    });
  });
});

// ── Status bar updates ──
//
// All status messages flow through the bus STATUS channel so a single
// rendering path owns `#status-text`. `updateStatus(msg, level)` is kept as the
// legacy entry point (callers across the app use `window.updateStatus`) but it
// now *emits* a STATUS event rather than writing the DOM directly, so legacy
// callers and modern `Studio.bus.emit(EVENTS.STATUS, …)` producers share one
// code path (Req 4.1).

const VALID_STATUS_LEVELS = ['info', 'warn', 'error'];

// Level → color. References design tokens where available; warn has no token
// yet so a literal amber is used. Styling lives here (scoped to the status bar)
// because the status bar is the only surface that reacts to message level.
const STATUS_LEVEL_COLORS = {
  info: 'var(--text-secondary)',
  warn: '#F59E0B',
  error: 'var(--danger)'
};

// The single renderer for the status bar. Reads the element at call time so it
// works regardless of when the DOM is ready relative to module load.
function renderStatusMessage(message, level) {
  const statusEl = document.getElementById('status-text');
  if (!statusEl) return;
  const lvl = VALID_STATUS_LEVELS.includes(level) ? level : 'info';
  statusEl.textContent = (message == null) ? '' : String(message);
  statusEl.style.color = STATUS_LEVEL_COLORS[lvl];
  statusEl.dataset.level = lvl;
}

// Consume STATUS events emitted by any module (map.js auth errors, routing
// fallbacks, gpx-parser import failures, capture/export, …) and render them.
// Registered at module load so the subscription persists for the app lifetime.
if (Studio && Studio.bus) {
  Studio.bus.on(EVENTS.STATUS, (detail) => {
    if (!detail) { renderStatusMessage('', 'info'); return; }
    // Support both { message, level } and a bare string payload.
    if (typeof detail === 'string') { renderStatusMessage(detail, 'info'); return; }
    renderStatusMessage(detail.message, detail.level);
  });
}

/**
 * Surface a status message in the status bar.
 * Routes through the bus so legacy `window.updateStatus(...)` callers and
 * `Studio.bus.emit(EVENTS.STATUS, ...)` producers share one rendering path.
 * @param {string} msg
 * @param {'info'|'warn'|'error'} [level='info']
 */
function updateStatus(msg, level = 'info') {
  if (Studio && Studio.bus) {
    Studio.bus.emit(EVENTS.STATUS, { level, message: msg });
  } else {
    // Defensive fallback if the bus is somehow unavailable.
    renderStatusMessage(msg, level);
  }
}

window.updateStatus = updateStatus;  // overrides map.js version; keeps callers working
// Canonical home under the Studio namespace (Req 8.1 centralization).
Studio.ui = Studio.ui || {};
Studio.ui.updateStatus = updateStatus;
Studio.ui.renderStatus = renderStatusMessage;

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
      const isActive = btnThirds.classList.contains('active');
      btnThirds.setAttribute('aria-pressed', String(isActive));
      btnThirds.style.color = isActive ? 'var(--accent-base)' : '';
    });
  }

  if (btnSafe && guidesContainer) {
    btnSafe.addEventListener('click', () => {
      guidesContainer.classList.toggle('show-safe');
      btnSafe.classList.toggle('active');
      const isActive = btnSafe.classList.contains('active');
      btnSafe.setAttribute('aria-pressed', String(isActive));
      btnSafe.style.color = isActive ? 'var(--accent-base)' : '';
    });
  }

  const btnDropPin = document.getElementById('btn-click-drop-pin');
  if (btnDropPin) {
    btnDropPin.addEventListener('click', () => {
      if (window.toggleWaypointMode) window.toggleWaypointMode();
    });
  }

  const btnCloseContext = document.getElementById('context-panel-close');
  if (btnCloseContext) {
    btnCloseContext.addEventListener('click', () => {
      if (window.closeContextPanel) window.closeContextPanel();
    });
  }

  const pmToggle = document.getElementById('toggle-performance-mode');
  if (pmToggle) {
    // Initial sync in case store.js has it true
    pmToggle.checked = STUDIO_CONFIG.performanceMode || false;
    pmToggle.addEventListener('change', (e) => {
      import('./store.js').then(({ STUDIO_CONFIG }) => {
        STUDIO_CONFIG.performanceMode = e.target.checked;
        if (window.updateStatus) {
          window.updateStatus('Performance mode ' + (e.target.checked ? 'enabled' : 'disabled'));
        }
      });
    });
  }
});

// ── Task 12.3: Subscribe to export-progress events for centralized rendering ──
// Any module can subscribe to EXPORT_PROGRESS for progress display. This renders
// a lightweight progress indication in the status bar when the capture overlay
// is not visible (e.g., background export future feature).
if (Studio && Studio.bus) {
  Studio.bus.on(EVENTS.EXPORT_PROGRESS, (detail) => {
    if (!detail) return;
    // The capture overlay handles its own progress UI; this provides an
    // additional status-bar breadcrumb for awareness.
    const statusEl = document.getElementById('status-text');
    if (statusEl && detail.pct !== undefined) {
      statusEl.textContent = detail.step || `Export: ${Math.round(detail.pct)}%`;
    }
  });

  // ── Task 12.3 (continued): Export-done summary in status bar ──
  Studio.bus.on(EVENTS.EXPORT_DONE, (detail) => {
    if (!detail || !detail.report) return;
    const r = detail.report;
    const issues = r.degradedFrames.length + r.blankFrames.length;
    const msg = issues > 0
      ? `Export done — ${r.producedFrames} frames (${issues} quality issues)`
      : `Export done — ${r.producedFrames} frames`;
    renderStatusMessage(msg, issues > 0 ? 'warn' : 'info');
  });
}

// ── Task 12.4: Disable conflicting controls while busy ──
// During Preview or Export, interactive controls that could conflict with the
// operation (e.g., starting another preview/export, changing aspect ratio) are
// disabled. The busy state is broadcast from capture.js / animator.js.
const BUSY_CONTROL_IDS = [
  'capture-btn', 'preview-btn', 'save-project-btn', 'load-project-btn'
];

function setBusyState(isBusy) {
  BUSY_CONTROL_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isBusy;
  });
}

// Expose for capture.js / animator.js to call
window.setStudioBusy = setBusyState;
Studio.ui.setBusy = setBusyState;

// ── Task 12.5: Cross-surface selection synchronization ──
// When a waypoint is selected in any surface (map marker, list, storyboard),
// it emits SELECTION_CHANGED. All surfaces subscribe and sync their highlight.
if (Studio && Studio.bus) {
  Studio.bus.on(EVENTS.SELECTION_CHANGED, (detail) => {
    if (!detail) return;
    const { kind, id } = detail;

    if (kind === 'waypoint') {
      // Highlight in waypoint list
      document.querySelectorAll('.waypoint-row').forEach(row => {
        row.classList.toggle('selected', row.dataset.wpId === String(id));
      });

      // Highlight in storyboard
      document.querySelectorAll('.storyboard-card').forEach(card => {
        card.classList.toggle('active', card.dataset.wpId === String(id));
      });
    }
  });
}

// ── Mobile Responsive Drawer & Timeline Collapse Handlers ──
function initMobileUI() {
  const leftPanel = document.getElementById('left-panel');
  const backdrop = document.getElementById('mobile-backdrop');
  const toggleBtn = document.getElementById('mobile-sidebar-toggle');
  const closeBtn = document.getElementById('mobile-panel-close');
  const timelineWorkspace = document.getElementById('timeline-workspace');
  const timelineCollapseBtn = document.getElementById('timeline-toggle-collapse');

  function openMobileDrawer() {
    if (leftPanel) leftPanel.classList.add('mobile-open');
    if (backdrop) backdrop.style.display = 'block';
  }

  function closeMobileDrawer() {
    if (leftPanel) leftPanel.classList.remove('mobile-open');
    if (backdrop) backdrop.style.display = 'none';
  }

  if (toggleBtn) toggleBtn.addEventListener('click', openMobileDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeMobileDrawer);
  if (backdrop) backdrop.addEventListener('click', closeMobileDrawer);

  // Auto-close mobile drawer when switching tabs on small screens
  document.querySelectorAll('#left-tabs .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        // give brief delay so the user sees tab activation
        setTimeout(() => closeMobileDrawer(), 150);
      }
    });
  });

  // Timeline collapse / expand toggle
  if (timelineCollapseBtn && timelineWorkspace) {
    timelineCollapseBtn.addEventListener('click', () => {
      const isCollapsed = timelineWorkspace.classList.toggle('timeline-collapsed');
      const icon = timelineCollapseBtn.querySelector('i');
      if (icon) {
        icon.className = isCollapsed ? 'ti ti-chevron-up' : 'ti ti-chevron-down';
      }
      // Trigger map resize so canvas expands cleanly
      setTimeout(() => {
        if (window.map && typeof window.map.resize === 'function') {
          window.map.resize();
        }
      }, 250);
    });
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileUI);
  } else {
    initMobileUI();
  }
}
