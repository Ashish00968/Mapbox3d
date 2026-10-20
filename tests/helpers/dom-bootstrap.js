// dom-bootstrap.js — DEV-ONLY test helper.
//
// Provides a minimal jsdom + global stub environment so that DOM-touching app
// modules can be imported in node WITHOUT a live Mapbox map or a browser.
//
// The shipped app never imports this file. It exists purely to let the
// `node --test` runner exercise js/*.js modules.
//
// Two levels of bootstrap are offered:
//   1. installDom()        -> bare jsdom window/document (no app markup)
//   2. installStudioDom()  -> jsdom loaded with the real index.html markup,
//                             plus a stubbed `mapboxgl` and `MapboxGeocoder`
//                             so heavily-coupled modules (map.js, ui.js, ...)
//                             can be imported without crashing.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

/**
 * Copy the jsdom window's properties onto Node's globalThis so that modules
 * referencing bare `document`, `window`, `navigator`, etc. resolve correctly.
 */
function defineGlobal(name, value) {
  // Some globals (e.g. `navigator` in modern Node) are getter-only; a plain
  // assignment throws. Use defineProperty and fall back gracefully.
  try {
    globalThis[name] = value;
  } catch {
    try {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    } catch {
      /* leave the existing global in place */
    }
  }
}

function exposeGlobals(dom) {
  const { window } = dom;
  defineGlobal('window', window);
  defineGlobal('document', window.document);
  defineGlobal('navigator', window.navigator);
  defineGlobal('HTMLElement', window.HTMLElement);
  defineGlobal('CustomEvent', window.CustomEvent);
  defineGlobal('Event', window.Event);
  defineGlobal('Node', window.Node);
  defineGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  // matchMedia is not implemented by jsdom; provide a no-op for
  // prefers-reduced-motion lookups.
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = (query) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() { return false; }
    });
  }
  globalThis.matchMedia = window.matchMedia.bind(window);
  return dom;
}

/** Bare jsdom environment with no application markup. */
export function installDom(html = '<!DOCTYPE html><html><head></head><body></body></html>') {
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  return exposeGlobals(dom);
}

/**
 * A lightweight chainable stub that stands in for a Mapbox GL map instance.
 * Every method returns the stub (or a benign default) so chained calls and
 * event registration during module import do not throw.
 */
export function createMapStub() {
  const handlers = {};
  const stub = {
    _handlers: handlers,
    on(type, fn) { (handlers[type] ||= []).push(fn); return stub; },
    once(type, fn) { (handlers[type] ||= []).push(fn); return stub; },
    off() { return stub; },
    fire(type, ev) { (handlers[type] || []).forEach((fn) => fn(ev)); return stub; },
    addControl() { return stub; },
    removeControl() { return stub; },
    addSource() { return stub; },
    removeSource() { return stub; },
    addLayer() { return stub; },
    removeLayer() { return stub; },
    getLayer() { return undefined; },
    getSource() { return undefined; },
    setTerrain() { return stub; },
    setFog() { return stub; },
    setLight() { return stub; },
    setConfigProperty() { return stub; },
    setPaintProperty() { return stub; },
    setLayoutProperty() { return stub; },
    jumpTo() { return stub; },
    easeTo() { return stub; },
    flyTo() { return stub; },
    setCenter() { return stub; },
    setZoom() { return stub; },
    setPitch() { return stub; },
    setBearing() { return stub; },
    getCenter() { return { lng: 0, lat: 0 }; },
    getZoom() { return 12; },
    getPitch() { return 60; },
    getBearing() { return 0; },
    getCanvas() {
      return {
        width: 1920,
        height: 1080,
        getContext: () => ({ getContextAttributes: () => ({ preserveDrawingBuffer: true }) })
      };
    },
    getContainer() { return document.getElementById('map') || document.body; },
    isStyleLoaded() { return true; },
    areTilesLoaded() { return true; },
    queryTerrainElevation() { return 0; },
    project() { return { x: 0, y: 0 }; },
    unproject() { return { lng: 0, lat: 0 }; },
    resize() { return stub; },
    remove() { return stub; }
  };
  return stub;
}

/** Install a stubbed `mapboxgl` global plus the geocoder plugin global. */
export function installMapboxStub() {
  const mapStub = createMapStub();
  const mapboxgl = {
    accessToken: '',
    Map: function Map() { return mapStub; },
    NavigationControl: function NavigationControl() { return {}; },
    Marker: function Marker() {
      return {
        setLngLat() { return this; },
        addTo() { return this; },
        remove() { return this; },
        setPopup() { return this; },
        getElement() { return document.createElement('div'); },
        on() { return this; }
      };
    },
    Popup: function Popup() {
      return {
        setLngLat() { return this; },
        setHTML() { return this; },
        addTo() { return this; },
        remove() { return this; }
      };
    },
    LngLat: function LngLat(lng, lat) { return { lng, lat }; }
  };
  globalThis.mapboxgl = mapboxgl;

  // Geocoder plugin global (loaded from CDN in index.html).
  globalThis.MapboxGeocoder = function MapboxGeocoder() {
    return { onAdd: () => document.createElement('div'), on() { return this; } };
  };

  return { mapboxgl, mapStub };
}

/**
 * Full Studio bootstrap: real index.html markup + jsdom globals + mapbox stubs.
 * Use this before importing DOM/map-coupled modules in a test.
 */
export function installStudioDom() {
  const html = readFileSync(join(REPO_ROOT, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { pretendToBeVisual: true, runScripts: 'outside-only' });
  exposeGlobals(dom);
  const { mapboxgl, mapStub } = installMapboxStub();
  return { dom, window: dom.window, document: dom.window.document, mapboxgl, mapStub };
}
