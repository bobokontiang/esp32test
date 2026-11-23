import React from 'react';
import {
  Play,
  Pause,
  Square,
  Repeat,
  Send,
  Wifi,
  WifiOff,
  Radio,
} from 'lucide-react';
import type {
  DeviceState,
  MelodyPayload,
  PlaybackCommandType,
  WsLogEntry,
} from '../../shared/types';

interface RealtimeConsoleProps {
  wsConnected: boolean;
  deviceId: string;
  onChangeDeviceId: (id: string) => void;
  deviceState: DeviceState | null;
  logs: WsLogEntry[];
  studioMelody: MelodyPayload | null;
  onPushMelody: (melody: MelodyPayload, autoPlay: boolean) => void;
  onSendCommand: (command: PlaybackCommandType, value?: number | boolean) => void;
  onGoToFirmware: () => void;
}

export const RealtimeConsole: React.FC<RealtimeConsoleProps> = ({
  wsConnected,
  deviceId,
  onChangeDeviceId,
  deviceState,
  logs,
  studioMelody,
  onPushMelody,
  onSendCommand,
  onGoToFirmware,
}) => {
  const activeMelody = deviceState?.activeMelody || null;
  const totalNotes = activeMelody?.notes.length || 0;
  const currentIdx = deviceState?.currentNoteIndex || 0;
  const progressPct = totalNotes > 0 ? Math.min(100, Math.round((currentIdx / totalNotes) * 100)) : 0;
  const currentNote = activeMelody?.notes[currentIdx] || null;

  return (
    <div className="space-y-6">
      {/* Top Status Summary Grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">การเชื่อมต่อหน้าเว็บ (WebSocket)</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${
                wsConnected ? 'bg-emerald-600' : 'bg-rose-600'
              }`}
            />
            <span
              className={`text-sm font-semibold ${
                wsConnected ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {wsConnected ? 'เชื่อมต่อเซิร์ฟเวอร์แล้ว' : 'กำลังเชื่อมต่อใหม่...'}
            </span>
          </div>
          <div className="mt-1 text-xs font-mono text-slate-400">
            Web Clients: {deviceState?.webClientsCount ?? 1}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">บอร์ด ESP32-S3 N16R8</div>
          <div className="mt-1.5 flex items-center gap-2">
            {deviceState?.online ? (
              <Wifi className="h-4 w-4 text-emerald-600" />
            ) : (
              <WifiOff className="h-4 w-4 text-slate-400" />
            )}
            <span
              className={`text-sm font-semibold ${
                deviceState?.online ? 'text-emerald-700' : 'text-slate-700'
              }`}
            >
              {deviceState?.online ? 'ออนไลน์พร้อมเล่น' : 'รอบอร์ดเชื่อมต่อ'}
            </span>
          </div>
          <div className="mt-1 text-xs font-mono text-slate-400">
            {deviceState?.ipAddress ? `IP: ${deviceState.ipAddress}` : 'WiFi: Bobo'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">เพลงบนเซิร์ฟเวอร์ Real-Time</div>
          <div className="mt-1.5 truncate text-sm font-semibold text-slate-900">
            {activeMelody ? activeMelody.title : 'ยังไม่มีเพลงในคิว'}
          </div>
          <div className="mt-1 text-xs font-mono text-slate-500 tabular-nums">
            {activeMelody
              ? `${activeMelody.notes.length} โน้ต · ${activeMelody.bpm} BPM`
              : 'ส่งเพลงจากแท็บถอดเสียงได้เลย'}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-500">รหัสห้องอุปกรณ์ (Device ID)</div>
          <input
            type="text"
            value={deviceId}
            onChange={(e) => onChangeDeviceId(e.target.value)}
            className="mt-1.5 w-full rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-mono font-semibold text-slate-800 focus:border-blue-500 focus:bg-white focus:outline-none"
          />
          <div className="mt-1 text-xs text-slate-400">ต้องตรงกับในโค้ด ESP32-S3</div>
        </div>
      </div>

      {/* Main Split: Remote Controller & Live Event Log */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left: Live Remote Deck */}
        <div className="space-y-5 lg:col-span-7">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  แผงควบคุม ESP32-S3 ออนไลน์แบบ Real-Time
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  สั่งงานผ่าน WebSocket ทันที ไม่ต้องรีเฟรชหน้าเว็บและไม่ต้องอัปโหลดโค้ดซ้ำเมื่อเปลี่ยนเพลง
                </p>
              </div>
              {!deviceState?.online && (
                <button
                  type="button"
                  onClick={onGoToFirmware}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 whitespace-nowrap shrink-0"
                >
                  ไปเอาโค้ดแฟลชลงบอร์ด
                </button>
              )}
            </div>

            {/* Push Current Studio Melody */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-500">
                  เพลงล่าสุดที่ถอดจากสตูดิโอ:
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                  {studioMelody
                    ? `${studioMelody.title} (${studioMelody.notes.length} โน้ต · ${studioMelody.mode === 'passive_melody' ? 'Passive' : 'Active'})`
                    : 'ยังไม่มีเพลงที่แปลง'}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!studioMelody}
                  onClick={() => studioMelody && onPushMelody(studioMelody, false)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  ส่งเข้าคิวก่อน
                </button>
                <button
                  type="button"
                  disabled={!studioMelody}
                  onClick={() => studioMelody && onPushMelody(studioMelody, true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  <Send className="h-3.5 w-3.5" />
                  ส่งและเล่นทันที
                </button>
              </div>
            </div>

            {/* Playback Transport */}
            <div className="mt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={!activeMelody}
                    onClick={() => onSendCommand('play')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Play className="h-3.5 w-3.5" />
                    เล่น
                  </button>
                  <button
                    type="button"
                    disabled={!activeMelody}
                    onClick={() => onSendCommand('pause')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    พัก
                  </button>
                  <button
                    type="button"
                    disabled={!activeMelody}
                    onClick={() => onSendCommand('stop')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
                  >
                    <Square className="h-3.5 w-3.5 text-rose-600" />
                    หยุด
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => onSendCommand('set_loop', !deviceState?.loop)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    deviceState?.loop
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Repeat className="h-3.5 w-3.5" />
                  เล่นวนซ้ำ: {deviceState?.loop ? 'เปิด' : 'ปิด'}
                </button>
              </div>

              {/* Live Playback Progress */}
              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-950 p-4 text-slate-100">
                <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                  <span className="text-slate-400">
                    สถานะ: {deviceState?.playing ? 'กำลังเล่นบน ESP32-S3' : 'หยุดนิ่ง'}
                  </span>
                  <span>
                    โน้ต {totalNotes > 0 ? currentIdx + 1 : 0} / {totalNotes}
                    {currentNote && currentNote.f > 0
                      ? ` · ${currentNote.f} Hz (${currentNote.noteName})`
                      : ''}
                  </span>
                </div>
                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-blue-500 transition-all duration-150"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Real-Time Tempo & Duty Sliders */}
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700">ความเร็ว Real-Time (Tempo)</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {(activeMelody?.tempoScale ?? 1).toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={1.5}
                    step={0.05}
                    value={activeMelody?.tempoScale ?? 1}
                    onChange={(e) => onSendCommand('set_tempo', Number(e.target.value))}
                    className="mt-1.5 w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-slate-700">ความดัง PWM (Duty Cycle)</span>
                    <span className="font-mono text-slate-600 tabular-nums">
                      {activeMelody?.dutyPercent ?? 35}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={5}
                    value={activeMelody?.dutyPercent ?? 35}
                    onChange={(e) => onSendCommand('set_duty', Number(e.target.value))}
                    className="mt-1.5 w-full accent-blue-600"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Real WebSocket Traffic Log */}
        <div className="lg:col-span-5">
          <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-semibold text-slate-900">
                  บันทึกการสื่อสาร WebSocket จริง
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400 tabular-nums">
                {logs.length} เหตุการณ์
              </span>
            </div>

            <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: 380 }}>
              {logs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  ยังไม่มีข้อความรับ-ส่ง ลองกดปุ่มส่งเพลงหรือเชื่อมต่อ ESP32-S3 เข้ามาที่ห้อง{' '}
                  <span className="font-mono font-semibold text-slate-700">{deviceId}</span>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {logs.map((entry) => (
                    <div key={entry.id} className="py-2.5 text-xs">
                      <div className="flex items-center justify-between font-mono text-slate-400 tabular-nums">
                        <span>
                          {entry.source.toUpperCase()} · {entry.event}
                        </span>
                        <span>
                          {new Date(entry.timestamp).toLocaleTimeString('th-TH', {
                            hour12: false,
                          })}
                        </span>
                      </div>
                      <p className="mt-0.5 text-slate-800">{entry.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
