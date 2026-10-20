# Mapbox Video Studio — Master Roadmap & Progress Summary

This document consolidates the complete development roadmap for Mapbox Video Studio, covering all phases from v1 through the latest pro-studio-overhaul, along with current development progress and detailed guidance for completing remaining tasks.

---

## 🟢 v1: Core Architecture & Rendering (Phases 1-6)
**Status:** ✅ Completed
**Objective:** Build a functional, no-build-step tool to fly a 3D camera along a GPX path and export individual frames.
* **Phase 1: Project Foundation:** Mapbox GL JS map setup with 3D terrain (`preserveDrawingBuffer: true`), satellite imagery, and UI layout.
* **Phase 2: Trek Path Loader:** Parsing GPX/KML coordinate data, drawing the path on the map, and displaying basic trail statistics.
* **Phase 3: Camera Controls:** Interactive sliders for Pitch, Bearing, Zoom, and Terrain Exaggeration.
* **Phase 4: Preview Animation:** Smooth real-time playback utilizing `requestAnimationFrame` for timeline scrubbing and playback.
* **Phase 5: Frame Capture:** Frame-by-frame forced rendering loop (`triggerRepaint` & `map.once('render')`), bundling PNGs into a ZIP with JSZip.
* **Phase 6: Photo Mode:** High-resolution single-shot exports, map annotations, and storable camera presets.

## 🔵 v2: Advanced Cinematics & WebCodecs (Phases 7-11)
**Status:** ✅ Completed
**Objective:** Introduce dynamic animation variables, visual overlays, and entirely browser-native video encoding.
* **Phase 7: Keyframe Editor:** Visual keyframing system to dynamically animate Pitch, Zoom, Bearing, and Terrain throughout the video rather than using static values.
* **Phase 8: Speed Curve System:** Interactive Bezier curve editor mapping linear path progress to dynamic camera speeds (e.g., slow-mo summits).
* **Phase 9: Canvas Overlay Compositor:** A synced Canvas2D layer that bakes animated titles, progress bars, and elevation graphs directly into the captured frames.
* **Phase 10: Multi-Segment Timeline:** Architecture to chain distinct sequential shots (intro, trail follow, summit orbit) into one contiguous export.
* **Phase 11: WebCodecs Encoder:** Implementing the native WebCodecs API to instantly output an MP4 file, completely eliminating the need for an external FFmpeg step.

## 🟣 v3: Platform UX & Export Presets (Phases 12-16)
**Status:** ✅ Completed
**Objective:** Focus on creator workflow by adding automated camera moves, aspect ratio handling, and social media export presets.
* **Phase 12: Aspect Ratio Engine:** Live container resizing and constraint handling for various output formats (16:9, 9:16, 4:3, 1:1, 2.39:1).
* **Phase 13: Orbit Shot Concept:** An automated 360° sweeping shot around any specific center point along the trail. *(Fully expanded and implemented in Phase 20)*
* **Phase 14: Editor Mode UI:** A simplified UX toggle that abstracts away advanced keyframing and speed curves for non-technical users.
* **Phase 15: Shot Presets:** One-click cinematic templates (e.g., "Reveal Shot", "Aerial Overview", "Dramatic Entry") that auto-populate the timeline.
* **Phase 16: Platform Exports:** Quick-select export presets that automatically configure resolution, framerate, and aspect ratio for YouTube, TikTok/Reels, Twitter, and Instagram.

