import { STUDIO_CONFIG, state } from './store.js';

// ── WebCodecs availability check ──
// Guarded with `typeof` so this module is importable in node (tests) where the
// WebCodecs globals do not exist. The pure timestamp helper below never touches
// these globals, so it works regardless of WebCodecs support.
const WEBCODECS_SUPPORTED = typeof VideoEncoder !== 'undefined'
                         && typeof VideoFrame  !== 'undefined';

if (typeof window !== 'undefined') {
  window.webCodecsSupported = WEBCODECS_SUPPORTED;
}

if (!WEBCODECS_SUPPORTED) {
  console.log('[encoder] WebCodecs not available — ZIP export will be used as fallback');
  // Force the fallback path and notify the user (Req 1.9, task 6.7)
  if (typeof window !== 'undefined') {
    STUDIO_CONFIG.exportMode = 'zip';
    // Defer bus emission until event-bus.js is loaded (import order: store → encoder → event-bus)
    Promise.resolve().then(() => {
      try {
        const bus = window.Studio && window.Studio.bus;
        if (bus) bus.emit('status', { level: 'info', message: 'WebCodecs unavailable — using PNG sequence export' });
      } catch { /* bus not yet available; status is in the console */ }
    });
  }
}

// ── Pure presentation-timestamp helper (Req 1.4, 1.5; Property 3) ──
//
// Presentation timestamps MUST increase monotonically by exactly one frame
// interval. The interval is derived from a SINGLE export-wide frame rate
// (`exportFps`) and a MONOTONIC global frame index — never from a per-segment
// fps. This decouples timestamp correctness from segments that mix fps.
//
//   timestamp_us(i) = round(i * (1_000_000 / exportFps))
//
// VideoFrame timestamps are integer microseconds, so the result is rounded.
// Because the per-step interval (1e6 / exportFps) is >= 1 for any fps <= 1e6,
// rounding preserves strict monotonicity (each step adds at least 1 µs).
//
// This function is pure (no DOM, no WebCodecs, no module state) so it is
// importable on its own for the Property 3 test (task 6.9).
//
// @param {number} globalIndex monotonic export-wide frame index (0-based)
// @param {number} exportFps   single export-wide frames-per-second (> 0)
// @returns {number} presentation timestamp in integer microseconds
export function frameTimestampUs(globalIndex, exportFps) {
  return Math.round(globalIndex * (1_000_000 / exportFps));
}

// ── Export mode state ──
STUDIO_CONFIG.exportMode = 'zip'; // 'zip' | 'webcodecs'

let muxer      = null;
let videoEnc   = null;
let audioEnc   = null;
let audioCtx   = null;
let audioBuf   = null;  // AudioBuffer from imported audio file
let frameCount = 0;

// ── Initialize VideoEncoder and Muxer for a capture run ──
async function initEncoder(fps, width, height, codec) {
  frameCount = 0;

  // Create muxer
  muxer = new Mp4Muxer.Muxer({
    target:    new Mp4Muxer.ArrayBufferTarget(),
    video: {
      codec:     'avc',    // 'avc' = H.264 for MP4
      width,
      height,
      frameRate: fps,
    },
    audio: audioBuf ? {
      codec:      'aac',
      sampleRate: audioBuf.sampleRate,
      numberOfChannels: audioBuf.numberOfChannels,
    } : undefined,
    fastStart: 'in-memory',
  });

  // Create VideoEncoder
  videoEnc = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { console.error('VideoEncoder error', e); throw e; },
  });

  await videoEnc.configure({
    codec:     'avc1.4d0034',  // H.264 High Profile Level 5.2
    width,
    height,
    bitrate:   20_000_000,     // 20 Mbps for 4K
    framerate: fps,
    latencyMode: 'quality',
  });

  if (audioBuf) {
    audioEnc = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: e => { console.error('AudioEncoder error', e); throw e; },
    });
    audioEnc.configure({
      codec: 'mp4a.40.2',
      sampleRate: audioBuf.sampleRate,
      numberOfChannels: audioBuf.numberOfChannels,
      bitrate: 128_000,
    });
  }
}

