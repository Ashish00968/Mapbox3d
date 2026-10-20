# Mapbox Video Studio — Product Requirements Document (PRD)

> **Version:** 1.0 (Draft)
> **Status:** Planning
> **Purpose:** This document is the single source of truth for what Mapbox Video Studio is, what it should do, and how it should evolve.

---

# Table of Contents
1. Executive Summary
2. Product Vision Alignment
3. Product Goals
4. Business Goals
5. Non-Goals
6. Success Metrics
7. Target Users & Personas
8. User Problems
9. Product Principles
10. User Journeys
11. Information Architecture
12. Workspace Overview
13. Functional Requirements
14. Non-Functional Requirements
15. UX Requirements
16. Design Requirements
17. Accessibility Requirements
18. Performance Requirements
19. Browser Compatibility
20. Security Requirements
21. Error Handling
22. Analytics & Telemetry
23. MVP Scope (Version 1)
24. Version 2 Roadmap
25. Future Opportunities
26. Features Explicitly Out of Scope
27. Open Questions
28. Acceptance Criteria
29. Product Glossary
30. Appendix

---

# 1. Executive Summary

Mapbox Video Studio is a browser-native creative application that lets storytellers turn geographic data (routes, GPS tracks, boundaries, points of interest) into cinematic video. It targets journalists, documentary filmmakers, travel creators, educators, and data storytellers who need publish-ready map animations without GIS expertise or desktop video-editing skill. The product's differentiator is combining a low floor (beautiful results by default) with a high ceiling (full manual override of every automated decision), delivered at desktop-app performance inside a browser tab.

# 2. Product Vision Alignment

Every requirement in this PRD is traceable to the Vision Document's four pillars:

| Vision Pillar | PRD Expression |
|---|---|
| Creativity First | AI Assistant, sensible defaults, minimal required setup before first render |
| Low Floor, High Ceiling | Templates + full manual keyframe/camera/route control |
| Beautiful by Default | Default camera easing, default typography system, default color grading |
| Storytelling Over Geography | Timeline-first workspace, narrative pacing tools, not a GIS analysis surface |

Any feature proposal must cite which pillar it advances before entering the roadmap (see Section 12 of the Vision Document — North Star Decision Framework).

# 3. Product Goals

- Enable a first-time user to produce a shareable map animation in under 10 minutes.
- Deliver export quality (resolution, frame timing, color) acceptable for broadcast and social publishing without post-processing.
- Make every core interaction (scrub, camera move, route edit) feel instantaneous (<100ms perceived latency) in-browser.
- Ensure every automated action (auto-camera, auto-route, AI suggestions) is presented as an edit the user can inspect and override, not a black box.

# 4. Business Goals

- Drive new user acquisition through low-friction first-project success ("aha moment" inside first session).
- Increase creator retention via project history, templates, and reusable style presets.
- Grow subscription revenue through tiered export quality, storage, and collaboration seats.
- Increase export volume as the primary activation/retention signal.
- Build community distribution through shareable templates and public project galleries.

# 5. Non-Goals

Mapbox Video Studio explicitly will **not** become:

- A GIS analysis platform (no spatial querying, no shapefile analytics suite).
- A turn-by-turn navigation application.
- A general-purpose, timeline-agnostic video editor competing with tools like Premiere or CapCut for non-map content.
- A raw data visualization/BI tool (e.g., no generic bar/pie chart building unrelated to spatial storytelling).

# 6. Success Metrics

**Product metrics**
- Time-to-first-export (target: <10 min for new users)
- % of projects exported without leaving default camera/route suggestions untouched (measures "beautiful by default" success)
- % of AI-assisted actions subsequently edited by the user (measures deconstructability, not treated as a negative signal)

**User metrics**
- 7-day and 30-day retention
- Projects per active user per month
- Template reuse rate

**Business metrics**
- Conversion from free to paid tier
- Export volume per billing period
- Net revenue retention

# 7. Target Users & Personas

**1. The Journalist / Data Storyteller**
- Goals: Turn a dataset (flight paths, migration, disaster spread) into a publishable explainer video quickly.
- Pain points: No time to learn GIS tools; deadlines measured in hours.
- Technical expertise: Low-to-moderate; comfortable with spreadsheets, not with 3D software.
- Success criteria: Accurate, credible, on-deadline export.

**2. The Travel / Adventure Creator**
- Goals: Turn a GPX track from a trip into an emotionally engaging recap video for social platforms.
- Pain points: Existing tools are either too simple (static map screenshots) or too complex (After Effects plugins).
- Technical expertise: Moderate; fluent in consumer creative apps, not professional NLEs.
- Success criteria: Cinematic, shareable output matching personal brand aesthetic.

