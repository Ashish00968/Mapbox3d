// canvas-mock.js — DEV-ONLY test helper.
//
// jsdom does not implement a real 2D canvas raster backend, so pixel-probe
// tests (blank-frame detection, sharpness heuristics) need a deterministic
// fake. This helper builds a minimal canvas-like object backed by a real
// RGBA Uint8ClampedArray that getImageData() / drawImage() can read.
//
// The shipped app never imports this file.

/** A minimal ImageData stand-in (jsdom/node have no global ImageData). */
export class MockImageData {
  constructor(dataOrWidth, widthOrHeight, maybeHeight) {
    if (dataOrWidth instanceof Uint8ClampedArray) {
      this.data = dataOrWidth;
      this.width = widthOrHeight;
      this.height = maybeHeight;
    } else {
      const width = dataOrWidth;
      const height = widthOrHeight;
      this.width = width;
      this.height = height;
      this.data = new Uint8ClampedArray(width * height * 4);
    }
  }
}

// Expose a global ImageData if one is not already present, so modules that
// reference the global `ImageData` constructor can be imported.
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = MockImageData;
}

/**
 * Create a fake canvas whose 2D context returns a fixed RGBA buffer.
 * @param {object} opts
 * @param {number} opts.width
 * @param {number} opts.height
 * @param {[number,number,number,number]} [opts.fill] solid RGBA fill
 * @param {Uint8ClampedArray} [opts.data] explicit pixel buffer (RGBA)
 */
export function createMockCanvas({ width = 16, height = 16, fill, data } = {}) {
  const buffer = data ?? new Uint8ClampedArray(width * height * 4);
  if (!data && fill) {
    const [r, g, b, a] = fill;
    for (let i = 0; i < buffer.length; i += 4) {
      buffer[i] = r; buffer[i + 1] = g; buffer[i + 2] = b; buffer[i + 3] = a;
    }
  }
  const ctx = {
    canvas: null,
    drawImage() { /* no-op: downscaled draws read the same buffer */ },
    getImageData(sx = 0, sy = 0, sw = width, sh = height) {
      // Return the requested sub-rectangle as a fresh ImageData.
      const out = new Uint8ClampedArray(sw * sh * 4);
      for (let y = 0; y < sh; y++) {
        for (let x = 0; x < sw; x++) {
          const srcX = sx + x;
          const srcY = sy + y;
          const srcIdx = (srcY * width + srcX) * 4;
          const dstIdx = (y * sw + x) * 4;
          out[dstIdx] = buffer[srcIdx];
          out[dstIdx + 1] = buffer[srcIdx + 1];
          out[dstIdx + 2] = buffer[srcIdx + 2];
          out[dstIdx + 3] = buffer[srcIdx + 3];
        }
      }
      return new (globalThis.ImageData)(out, sw, sh);
    },
    fillRect() {},
    clearRect() {}
  };
  const canvas = {
    width,
    height,
    getContext: (type) => (type === '2d' ? ctx : null),
    toDataURL: () => 'data:image/png;base64,'
  };
  ctx.canvas = canvas;
  return canvas;
}

/** Convenience: a fully blank (single-color) canvas. */
export function blankCanvas(width = 16, height = 16, color = [0, 0, 0, 255]) {
  return createMockCanvas({ width, height, fill: color });
}

/** Convenience: a transparent canvas (alpha 0). */
export function transparentCanvas(width = 16, height = 16) {
  return createMockCanvas({ width, height, fill: [0, 0, 0, 0] });
}

/** Convenience: a canvas with varied (non-uniform) content. */
export function noisyCanvas(width = 16, height = 16, seed = 1) {
  const data = new Uint8ClampedArray(width * height * 4);
  let s = seed >>> 0;
  for (let i = 0; i < data.length; i += 4) {
    // simple deterministic LCG for repeatable pseudo-random pixels
    s = (s * 1664525 + 1013904223) >>> 0;
    data[i] = s & 0xff;
    data[i + 1] = (s >> 8) & 0xff;
    data[i + 2] = (s >> 16) & 0xff;
    data[i + 3] = 255;
  }
  return createMockCanvas({ width, height, data });
}
