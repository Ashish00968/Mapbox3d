import { STUDIO_CONFIG, state } from './store.js';

// ── WebCodecs availability check ──
const WEBCODECS_SUPPORTED = typeof VideoEncoder !== 'undefined'
                         && typeof VideoFrame  !== 'undefined';

window.webCodecsSupported = WEBCODECS_SUPPORTED;

if (!WEBCODECS_SUPPORTED) {
  console.log('[encoder] WebCodecs not available — ZIP export will be used as fallback');
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
async function encodeFrame(dataUrl, fps) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = async () => {
      const bitmap    = await createImageBitmap(img);
      await encodeFrameRaw(bitmap, fps);
      resolve();
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// ── Encode raw ImageBitmap directly (Optimized) ──
async function encodeFrameRaw(bitmap, fps) {
  const timestamp = (frameCount / fps) * 1_000_000; // microseconds
  const frame     = new VideoFrame(bitmap, { timestamp, duration: 1_000_000 / fps });
  videoEnc.encode(frame, { keyFrame: frameCount % (fps * 2) === 0 });
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
    <div style="display:flex; gap:6px; margin-bottom:8px">
      <label style="display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-secondary); cursor:pointer">
        <input type="radio" name="export-mode" value="zip" ${STUDIO_CONFIG.exportMode==='zip'?'checked':''}> ZIP + FFmpeg
      </label>
      <label style="display:flex; align-items:center; gap:4px; font-size:11px; color:${supported?'var(--text-secondary)':'var(--text-muted)'}; cursor:pointer" title="${supported?'':'Requires Chrome 94+'}">
        <input type="radio" name="export-mode" value="webcodecs" ${!supported?'disabled':''} ${STUDIO_CONFIG.exportMode==='webcodecs'?'checked':''}> Direct MP4
        ${!supported ? '<span style="color:#f59e0b; font-size:10px"> ⚠ Chrome 94+ only</span>' : ''}
      </label>
    </div>
    ${supported ? `
      <div id="audio-import-row" style="margin-top:6px">
        <label style="font-size:11px; color:var(--text-secondary); display:block; margin-bottom:4px">
          Audio track (optional)
        </label>
        <input type="file" id="audio-file-input" accept="audio/*" class="select-input" style="font-size:11px; width:100%; background-image:none;">
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

document.addEventListener('DOMContentLoaded', () => buildEncoderUI());

// ── Public interface for capture.js ──
window.EncoderAPI = {
  supported: true,
  initEncoder,
  encodeFrame,
  encodeFrameRaw,
  finalizeAndDownload,
  initAudioImport
};