**3. The Documentary Filmmaker / Professional Editor**
- Goals: Integrate high-fidelity map sequences into a larger production.
- Pain points: Needs frame-accurate control and format flexibility that "easy" tools don't provide.
- Technical expertise: High; expects keyframe-level control, export flexibility, and non-destructive editing.
- Success criteria: Full manual override capability; broadcast-grade export fidelity.

**4. The Educator**
- Goals: Build a repeatable, clear animation to explain a historical or geographic concept to students.
- Pain points: No budget for professional tools; needs projects to be simple to update year over year.
- Technical expertise: Low.
- Success criteria: Reusable templates, simple re-editing.

# 8. User Problems

- Producing map animation currently requires stitching together GIS export + generic video editor + manual keyframing — a multi-tool workflow with no continuity.
- Beginners cannot achieve professional-looking camera motion or route reveal without significant trial and error.
- Professionals lose disproportionate time to repetitive setup (camera paths, easing curves, timing sync) that could be automated without losing control.
- Existing tools' non-browser architecture creates friction (installs, licenses, hardware limits, file-based collaboration).
- Automated/AI features in adjacent tools are frequently opaque, discouraging trust and adoption among professional users.

# 9. Product Principles

Directly inherited from the Vision Document and translated into build requirements:

- **Creativity First →** No required project setup screen may block a user from seeing a live map before their first edit.
- **Low Floor, High Ceiling →** Every AI/automated feature must expose an "edit manually" affordance in the same interaction.
- **Beautiful by Default →** Default templates, typography, and camera moves must pass an internal design QA bar before shipping — not require user tuning.
- **Non-Destructive Creativity →** All edits are layered/versioned; Undo history persists per project session at minimum.
- **Performance as UX →** No core interaction may exceed 100ms perceived response time; violations are treated as P1 bugs, not polish items.
- **Collaborative State →** Projects autosave continuously; there is no explicit "Save" action required from the user.

# 10. User Journeys

**Journey A — Create First Project (New User)**
1. User lands on Studio, prompted to start from a template or blank map.
2. User imports a GPX/GeoJSON file or draws a route manually.
3. Studio auto-generates a suggested camera path and timeline.
4. User previews, adjusts pacing via timeline, adjusts camera via direct manipulation.
5. User exports.

**Journey B — Import GPX and Build a Route**
1. User uploads a GPX file.
2. System validates and renders the track on the map.
3. System suggests route simplification/smoothing for cinematic pacing.
4. User confirms or manually edits route points.

**Journey C — Animate Camera**
1. User selects "Auto Camera" or manually places camera keyframes.
2. User adjusts easing, angle, and follow-behavior per segment.
3. User previews in real time with scrubbing.

**Journey D — Export Video**
1. User selects resolution, format, and quality tier.
2. System renders in-browser or via cloud render (see Section 13, Export System).
3. User receives a shareable link and/or downloadable file.

# 11. Information Architecture

- **Home / Project Dashboard** — recent projects, templates, org/team projects (if applicable).
- **Editor Workspace** — the core creative environment (see Section 12).
- **Asset Library** — user-uploaded and stock geographic/media assets.
- **Template Gallery** — starter projects by category (travel, news, education, business).
- **Export Center** — render queue, export history, download/share links.
- **Account & Settings** — billing, preferences, team management.

# 12. Workspace Overview

The Editor Workspace consists of:

- **Canvas** — the live map render; the primary focus of the screen at all times.
- **Toolbar** — contextual tools (route draw, camera, text/overlay, markers), collapsed by default to reduce visual noise per the "No Friction Points" principle.
- **Sidebar** — layers, assets, and project structure.
- **Inspector** — contextual properties panel for the currently selected element (camera keyframe, route segment, overlay).
- **Timeline** — the narrative spine of the project; scrubbing, keyframes, and pacing controls live here.
- **Status Bar** — render/save state, performance indicator, collaboration presence.

# 13. Functional Requirements

Each module below is scoped for MVP unless marked otherwise (see Section 23).

### Project Management
- *Purpose:* Create, organize, and persist projects.
- *User stories:* As a user, I want my project to autosave continuously so I never lose work.
- *Requirements:* Continuous autosave; project versioning/history; duplicate/rename/delete projects.
- *Acceptance criteria:* No explicit save action required; version history recoverable for at least 30 days.
- *Edge cases:* Concurrent edits from multiple tabs/devices; offline edit reconciliation.

### Map Engine
- *Purpose:* Render accurate, styled geographic base layers.
- *Requirements:* Real-world coordinate accuracy (Spatial Integrity principle); multiple base styles; smooth zoom/pan at 60fps target.
- *Acceptance criteria:* No visible tile pop-in or reprojection artifacts during camera motion.

