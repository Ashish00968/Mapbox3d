# Mapbox Video Studio — Master Roadmap & Progress Summary

This document consolidates the complete development roadmap for Mapbox Video Studio, covering all phases from v1 through the latest v3 extensions, along with our current development progress.

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

### Recent Updates & Current State
We have successfully implemented all phases up to **Phase 21**. Recent developments have overhauled the platform into a cohesive, single-screen editor experience:
- **UI Architecture:** The app now utilizes a streamlined tabbed left-panel and a slide-in right context panel. A floating map toolbar acts as the primary interaction point for adding waypoints, orbits, and capturing video, resolving the split-UI issue.
- **Dynamic Routing:** Users no longer rely exclusively on GPX files; they can point-and-click to build trails with auto-elevation generation, dramatically improving accessibility.
- **Cinematic Triggers & Storyboard:** Visual representation of the route is present as a drag-and-drop storyboard strip. Waypoints act as spatial triggers for cinematic effects (labels, slow-motion, orbits), deeply integrating the route with the camera timeline.
- **Codebase:** Entirely built in vanilla JS with individual modular files for each system (e.g. `orbit.js`, `waypoint-builder.js`, `ui.js`, `storyboard.js`). No build steps are required, adhering strictly to the project's foundational constraints.
