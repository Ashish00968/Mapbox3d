// frame-quality.js — Capture_Engine per-frame quality probe.
//
// During Export each rendered frame is checked for two failure modes:
//   1. Blank frames  — a fully transparent or uniformly constant raster, the
//      classic "the map hadn't drawn anything yet" capture bug. The capture
//      loop (task 6.5) records blank frame indices in the Export report so
//      they are surfaced rather than silently shipped.
//   2. Blurry frames — an optional sharpness heuristic (variance of a Laplacian
//      on a downscaled sample) used as a soft signal; higher = sharper.
//
// The core logic is pure: it operates on an `ImageData`-shaped object
// ({ data: Uint8ClampedArray, width, height }). A convenience wrapper accepts
// either a real/mock canvas (reading pixels via getContext('2d').getImageData)
// OR an ImageData directly, so the detection logic is unit-testable with the
// MockImageData / createMockCanvas helpers (tests/helpers/canvas-mock.js) and
// supports Property 4 (task 6.11).
//
// No build step: this is a hand-authored ES module with no dependencies.
//
// _Requirements: 1.6_

// A frame is "blank" when every sampled pixel is effectively identical (a
// uniform fill) or fully transparent. Tiny encoding/dithering noise should not
// defeat detection, so equality is judged within a small per-channel
// tolerance.
export const DEFAULT_BLANK_TOLERANCE = 2;      // max per-channel delta to treat as "same"
export const DEFAULT_SAMPLE_GRID = 16;         // sample an N×N grid of pixels
export const DEFAULT_ALPHA_BLANK_THRESHOLD = 8; // alpha at/below this => transparent

/**
 * Normalize the accepted input into an ImageData-shaped object.
 *
 * Accepts:
 *   - an ImageData-like object: has numeric `width`/`height` and a `data`
 *     typed array (returned as-is).
 *   - a canvas-like object: exposes getContext('2d') with getImageData.
 *
 * @param {object} source canvas-like or ImageData-like
 * @returns {{data: (Uint8ClampedArray|number[]), width: number, height: number}|null}
 */
export function toImageData(source) {
  if (!source || typeof source !== 'object') return null;

  // Already ImageData-shaped (real ImageData or MockImageData).
  if (source.data && Number.isFinite(source.width) && Number.isFinite(source.height)) {
    return source;
  }

  // Canvas-like: pull the full raster via the 2D context.
  if (typeof source.getContext === 'function') {
    const ctx = source.getContext('2d');
    if (ctx && typeof ctx.getImageData === 'function') {
      const w = source.width || 0;
      const h = source.height || 0;
      if (w > 0 && h > 0) {
        return ctx.getImageData(0, 0, w, h);
      }
    }
  }

  return null;
}

/**
 * Detect a uniformly constant / fully transparent frame.
 *
 * Samples a small evenly-spaced grid of pixels (rather than every pixel, to
 * keep the probe cheap) and returns true when:
 *   - every sampled pixel is fully transparent (alpha <= alphaThreshold), OR
 *   - every sampled pixel matches the first sampled pixel within `tolerance`
 *     on all four channels (a uniform fill of any color).
 *
 * Accepts a canvas-like object or an ImageData-like object directly, so the
 * detection is unit-testable without a real canvas backend.
 *
 * @param {object} source canvas-like or ImageData-like
 * @param {{tolerance?: number, grid?: number, alphaThreshold?: number}} [opts]
 * @returns {boolean} true when the frame is blank
 */
export function isBlankFrame(source, opts = {}) {
  const tolerance = Number.isFinite(opts.tolerance) ? opts.tolerance : DEFAULT_BLANK_TOLERANCE;
  const grid = Number.isFinite(opts.grid) && opts.grid > 0 ? Math.floor(opts.grid) : DEFAULT_SAMPLE_GRID;
  const alphaThreshold = Number.isFinite(opts.alphaThreshold) ? opts.alphaThreshold : DEFAULT_ALPHA_BLANK_THRESHOLD;

  const img = toImageData(source);
  // Treat an unreadable / empty raster as blank: there is nothing to show.
  if (!img || !img.data || img.width <= 0 || img.height <= 0) return true;

  const { data, width, height } = img;

  // Evenly spaced sample positions across the raster. Clamp the grid so we
  // never request more samples than there are pixels in a dimension.
  const cols = Math.min(grid, width);
  const rows = Math.min(grid, height);

  let firstR = 0, firstG = 0, firstB = 0, firstA = 0;
  let haveFirst = false;
  let allTransparent = true;

  for (let row = 0; row < rows; row++) {
    // Center each sample within its cell to avoid biasing toward the edges.
    const y = rows === 1 ? 0 : Math.min(height - 1, Math.floor(((row + 0.5) / rows) * height));
    for (let col = 0; col < cols; col++) {
      const x = cols === 1 ? 0 : Math.min(width - 1, Math.floor(((col + 0.5) / cols) * width));
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3];

      if (a > alphaThreshold) allTransparent = false;

      if (!haveFirst) {
        firstR = r; firstG = g; firstB = b; firstA = a;
        haveFirst = true;
      } else if (
        Math.abs(r - firstR) > tolerance ||
        Math.abs(g - firstG) > tolerance ||
        Math.abs(b - firstB) > tolerance ||
        Math.abs(a - firstA) > tolerance
      ) {
        // Found a pixel that differs from the reference: not a uniform fill.
        // It still counts as blank only if the whole frame is transparent,
        // which we cannot conclude here, so keep scanning to settle alpha.
        return continueTransparentScan(data, width, height, rows, cols, alphaThreshold, row, col, allTransparent);
      }
    }
  }

  // Either every sampled pixel was identical (uniform fill) or fully
  // transparent — both are blank.
  return true;
}

