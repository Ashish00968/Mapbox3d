# Mapbox Video Studio --- Product Design Foundations

**Scope:** Information Architecture, User Flows, and Low-Fidelity
Wireframes\
**Status:** Draft

This document bridges the Vision and PRD with UI design.

------------------------------------------------------------------------

# 1. Information Architecture

## Objective

Define the logical structure of the application before visual design.

### Product Structure

``` text
Mapbox Video Studio
├── Authentication
├── Dashboard
├── Editor
├── Asset Library
├── Templates
├── Settings
└── Help
```

### Editor Areas

-   Canvas
-   Timeline
-   Layers
-   Assets
-   Inspector
-   Toolbar
-   Export

------------------------------------------------------------------------

# 2. User Flows

## Create Project

1.  Dashboard
2.  New Project
3.  Name
4.  Aspect Ratio
5.  Map Style
6.  Create
7.  Open Editor

## Import Route

1.  Import GPX/KML/GeoJSON
2.  Validate
3.  Display Route
4.  Camera
5.  Preview
6.  Save

## Camera Editing

1.  Select Camera
2.  Add/Edit Keyframes
3.  Preview
4.  Refine

## Export

1.  Export
2.  Choose Format
3.  Choose Resolution
4.  Render
5.  Download

------------------------------------------------------------------------

# 3. Low-Fidelity Wireframes

## Dashboard

``` text
+------------------------------------------------------+
| Search                               New Project     |
+------------------------------------------------------+
| Recent Projects                                    |
| [] [] []                                            |
| Templates                                           |
| [] [] []                                            |
+------------------------------------------------------+
```

## Editor

``` text
+--------------------------------------------------------------+
| Undo | Redo | Preview | Export                               |
+--------------------------------------------------------------+
| Toolbar | Layers | Canvas | Inspector                        |
+--------------------------------------------------------------+
| Timeline                                                |
+--------------------------------------------------------------+
```

## Export

``` text
+--------------------------------------+
| Format     MP4                       |
| Resolution 1080p                     |
| FPS        30                        |
| Quality    High                      |
|              Start Export            |
+--------------------------------------+
```

------------------------------------------------------------------------

# Design Rules

-   Grayscale only
-   Layout before visuals
-   Progressive disclosure
-   Clear hierarchy

------------------------------------------------------------------------

# Next Steps

1.  Design System
2.  Component Library
3.  High-Fidelity UI
4.  Prototype
5.  Technical Architecture
