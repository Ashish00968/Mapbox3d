# Dev-only test toolchain

This `tests/` directory and the repo-root `package.json` exist **only for
development**. They have **no effect on the shipped application**.

## Why this is safe for the no-build app

- The Mapbox Video Studio app ships as **vanilla ES modules loaded directly by
  `index.html`** with libraries pulled from CDNs. There is **no build step**,
  and this toolchain does **not** introduce one.
- `package.json` declares **devDependencies only** (`jsdom`, `fast-check`).
  Nothing here is bundled, transpiled, or referenced by `index.html`.
- The runner imports the same `js/*.js` files the browser loads — unchanged.

## Running the tests

```bash
npm install      # installs the dev-only devDependencies
npm test         # runs:  node --test tests/
```

You can also run the runner directly:

```bash
node --test tests/
```

## How modules are imported without a live Mapbox map

- **Pure modules** (e.g. `js/store.js`, and the new thin modules such as
  `geo.js`, `camera-sampler.js`, `project-schema.js`, `frame-quality.js`) import
  directly in node with no DOM and no map.
- **DOM / map-coupled modules** are tested after calling the jsdom bootstrap,
  which loads the real `index.html` markup and installs a stubbed `mapboxgl`
  (and `MapboxGeocoder`) global so importing them does not crash and no live
  map, network, or WebGL context is required.

## Helpers

- `tests/helpers/dom-bootstrap.js`
  - `installDom()` — bare jsdom window/document.
  - `installStudioDom()` — real `index.html` markup + jsdom globals + a stubbed
    `mapboxgl`/`MapboxGeocoder`.
  - `createMapStub()` / `installMapboxStub()` — chainable Mapbox map stub.
- `tests/helpers/canvas-mock.js`
  - `MockImageData` and a global `ImageData` shim.
  - `createMockCanvas()`, `blankCanvas()`, `transparentCanvas()`,
    `noisyCanvas()` for pixel-probe (blank-frame / sharpness) tests.

## Conventions for property-based tests

- Use **fast-check** with a minimum of **100 iterations**.
- Tag each property test with `// Feature: pro-studio-overhaul, Property N: ...`.
- Annotate the validated requirement, e.g. `**Validates: Requirements 1.3**`.
