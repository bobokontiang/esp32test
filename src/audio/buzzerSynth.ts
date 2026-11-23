import type { BuzzerMode, BuzzerNote } from '../../shared/types';

export type PreviewMode = 'buzzer' | 'original' | 'mix';

export class BuzzerPreviewPlayer {
  private ctx: AudioContext | null = null;
  private rafId: number | null = null;
  private activeSource: AudioBufferSourceNode | null = null;
  private activeOscs: OscillatorNode[] = [];
  private isPlaying = false;
  private startWallTime = 0;
  private totalDurationMs = 0;

  public stop() {
    this.isPlaying = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // already stopped
      }
      this.activeSource = null;
    }
    for (const osc of this.activeOscs) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // already stopped
      }
    }
    this.activeOscs = [];
  }

  public async play(params: {
    notes: BuzzerNote[];
    buzzerMode: BuzzerMode;
    gapMs: number;
    dutyPercent: number;
    previewMode: PreviewMode;
    originalBuffer: AudioBuffer | null;
    trimStartSec: number;
    tempoScale: number;
    onProgress: (currentMs: number, activeNoteIndex: number) => void;
    onEnded: () => void;
  }) {
    this.stop();

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    const ctx = this.ctx;
    const now = ctx.currentTime + 0.04;
    const notes = params.notes;
    if (notes.length === 0) {
      params.onEnded();
      return;
    }

    const totalMs = notes.reduce((sum, n) => sum + n.d, 0);
    this.totalDurationMs = totalMs;
    this.isPlaying = true;
    this.startWallTime = performance.now() + 40;

    // Schedule Original Audio if mode is 'original' or 'mix'
    if (
      params.originalBuffer &&
      (params.previewMode === 'original' || params.previewMode === 'mix')
    ) {
      const src = ctx.createBufferSource();
      src.buffer = params.originalBuffer;
      src.playbackRate.value = params.tempoScale;
      const origGain = ctx.createGain();
      origGain.gain.value = params.previewMode === 'mix' ? 0.35 : 0.85;
      src.connect(origGain);
      origGain.connect(ctx.destination);
      const durSec = totalMs / 1000;
      src.start(now, params.trimStartSec, durSec * params.tempoScale);
      this.activeSource = src;
    }

    // Schedule Buzzer Synth if mode is 'buzzer' or 'mix'
    if (params.previewMode === 'buzzer' || params.previewMode === 'mix') {
      const masterGain = ctx.createGain();
      // Slight piezo resonant highpass character around 280Hz
      const piezoHp = ctx.createBiquadFilter();
      piezoHp.type = 'highpass';
      piezoHp.frequency.value = 260;

      const piezoPeak = ctx.createBiquadFilter();
      piezoPeak.type = 'peaking';
      piezoPeak.frequency.value = 2100;
      piezoPeak.Q.value = 1.4;
      piezoPeak.gain.value = 4.5;

      const volScale = (params.dutyPercent / 50) * (params.previewMode === 'mix' ? 0.24 : 0.28);
      masterGain.gain.value = Math.max(0.05, Math.min(0.4, volScale));

      piezoHp.connect(piezoPeak);
      piezoPeak.connect(masterGain);
      masterGain.connect(ctx.destination);

      let cursorSec = now;
      for (const note of notes) {
        const durSec = note.d / 1000;
        const effectiveGapSec = Math.min(durSec * 0.45, params.gapMs / 1000);
        const playDurSec = Math.max(0.015, durSec - effectiveGapSec);

        if (note.f > 0) {
          const osc = ctx.createOscillator();
          const noteGain = ctx.createGain();

          osc.type = params.buzzerMode === 'active_rhythm' ? 'sawtooth' : 'square';
          osc.frequency.setValueAtTime(
            params.buzzerMode === 'active_rhythm' ? 2400 : note.f,
            cursorSec
          );

          noteGain.gain.setValueAtTime(0.001, cursorSec);
          noteGain.gain.linearRampToValueAtTime(1.0, cursorSec + 0.004);
          noteGain.gain.setValueAtTime(1.0, cursorSec + Math.max(0.005, playDurSec - 0.005));
          noteGain.gain.linearRampToValueAtTime(0.001, cursorSec + playDurSec);

          osc.connect(noteGain);
          noteGain.connect(piezoHp);
          osc.start(cursorSec);
          osc.stop(cursorSec + playDurSec + 0.005);
          this.activeOscs.push(osc);
        }
        cursorSec += durSec;
      }
    }

    const tick = () => {
      if (!this.isPlaying) return;
      const elapsedMs = Math.max(0, performance.now() - this.startWallTime);
      if (elapsedMs >= this.totalDurationMs) {
        this.stop();
        params.onProgress(this.totalDurationMs, notes.length - 1);
        params.onEnded();
        return;
      }

      // Find current note index
      let acc = 0;
      let idx = 0;
      for (let i = 0; i < notes.length; i++) {
        acc += notes[i].d;
        if (elapsedMs < acc) {
          idx = i;
          break;
        }
      }
      params.onProgress(elapsedMs, idx);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }
}
