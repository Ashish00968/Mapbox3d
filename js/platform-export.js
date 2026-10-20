import { STUDIO_CONFIG, state } from './store.js';

// ── Platform Export Presets (Phase 16) ──

const PLATFORMS = [
  {
    id: 'youtube',
    name: 'YouTube',
    desc: '16:9 · 4K · 30fps · MP4',
    icon: '▶️',
    config: { ratio: '16:9', res: '4K', fps: 30, format: 'webcodecs' }
  },
  {
    id: 'tiktok',
    name: 'Reels / TikTok',
    desc: '9:16 · 1080p · 30fps · MP4',
    icon: '📱',
    config: { ratio: '9:16', res: '1080p', fps: 30, format: 'webcodecs' }
  },
  {
    id: 'twitter',
    name: 'Twitter / X',
    desc: '16:9 · 1080p · 30fps · MP4',
    icon: '🐦',
    config: { ratio: '16:9', res: '1080p', fps: 30, format: 'webcodecs' }
  },
  {
    id: 'instagram',
    name: 'Instagram Post',
    desc: '1:1 · 1080p · 30fps · MP4',
    icon: '📸',
    config: { ratio: '1:1', res: '1080p', fps: 30, format: 'webcodecs' }
  },
  {
    id: 'cinema',
    name: 'Cinema / Portfolio',
    desc: '2.39:1 · 4K · 24fps · ZIP (ProRes ready)',
    icon: '🎞️',
    config: { ratio: '2.39:1', res: '4K', fps: 24, format: 'zip' }
  }
];

function buildPlatformExportUI() {
  const tabExport = document.getElementById('tab-export');
  if (!tabExport) return;

  // Add the "Export for..." button at the bottom of the export tab
  const btnDiv = document.createElement('div');
  btnDiv.className = 'panel-section';
  btnDiv.style.paddingTop = '12px';
  btnDiv.innerHTML = `
    <button id="btn-export-platform" class="btn-primary" style="width:100%; background:var(--accent-gradient); border:none;">
      Export for Platform...
    </button>
  `;
  tabExport.appendChild(btnDiv);

  // Add Modal
  const modal = document.createElement('div');
  modal.id = 'platform-export-modal';
  modal.style.cssText = `
    display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); z-index: 1000;
    align-items: center; justify-content: center;
  `;

  const cardsHtml = PLATFORMS.map(p => `
    <div class="platform-card" onclick="applyPlatformExport('${p.id}')"
      style="
        background: var(--bg-panel-section); border: 1px solid var(--border);
        border-radius: 8px; padding: 12px; cursor: pointer; transition: all 0.2s;
        display: flex; align-items: center; gap: 16px; margin-bottom: 8px;
      "
      onmouseover="this.style.borderColor='var(--accent-base)'; this.style.background='rgba(255,255,255,0.08)'"
      onmouseout="this.style.borderColor='var(--border)'; this.style.background='var(--bg-panel-section)'"
    >
      <div style="font-size: 24px;">${p.icon}</div>
      <div>
        <div style="font-weight: 600; font-size: 14px; color: #fff;">${p.name}</div>
        <div style="font-size: 11px; color: var(--text-secondary); margin-top: 4px;">${p.desc}</div>
      </div>
    </div>
  `).join('');

  modal.innerHTML = `
    <div style="background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px; padding: 24px; width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.5);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 20px;">
        <h3 style="margin:0; font-weight:600; color:#fff;">Export Settings</h3>
        <button onclick="document.getElementById('platform-export-modal').style.display='none'"
          style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; font-size:16px;">✕</button>
      </div>
      <div id="platform-grid">
        ${cardsHtml}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('btn-export-platform').onclick = () => {
    modal.style.display = 'flex';
  };
}

function applyPlatformExport(platformId) {
  const p = PLATFORMS.find(x => x.id === platformId);
  if (!p) return;

  document.getElementById('platform-export-modal').style.display = 'none';

  // Apply Ratio
  if (window.applyAspectRatio) window.applyAspectRatio(p.config.ratio);
  
  // Apply FPS to all segments
  if (STUDIO_CONFIG.timeline && STUDIO_CONFIG.timeline.segments) {
    STUDIO_CONFIG.timeline.segments.forEach(seg => {
      seg.fps = p.config.fps;
    });
  } else {
    STUDIO_CONFIG.fps = p.config.fps;
  }
  
  // Apply Format
  STUDIO_CONFIG.exportMode = p.config.format;
  const webcodecsRadio = document.querySelector('input[name="exportMode"][value="webcodecs"]');
  const zipRadio = document.querySelector('input[name="exportMode"][value="zip"]');
  if (webcodecsRadio && zipRadio) {
    if (p.config.format === 'webcodecs') webcodecsRadio.checked = true;
    else zipRadio.checked = true;
  }

  // Handle Resolution Multiplier
  const resToMult = { '1080p': 1, '2K': 1.5, '4K': 2 };
  const targetMult = resToMult[p.config.res] || 1;
  const currentMult = STUDIO_CONFIG.pixelRatio || window.devicePixelRatio || 1;

  if (targetMult !== currentMult) {
    // Requires reload
    if (confirm(`Applying ${p.name} preset requires changing the output resolution to ${p.config.res}. The page will reload. Proceed?`)) {
      STUDIO_CONFIG.pixelRatio = targetMult;
      
      // We must save state before reload
      // We assume user has their trek loaded, but GPX path loading is currently not auto-persisted.
      // We will persist the minimal config needed to restore state.
      localStorage.setItem('mapbox_studio_pending_export', JSON.stringify({
        preset: platformId,
        config: STUDIO_CONFIG
      }));
      window.location.reload();
    }
    return;
  }

  // If no reload needed, trigger capture immediately
  if (window.startCapture) window.startCapture();
  else {
    const btn = document.getElementById('capture-btn');
    if (btn) btn.click();
  }
}

// On load, check if we came back from a resolution reload
document.addEventListener('DOMContentLoaded', () => {
  buildPlatformExportUI();

  const pendingJSON = localStorage.getItem('mapbox_studio_pending_export');
  if (pendingJSON) {
    try {
      const pending = JSON.parse(pendingJSON);
      localStorage.removeItem('mapbox_studio_pending_export');
      
      // Note: Full state restoration would require restoring trekPath, which might be large.
      // The user will need to drop their GPX again if they didn't explicitly save it.
      // But we can restore the pixelRatio and preset choices.
      
      STUDIO_CONFIG.pixelRatio = pending.config.pixelRatio;
      STUDIO_CONFIG.aspectRatio = pending.config.aspectRatio;
      STUDIO_CONFIG.exportMode = pending.config.exportMode;
      
      if (window.applyAspectRatio) window.applyAspectRatio(STUDIO_CONFIG.aspectRatio);
      
      const p = PLATFORMS.find(x => x.id === pending.preset);
      if (p) {
        setTimeout(() => {
          if (window.updateStatus) window.updateStatus(`Reloaded for ${p.name} export. Please load your GPX file again to start the capture.`);
        }, 500);
      }
    } catch (e) {
      console.error(e);
    }
  }
});