// ── Encode one PNG dataURL as a VideoFrame ──
// Forwards the (globalIndex, exportFps) arguments straight through to
// encodeFrameRaw, which also accepts the legacy (fps) form (see below).
async function encodeFrame(dataUrl, globalIndexOrFps, exportFps) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const bitmap = await createImageBitmap(img);
      await encodeFrameRaw(bitmap, globalIndexOrFps, exportFps);
      resolve();
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ── Encode raw ImageBitmap directly (Optimized) ──
//
// New signature (Req 1.4/1.5): encodeFrameRaw(bitmap, globalIndex, exportFps)
//   - `globalIndex` is the monotonic export-wide frame index
//   - `exportFps`   is the single export-wide frame rate
// The presentation timestamp is computed from these via frameTimestampUs, so it
// strictly increases by exactly one frame interval regardless of per-segment fps.
//
// Backward-compatible legacy signature: encodeFrameRaw(bitmap, fps)
//   When `exportFps` is omitted, the second argument is treated as the fps and
//   the internal monotonic `frameCount` is used as the global index — matching
//   the previous behavior. This keeps current capture.js callers working until
//   they are rewired (task 6.5).
async function encodeFrameRaw(bitmap, globalIndexOrFps, exportFps) {
  let globalIndex, fps;
  if (exportFps === undefined) {
    // Legacy call: (bitmap, fps) — derive the index from the monotonic counter.
    fps = globalIndexOrFps;
    globalIndex = frameCount;
  } else {
    // New call: (bitmap, globalIndex, exportFps).
    globalIndex = globalIndexOrFps;
    fps = exportFps;
  }

  const timestamp = frameTimestampUs(globalIndex, fps); // integer microseconds
  const duration  = Math.round(1_000_000 / fps);
  const frame     = new VideoFrame(bitmap, { timestamp, duration });
  // Key every ~2 seconds, keyed off the monotonic global index.
  const keyInterval = Math.max(1, Math.round(fps) * 2);
  videoEnc.encode(frame, { keyFrame: globalIndex % keyInterval === 0 });
  frame.close();
  bitmap.close();
  frameCount++;
}

// ── Encode audio buffer into muxer ──
async function encodeAudio(fps, totalFrames) {
  if (!audioBuf || !muxer || !audioEnc) return;
  const totalSamples = Math.ceil(audioBuf.duration * audioBuf.sampleRate);
  const targetSamples = (totalFrames / fps) * audioBuf.sampleRate;
  
  // Use only the matching duration
  const samples = Math.min(totalSamples, targetSamples);
  
  const channels = [];
  for (let c = 0; c < audioBuf.numberOfChannels; c++) {
    channels.push(audioBuf.getChannelData(c));
  }
  
  const CHUNK = 48000; // Process 1 second at a time
  for (let i = 0; i < samples; i += CHUNK) {
    const end = Math.min(i + CHUNK, samples);
    const len = end - i;
    
    // f32-planar format requires consecutive blocks of each channel
    const data = new Float32Array(len * audioBuf.numberOfChannels);
    for (let c = 0; c < audioBuf.numberOfChannels; c++) {
      data.set(channels[c].subarray(i, end), c * len);
    }
    
    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: audioBuf.sampleRate,
      numberOfFrames: len,
      numberOfChannels: audioBuf.numberOfChannels,
      timestamp: (i / audioBuf.sampleRate) * 1_000_000,
      data,
    });
    
    audioEnc.encode(audioData);
    audioData.close();
  }
  
  await audioEnc.flush();
}

