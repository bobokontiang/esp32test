export type BuzzerMode = 'passive_melody' | 'active_rhythm';

export type QuantizeGrid = 'free' | '1/16' | '1/8';

export type FocusFilterMode = 'melody' | 'wide';

export interface BuzzerNote {
  id: string;
  f: number; // Frequency in Hz (0 = rest/silence)
  d: number; // Duration in ms
  startMs: number;
  noteName: string;
  velocity: number; // 0..1 normalized energy
}

export interface MelodyPayload {
  id: string;
  title: string;
  bpm: number;
  totalDurationMs: number;
  mode: BuzzerMode;
  gapMs: number;
  dutyPercent: number;
  tempoScale: number;
  notes: BuzzerNote[];
  createdAt: number;
}

export interface DeviceState {
  deviceId: string;
  online: boolean;
  playing: boolean;
  loop: boolean;
  currentNoteIndex: number;
  activeMelody: MelodyPayload | null;
  ipAddress: string | null;
  firmwareVersion: string | null;
  lastSeenAt: number | null;
  webClientsCount: number;
  deviceClientsCount: number;
}

export interface WsLogEntry {
  id: string;
  timestamp: number;
  source: 'server' | 'web' | 'esp32';
  event: string;
  summary: string;
}

export type PlaybackCommandType = 'play' | 'pause' | 'stop' | 'set_loop' | 'set_tempo' | 'set_duty';

export interface PlaybackCommandPayload {
  command: PlaybackCommandType;
  value?: number | boolean;
}
