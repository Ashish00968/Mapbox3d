// Feature: pro-studio-overhaul — Accessibility (Req 7.4)
//
// Pure WCAG 2.1 relative-luminance + contrast-ratio utility.
// No DOM access, no side effects — safe to import in Node for tests
// (supports Property 19, task 14.5) and in the browser.
//
// References (rephrased for compliance with licensing restrictions):
//   - sRGB linearization + relative luminance, WCAG 2.1 definitions
//   - Contrast ratio = (L_lighter + 0.05) / (L_darker + 0.05)
//   - AA thresholds: 4.5:1 normal text, 3:1 large text / UI components

/**
 * Parse a CSS color string into { r, g, b, a }.
 * Supports #rgb, #rgba, #rrggbb, #rrggbbaa, rgb(...) and rgba(...).
 * r,g,b are integers in [0,255]; a is a float in [0,1].
 * @param {string|{r:number,g:number,b:number,a?:number}} input
 * @returns {{r:number,g:number,b:number,a:number}}
 */
export function parseColor(input) {
  if (input && typeof input === 'object') {
    const { r, g, b, a } = input;
    return { r, g, b, a: a == null ? 1 : a };
  }
  if (typeof input !== 'string') {
    throw new TypeError(`parseColor: unsupported color value: ${String(input)}`);
  }

  const str = input.trim().toLowerCase();

  // Hex forms
  if (str[0] === '#') {
    let hex = str.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    if (hex.length !== 6 && hex.length !== 8) {
      throw new Error(`parseColor: invalid hex color: ${input}`);
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
    if ([r, g, b].some(Number.isNaN)) {
      throw new Error(`parseColor: invalid hex color: ${input}`);
    }
    return { r, g, b, a };
  }

  // rgb()/rgba() forms
  const m = str.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 3) {
      throw new Error(`parseColor: invalid rgb color: ${input}`);
    }
    const channel = (p) => {
      if (p.endsWith('%')) return Math.round((parseFloat(p) / 100) * 255);
      return Math.round(parseFloat(p));
    };
    const r = channel(parts[0]);
    const g = channel(parts[1]);
    const b = channel(parts[2]);
    let a = 1;
    if (parts.length >= 4) {
      a = parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    }
    return { r, g, b, a };
  }

  throw new Error(`parseColor: unsupported color format: ${input}`);
}

/**
 * Composite a (possibly translucent) foreground color over an opaque backdrop,
 * returning an opaque color. Standard source-over alpha compositing.
 * @param {string|object} color
 * @param {string|object} backdrop must resolve to (or be treated as) opaque
 * @returns {{r:number,g:number,b:number,a:1}}
 */
export function flatten(color, backdrop) {
  const fg = parseColor(color);
  const bg = parseColor(backdrop);
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

function srgbChannelToLinear(channel8) {
  const c = channel8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * WCAG relative luminance of an (opaque) color.
 * @param {string|object} color
 * @returns {number} luminance in [0,1]
 */
export function relativeLuminance(color) {
  const { r, g, b } = parseColor(color);
  const R = srgbChannelToLinear(r);
  const G = srgbChannelToLinear(g);
  const B = srgbChannelToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/**
 * WCAG contrast ratio between a foreground and background color.
 * If the foreground is translucent it is composited over the background first.
 * The background is treated as opaque; resolve translucent backgrounds against
 * their underlying surface (e.g. flatten over --bg-base) before calling.
 * @param {string|object} fg
 * @param {string|object} bg
 * @returns {number} ratio in [1, 21]
 */
export function contrastRatio(fg, bg) {
  const bgColor = parseColor(bg);
  const fgColor = parseColor(fg);
  const fgResolved = fgColor.a < 1 ? flatten(fgColor, bgColor) : fgColor;
  const L1 = relativeLuminance(fgResolved);
  const L2 = relativeLuminance(bgColor);
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Whether a foreground/background pair meets WCAG AA.
 * Thresholds: 4.5:1 for normal text, 3:1 for large text or UI components.
 * @param {string|object} fg
 * @param {string|object} bg
 * @param {{largeText?:boolean, component?:boolean}} [opts]
 * @returns {boolean}
 */
export function meetsAA(fg, bg, opts = {}) {
  const { largeText = false, component = false } = opts;
  const threshold = largeText || component ? 3 : 4.5;
  return contrastRatio(fg, bg) >= threshold;
}

export const AA_THRESHOLDS = { normalText: 4.5, largeText: 3, component: 3 };