### Camera System
- *Purpose:* Define cinematic motion through 3D map space.
- *Requirements:* Auto-generated default camera paths; manual keyframe placement; adjustable easing curves; follow/track behaviors along a route.
- *Acceptance criteria:* Every auto-generated camera move is editable via visible keyframes (Deconstructability).

### Route System
- *Purpose:* Define and animate the path(s) that structure the story.
- *Requirements:* Import from GPX/GeoJSON/KML; manual route drawing; route simplification/smoothing suggestions; multi-route support.
- *Acceptance criteria:* Imported routes render within the same session without manual reprojection.

### Timeline
- *Purpose:* Sequence and pace the narrative.
- *Requirements:* Multi-track (camera, route reveal, overlays, audio); scrubbing; keyframe editing; snapping.
- *Acceptance criteria:* Scrub latency under 100ms at target project complexity.

### Animation System
- *Purpose:* Interpolate motion and data changes over time.
- *Requirements:* Easing presets and custom curve editor; data-driven interpolation (e.g., time-series overlays synced to route progress).

### Motion Graphics
- *Purpose:* Add narrative emphasis beyond the base map.
- *Requirements:* Text titles/lower-thirds, callouts, markers with animated entrance/exit.
- *Acceptance criteria:* Typography defaults meet the "Typography as Architecture" design bar without user adjustment.

### Overlays
- *Purpose:* Layer supplementary information (data charts, images, labels) onto the map canvas.
- *Requirements:* Position/scale/timing control; import of static image/chart assets.

### Asset Library
- *Purpose:* Centralize reusable creative assets.
- *Requirements:* Upload/store images, audio, data files; organize by project or globally.

### Templates
- *Purpose:* Provide a beautiful, working starting point.
- *Requirements:* Category-based template gallery; one-click apply to a new or existing project.
- *Acceptance criteria:* Every shipped template passes the same design QA bar as default settings.

### Export System
- *Purpose:* Produce final shareable/publishable video output.
- *Requirements:* Resolution/format/quality options; in-browser or cloud rendering; shareable link generation; download.
- *Acceptance criteria:* Export reliably completes without manual retry for projects within documented complexity limits (see Section 18).

### AI Assistant
- *Purpose:* Act as a co-pilot, not an autopilot (Intelligent Automation principle).
- *Requirements:* Suggest camera paths, pacing, route simplification, and narrative structure; every suggestion must be presented as an editable, reversible layer, never a silent, permanent change.
- *Acceptance criteria:* 100% of AI-generated changes are visible in the timeline/inspector and reversible via Undo.

### Preferences & Settings
- *Purpose:* User- and project-level configuration.
- *Requirements:* Units, default export settings, accessibility preferences (see Section 17), account/billing settings.

# 14. Non-Functional Requirements

- **Reliability:** Autosave must not lose more than the last few seconds of work in a crash scenario.
- **Scalability:** Architecture must support growth from single-user projects to team/collaborative projects without redesign.
- **Maintainability:** Feature modules (Section 13) should be independently testable and deployable.
- **Responsiveness:** All core interactions target sub-100ms perceived latency, per the Performance as UX principle.

# 15. UX Requirements

- Discoverability: advanced tools are accessible but not visually dominant by default (progressive disclosure).
- Full keyboard shortcut coverage for core timeline/camera actions.
- Undo/redo available for every action, including AI-assisted ones.
- Onboarding must get a user to a visible, styled map within seconds of landing — no blocking setup wizard.

# 16. Design Requirements

- **Design language:** Subdued, neutral UI chrome; the map/canvas is always the visual focal point.
- **Layout:** Panel-based workspace (Toolbar, Sidebar, Inspector, Timeline) with collapsible, low-noise chrome.
- **Spacing & Typography:** Editorial-grade typographic system for in-canvas labels/titles, distinct from UI chrome typography.
- **Iconography:** Minimal, consistent, functional-first icon set.
- **Color system:** Neutral UI palette that never competes with map/content color.
- **Dark mode:** Supported as a first-class theme, not an inverted afterthought.

# 17. Accessibility Requirements

- Full keyboard navigation across all editor panels.
- Screen reader support for project management, settings, and non-canvas UI (canvas/map rendering accessibility is an open research area — see Section 27).
- Visible, consistent focus states throughout.
- Reduced-motion setting that dampens or disables non-essential UI animation (does not affect exported video content).
- Minimum contrast ratios for all UI text per WCAG AA.

# 18. Performance Requirements