## 🟠 v3 Next Phases: Consolidation, Routing & Storyboarding (Phases 17-21)
**Status:** ✅ Completed
**Objective:** Consolidate the UI for better UX, introduce map-click in-map routing, full Orbit engine integration, and a route Storyboard.
* **Phase 17: UI Consolidation:** Right panel dissolved. Everything moved into a tabbed left panel (Route, Camera, Export). Map takes up full space, and a floating toolbar is introduced. Context panel slides in from the right.
* **Phase 18: Map-Click Waypoint Route Builder:** Placed waypoints dynamically on the map, removing the strict need for GPX uploads. Auto-generates paths and calculates elevation via Mapbox Terrain.
* **Phase 19: Waypoint Animation Triggers:** Introduced context-based triggers to waypoints (e.g., "Show label", "Slow down", "Orbit here"), allowing automated events as the camera arrives at specific coordinates.
* **Phase 20: Orbit / Rotate Shot Engine:** Complete, standalone implementation of the Orbit engine. Includes floating toolbar access, popup config for degrees/direction/duration, real-time preview, and timeline integration natively supported by the capture engine.
* **Phase 21: Route Storyboard View:** A horizontal card strip above the player bar to view, manage, and reorder waypoints, complete with active highlighting during playback and click-to-jump camera controls.

## 🟢 v4: The Professional Studio Engine (Phases 22-24)
**Status:** ✅ Completed
**Objective:** Elevate the engine to professional standards with audio support, custom 3D models, deep code optimization, and cinematography tools.
* **Phase 22: Audio & Time Keyframing:** Added support for importing MP3/WAV files with a live visual waveform in the timeline. Introduced dynamic `timeOfDay` keyframing to animate the sun (sunrise to sunset) across the map in real-time.
* **Phase 23: The Pro Polish:** Introduced Catmull-Rom spline mathematics for perfectly smooth drone-like camera curves. Added 1-click social media aspect ratio masking (16:9, 9:16, 1:1), UI auto-keyframing for GPX drops, and custom `.glb` 3D model injection for the tracker.
* **Phase 24: The Master Polish:** Integrated 1-click cinematic "Shot Presets" (Orbit, Zoom-To, Spiral). Added cinematic post-processing overlays (Vignette, 2.35:1 Letterboxing). Upgraded the WebCodecs capture engine to strictly pre-fetch and await 4K Mapbox tiles before rendering, eliminating blurry frames. Implemented NLE keyboard shortcuts (Spacebar playback, Arrow key scrubbing) and removed unoptimized inline HTML handlers in favor of strict ES6 event listeners.

---

## 🔴 v5: Pro Studio Overhaul (Current Work)
**Status:** 🟡 In Progress (~65% complete)
**Objective:** Reliability, motion quality, UX, performance, accessibility, and security overhaul across 9 requirement areas.

### Spec Location
- **Requirements:** `.kiro/specs/pro-studio-overhaul/requirements.md`
- **Design:** `.kiro/specs/pro-studio-overhaul/design.md`
- **Tasks:** `.kiro/specs/pro-studio-overhaul/tasks.md`

### Hard Constraints (NEVER violate)
1. **No build step** — vanilla ES modules loaded directly by `index.html`
2. **`preserveDrawingBuffer: true`** must remain set at map construction in `map.js`
3. **`window.*` coupling** — legacy globals are kept as thin aliases forwarding to `window.Studio` namespace
4. **Test toolchain** is dev-only (`node --test` + jsdom + fast-check) — never affects shipped app

### Architecture Summary
New thin modules slot into the existing module graph:
- `js/event-bus.js` — EventTarget bus + `window.Studio` namespace
- `js/geo.js` — pure geodesic/haversine/bearing utilities
- `js/tile-await.js` — tile readiness with degraded fallback
- `js/frame-quality.js` — blank/blur frame detection
- `js/camera-sampler.js` — pure deterministic `sampleCamera(t)`
- `js/routing.js` — straight-line + road-and-trail mode dispatch
- `js/project-schema.js` — validate + migrate + (de)serialize
- `js/contrast.js` — pure WCAG contrast ratio utility
- `js/validation.js` — operation input validation
- `css/tokens.css` — canonical design tokens
- `css/components.css` — token-referencing component classes

### Test Suite Status
- **28 tests passing** (`npm test` — all green)
- Tests live in `tests/` directory using `node --test` + jsdom

---

## Task-by-Task Status

### Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Complete and verified |
| 🟡 | Partially done / in progress when credits ran out |
| ⬜ | Not started |
| ⏭️ | Skipped (optional test tasks) |

---

