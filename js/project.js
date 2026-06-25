import { STUDIO_CONFIG, state } from './store.js';

export function saveProject() {
  // We need to carefully clone the configuration to remove complex objects if any.
  // We'll stringify STUDIO_CONFIG directly.
  
  const projectData = {
    version: 1,
    timestamp: new Date().toISOString(),
    config: STUDIO_CONFIG
  };

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2));
  const dlAnchorElem = document.createElement('a');
  dlAnchorElem.setAttribute("href", dataStr);
  dlAnchorElem.setAttribute("download", "mapbox_studio_project.mbv");
  dlAnchorElem.click();
  
  if (window.updateStatus) window.updateStatus('Project saved to disk');
}

export function loadProject(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.config) {
        // Restore properties
        Object.assign(STUDIO_CONFIG, data.config);
        
        // Re-apply the loaded configuration to the UI and state
        
        // 1. Rebuild Trek Path
        if (window.rebuildTrekPath) window.rebuildTrekPath();
        
        // 2. Render waypoints
        if (window.renderWaypointList) window.renderWaypointList();
        
        // 3. Render keyframes/timeline
        if (window.renderTimeline) window.renderTimeline();
        if (window.renderTracks) window.renderTracks();
        if (window.renderStoryboard) window.renderStoryboard();
        
        // 4. Update aspect ratio
        if (window.applyAspectRatio && STUDIO_CONFIG.aspectRatio) {
          window.applyAspectRatio(STUDIO_CONFIG.aspectRatio);
        }
        
        if (window.updateStatus) window.updateStatus('Project loaded successfully');
      } else {
        alert('Invalid project file format.');
      }
    } catch (err) {
      console.error(err);
      alert('Error parsing project file.');
    }
  };
  reader.readAsText(file);
}

function initProjectUI() {
  document.getElementById('save-project-btn')?.addEventListener('click', saveProject);
  
  document.getElementById('load-project-btn')?.addEventListener('click', () => {
    document.getElementById('load-project-input').click();
  });
  
  document.getElementById('load-project-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadProject(file);
    e.target.value = ''; // Reset
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initProjectUI();
});
