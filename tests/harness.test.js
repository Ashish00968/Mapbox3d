// harness.test.js — DEV-ONLY sanity tests for the no-build ES-module runner.
//
// Confirms that:
//   1. The runner imports the app's js/*.js ES modules directly (no bundler).
//   2. A pure app module loads with NO live Mapbox map and NO DOM.
//   3. fast-check is available for property-based tests.
//   4. The jsdom bootstrap can load the real index.html markup + mapbox stubs.
//   5. The canvas / ImageData mock works for pixel-probe tests.

import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';

import { installStudioDom } from './helpers/dom-bootstrap.js';
import { blankCanvas, transparentCanvas, noisyCanvas } from './helpers/canvas-mock.js';

test('imports a pure app module directly as an ES module (no map, no DOM)', async () => {
  // store.js is imported with the exact same path the app ships — no transpile.
  const { STUDIO_CONFIG, state } = await import('../js/store.js');
  assert.ok(STUDIO_CONFIG, 'STUDIO_CONFIG should be exported');
  assert.equal(typeof STUDIO_CONFIG, 'object');
  assert.ok(Array.isArray(STUDIO_CONFIG.keyframes), 'keyframes should default to an array');
  assert.equal(state.map, null, 'no live Mapbox map should exist in the test runner');
});

test('fast-check is wired up for property-based testing', () => {
  // Trivial always-true property to confirm the library runs >= 100 iterations.
  fc.assert(
    fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
    { numRuns: 100 }
  );
});

test('jsdom bootstrap loads the real index.html and stubs mapboxgl', () => {
  const { document, mapboxgl } = installStudioDom();
  // Key DOM nodes the app relies on should exist from the shipped markup.
  assert.ok(document.getElementById('map'), '#map element should exist');
  assert.ok(document.getElementById('pitch-slider'), '#pitch-slider should exist');
  assert.ok(document.getElementById('capture-overlay'), '#capture-overlay should exist');
  // The mapbox stub stands in for the CDN library with no network/WebGL.
  assert.equal(typeof mapboxgl.Map, 'function');
  const map = new mapboxgl.Map({});
  assert.equal(map.areTilesLoaded(), true);
  assert.equal(map.isStyleLoaded(), true);
});

test('canvas / ImageData mock supports pixel-probe tests', () => {
  assert.equal(typeof globalThis.ImageData, 'function', 'global ImageData should be installed');

  const blank = blankCanvas(8, 8, [10, 20, 30, 255]);
  const img = blank.getContext('2d').getImageData(0, 0, 8, 8);
  assert.equal(img.width, 8);
  assert.equal(img.height, 8);
  // Every pixel in a blank canvas is identical.
  assert.equal(img.data[0], 10);
  assert.equal(img.data[1], 20);
  assert.equal(img.data[2], 30);

  const clear = transparentCanvas(4, 4);
  assert.equal(clear.getContext('2d').getImageData(0, 0, 4, 4).data[3], 0, 'alpha 0');

  // A noisy canvas should NOT be uniform.
  const noisy = noisyCanvas(8, 8, 42).getContext('2d').getImageData(0, 0, 8, 8).data;
  const allEqual = noisy.every((v, i) => i % 4 === 3 || v === noisy[i % 4]);
  assert.equal(allEqual, false, 'noisy canvas pixels should vary');
});
