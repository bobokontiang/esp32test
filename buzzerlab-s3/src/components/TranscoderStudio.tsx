import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Play,
  Square,
  SlidersHorizontal,
  Trash2,
  Send,
  Volume2,
  Music,
  AlertCircle,
} from 'lucide-react';
import type {
  BuzzerMode,
  BuzzerNote,
  FocusFilterMode,
  MelodyPayload,
  QuantizeGrid,
} from '../../shared/types';
import {
  analyzeAudioSegment,
  decodeMediaFileToBuffer,
  freqToNoteName,
  generateSampleAudioBuffer,
  type TranscodeOptions,
} from '../dsp/audioTranscoder';
import { BuzzerPreviewPlayer, type PreviewMode } from '../audio/buzzerSynth';
import { AcousticCanvas } from './AcousticCanvas';

interface TranscoderStudioProps {
  currentMelody: MelodyPayload | null;
  onMelodyReady: (melody: MelodyPayload) => void;
  onPushToEsp32: (melody: MelodyPayload, autoPlay: boolean) => void;
  espOnline: boolean;
}

export const TranscoderStudio: React.FC<TranscoderStudioProps> = ({
  currentMelody,
  onMelodyReady,
  onPushToEsp32,
  espOnline,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const playerRef = useRef<BuzzerPreviewPlayer | null>(null);

  const [sourceBuffer, setSourceBuffer] = useState<AudioBuffer | null>(null);
  const [sourceTitle, setSourceTitle] = useState<string>('');
  const [sourceDurationSec, setSourceDurationSec] = useState<number>(0);
  const [trimStartSec, setTrimStartSec] = useState<number>(0);
  const [trimLengthSec, setTrimLengthSec] = useState<number>(20);

  const [options, setOptions] = useState<TranscodeOptions>({
    mode: 'passive_melody',
    focusFilter: 'melody',
    quantizeGrid: '1/16',
    gapMs: 14,
    octaveShift: 0,
    tempoScale: 1.0,
    sensitivity: 0.14,
    snapToSemitone: true,
  });

  const [dutyPercent, setDutyPercent] = useState<number>(35);
  const [waveformPeaks, setWaveformPeaks] = useState<number[]>([]);
  const [notes, setNotes] = useState<BuzzerNote[]>([]);
  const [bpm, setBpm] = useState<number>(120);
  const [durationMs, setDurationMs] = useState<number>(0);

  const [isDecoding, setIsDecoding] = useState<boolean>(false);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [previewMode, setPreviewMode] = useState<PreviewMode>('buzzer');
  const [isPlayingPreview, setIsPlayingPreview] = useState<boolean>(false);
  const [currentPlayMs, setCurrentPlayMs] = useState<number>(0);
  const [activeNoteIndex, setActiveNoteIndex] = useState<number>(-1);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  useEffect(() => {
    playerRef.current = new BuzzerPreviewPlayer();
    return () => {
      playerRef.current?.stop();
    };
  }, []);

  // Load initial sample on mount so studio is immediately interactive
  useEffect(() => {
    if (!sourceBuffer && !currentMelody) {
      handleLoadSample('melody_thai');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-run DSP analysis whenever buffer, trim, or options change
  useEffect(() => {
    if (!sourceBuffer) return;
    let cancelled = false;
    setIsAnalyzing(true);
    setErrorMsg(null);

    const run = async () => {
      try {
        const res = await analyzeAudioSegment(
          sourceBuffer,
          trimStartSec,
          Math.min(20, trimLengthSec),
          options
        );
        if (cancelled) return;
        setNotes(res.notes);
        setBpm(res.bpm);
        setWaveformPeaks(res.waveformPeaks);
        setDurationMs(res.durationMs);

        const payload: MelodyPayload = {
          id: `mel-${Date.now()}`,
          title: sourceTitle || 'Custom Clip',
          bpm: res.bpm,
          totalDurationMs: res.durationMs,
          mode: options.mode,
          gapMs: options.gapMs,
          dutyPercent,
          tempoScale: options.tempoScale,
          notes: res.notes,
          createdAt: Date.now(),
        };
        onMelodyReady(payload);
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(err instanceof Error ? err.message : 'วิเคราะห์ไฟล์เสียงไม่สำเร็จ');
        }
      } finally {
        if (!cancelled) setIsAnalyzing(false);
      }
    };

    const timer = setTimeout(run, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceBuffer, trimStartSec, trimLengthSec, options]);

  // Sync dutyPercent into parent melody without full re-DSP
  useEffect(() => {
    if (notes.length === 0) return;
    onMelodyReady({
      id: currentMelody?.id || `mel-${Date.now()}`,
      title: sourceTitle || 'Custom Clip',
      bpm,
      totalDurationMs: durationMs,
      mode: options.mode,
      gapMs: options.gapMs,
      dutyPercent,
      tempoScale: options.tempoScale,
      notes,
      createdAt: Date.now(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dutyPercent, notes]);

  const handleFileSelected = async (file: File) => {
    playerRef.current?.stop();
    setIsPlayingPreview(false);
    setIsDecoding(true);
    setErrorMsg(null);

    try {
      const buffer = await decodeMediaFileToBuffer(file);
      const cleanName = file.name.replace(/\.[^/.]+$/, '');
      setSourceBuffer(buffer);
      setSourceTitle(cleanName);
      setSourceDurationSec(buffer.duration);
      setTrimStartSec(0);
      setTrimLengthSec(Math.min(20, Math.max(0.5, buffer.duration)));
      setSelectedNoteId(null);
    } catch {
      setErrorMsg(
        'ไม่สามารถถอดเสียงจากไฟล์นี้ได้ กรุณาลองไฟล์ .mp3, .wav, .m4a, .mp4 หรือ .webm ที่มีแทร็กเสียง'
      );
    } finally {
      setIsDecoding(false);
    }
  };

  const handleLoadSample = async (preset: 'melody_thai' | 'arcade_8bit' | 'beat_rhythm') => {
    playerRef.current?.stop();
    setIsPlayingPreview(false);
    setIsDecoding(true);
    setErrorMsg(null);
    try {
      const { buffer, title } = await generateSampleAudioBuffer(preset);
      setSourceBuffer(buffer);
      setSourceTitle(title);
      setSourceDurationSec(buffer.duration);
      setTrimStartSec(0);
      setTrimLengthSec(Math.min(20, buffer.duration));
      if (preset === 'beat_rhythm') {
        setOptions((prev) => ({ ...prev, mode: 'active_rhythm', quantizeGrid: '1/16' }));
      } else {
        setOptions((prev) => ({ ...prev, mode: 'passive_melody' }));
      }
    } finally {
      setIsDecoding(false);
    }
  };

  const togglePlayPreview = () => {
    if (isPlayingPreview) {
      playerRef.current?.stop();
      setIsPlayingPreview(false);
      setCurrentPlayMs(0);
      setActiveNoteIndex(-1);
      return;
    }

    if (notes.length === 0) return;
    setIsPlayingPreview(true);
    playerRef.current?.play({
      notes,
      buzzerMode: options.mode,
      gapMs: options.gapMs,
      dutyPercent,
      previewMode,
      originalBuffer: sourceBuffer,
      trimStartSec,
      tempoScale: options.tempoScale,
      onProgress: (ms, idx) => {
        setCurrentPlayMs(ms);
        setActiveNoteIndex(idx);
      },
      onEnded: () => {
        setIsPlayingPreview(false);
        setCurrentPlayMs(0);
        setActiveNoteIndex(-1);
      },
    });
  };

  const handleUpdateNoteFreq = (id: string, newFreq: number) => {
    const clamped = newFreq <= 0 ? 0 : Math.max(100, Math.min(4000, Math.round(newFreq)));
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, f: clamped, noteName: freqToNoteName(clamped) } : n
      )
    );
  };

  const handleUpdateNoteDur = (id: string, newDur: number) => {
    const clamped = Math.max(30, Math.min(3000, Math.round(newDur)));
    setNotes((prev) => {
      let cursor = 0;
      return prev.map((n) => {
        const d = n.id === id ? clamped : n.d;
        const updated = { ...n, d, startMs: cursor };
        cursor += d;
        return updated;
      });
    });
  };

  const handleDeleteNote = (id: string) => {
    setNotes((prev) => {
      const filtered = prev.filter((n) => n.id !== id);
      let cursor = 0;
      return filtered.map((n) => {
        const updated = { ...n, startMs: cursor };
        cursor += n.d;
        return updated;
      });
    });
    if (selectedNoteId === id) setSelectedNoteId(null);
  };

  const builtPayload: MelodyPayload | null = useMemo(() => {
    if (notes.length === 0) return null;
    const totalMs = notes.reduce((s, n) => s + n.d, 0);
    return {
      id: currentMelody?.id || `mel-${Date.now()}`,
      title: sourceTitle || 'Custom Clip',
      bpm,
      totalDurationMs: totalMs,
      mode: options.mode,
      gapMs: options.gapMs,
      dutyPercent,
      tempoScale: options.tempoScale,
      notes,
      createdAt: Date.now(),
    };
  }, [notes, currentMelody?.id, sourceTitle, bpm, options.mode, options.gapMs, options.tempoScale, dutyPercent]);

  const playableNotesCount = useMemo(() => notes.filter((n) => n.f > 0).length, [notes]);

  return (
    <div className="space-y-6">
      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Control Column (4 cols) */}
        <div className="space-y-5 lg:col-span-4">
          {/* Upload / Source Box */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">1. เลือกไฟล์เสียงหรือคลิปวิดีโอ</h2>
              <span className="text-xs font-mono text-slate-500">ไม่เกิน 20 วินาที</span>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileSelected(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              className="mt-3 flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-4 py-6 text-center transition-colors hover:border-blue-500 hover:bg-blue-50/40"
            >
              <Upload className="h-6 w-6 text-blue-600" />
              <p className="mt-2 text-sm font-medium text-slate-800">
                คลิกเพื่อเลือกไฟล์ หรือลากไฟล์มาวางที่นี่
              </p>
              <p className="mt-1 text-xs text-slate-500">
                รองรับ MP3, WAV, M4A, MP4, MOV, WebM (ถอดเสียงในเครื่องฟรี 100%)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelected(file);
                }}
              />
            </div>

            {/* Instant Samples */}
            <div className="mt-4">
              <p className="text-xs font-medium text-slate-500">หรือทดสอบด้วยเสียงตัวอย่างทันที:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadSample('melody_thai')}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-400 hover:text-blue-700 whitespace-nowrap shrink-0"
                >
                  เมโลดี้ 5 เสียง
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('arcade_8bit')}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-blue-400 hover:text-blue-700 whitespace-nowrap shrink-0"
                >
                  ริฟฟ์เกม 8-Bit
                </button>
                <button
                  type="button"
                  onClick={() => handleLoadSample('beat_rhythm')}
                  className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-amber-400 hover:text-amber-700 whitespace-nowrap shrink-0"
                >
                  จังหวะ Active Buzzer
                </button>
              </div>
            </div>

            {/* Trim slider if source > 20s */}
            {sourceDurationSec > 20 && (
              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-amber-700">
                    คลิปยาว {sourceDurationSec.toFixed(1)} วินาที (เลือกช่วง 20 วิ)
                  </span>
                  <span className="font-mono text-slate-700 tabular-nums">
                    {trimStartSec.toFixed(1)}s – {Math.min(sourceDurationSec, trimStartSec + 20).toFixed(1)}s
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, Math.floor((sourceDurationSec - 20) * 10) / 10)}
                  step={0.5}
                  value={trimStartSec}
                  onChange={(e) => setTrimStartSec(Number(e.target.value))}
                  className="mt-2 w-full accent-blue-600"
                />
              </div>
            )}

            {errorMsg && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
          </div>

          {/* DSP Parameters */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-slate-600" />
                <h2 className="text-base font-semibold text-slate-900">2. ปรับจูนความเหมือนจริง</h2>
              </div>
            </div>

            {/* Buzzer Mode Selector */}
            <div>
              <label className="block text-xs font-medium text-slate-700">ชนิด Buzzer ที่ใช้งาน</label>
              <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setOptions((p) => ({ ...p, mode: 'passive_melody' as BuzzerMode }))}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    options.mode === 'passive_melody'
                      ? 'bg-white text-blue-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Passive (เล่นโน้ตเพลง)
                </button>
                <button
                  type="button"
                  onClick={() => setOptions((p) => ({ ...p, mode: 'active_rhythm' as BuzzerMode }))}
                  className={`rounded-md px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    options.mode === 'active_rhythm'
                      ? 'bg-white text-amber-700 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Active แท้ (เล่นจังหวะ)
                </button>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                {options.mode === 'passive_melody'
                  ? 'สร้างความถี่ตามโน้ตเพลงจริง หากคุณต่อ Active Buzzer แท้เสียงจะออกเป็นโทนเดียว แนะนำเช็คด้วยโค้ดทดสอบ 5 วิในแท็บโค้ด'
                  : 'สำหรับ Active Buzzer ที่มีเสียงตี๊ดความถี่เดียวในตัว จะถอดจังหวะและแรงตบกลอง/เสียงร้องมาสั่งเปิด-ปิดให้ตรงจังหวะ'}
              </p>
            </div>

            {/* Focus Filter & Quantize */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">กรองย่านเสียง</label>
                <select
                  value={options.focusFilter}
                  onChange={(e) =>
                    setOptions((p) => ({ ...p, focusFilter: e.target.value as FocusFilterMode }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value="melody">เน้นเสียงร้อง/ทำนอง</option>
                  <option value="wide">กว้าง (ทุกย่านเสียง)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">ล็อกจังหวะ (Quantize)</label>
                <select
                  value={options.quantizeGrid}
                  onChange={(e) =>
                    setOptions((p) => ({ ...p, quantizeGrid: e.target.value as QuantizeGrid }))
                  }
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                >
                  <option value="1/16">1/16 Beat (แนะนำ)</option>
                  <option value="1/8">1/8 Beat (จังหวะนิ่ง)</option>
                  <option value="free">อิสระตามต้นฉบับ (ms)</option>
                </select>
              </div>
            </div>

            {/* Octave Shift */}
            {options.mode === 'passive_melody' && (
              <div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700">เลื่อนระดับเสียง (Octave)</span>
                  <span className="font-mono text-slate-500">
                    {options.octaveShift > 0 ? `+${options.octaveShift}` : options.octaveShift} Oct
                  </span>
                </div>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                  {[-1, 0, 1].map((oct) => (
                    <button
                      key={oct}
                      type="button"
                      onClick={() => setOptions((p) => ({ ...p, octaveShift: oct }))}
                      className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                        options.octaveShift === oct
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {oct === -1 ? 'ต่ำ (-1)' : oct === 0 ? 'ปกติ (0)' : 'สูงชัด (+1)'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Sliders */}
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">ช่องว่างตัดโน้ตให้ชัด (Articulation)</span>
                  <span className="font-mono text-slate-600 tabular-nums">{options.gapMs} ms</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={35}
                  step={2}
                  value={options.gapMs}
                  onChange={(e) => setOptions((p) => ({ ...p, gapMs: Number(e.target.value) }))}
                  className="mt-1 w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">ความไวในการจับเสียง (Noise Gate)</span>
                  <span className="font-mono text-slate-600 tabular-nums">
                    {Math.round(options.sensitivity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={0.45}
                  step={0.02}
                  value={options.sensitivity}
                  onChange={(e) =>
                    setOptions((p) => ({ ...p, sensitivity: Number(e.target.value) }))
                  }
                  className="mt-1 w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">ความเร็วเล่น (Tempo)</span>
                  <span className="font-mono text-slate-600 tabular-nums">
                    {options.tempoScale.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  min={0.75}
                  max={1.5}
                  step={0.05}
                  value={options.tempoScale}
                  onChange={(e) =>
                    setOptions((p) => ({ ...p, tempoScale: Number(e.target.value) }))
                  }
                  className="mt-1 w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-slate-700">ความแรงเสียง Buzzer (Duty Cycle)</span>
                  <span className="font-mono text-slate-600 tabular-nums">{dutyPercent}%</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={50}
                  step={5}
                  value={dutyPercent}
                  onChange={(e) => setDutyPercent(Number(e.target.value))}
                  className="mt-1 w-full accent-blue-600"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Acoustic Viewport & Note Inspector (8 cols) */}
        <div className="space-y-5 lg:col-span-8">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  {sourceTitle || 'ยังไม่ได้เลือกไฟล์เสียง'}
                </h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                  <span>{isDecoding ? 'กำลังถอดเสียง...' : isAnalyzing ? 'กำลังวิเคราะห์โน้ต...' : 'ถอดโน้ตสำเร็จ'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{bpm} BPM</span>
                  <span aria-hidden="true">·</span>
                  <span>{playableNotesCount} โน้ต</span>
                  <span aria-hidden="true">·</span>
                  <span>{(durationMs / 1000).toFixed(2)} วินาที</span>
                </div>
              </div>

              {/* Preview Transport & Push CTA */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {(
                    [
                      ['buzzer', 'เสียง Buzzer'],
                      ['original', 'ต้นฉบับ'],
                      ['mix', 'เทียบคู่กัน'],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreviewMode(key)}
                      className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        previewMode === key
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={togglePlayPreview}
                  disabled={notes.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {isPlayingPreview ? (
                    <>
                      <Square className="h-3.5 w-3.5 text-rose-600" />
                      หยุดฟัง
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5 text-blue-600" />
                      ทดลองฟังบนเว็บ
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={!builtPayload}
                  onClick={() => builtPayload && onPushToEsp32(builtPayload, true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Send className="h-3.5 w-3.5" />
                  {espOnline ? 'ส่งเล่นบน ESP32-S3 ทันที' : 'ส่งเข้าคิว Real-Time'}
                </button>
              </div>
            </div>

            {/* Canvas Viewport */}
            <div className="mt-4">
              <AcousticCanvas
                notes={notes}
                waveformPeaks={waveformPeaks}
                durationMs={durationMs}
                currentPlayMs={currentPlayMs}
                activeNoteIndex={activeNoteIndex}
                buzzerMode={options.mode}
                selectedNoteId={selectedNoteId}
                onSelectNote={setSelectedNoteId}
              />
            </div>
          </div>

          {/* Tabular Note Sequence Editor */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-slate-500" />
                <h3 className="text-sm font-semibold text-slate-900">
                  ตารางโน้ตที่ถอดได้ ({notes.length} บล็อก)
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                แก้ไขความถี่ (Hz) หรือความยาว (ms) ได้ทันที
              </span>
            </div>

            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-slate-500">
                <Volume2 className="h-7 w-7 text-slate-400" />
                <p className="mt-2 text-sm font-medium text-slate-700">
                  ยังไม่มีข้อมูลโน้ตเพลง
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  อัปโหลดไฟล์เสียงหรือเลือกตัวอย่างทางด้านซ้าย เพื่อเริ่มถอดโน้ตสำหรับ ESP32-S3
                </p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">#</th>
                      <th className="px-4 py-2.5 font-medium">เวลาเริ่ม</th>
                      <th className="px-4 py-2.5 font-medium">โน้ต</th>
                      <th className="px-4 py-2.5 font-medium">ความถี่ (Hz)</th>
                      <th className="px-4 py-2.5 font-medium">ความยาว (ms)</th>
                      <th className="px-4 py-2.5 text-right font-medium">ลบ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                    {notes.slice(0, 250).map((note, idx) => {
                      const isRowActive =
                        (isPlayingPreview && idx === activeNoteIndex) || note.id === selectedNoteId;
                      return (
                        <tr
                          key={note.id}
                          onClick={() => setSelectedNoteId(note.id)}
                          className={`transition-colors ${
                            isRowActive ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-2 text-slate-400">{idx + 1}</td>
                          <td className="px-4 py-2 text-slate-600">
                            {(note.startMs / 1000).toFixed(2)}s
                          </td>
                          <td className="px-4 py-2 font-semibold text-slate-800">
                            {note.noteName}
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={note.f}
                              onChange={(e) => handleUpdateNoteFreq(note.id, Number(e.target.value))}
                              className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                            />
                          </td>
                          <td className="px-4 py-2">
                            <input
                              type="number"
                              value={note.d}
                              onChange={(e) => handleUpdateNoteDur(note.id, Number(e.target.value))}
                              className="w-20 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
                            />
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteNote(note.id);
                              }}
                              aria-label="ลบโน้ต"
                              className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {notes.length > 250 && (
                  <p className="border-t border-slate-100 bg-slate-50 px-4 py-2 text-xs text-slate-500">
                    แสดง 250 โน้ตแรกในตารางเพื่อความลื่นไหล (ส่งออกครบทั้งหมด {notes.length} โน้ต)
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
