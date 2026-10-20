// tile-await.test.js — DEV-ONLY unit tests for js/tile-await.js.
//
// Covers the pure classifier and the async readiness gate via a controllable
// map stub. The fast-check property test for tile readiness classification is
// task 6.10 and lives elsewhere; these are example/edge-case unit tests.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyReadiness,
  awaitTilesOrDegrade,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_MAX_TIMEOUT_MS
} from '../js/tile-await.js';

test('classifyReadiness: ready within the ceiling is ok', () => {
  assert.equal(classifyReadiness(0, 2500, 8000), 'ok');
  assert.equal(classifyReadiness(2500, 2500, 8000), 'ok');
  assert.equal(classifyReadiness(8000, 2500, 8000), 'ok'); // boundary: <= max
});

test('classifyReadiness: slower than soft timeout but within ceiling is still ok', () => {
  assert.equal(classifyReadiness(4000, 2500, 8000), 'ok');
});

test('classifyReadiness: beyond the ceiling is degraded', () => {
  assert.equal(classifyReadiness(8001, 2500, 8000), 'degraded');
  assert.equal(classifyReadiness(Infinity, 2500, 8000), 'degraded');
});

test('classifyReadiness: non-numeric readyTime degrades safely', () => {
  assert.equal(classifyReadiness(NaN, 2500, 8000), 'degraded');
  assert.equal(classifyReadiness(undefined, 2500, 8000), 'degraded');
});

// Minimal controllable map stub for the async gate.
function makeMapStub(initialLoaded) {
  const handlers = {};
  let loaded = initialLoaded;
  return {
    _loaded: () => loaded,
    setLoaded(v) { loaded = v; },
    areTilesLoaded() { return loaded; },
    on(type, fn) { (handlers[type] ||= []).push(fn); },
    off(type, fn) {
      if (!handlers[type]) return;
      handlers[type] = handlers[type].filter((h) => h !== fn);
    },
    fire(type) { (handlers[type] || []).forEach((fn) => fn()); },
    triggerRepaint() {}
  };
}

test('awaitTilesOrDegrade: resolves ok immediately when tiles already loaded', async () => {
  const map = makeMapStub(true);
  const result = await awaitTilesOrDegrade(map, { timeoutMs: 50, maxTimeoutMs: 200 });
  assert.equal(result.status, 'ok');
  assert.equal(result.readyTime, 0);
});

test('awaitTilesOrDegrade: resolves ok when tiles finish before the ceiling', async () => {
  const map = makeMapStub(false);
  const p = awaitTilesOrDegrade(map, { timeoutMs: 50, maxTimeoutMs: 500, pollIntervalMs: 10 });
  // Tiles become loaded shortly, then a signal fires.
  setTimeout(() => { map.setLoaded(true); map.fire('idle'); }, 30);
  const result = await p;
  assert.equal(result.status, 'ok');
  assert.ok(result.readyTime <= 500);
});

test('awaitTilesOrDegrade: resolves degraded when tiles never load by the ceiling', async () => {
  const map = makeMapStub(false);
  const result = await awaitTilesOrDegrade(map, { timeoutMs: 20, maxTimeoutMs: 80, pollIntervalMs: 10 });
  assert.equal(result.status, 'degraded');
});

test('awaitTilesOrDegrade: applies default budgets when options omitted', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 2500);
  assert.equal(DEFAULT_MAX_TIMEOUT_MS, 8000);
});