// ── Finalize and download encoded video ──
async function finalizeAndDownload(fps, totalFrames) {
  if (audioBuf) await encodeAudio(fps, totalFrames);
  await videoEnc.flush();
  muxer.finalize();
  const { buffer } = muxer.target;
  const blob = new Blob([buffer], { type: 'video/mp4' });
  saveAs(blob, 'trek_' + fps + 'fps.mp4');
  console.log('MP4 saved — ' + (blob.size / 1_000_000).toFixed(1) + ' MB');
}

// ── Dispose encoder resources (cancellation / cleanup) ──
//
// Closes the VideoEncoder and audio encoder (if present), nulls the muxer, and
// resets the monotonic global frame index. This supports cancellation cleanup
// so memory returns to baseline (tasks 6.5/6.6, Req 1.8/1.10). Safe to call
// multiple times and safe when nothing was initialized.
function dispose() {
  try {
    if (videoEnc && videoEnc.state !== 'closed') videoEnc.close();
  } catch (e) { /* already closed / never configured */ }
  try {
    if (audioEnc && audioEnc.state !== 'closed') audioEnc.close();
  } catch (e) { /* already closed / never configured */ }
  videoEnc   = null;
  audioEnc   = null;
  muxer      = null;
  frameCount = 0; // reset the monotonic global frame index
}

// ── Audio import ──
function initAudioImport() {
  const input = document.getElementById('audio-file-input');
  if (!input) return;
  input.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    console.log('Loading audio…');
    audioCtx = audioCtx || new AudioContext();
    const arrayBuf = await file.arrayBuffer();
    audioBuf = await audioCtx.decodeAudioData(arrayBuf);
    console.log('Audio loaded: ' + audioBuf.duration.toFixed(1) + 's');
    
    // Expose for preview and timeline visualization
    window.studioAudioCtx = audioCtx;
    window.studioAudioBuf = audioBuf;
    
    // Dispatch event so timeline can render waveform
    document.dispatchEvent(new CustomEvent('audio-loaded'));
  });
}

// ── Export mode selector ──
function buildEncoderUI() {
  const container = document.getElementById('encoder-settings');
  if (!container) return;

  const supported = WEBCODECS_SUPPORTED;

  container.innerHTML = `
    <p class="section-label">Export mode</p>
    <div class="encoder-modes">
      <label class="encoder-mode">
        <input type="radio" name="export-mode" value="zip" ${STUDIO_CONFIG.exportMode==='zip'?'checked':''}> ZIP + FFmpeg
      </label>
      <label class="encoder-mode${supported ? '' : ' encoder-mode--disabled'}" title="${supported?'':'Requires Chrome 94+'}">
        <input type="radio" name="export-mode" value="webcodecs" ${!supported?'disabled':''} ${STUDIO_CONFIG.exportMode==='webcodecs'?'checked':''}> Direct MP4
        ${!supported ? '<span class="encoder-warn"> ⚠ Chrome 94+ only</span>' : ''}
      </label>
    </div>
    ${supported ? `
      <div id="audio-import-row" class="encoder-audio-row">
        <label class="encoder-audio-label">
          Audio track (optional)
        </label>
        <input type="file" id="audio-file-input" accept="audio/*" class="select-input encoder-audio-input">
      </div>
    ` : ''}
  `;

  document.querySelectorAll('input[name=export-mode]').forEach(radio => {
    radio.addEventListener('change', () => {
      STUDIO_CONFIG.exportMode = radio.value;
    });
  });

  if (supported) initAudioImport();
}

// ── Public interface for capture.js ──
// Guarded for node/test imports where `window`/`document` do not exist (the
// pure frameTimestampUs export above is importable without any of this).
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => buildEncoderUI());
}

const EncoderAPI = {
  supported: true,
  initEncoder,
  encodeFrame,
  encodeFrameRaw,
  finalizeAndDownload,
  initAudioImport,
  dispose,
  frameTimestampUs
};

if (typeof window !== 'undefined') {
  window.EncoderAPI = EncoderAPI;

  // Also register under the Studio namespace (design "Decoupling strategy").
  window.Studio = window.Studio || {};
  window.Studio.encoder = EncoderAPI;
}