- App shell load/startup: target under 3 seconds on broadband connections.
- Core interactions (scrub, camera drag, route edit): under 100ms perceived latency.
- Export reliability: defined complexity ceiling (route length, project duration, overlay count) documented and enforced with clear user warnings before failure, not silent failure.
- Memory usage: bounded and monitored to avoid tab crashes on long editing sessions.

# 19. Browser Compatibility

- Supported: latest two stable versions of Chrome, Edge, Firefox, and Safari.
- WebGL/GPU-accelerated rendering required; graceful degradation messaging for unsupported browsers/hardware rather than silent failure.

# 20. Security Requirements

- Authenticated access to all user projects and assets.
- Project and asset data encrypted in transit and at rest.
- Scoped API access for any third-party data import (e.g., GPX/GeoJSON sources).
- Team/collaboration permissions must be project-scoped, not account-wide by default.

# 21. Error Handling

- All failures (import errors, render failures, network loss) must produce a specific, actionable message — never a silent failure or generic error.
- Autosave/version history must allow recovery from any failed session.
- Import validation must clearly flag malformed or unsupported geographic files before they enter the canvas.

# 22. Analytics & Telemetry

- Track activation funnel: signup → first import/draw → first export.
- Track AI Assistant interaction rates (suggested vs. accepted vs. edited) to validate the Deconstructability principle in practice.
- Anonymized usage analytics only; no raw project content used for analytics without explicit consent.
- Performance telemetry (latency, render time, crash rate) monitored continuously against Section 18 targets.

# 23. MVP Scope (Version 1)

- Map Engine (core styles, real-world accuracy)
- Route System (import GPX/GeoJSON + manual draw)
- Camera System (auto-generated default path + manual keyframing)
- Timeline (core scrubbing, keyframes, basic multi-track)
- Basic Motion Graphics (titles, markers)
- Export System (core resolutions/formats, in-browser or cloud render)
- Template Gallery (initial curated set)
- Project Management (autosave, project dashboard)
- AI Assistant (camera + pacing suggestions only, fully editable)

# 24. Version 2 Roadmap

- Expanded Overlays (data-driven charts synced to route progress)
- Team collaboration (live multi-user editing)
- Expanded AI Assistant (narrative structure suggestions, auto-generated title/caption copy)
- Asset Library expansion (stock geographic datasets, audio library)
- Advanced export options (broadcast-grade formats, higher resolution tiers)

# 25. Future Opportunities

- Real-Time Spatial Direction: live, collaborative spatial broadcasts (per Vision Document Section 13).
- Generative spatial intelligence suggesting narrative data layers and camera perspectives in real time.
- Public template/community marketplace.
- API access for programmatic project generation (e.g., newsroom pipelines).

# 26. Features Explicitly Out of Scope

- GIS spatial analysis tooling (buffering, spatial joins, etc.)
- Turn-by-turn navigation/routing for end-user wayfinding
- General-purpose non-map video editing (e.g., arbitrary webcam/screen-recording editing unrelated to spatial content)
- Native desktop application (browser-native is a core commitment, not a stopgap)

# 27. Open Questions

- What is the accessibility strategy for the canvas/map rendering itself (beyond surrounding UI)?
- What complexity ceiling (route length, duration, overlay count) is realistic for reliable in-browser export at launch?
- What is the collaboration model for MVP — is any live multi-user editing required before V2, or fully deferred?
- How should AI Assistant suggestions be scoped to avoid overwhelming first-time users while still being visible/editable?
- What cloud-render fallback strategy is needed for lower-powered devices/browsers?

# 28. Acceptance Criteria

A feature is considered complete when:
- It satisfies all four North Star Decision Framework questions from the Vision Document.
- It has documented acceptance criteria at the module level (see Section 13).
- It meets the relevant Non-Functional and Performance requirements (Sections 14, 18).
- Any automated/AI behavior is fully visible and reversible in the UI.

# 29. Product Glossary

- **Canvas:** The live, interactive map render at the center of the workspace.
- **Route:** A defined path (imported or drawn) that structures the narrative journey.
- **Camera Path:** The sequence of viewpoints/motion through 3D map space over time.
- **Keyframe:** A defined point of state (camera, overlay, etc.) at a specific time on the Timeline.
- **Template:** A pre-built, styled starting project.
- **AI Assistant:** The co-pilot system that suggests but never finalizes creative decisions without user visibility.

# 30. Appendix

- Reference: *Mapbox Video Studio: The Vision Document (Refined)*
- Supporting research, diagrams, and competitive analysis to be linked here as they are produced.

---

## Document Rules

- Every requirement must be testable.
- Every feature must support the Vision Document.
- Every user story must include acceptance criteria.
- Every new feature should reference this PRD before implementation.
- This document is the authoritative product specification for Mapbox Video Studio.
