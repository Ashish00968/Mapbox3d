// validation.test.js — DEV-ONLY unit tests for js/validation.js.
//
// Example/edge-case coverage for operation input validation (Req 4.3). The
// fast-check property test for input-validation gating is task 12.8 (Property
// 16) and lives elsewhere; these are illustrative unit tests.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateForOperation,
  canStartOperation,
  describeMissingInputs,
  MIN_KEYFRAMES,
  MIN_TREK_POINTS
} from '../js/validation.js';

const twoKeyframes = [{ t: 0 }, { t: 1 }];
const twoTrekPoints = [[0, 0], [1, 1]];

test('preview: missing keyframes yields a non-empty list', () => {
  assert.deepEqual(validateForOperation('preview', { keyframes: [] }),
    [`needs at least ${MIN_KEYFRAMES} keyframes`]);
  assert.deepEqual(validateForOperation('preview', { keyframes: [{ t: 0 }] }),
    [`needs at least ${MIN_KEYFRAMES} keyframes`]);
});

test('preview: enough keyframes yields an empty list (allowed)', () => {
  assert.deepEqual(validateForOperation('preview', { keyframes: twoKeyframes }), []);
  assert.equal(canStartOperation('preview', { keyframes: twoKeyframes }), true);
});

test('export: missing trek path yields a non-empty list', () => {
  assert.deepEqual(validateForOperation('export', { trekPath: [] }), ['needs a trek path']);
  assert.deepEqual(validateForOperation('export', { trekPath: [[0, 0]] }), ['needs a trek path']);
});

test('export: a sufficient trek path yields an empty list (allowed)', () => {
  assert.deepEqual(validateForOperation('export', { trekPath: twoTrekPoints }), []);
  assert.equal(canStartOperation('export', { trekPath: twoTrekPoints }), true);
});

test('MIN_TREK_POINTS boundary is respected', () => {
  assert.equal(MIN_TREK_POINTS, 2);
  assert.equal(canStartOperation('export', { trekPath: twoTrekPoints.slice(0, 1) }), false);
});

test('missing/garbage config fields are treated as empty (not allowed)', () => {
  assert.equal(canStartOperation('preview', {}), false);
  assert.equal(canStartOperation('export', {}), false);
  assert.equal(canStartOperation('preview', { keyframes: 'nope' }), false);
  assert.equal(canStartOperation('export', { trekPath: null }), false);
});

test('unknown operation is never permitted to start', () => {
  const missing = validateForOperation('render', { keyframes: twoKeyframes, trekPath: twoTrekPoints });
  assert.equal(missing.length > 0, true);
  assert.equal(canStartOperation('render', { keyframes: twoKeyframes, trekPath: twoTrekPoints }), false);
});

test('canStartOperation is the empty-list predicate (Property 16 contract)', () => {
  const cfgs = [
    { keyframes: [], trekPath: [] },
    { keyframes: twoKeyframes, trekPath: [] },
    { keyframes: [], trekPath: twoTrekPoints },
    { keyframes: twoKeyframes, trekPath: twoTrekPoints }
  ];
  for (const op of ['preview', 'export']) {
    for (const cfg of cfgs) {
      const allowed = validateForOperation(op, cfg).length === 0;
      assert.equal(canStartOperation(op, cfg), allowed);
    }
  }
});

test('describeMissingInputs returns empty when allowed and a sentence when not', () => {
  assert.equal(describeMissingInputs('preview', { keyframes: twoKeyframes }), '');
  assert.equal(
    describeMissingInputs('export', { trekPath: [] }),
    'Cannot start Export: needs a trek path.'
  );
  assert.equal(
    describeMissingInputs('preview', { keyframes: [] }),
    `Cannot start Preview: needs at least ${MIN_KEYFRAMES} keyframes.`
  );
});
