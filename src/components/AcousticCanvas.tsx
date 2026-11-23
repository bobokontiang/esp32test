import React, { useEffect, useRef, useState } from 'react';
import type { BuzzerMode, BuzzerNote } from '../../shared/types';

interface AcousticCanvasProps {
  notes: BuzzerNote[];
  waveformPeaks: number[];
  durationMs: number;
  currentPlayMs: number;
  activeNoteIndex: number;
  buzzerMode: BuzzerMode;
  selectedNoteId: string | null;
  onSelectNote: (noteId: string | null) => void;
}

interface HoverInfo {
  x: number;
  y: number;
  timeMs: number;
  freq: number;
  noteName: string;
  durMs: number;
}

export const AcousticCanvas: React.FC<AcousticCanvasProps> = ({
  notes,
  waveformPeaks,
  durationMs,
  currentPlayMs,
  activeNoteIndex,
  buzzerMode,
  selectedNoteId,
  onSelectNote,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  const safeDuration = Math.max(durationMs, 1000);
  const minLogFreq = Math.log2(120);
  const maxLogFreq = Math.log2(3600);

  const freqToY = (freq: number, pianoTop: number, pianoHeight: number) => {
    if (freq <= 0) return pianoTop + pianoHeight;
    const clamped = Math.max(120, Math.min(3600, freq));
    const norm = (Math.log2(clamped) - minLogFreq) / (maxLogFreq - minLogFreq);
    return pianoTop + pianoHeight - norm * (pianoHeight - 16) - 8;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width));
    const height = 280;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Background
    ctx.fillStyle = '#0B1120';
    ctx.fillRect(0, 0, width, height);

    const waveHeight = 62;
    const pianoTop = 74;
    const pianoHeight = height - pianoTop - 22;

    // Subtle horizontal grid lines (Hz reference)
    const refFreqs = [261.63, 523.25, 1046.5, 2093.0];
    const refLabels = ['C4 262Hz', 'C5 523Hz', 'C6 1047Hz', 'C7 2093Hz'];
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';

    refFreqs.forEach((f, idx) => {
      const y = freqToY(f, pianoTop, pianoHeight);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();

      ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.fillText(refLabels[idx], 8, y - 7);
    });

    // Divider between waveform and piano roll
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, waveHeight + 6);
    ctx.lineTo(width, waveHeight + 6);
    ctx.stroke();

    // Waveform envelope bars
    if (waveformPeaks.length > 0) {
      const barW = width / waveformPeaks.length;
      const midY = waveHeight / 2 + 4;
      for (let i = 0; i < waveformPeaks.length; i++) {
        const amp = Math.max(0.04, waveformPeaks[i]) * (waveHeight * 0.44);
        const x = i * barW;
        ctx.fillStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.fillRect(x, midY - amp, Math.max(1, barW - 1), amp * 2);
      }
    }

    // Time ruler at bottom
    const totalSec = safeDuration / 1000;
    const stepSec = totalSec > 12 ? 2 : 1;
    ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
    ctx.textBaseline = 'bottom';
    for (let s = 0; s <= totalSec; s += stepSec) {
      const x = ((s * 1000) / safeDuration) * width;
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.beginPath();
      ctx.moveTo(x, pianoTop);
      ctx.lineTo(x, height - 18);
      ctx.stroke();
      ctx.fillText(`${s}s`, Math.min(width - 24, x + 3), height - 3);
    }

    // Draw note blocks
    notes.forEach((note, idx) => {
      if (note.f <= 0) return;
      const x = (note.startMs / safeDuration) * width;
      const w = Math.max(3, (note.d / safeDuration) * width - 1);
      const y = freqToY(note.f, pianoTop, pianoHeight);
      const isPlayingThis = currentPlayMs > 0 && idx === activeNoteIndex;
      const isSelected = note.id === selectedNoteId;

      if (isPlayingThis) {
        ctx.fillStyle = '#38BDF8';
      } else if (isSelected) {
        ctx.fillStyle = '#F59E0B';
      } else {
        ctx.fillStyle = buzzerMode === 'active_rhythm' ? '#D97706' : '#2563EB';
      }

      const barH = 8;
      ctx.fillRect(x, y - barH / 2, w, barH);

      if (isSelected || isPlayingThis) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y - barH / 2, w, barH);
      }
    });

    // Playhead cursor
    if (currentPlayMs > 0 && currentPlayMs <= safeDuration) {
      const px = (currentPlayMs / safeDuration) * width;
      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height - 18);
      ctx.stroke();
    }

    // Hover crosshair
    if (hoverInfo) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.25)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hoverInfo.x, 0);
      ctx.lineTo(hoverInfo.x, height - 18);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [notes, waveformPeaks, safeDuration, currentPlayMs, activeNoteIndex, buzzerMode, selectedNoteId, hoverInfo]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || notes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const timeMs = (x / rect.width) * safeDuration;

    const hit = notes.find((n) => timeMs >= n.startMs && timeMs <= n.startMs + n.d);
    if (hit) {
      setHoverInfo({
        x,
        y,
        timeMs: Math.round(timeMs),
        freq: hit.f,
        noteName: hit.noteName,
        durMs: hit.d,
      });
    } else {
      setHoverInfo({
        x,
        y,
        timeMs: Math.round(timeMs),
        freq: 0,
        noteName: '-',
        durMs: 0,
      });
    }
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || notes.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const timeMs = (x / rect.width) * safeDuration;
    const hit = notes.find((n) => n.f > 0 && timeMs >= n.startMs && timeMs <= n.startMs + n.d);
    onSelectNote(hit ? hit.id : null);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-lg border border-slate-800 bg-[#0B1120]"
    >
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverInfo(null)}
        onClick={handleClick}
        className="block w-full cursor-crosshair"
      />

      <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/90 px-3 py-1.5 text-xs font-mono text-slate-300 tabular-nums">
        <div className="flex items-center gap-4">
          <span>
            {hoverInfo
              ? `เวลา ${(hoverInfo.timeMs / 1000).toFixed(2)}s · ${
                  hoverInfo.freq > 0
                    ? `${hoverInfo.freq} Hz (${hoverInfo.noteName}) · ยาว ${hoverInfo.durMs} ms`
                    : 'ช่วงพัก (Rest)'
                }`
              : 'เลื่อนเมาส์บนกราฟเพื่อดูความถี่ Hz และชื่อโน้ต · คลิกที่แท่งโน้ตเพื่อแก้ไข'}
          </span>
        </div>
        <div className="text-slate-400">
          {notes.filter((n) => n.f > 0).length} โน้ต · {(safeDuration / 1000).toFixed(2)}s
        </div>
      </div>
    </div>
  );
};
