import type {
  BuzzerMode,
  BuzzerNote,
  FocusFilterMode,
  QuantizeGrid,
} from '../../shared/types';

export interface TranscodeOptions {
  mode: BuzzerMode;
  focusFilter: FocusFilterMode;
  quantizeGrid: QuantizeGrid;
  gapMs: number;
  octaveShift: number; // -1, 0, +1
  tempoScale: number; // 0.75..1.5
  sensitivity: number; // 0.05..0.50 (energy gate multiplier)
  snapToSemitone: boolean;
}

export interface TranscodeResult {
  notes: BuzzerNote[];
  bpm: number;
  waveformPeaks: number[]; // ~240 normalized peaks for canvas rendering
  durationMs: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function freqToMidi(freq: number): number {
  if (freq <= 0) return 0;
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToNoteName(freq: number): string {
  if (freq <= 0) return 'REST';
  const midi = freqToMidi(freq);
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

export async function decodeMediaFileToBuffer(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    return decoded;
  } finally {
    await ctx.close();
  }
}

export async function generateSampleAudioBuffer(
  preset: 'melody_thai' | 'arcade_8bit' | 'beat_rhythm'
): Promise<{ buffer: AudioBuffer; title: string }> {
  const sampleRate = 44100;

  if (preset === 'melody_thai') {
    // Expressive pentatonic/pop melody (~8.0s at 120 BPM)
    const sequence: Array<[number, number]> = [
      [523.25, 0.35], [587.33, 0.35], [659.25, 0.55], [783.99, 0.45],
      [659.25, 0.35], [587.33, 0.35], [523.25, 0.70], [0, 0.15],
      [659.25, 0.35], [783.99, 0.35], [880.0, 0.55], [1046.5, 0.65],
      [880.0, 0.35], [783.99, 0.35], [659.25, 0.85], [0, 0.15],
      [587.33, 0.35], [659.25, 0.35], [783.99, 0.50], [659.25, 0.35],
      [587.33, 0.35], [523.25, 0.90],
    ];
    const totalSec = sequence.reduce((acc, [, d]) => acc + d, 0) + 0.3;
    const offline = new OfflineAudioContext(1, Math.ceil(totalSec * sampleRate), sampleRate);
    let cursor = 0.1;
    for (const [freq, dur] of sequence) {
      if (freq > 0) {
        const osc = offline.createOscillator();
        const harmonic = offline.createOscillator();
        const gain = offline.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, cursor);
        harmonic.type = 'sine';
        harmonic.frequency.setValueAtTime(freq * 2, cursor);

        gain.gain.setValueAtTime(0.001, cursor);
        gain.gain.exponentialRampToValueAtTime(0.45, cursor + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.28, cursor + dur * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.001, cursor + dur - 0.02);

        osc.connect(gain);
        harmonic.connect(gain);
        gain.connect(offline.destination);
        osc.start(cursor);
        harmonic.start(cursor);
        osc.stop(cursor + dur);
        harmonic.stop(cursor + dur);
      }
      cursor += dur;
    }
    const buffer = await offline.startRendering();
    return { buffer, title: 'ตัวอย่างเมโลดี้ 5 เสียง (120 BPM)' };
  }

  if (preset === 'arcade_8bit') {
    // Upbeat 140 BPM chiptune motif (~6.5s)
    const step = 60 / 140 / 2; // eighth note ~214ms
    const notes = [
      659.25, 659.25, 0, 659.25, 0, 523.25, 659.25, 0,
      783.99, 0, 0, 0, 392.0, 0, 0, 0,
      523.25, 0, 0, 392.0, 0, 0, 329.63, 0,
      440.0, 0, 493.88, 0, 466.16, 440.0, 0,
      392.0, 659.25, 783.99, 880.0, 0, 698.46, 783.99, 0,
      659.25, 0, 523.25, 587.33, 493.88, 0,
    ];
    const totalSec = notes.length * step + 0.3;
    const offline = new OfflineAudioContext(1, Math.ceil(totalSec * sampleRate), sampleRate);
    notes.forEach((freq, idx) => {
      const start = 0.1 + idx * step;
      if (freq > 0) {
        const osc = offline.createOscillator();
        const gain = offline.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.28, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + step * 0.85);
        osc.connect(gain);
        gain.connect(offline.destination);
        osc.start(start);
        osc.stop(start + step * 0.9);
      }
    });
    const buffer = await offline.startRendering();
    return { buffer, title: 'ตัวอย่างริฟฟ์ 8-Bit Arcade (140 BPM)' };
  }