### Area 1: Test Harness (Foundation)
| Task | Status | Description |
|------|--------|-------------|
| 1.1 | ✅ | Dev-only test runner with jsdom, fast-check, canvas mock |

**Files created:** `package.json`, `tests/helpers/dom-bootstrap.js`, `tests/helpers/canvas-mock.js`, `tests/harness.test.js`, `tests/README.md`

---

### Area 2: Configuration, Event Bus, Studio Namespace (Req 8)
| Task | Status | Description |
|------|--------|-------------|
| 2.1 | ✅ | `store.js` centralized with token, presets, schema version |
| 2.2 | ✅ | `event-bus.js` + `window.Studio` namespace |
| 2.3 | ✅ | `map.js` reads token from config, auth error handling |
| 2.4 | ✅ | `SECURITY.md` documenting token restrictions |
| 2.5 | ⏭️ | *Optional: smoke tests for config* |

---

### Area 3: Geometry Foundation (Req 3 support)
| Task | Status | Description |
|------|--------|-------------|
| 3.1 | ✅ | `geo.js` — haversine, bearing, geodesic interpolation |
| 3.2 | ⏭️ | *Optional: property test for distance* |

---

### Area 4: Camera System (Req 2)
| Task | Status | Description |
|------|--------|-------------|
| 4.1 | ✅ | `camera-sampler.js` — pure deterministic sampler |
| 4.2 | ✅ | Keyframe spline hardening (C0 continuity, bearing shortest-arc) |
| 4.3 | ✅ | Speed-curve `remapT` monotonicity + endpoint clamping |
| 4.4 | ✅ | Preview progress time-proportional with dt clamping |
| **4.5** | **🟡** | **Route Preview and Export through the same sampler** |
| 4.6–4.12 | ⏭️ | *Optional: property tests* |

**Task 4.5 details — what's needed:**
- Both `animator.js` (preview RAF loop) and `capture.js` (export loop) must call `sampleCamera(remapT(t))` from `camera-sampler.js` instead of independently computing camera state
- Currently `animator.js` calls `window.interpolateCameraAtT(t)` directly in `updateCamera()` (line 164-165)
- `capture.js` also calls `window.studioAnimator.updateCamera()` which goes through the same path
- **The sampler already exists** (`camera-sampler.js`) but neither loop calls it yet
- Implementation: Replace the interpolation call in `updateCamera()` with `Studio.camera.sampleCamera(t)`, and similarly in the capture loop

**Key files:** `js/animator.js` (lines 160-224), `js/capture.js` (lines 340-470), `js/camera-sampler.js`

---

### Area 5: Checkpoint
| Task | Status | Description |
|------|--------|-------------|
| 5 | 🟡 | Checkpoint — all 28 tests pass but area 4.5 incomplete |

---

### Area 6: Capture Engine (Req 1)
| Task | Status | Description |
|------|--------|-------------|
| 6.1 | ✅ | Pure frame planner in `capture.js` |
| 6.2 | ✅ | Monotonic timestamps in `encoder.js` |
| 6.3 | ✅ | `tile-await.js` — readiness + degraded fallback |
| 6.4 | ✅ | `frame-quality.js` — blank frame detection |
| **6.5** | **🟡** | **Wire capture loop with readiness, quality, ExportReport** |
| **6.6** | **🟡** | **Cancellation cleanup (dispose encoder, restore DPR)** |
| **6.7** | **🟡** | **WebCodecs fallback explicit + user-visible** |
| 6.8–6.12 | ⏭️ | *Optional: property/integration tests* |

**Task 6.5 details — what's needed:**
The capture loop in `capture.js` (`runSegmentsCapture`, line 323) currently uses `waitTilesLoaded()` (the old 2500ms fallback). It needs to:
1. Replace `waitTilesLoaded()` calls with `awaitTilesOrDegrade()` from `tile-await.js`
2. After each frame capture, call `isBlankFrame(canvas)` from `frame-quality.js`
3. Accumulate degraded/blank frame indices into an `ExportReport` object
4. Emit `export-progress { pct, step }` and `export-done { report }` via `Studio.bus`
5. Use the planner's exact counts (already done — `frameCountFor` is wired)

