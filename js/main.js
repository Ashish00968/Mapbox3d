// main.js - Application Entry Point
import { STUDIO_CONFIG, state } from './store.js';
window.STUDIO_CONFIG = STUDIO_CONFIG;
window.state = state;

// Centralization backbone: the event bus + window.Studio namespace must load
// before any consumer module so the bus and namespace exist when they register.
import './event-bus.js';

import './animator.js';
import './aspect-ratio.js';
import './auto-director.js';
import './camera-sampler.js';
import './camera-target.js';
import './capture.js';
import './controls.js';
import './editor-mode.js';
import './encoder.js';
import './gpx-parser.js';
import './keyframes.js';
import './map.js';
import './orbit.js';
import './overlays.js';
import './photo-mode.js';
import './platform-export.js';
import './presets.js';
import './routing.js';
import './shot-presets.js';
import './speed-curve.js';
import './timeline-editor.js';
import './ui.js';
import './waypoint-builder.js';
import './waypoint-triggers.js';