/**
 * Helper: once a non-uniform pixel is found, the frame can still be "blank" if
 * it is entirely transparent. Finish scanning the remaining sample grid for any
 * opaque pixel; if none is found, the frame is transparent (blank).
 */
function continueTransparentScan(data, width, height, rows, cols, alphaThreshold, startRow, startCol, allTransparent) {
  if (!allTransparent) {
    // We already saw an opaque pixel and a color difference -> real content.
    return false;
  }
  for (let row = startRow; row < rows; row++) {
    const y = rows === 1 ? 0 : Math.min(height - 1, Math.floor(((row + 0.5) / rows) * height));
    for (let col = (row === startRow ? startCol : 0); col < cols; col++) {
      const x = cols === 1 ? 0 : Math.min(width - 1, Math.floor(((col + 0.5) / cols) * width));
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > alphaThreshold) return false;
    }
  }
  return true;
}

/**
 * Optional sharpness heuristic: variance of the Laplacian over a luminance
 * sample of the frame. Higher values indicate more high-frequency detail
 * (sharper); a near-zero value indicates a flat/blurry frame.
 *
 * This is a soft signal only — it is not a hard pass/fail gate. It operates on
 * the sampled grid for cheapness and is robust to small frames.
 *
 * @param {object} source canvas-like or ImageData-like
 * @param {{grid?: number}} [opts]
 * @returns {number} variance of the Laplacian (>= 0; higher = sharper)
 */
export function frameSharpness(source, opts = {}) {
  const grid = Number.isFinite(opts.grid) && opts.grid > 0 ? Math.floor(opts.grid) : DEFAULT_SAMPLE_GRID;
  const img = toImageData(source);
  if (!img || !img.data || img.width <= 0 || img.height <= 0) return 0;

  const { data, width, height } = img;
  const cols = Math.min(grid, width);
  const rows = Math.min(grid, height);
  if (cols < 3 || rows < 3) return 0; // need a 3x3 neighborhood for a Laplacian

  // Build a small luminance map from evenly-spaced samples.
  const lum = new Float64Array(rows * cols);
  for (let row = 0; row < rows; row++) {
    const y = Math.min(height - 1, Math.floor(((row + 0.5) / rows) * height));
    for (let col = 0; col < cols; col++) {
      const x = Math.min(width - 1, Math.floor(((col + 0.5) / cols) * width));
      const idx = (y * width + x) * 4;
      // Rec. 601 luma.
      lum[row * cols + col] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    }
  }

  // 4-neighbor Laplacian over the interior of the luminance map.
  const responses = [];
  for (let row = 1; row < rows - 1; row++) {
    for (let col = 1; col < cols - 1; col++) {
      const c = lum[row * cols + col];
      const up = lum[(row - 1) * cols + col];
      const down = lum[(row + 1) * cols + col];
      const left = lum[row * cols + (col - 1)];
      const right = lum[row * cols + (col + 1)];
      responses.push(up + down + left + right - 4 * c);
    }
  }
  if (responses.length === 0) return 0;

  // Variance of the Laplacian responses.
  let mean = 0;
  for (const v of responses) mean += v;
  mean /= responses.length;
  let variance = 0;
  for (const v of responses) {
    const d = v - mean;
    variance += d * d;
  }
  variance /= responses.length;
  return variance;
}

// Optional, non-breaking registration under the Studio namespace so call sites
// can migrate opportunistically (see design "Decoupling strategy"). Guarded so
// the module remains usable as a plain import in tests and in node.
if (typeof window !== 'undefined') {
  window.Studio = window.Studio || {};
  window.Studio.quality = window.Studio.quality || {};
  window.Studio.quality.isBlankFrame = isBlankFrame;
  window.Studio.quality.frameSharpness = frameSharpness;
  window.Studio.quality.toImageData = toImageData;
}