**Key imports needed at top of capture.js:**
```js
import { awaitTilesOrDegrade } from './tile-await.js';
import { isBlankFrame } from './frame-quality.js';
```

**Task 6.6 details — what's needed:**
- On cancel, call `encoder.dispose()` (already exists in encoder.js line 211-222)
- Ensure DPR is restored (already done in `finishCapture()` line 489-500)
- Re-enable controls within 1 second (already partially done)
- Add: `if (window.EncoderAPI) window.EncoderAPI.dispose();` in `finishCapture()` when `captureCanceled`

**Task 6.7 details — what's needed:**
- When `WEBCODECS_SUPPORTED` is false, force `STUDIO_CONFIG.exportMode = 'zip'`
- Emit `Studio.bus.emit(EVENTS.STATUS, { level: 'info', message: 'WebCodecs unavailable — using PNG sequence export' })`
- This is mostly wired already in `encoder.js` (line 14-16 has the console.log) — just add the bus emission

---

### Area 7: Performance (Req 6)
| Task | Status | Description |
|------|--------|-------------|
| **7.1** | **🟡** | **Formalize chunked PNG export** |
| 7.2 | ✅ | `shouldWrite` redundant-update suppression |
| **7.3** | **🟡** | **Performance mode + main-thread yielding** |
| 7.4–7.6 | ⏭️ | *Optional: property/integration tests* |

**Task 7.1 details:**
- `capture.js` already uses `CHUNK_SIZE = 500` (line 327) and chunks ZIPs
- Need to read from `STUDIO_CONFIG.presets.pngChunkSize` instead of hardcoded 500
- Flush base64 entries per chunk so memory stays bounded
- Replace line 327: `const CHUNK_SIZE = STUDIO_CONFIG.presets.pngChunkSize || 500;`

**Task 7.3 details:**
- `yieldThread()` already exists in capture.js (line 313-315) and is called per frame
- Need a "Performance mode" toggle that selects 1080p (pixelRatio 1) + 30fps
- Disable costly layers (3D buildings) when enabled
- Add a toggle in the Export tab UI or a config flag in `STUDIO_CONFIG`

---

### Area 8: Checkpoint
| Task | Status | Description |
|------|--------|-------------|
| 8 | 🟡 | Blocked on areas 4.5, 6.5–6.7, 7.1, 7.3 |

---

### Area 9: Route Builder (Req 3)
| Task | Status | Description |
|------|--------|-------------|
| 9.1 | ✅ | Straight-line mode in `routing.js` |
| 9.2 | ✅ | Road-and-trail mode with per-leg fallback |
| 9.3 | ✅ | GPX/KML transactional import in `gpx-parser.js` |
| 9.4 | ✅ | Waypoint order preservation + distance/elevation recompute |
| 9.5–9.9 | ⏭️ | *Optional: property/integration tests* |

---

### Area 10: Project Store (Req 9)
| Task | Status | Description |
|------|--------|-------------|
| 10.1 | ✅ | `validateProject()` in `project-schema.js` |
| 10.2 | ✅ | `migrateProject()` v1-to-v2 in `project-schema.js` |
| 10.3 | ✅ | `serializeProject` / `deserializeProject` as inverses |
| **10.4** | **🟡** | **Wire save/load in `project.js`** |
| 10.5–10.8 | ⏭️ | *Optional: property/integration tests* |

**Task 10.4 details — what's needed:**
`project.js` currently does a naive `Object.assign(STUDIO_CONFIG, data.config)` on load (line 29) and saves with `version: 1` (line 8). It needs:

1. **Save**: Use `serializeProject` + wrap with `{ schemaVersion: CURRENT_SCHEMA, timestamp, config }`
2. **Load**: `JSON.parse` then `migrateProject` (if older) then `validateProject` then apply only on success then call `syncUIToConfig` + rebuild trek path + re-render
3. **Invalid file**: emit descriptive error via bus, leave state unchanged (currently uses `alert()`)

