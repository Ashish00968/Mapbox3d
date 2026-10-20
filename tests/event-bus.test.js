// event-bus.test.js — DEV-ONLY sanity tests for the event bus + Studio namespace.
//
// Confirms the centralization backbone (Req 8.1) is importable with NO live
// Mapbox map and NO DOM, and that the bus emit/on/once/off contract works.

import test from 'node:test';
import assert from 'node:assert/strict';

import Studio, {
  EventBus,
  EVENTS,
  EVENT_NAMES,
  registerLegacyAlias
} from '../js/event-bus.js';

test('enumerated event names are defined in one place', () => {
  assert.equal(EVENTS.TREK_CHANGED, 'trek-changed');
  assert.equal(EVENTS.SELECTION_CHANGED, 'selection-changed');
  assert.equal(EVENTS.EXPORT_PROGRESS, 'export-progress');
  assert.equal(EVENTS.EXPORT_DONE, 'export-done');
  assert.equal(EVENTS.STATUS, 'status');
  assert.equal(EVENTS.CONFIG_CHANGED, 'config-changed');
  assert.deepEqual(
    [...EVENT_NAMES].sort(),
    ['config-changed', 'export-done', 'export-progress', 'selection-changed', 'status', 'trek-changed']
  );
});

test('Studio namespace exposes the bus, events, and extensible sub-namespaces', () => {
  assert.ok(Studio.bus instanceof EventBus, 'Studio.bus should be an EventBus');
  assert.equal(Studio.events, EVENTS);
  for (const ns of ['camera', 'capture', 'route', 'speed', 'project', 'ui', 'geo']) {
    assert.equal(typeof Studio[ns], 'object', `Studio.${ns} placeholder should exist`);
  }
  // namespace() is idempotent and does not clobber existing content.
  Studio.camera.marker = 1;
  const cam = Studio.namespace('camera');
  assert.equal(cam.marker, 1, 'existing namespace contents are preserved');
  delete Studio.camera.marker;
});

test('Studio is attached to the global object in the no-DOM runner', () => {
  assert.equal(globalThis.Studio, Studio, 'Studio should be exposed on globalThis');
});

test('bus.emit delivers the detail payload to on() listeners', () => {
  const bus = new EventBus();
  const seen = [];
  const unsub = bus.on(EVENTS.STATUS, (detail) => seen.push(detail));
  bus.emit(EVENTS.STATUS, { level: 'info', message: 'hello' });
  bus.emit(EVENTS.STATUS, { level: 'error', message: 'bye' });
  assert.deepEqual(seen, [
    { level: 'info', message: 'hello' },
    { level: 'error', message: 'bye' }
  ]);
  unsub();
  bus.emit(EVENTS.STATUS, { level: 'info', message: 'ignored' });
  assert.equal(seen.length, 2, 'unsubscribe stops further delivery');
});

test('bus.off removes a named listener', () => {
  const bus = new EventBus();
  let count = 0;
  const fn = () => { count += 1; };
  bus.on(EVENTS.TREK_CHANGED, fn);
  bus.emit(EVENTS.TREK_CHANGED);
  bus.off(EVENTS.TREK_CHANGED, fn);
  bus.emit(EVENTS.TREK_CHANGED);
  assert.equal(count, 1, 'listener fires once then is removed');
});

test('bus.once fires a listener exactly one time', () => {
  const bus = new EventBus();
  let count = 0;
  bus.once(EVENTS.EXPORT_DONE, () => { count += 1; });
  bus.emit(EVENTS.EXPORT_DONE);
  bus.emit(EVENTS.EXPORT_DONE);
  assert.equal(count, 1, 'once listener fires a single time');
});

test('registerLegacyAlias forwards to the namespace target lazily', () => {
  // Target assigned AFTER the alias to prove lazy (call-time) resolution.
  const alias = registerLegacyAlias('__studioTestAlias', 'speed.__remapTest');
  assert.equal(alias.__deprecated, 'Studio.speed.__remapTest');
  Studio.speed.__remapTest = (t) => t * 2;
  assert.equal(globalThis.__studioTestAlias(21), 42, 'alias forwards to namespace method');
  // cleanup
  delete Studio.speed.__remapTest;
  delete globalThis.__studioTestAlias;
});