  // beat_rhythm: crisp rhythmic pattern suited for Active Buzzer
  const totalSec = 6.0;
  const offline = new OfflineAudioContext(1, Math.ceil(totalSec * sampleRate), sampleRate);
  const beat = 60 / 128; // 128 BPM
  const pattern = [0, 0.5, 0.75, 1.0, 1.5, 2.0, 2.25, 2.5, 3.0, 3.5, 3.75];
  for (let bar = 0; bar < 3; bar++) {
    for (const offset of pattern) {
      const t = 0.1 + (bar * 4 + offset) * (beat / 2);
      if (t >= totalSec - 0.15) continue;
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      osc.type = 'sine';
      const isAccent = offset % 1 === 0;
      osc.frequency.setValueAtTime(isAccent ? 1800 : 1200, t);
      osc.frequency.exponentialRampToValueAtTime(420, t + 0.08);
      gain.gain.setValueAtTime(isAccent ? 0.6 : 0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      osc.connect(gain);
      gain.connect(offline.destination);
      osc.start(t);
      osc.stop(t + 0.1);
    }
  }
  const buffer = await offline.startRendering();
  return { buffer, title: 'ตัวอย่างจังหวะสำหรับ Active Buzzer (128 BPM)' };
}

async function renderFilteredMonoSlice(
  sourceBuffer: AudioBuffer,
  startSec: number,
  durationSec: number,
  focusFilter: FocusFilterMode
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const targetSampleRate = 44100;
  const clampedStart = Math.max(0, Math.min(startSec, Math.max(0, sourceBuffer.duration - 0.1)));
  const clampedDur = Math.max(0.2, Math.min(durationSec, 20, sourceBuffer.duration - clampedStart));
  const frameCount = Math.ceil(clampedDur * targetSampleRate);

  const offline = new OfflineAudioContext(1, frameCount, targetSampleRate);
  const src = offline.createBufferSource();
  src.buffer = sourceBuffer;

  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = focusFilter === 'melody' ? 180 : 80;
  hp.Q.value = 0.8;

  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = focusFilter === 'melody' ? 2300 : 3800;
  lp.Q.value = 0.8;

  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.005;
  comp.release.value = 0.08;

  src.connect(hp);
  hp.connect(lp);
  lp.connect(comp);
  comp.connect(offline.destination);

  src.start(0, clampedStart, clampedDur);
  const rendered = await offline.startRendering();
  const raw = rendered.getChannelData(0);

  // Peak-normalize to [-1, 1]
  let maxAbs = 0;
  for (let i = 0; i < raw.length; i++) {
    const a = Math.abs(raw[i]);
    if (a > maxAbs) maxAbs = a;
  }
  const normalized = new Float32Array(raw.length);
  const scale = maxAbs > 0.001 ? 0.95 / maxAbs : 1;
  for (let i = 0; i < raw.length; i++) {
    normalized[i] = raw[i] * scale;
  }
  return { samples: normalized, sampleRate: targetSampleRate };
}

function detectYinPitch(
  samples: Float32Array,
  startIdx: number,
  frameSize: number,
  sampleRate: number,
  minFreq: number,
  maxFreq: number,
  yinThreshold = 0.18
): { freq: number; confidence: number } {
  const half = Math.floor(frameSize / 2);
  const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxTau = Math.min(half - 2, Math.floor(sampleRate / minFreq));
  if (maxTau <= minTau || startIdx + frameSize >= samples.length) {
    return { freq: 0, confidence: 0 };
  }

  const diff = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let j = 0; j < half; j++) {
      const d = samples[startIdx + j] - samples[startIdx + j + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  const cmndf = new Float32Array(maxTau + 1);
  cmndf[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    runningSum += diff[tau];
    cmndf[tau] = runningSum > 0 ? (diff[tau] * tau) / runningSum : 1;
  }

  let tauEstimate = -1;
  for (let tau = minTau; tau < maxTau; tau++) {
    if (cmndf[tau] < yinThreshold) {
      while (tau + 1 < maxTau && cmndf[tau + 1] < cmndf[tau]) {
        tau++;
      }
      tauEstimate = tau;
      break;
    }
  }

  if (tauEstimate === -1) {
    // Fallback to global minimum inside search bounds if mildly periodic
    let bestTau = minTau;
    let bestVal = cmndf[minTau];
    for (let tau = minTau + 1; tau < maxTau; tau++) {
      if (cmndf[tau] < bestVal) {
        bestVal = cmndf[tau];
        bestTau = tau;
      }
    }
    if (bestVal > 0.34) {
      return { freq: 0, confidence: 0 };
    }
    tauEstimate = bestTau;
  }

  // Parabolic interpolation for sub-sample precision
  const x0 = tauEstimate > 1 ? tauEstimate - 1 : tauEstimate;
  const x2 = tauEstimate + 1 <= maxTau ? tauEstimate + 1 : tauEstimate;
  let betterTau = tauEstimate;
  if (x0 !== tauEstimate && x2 !== tauEstimate) {
    const s0 = cmndf[x0];
    const s1 = cmndf[tauEstimate];
    const s2 = cmndf[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (Math.abs(denom) > 1e-6) {
      betterTau += (s2 - s0) / denom;
    }
  }

  const freq = sampleRate / betterTau;
  const confidence = Math.max(0, Math.min(1, 1 - cmndf[tauEstimate]));
  return { freq, confidence };
}

function estimateBpmFromOnsets(energies: number[], hopMs: number): number {
  if (energies.length < 40) return 120;
  const flux = new Float32Array(energies.length);
  for (let i = 1; i < energies.length; i++) {
    flux[i] = Math.max(0, energies[i] - energies[i - 1]);
  }

  const minLag = Math.round((60000 / 170) / hopMs); // 170 BPM
  const maxLag = Math.round((60000 / 70) / hopMs);  // 70 BPM
  let bestLag = Math.round((60000 / 120) / hopMs);
  let bestScore = -1;

  for (let lag = minLag; lag <= maxLag && lag < flux.length / 2; lag++) {
    let score = 0;
    for (let i = 0; i < flux.length - lag; i++) {
      score += flux[i] * flux[i + lag];
    }
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  const rawBpm = 60000 / (bestLag * hopMs);
  return Math.max(70, Math.min(170, Math.round(rawBpm)));
}

function median3(a: number, b: number, c: number): number {
  const arr = [a, b, c].sort((x, y) => x - y);
  return arr[1];
}

export async function analyzeAudioSegment(
  sourceBuffer: AudioBuffer,
  startSec: number,
  durationSec: number,
  options: TranscodeOptions
): Promise<TranscodeResult> {
  const { samples, sampleRate } = await renderFilteredMonoSlice(
    sourceBuffer,
    startSec,
    durationSec,
    options.focusFilter
  );

  const durationMs = Math.round((samples.length / sampleRate) * 1000);
  const hopMs = 10;
  const hopSize = Math.round((sampleRate * hopMs) / 1000);
  const frameSize = 2048;

  // Compute waveform peaks for UI visualization (~240 bars)
  const numBars = 240;
  const samplesPerBar = Math.max(1, Math.floor(samples.length / numBars));
  const waveformPeaks: number[] = [];
  for (let b = 0; b < numBars; b++) {
    const start = b * samplesPerBar;
    const end = Math.min(samples.length, start + samplesPerBar);
    let peak = 0;
    for (let i = start; i < end; i++) {
      const v = Math.abs(samples[i]);
      if (v > peak) peak = v;
    }
    waveformPeaks.push(Number(peak.toFixed(3)));
  }

  // Frame-by-frame RMS + Pitch
  const frameCount = Math.max(1, Math.floor((samples.length - frameSize) / hopSize));
  const rmsArr: number[] = new Array(frameCount).fill(0);
  const rawFreqs: number[] = new Array(frameCount).fill(0);
  const midis: number[] = new Array(frameCount).fill(0);

  let maxRms = 0;
  for (let f = 0; f < frameCount; f++) {
    const offset = f * hopSize;
    let sumSq = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = samples[offset + i];
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / frameSize);
    rmsArr[f] = rms;
    if (rms > maxRms) maxRms = rms;
  }

  const gateThreshold = Math.max(0.012, maxRms * options.sensitivity);

  if (options.mode === 'passive_melody') {
    const minFreq = options.focusFilter === 'melody' ? 140 : 80;
    const maxFreq = options.focusFilter === 'melody' ? 2100 : 3200;

    for (let f = 0; f < frameCount; f++) {
      if (rmsArr[f] < gateThreshold) {
        rawFreqs[f] = 0;
        midis[f] = 0;
        continue;
      }
      const { freq, confidence } = detectYinPitch(
        samples,
        f * hopSize,
        frameSize,
        sampleRate,
        minFreq,
        maxFreq
      );
      if (freq > 0 && confidence > 0.48) {
        rawFreqs[f] = freq;
        midis[f] = freqToMidi(freq);
      }
    }

    // 3-frame median smoothing on MIDI to eliminate jitter spikes
    const smoothedMidis = [...midis];
    for (let f = 1; f < frameCount - 1; f++) {
      if (midis[f - 1] > 0 && midis[f] > 0 && midis[f + 1] > 0) {
        smoothedMidis[f] = median3(midis[f - 1], midis[f], midis[f + 1]);
      }
    }
    for (let f = 0; f < frameCount; f++) {
      midis[f] = smoothedMidis[f];
    }
  }

  const bpm = estimateBpmFromOnsets(rmsArr, hopMs);

  // Detect strong energy onsets to separate repeated identical notes cleanly
  const isOnset: boolean[] = new Array(frameCount).fill(false);
  for (let f = 3; f < frameCount; f++) {
    const prevAvg = (rmsArr[f - 3] + rmsArr[f - 2] + rmsArr[f - 1]) / 3;
    if (rmsArr[f] > gateThreshold * 1.1 && rmsArr[f] > prevAvg * 1.48) {
      // Debounce onsets within 60ms
      let recent = false;
      for (let k = Math.max(0, f - 6); k < f; k++) {
        if (isOnset[k]) recent = true;
      }
      if (!recent) isOnset[f] = true;
    }
  }

  // Segment frames into discrete notes
  interface RawSegment {
    midi: number;
    avgFreq: number;
    startFrame: number;
    endFrame: number;
    maxEnergy: number;
  }

  const segments: RawSegment[] = [];

  if (options.mode === 'active_rhythm') {
    // Active Buzzer Mode: extract crisp rhythmic pulses (ON = 2400 Hz preview / digital HIGH, OFF = 0)
    let currentOn = rmsArr[0] >= gateThreshold;
    let segStart = 0;
    let peakE = rmsArr[0];

    for (let f = 1; f < frameCount; f++) {
      const active = rmsArr[f] >= gateThreshold;
      const splitOnAccent = active && currentOn && isOnset[f] && f - segStart >= 6;
      if (active !== currentOn || splitOnAccent) {
        segments.push({
          midi: currentOn ? 98 : 0, // ~2400Hz representative beep
          avgFreq: currentOn ? 2400 : 0,
          startFrame: segStart,
          endFrame: f,
          maxEnergy: peakE,
        });
        currentOn = active;
        segStart = f;
        peakE = rmsArr[f];
      } else {
        if (rmsArr[f] > peakE) peakE = rmsArr[f];
      }
    }
    segments.push({
      midi: currentOn ? 98 : 0,
      avgFreq: currentOn ? 2400 : 0,
      startFrame: segStart,
      endFrame: frameCount,
      maxEnergy: peakE,
    });
  } else {
    // Passive Buzzer Melody Mode: segment by pitch change or attack onset
    let activeMidi = midis[0];
    let segStart = 0;
    let freqSum = rawFreqs[0];
    let freqCount = rawFreqs[0] > 0 ? 1 : 0;
    let peakE = rmsArr[0];

    for (let f = 1; f < frameCount; f++) {
      const m = midis[f];
      const pitchChanged = Math.abs(m - activeMidi) >= 1;
      const attackSplit = m > 0 && m === activeMidi && isOnset[f] && f - segStart >= 7;

      if (pitchChanged || attackSplit) {
        segments.push({
          midi: activeMidi,
          avgFreq: freqCount > 0 ? freqSum / freqCount : 0,
          startFrame: segStart,
          endFrame: f,
          maxEnergy: peakE,
        });
        activeMidi = m;
        segStart = f;
        freqSum = rawFreqs[f];
        freqCount = rawFreqs[f] > 0 ? 1 : 0;
        peakE = rmsArr[f];
      } else {
        if (rawFreqs[f] > 0) {
          freqSum += rawFreqs[f];
          freqCount += 1;
        }
        if (rmsArr[f] > peakE) peakE = rmsArr[f];
      }
    }
    segments.push({
      midi: activeMidi,
      avgFreq: freqCount > 0 ? freqSum / freqCount : 0,
      startFrame: segStart,
      endFrame: frameCount,
      maxEnergy: peakE,
    });
  }

  // Clean micro-glitches (< 35ms) and merge adjacent identical rests
  const minSegFrames = 4; // 40ms
  const cleaned: RawSegment[] = [];
  for (const seg of segments) {
    if (seg.endFrame - seg.startFrame < minSegFrames) {
      if (cleaned.length > 0) {
        cleaned[cleaned.length - 1].endFrame = seg.endFrame;
      }
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.midi === 0 && seg.midi === 0) {
      prev.endFrame = seg.endFrame;
    } else {
      cleaned.push({ ...seg });
    }
  }

  // Trim leading & trailing silence
  while (cleaned.length > 0 && cleaned[0].midi === 0) {
    cleaned.shift();
  }
  while (cleaned.length > 0 && cleaned[cleaned.length - 1].midi === 0) {
    cleaned.pop();
  }

  // Convert segments into final BuzzerNote array with optional BPM quantization & octave shift
  const gridMs =
    options.quantizeGrid === '1/8'
      ? (60000 / bpm) / 2
      : options.quantizeGrid === '1/16'
      ? (60000 / bpm) / 4
      : 0;

  const notes: BuzzerNote[] = [];
  let cursorMs = 0;

  for (let i = 0; i < cleaned.length; i++) {
    const seg = cleaned[i];
    let durMs = (seg.endFrame - seg.startFrame) * hopMs;
    if (gridMs > 0) {
      const steps = Math.max(1, Math.round(durMs / gridMs));
      durMs = Math.round(steps * gridMs);
    }
    durMs = Math.max(35, Math.round(durMs / options.tempoScale));

    let finalFreq = 0;
    let noteName = 'REST';
    if (seg.midi > 0) {
      if (options.mode === 'active_rhythm') {
        finalFreq = 2400;
        noteName = 'PULSE';
      } else {
        const shiftedMidi = Math.max(36, Math.min(108, seg.midi + options.octaveShift * 12));
        if (options.snapToSemitone) {
          finalFreq = Math.round(midiToFreq(shiftedMidi));
        } else {
          finalFreq = Math.round(seg.avgFreq * Math.pow(2, options.octaveShift));
        }
        finalFreq = Math.max(120, Math.min(3600, finalFreq));
        noteName = freqToNoteName(finalFreq);
      }
    }

    notes.push({
      id: `n-${i}-${cursorMs}`,
      f: finalFreq,
      d: durMs,
      startMs: cursorMs,
      noteName,
      velocity: maxRms > 0 ? Math.min(1, Number((seg.maxEnergy / maxRms).toFixed(2))) : 0.7,
    });
    cursorMs += durMs;
  }

  return {
    notes,
    bpm,
    waveformPeaks,
    durationMs: cursorMs || durationMs,
  };
}