**Implementation sketch:**
```js
import { validateProject, migrateProject, serializeProject, deserializeProject, CURRENT_SCHEMA } from './project-schema.js';
import { Studio, EVENTS } from './event-bus.js';

export function saveProject() {
  const snapshot = serializeProject(STUDIO_CONFIG);
  const projectData = {
    schemaVersion: CURRENT_SCHEMA,
    timestamp: new Date().toISOString(),
    config: snapshot
  };
  // ... download as .mbv
}

export function loadProject(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      let data = JSON.parse(e.target.result);
      data = migrateProject(data);
      const result = validateProject(data);
      if (!result.ok) {
        Studio.bus.emit(EVENTS.STATUS, { level: 'error', message: result.error });
        return; // state unchanged
      }
      const config = deserializeProject(result.value.config);
      Object.assign(STUDIO_CONFIG, config);
      syncUIToConfig();
      // ...rebuild trek path, keyframes, timeline, storyboard
    } catch (err) {
      Studio.bus.emit(EVENTS.STATUS, { level: 'error', message: 'Error parsing project file.' });
    }
  };
  reader.readAsText(file);
}
```

---

### Area 12: Editor UI (Req 4)
| Task | Status | Description |
|------|--------|-------------|
| 12.1 | ✅ | Operation input validation (`validateForOperation`) |
| **12.2** | **🟡** | **Route status messages through the bus** |
| **12.3** | **🟡** | **Show progress for long operations** |
| **12.4** | **🟡** | **Disable conflicting controls while busy** |
| **12.5** | **🟡** | **Synchronize cross-surface selection** |
| **12.6** | **🟡** | **Propagate storyboard reorder** |
| **12.7** | **🟡** | **Group controls under labeled sections** |
| 12.8–12.9 | ⏭️ | *Optional: property/integration tests* |

**Task 12.2 details — what's needed:**
`ui.js` already has the bus-routed status bar (lines 67-131). The remaining work is:
1. Replace any remaining `alert()` calls across the codebase with `Studio.bus.emit(EVENTS.STATUS, ...)` or `window.updateStatus(...)`
2. Search for `alert(` in all JS files and replace with status bus emissions

**Task 12.3 details:**
- Subscribe the capture overlay to `export-progress { pct, step }` events
- The capture overlay already shows progress (capture.js lines 448-450) but via direct DOM writes
- Wire it through the bus so any progress UI can subscribe

**Task 12.4 details:**
- Broadcast a `busy` state via the bus during Preview/Export
- Have controls subscribe and disable themselves
- Currently `capture-btn` and `preview-btn` are manually disabled (lines 176-177 in capture.js)

**Task 12.5 details:**
- Use `Studio.bus.emit(EVENTS.SELECTION_CHANGED, { kind, id })` when selecting a waypoint anywhere
- Have waypoint list, storyboard, and map marker all listen and sync highlight

**Task 12.6 details:**
- On storyboard reorder, emit `trek-changed` via the bus
- Rebuild path via `routing.js` and re-render waypoint list
- `storyboard.js` already has drag-and-drop reorder logic

**Task 12.7 details:**
- Wrap tabbed-panel sections in `<fieldset>`/`<legend>` or labeled `.panel-section` headers
- This is an HTML/CSS task in `index.html` and `style.css`

---

### Area 13: Visual System (Req 5)
| Task | Status | Description |
|------|--------|-------------|
| 13.1 | ✅ | `css/tokens.css` — all design tokens |
| 13.2 | ✅ | Migrated inline styles to token-referencing classes |
| **13.3** | **⬜** | **Consistent control classes + GPU-only transitions** |
| **13.4** | **🟡** | **`prefers-reduced-motion` for UI chrome** |
| 13.5 | ⏭️ | *Optional: smoke tests* |

**Task 13.3 details — what's needed:**
1. Define one class per control type in `css/components.css` or `style.css`:
   - `.btn` (base), `.btn-primary`, `.btn-ghost` (already partially exist in `style.css`)
   - `.select-input` (dropdown selects)
   - Slider styles (range inputs)
2. Ensure ALL panels use these same classes consistently
3. Animate only `transform`/`opacity`:
   - Button `:active { transform: scale(0.97) }` with `--dur-fast` transition
   - Avoid `transition: all` and width/height/margin animation
4. Use `--dur-*` tokens for all transition durations

**Current state:** `style.css` already has `.btn`, `.btn-primary`, `.btn-ghost` classes (grep for them). Need to audit for consistency across all panels and add GPU-only transition constraints.

**Task 13.4 details:**
Add a global `@media (prefers-reduced-motion: reduce)` block:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```
Place it at the end of `css/tokens.css` or `style.css`. Do NOT affect camera rendering.

---

### Area 14: Accessibility (Req 7)
| Task | Status | Description |
|------|--------|-------------|
| **14.1** | **🟡** | **Keyboard operability** |
| **14.2** | **🟡** | **Visible focus + accessible names** |
| 14.3 | ✅ | Contrast utility + token audit (fixed `--text-muted` to `#86868F`) |
| **14.4** | **🟡** | **Focus trap in modal overlays** |
| 14.5–14.6 | ⏭️ | *Optional: property/integration tests* |

**Task 14.1 details:**
- Make tabs `role="tablist"` with `role="tab"` on each tab button, arrow-key navigation
- Add keyboard handlers to timeline and storyboard (arrows move selection, Enter activates)
- Convert clickable `<div>`s to `<button>` or add `tabindex="0"` + `role="button"` + keypress handlers
- Focus area: `index.html` tab structure (`.tab-btn` elements)

**Task 14.2 details:**
- Add `:focus-visible` outline using a design token
- Add `aria-label` to all icon-only buttons
- Add `aria-hidden="true"` to decorative `<i>` icon elements

**Task 14.4 details:**
- Confine Tab focus to the capture overlay and context panel while open
- Restore focus to the trigger element on close
- Standard focus-trap pattern: intercept Tab/Shift+Tab at boundary elements

---

### Area 15: Final Checkpoint
| Task | Status | Description |
|------|--------|-------------|
| 15 | ⬜ | Final verification — blocked on all above |

---

## Summary: What's Left to Complete

### Priority 1 — Core Implementation (must-do, 18 tasks)

| # | Task | Area | Complexity | Key Files |
|---|------|------|-----------|-----------|
| 1 | 4.5 | Camera | Medium | `animator.js`, `capture.js`, `camera-sampler.js` |
| 2 | 6.5 | Capture | High | `capture.js`, `tile-await.js`, `frame-quality.js` |
| 3 | 6.6 | Capture | Low | `capture.js`, `encoder.js` |
| 4 | 6.7 | Capture | Low | `encoder.js`, `event-bus.js` |
| 5 | 7.1 | Performance | Low | `capture.js` (line 327) |
| 6 | 7.3 | Performance | Medium | `store.js`, `capture.js`, UI |
| 7 | 10.4 | Project | Medium | `project.js`, `project-schema.js` |
| 8 | 12.2 | UI | Low | All JS files with `alert(` |
| 9 | 12.3 | UI | Low | `capture.js`, `ui.js` |
| 10 | 12.4 | UI | Medium | `capture.js`, `animator.js`, `ui.js` |
| 11 | 12.5 | UI | Medium | `waypoint-builder.js`, `storyboard.js`, `ui.js` |
| 12 | 12.6 | UI | Medium | `storyboard.js`, `routing.js` |
| 13 | 12.7 | UI | Low | `index.html` |
| 14 | 13.3 | Visual | Medium | `style.css`, `css/components.css` |
| 15 | 13.4 | Visual | Low | `css/tokens.css` or `style.css` |
| 16 | 14.1 | A11y | High | `index.html`, `ui.js`, `storyboard.js` |
| 17 | 14.2 | A11y | Medium | `style.css`, `index.html` |
| 18 | 14.4 | A11y | Medium | `ui.js`, `capture.js` |

### Priority 2 — Skipped (optional tests)
All property-based and integration test tasks (marked `*` in tasks.md) were intentionally skipped. They can be added later for regression coverage. The 28 existing unit tests cover the core module contracts.

---

## Recommended Execution Order

Work in dependency order, batching by distinct files to avoid conflicts:

### Batch 1 — Quick Wins (Low complexity, independent)
1. **6.6** — Cancel cleanup: add `EncoderAPI.dispose()` call in `finishCapture()`
2. **6.7** — WebCodecs fallback: emit status event in `encoder.js`
3. **7.1** — Chunked PNG: replace hardcoded 500 with config value
4. **12.2** — Replace `alert()` calls with bus status
5. **13.4** — Add `prefers-reduced-motion` media query

### Batch 2 — Medium (Capture + Project wiring)
6. **6.5** — Wire tile-await + frame-quality into capture loop
7. **10.4** — Wire schema validation into project.js save/load
8. **4.5** — Route preview + export through camera-sampler

### Batch 3 — UI/UX Polish
9. **12.3** — Export progress via bus
10. **12.4** — Disable controls while busy
11. **12.5** — Cross-surface selection sync
12. **12.6** — Storyboard reorder propagation
13. **12.7** — Group controls under labels
14. **7.3** — Performance mode toggle

### Batch 4 — Visual + Accessibility
15. **13.3** — Consistent control classes + GPU transitions
16. **14.1** — Keyboard operability (tabs, timeline, storyboard)
17. **14.2** — Focus indicators + ARIA labels
18. **14.4** — Modal focus trap

### Final
19. **15** — Final checkpoint: `npm test` all green, manual browser verification

---

## Key Module Reference

| Module | Purpose | Pure? | Key Exports |
|--------|---------|-------|------------|
| `store.js` | Config singleton | Yes | `STUDIO_CONFIG`, `state`, `getMapboxToken()` |
| `event-bus.js` | EventTarget bus + Studio namespace | Yes | `Studio`, `EVENTS`, `registerLegacyAlias` |
| `geo.js` | Geodesic math | Yes | `haversineDistance`, `pathDistanceKm`, `bearingBetween`, `bearingDelta`, `midpoint` |
| `camera-sampler.js` | Deterministic camera | Yes | `sampleCamera(t)`, `pathProgressToCamera(t)` |
| `tile-await.js` | Tile readiness | No | `awaitTilesOrDegrade(map, opts)`, `classifyReadiness(status)` |
| `frame-quality.js` | Blank/sharp detection | Yes | `isBlankFrame(canvas)`, `frameSharpness(canvas)` |
| `speed-curve.js` | Bezier remap | Yes | `remapT(t)` (also `Studio.speed.remapT`) |
| `routing.js` | Route mode dispatch | No | `buildTrekPath(wps, opts)` (also `Studio.route`) |
| `project-schema.js` | Schema V+M+S/D | Yes | `validateProject`, `migrateProject`, `serializeProject`, `deserializeProject` |
| `validation.js` | Op input gates | Yes | `validateForOperation(op, config)`, `describeMissingInputs(op, config)` |
| `contrast.js` | WCAG contrast | Yes | `contrastRatio(fg, bg)`, `meetsAA(ratio, isLarge)` |

---

## Notes for the Next Model

1. **Always run `npm test` after changes** — 28 tests must stay green
2. **No build step** — all code is hand-authored ES modules, no bundler/transpiler
3. **Guard browser globals** — any new code in modules that touch `document`/`window` must be wrapped in `if (typeof document !== 'undefined')` so node tests can import the pure exports
4. **Studio namespace pattern** — register new public functions under `window.Studio.*` and keep `window.*` as deprecated forwarding aliases
5. **Token references** — all new CSS should reference design tokens from `css/tokens.css`, never hardcode colors/spacing
6. **The `--text-muted` fix** — tokens.css has the corrected `#86868F` value (was `#71717A`); style.css also has this fix so cascade produces the correct value
7. **Import order in `main.js`** — event-bus.js must load first (before any consumer), then the rest can be alphabetical
8. **The tasks.md file** in `.kiro/specs/pro-studio-overhaul/` is the authoritative task list — update task statuses there as work completes
