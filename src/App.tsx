import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DeviceState,
  MelodyPayload,
  PlaybackCommandType,
  WsLogEntry,
} from '../shared/types';
import { TranscoderStudio } from './components/TranscoderStudio';
import { RealtimeConsole } from './components/RealtimeConsole';
import { FirmwarePanel } from './components/FirmwarePanel';
import { BeginnerGuide } from './components/BeginnerGuide';

type ActiveTab = 'studio' | 'realtime' | 'firmware' | 'guide';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('studio');
  const [deviceId, setDeviceId] = useState<string>('esp32s3-bobo');
  const [studioMelody, setStudioMelody] = useState<MelodyPayload | null>(null);

  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [deviceState, setDeviceState] = useState<DeviceState | null>(null);
  const [logs, setLogs] = useState<WsLogEntry[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  useEffect(() => {
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws?role=web&deviceId=${encodeURIComponent(
        deviceId || 'esp32s3-bobo'
      )}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!disposed) setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as {
            type?: string;
            state?: DeviceState;
            logs?: WsLogEntry[];
            log?: WsLogEntry;
            noteIndex?: number;
            playing?: boolean;
          };

          if (data.type === 'init') {
            if (data.state) setDeviceState(data.state);
            if (Array.isArray(data.logs)) setLogs(data.logs);
          } else if (data.type === 'state:sync') {
            if (data.state) setDeviceState(data.state);
            if (data.log) {
              setLogs((prev) => [data.log!, ...prev].slice(0, 40));
            }
          } else if (data.type === 'device:progress') {
            setDeviceState((prev) =>
              prev
                ? {
                    ...prev,
                    currentNoteIndex:
                      typeof data.noteIndex === 'number' ? data.noteIndex : prev.currentNoteIndex,
                    playing: typeof data.playing === 'boolean' ? data.playing : prev.playing,
                  }
                : prev
            );
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setWsConnected(false);
        reconnectTimerRef.current = window.setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [deviceId]);

  const handlePushMelody = useCallback(
    async (melody: MelodyPayload, autoPlay: boolean) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'melody:push', melody, autoPlay }));
      } else {
        await fetch(`/api/device/${encodeURIComponent(deviceId)}/melody`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ melody, autoPlay }),
        });
      }
      setActiveTab('realtime');
      showToast(
        deviceState?.online
          ? `ส่งเพลง "${melody.title}" ขึ้น ESP32-S3 แล้ว`
          : `บันทึกเพลง "${melody.title}" เข้าคิว Real-Time แล้ว (รอบอร์ดเชื่อมต่อ)`
      );
    },
    [deviceId, deviceState?.online, showToast]
  );

  const handleSendCommand = useCallback(
    async (command: PlaybackCommandType, value?: number | boolean) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'playback:command', command, value }));
      } else {
        await fetch(`/api/device/${encodeURIComponent(deviceId)}/command`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, value }),
        });
      }
    },
    [deviceId]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-8 px-6 py-3.5">
          {/* Zone 1: Single text element wordmark */}
          <button
            type="button"
            onClick={() => setActiveTab('studio')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            BuzzerLab S3
          </button>

          {/* Zone 2: 4 clean single-line text links */}
          <nav className="flex items-center gap-6 overflow-x-auto text-sm font-medium">
            {(
              [
                ['studio', 'ตัวถอดเสียง'],
                ['realtime', 'ควบคุม Real-time'],
                ['firmware', 'โค้ด ESP32-S3'],
                ['guide', 'คู่มือทำตั้งแต่ศูนย์'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`border-b-2 py-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === key
                    ? 'border-blue-600 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: 1 primary action */}
          <div className="shrink-0 hidden sm:block">
            <button
              type="button"
              onClick={() => {
                if (studioMelody && activeTab !== 'realtime') {
                  handlePushMelody(studioMelody, true);
                } else {
                  setActiveTab('firmware');
                }
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              ส่งเพลงขึ้นบอร์ด
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-[1360px] px-6 py-6">
        {/* Hero / Contextual Unboxed Metadata Bar */}
        <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 text-balance">
              แปลงคลิปเสียงเป็นโน้ต Buzzer สำหรับ ESP32-S3 N16R8
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>ESP32-S3 N16R8</span>
              <span aria-hidden="true">·</span>
              <span>WiFi Bobo</span>
              <span aria-hidden="true">·</span>
              <span>GPIO 7 (ขา S)</span>
              <span aria-hidden="true">·</span>
              <span className={wsConnected ? 'text-emerald-700 font-medium' : 'text-amber-700'}>
                {wsConnected ? '● WebSocket พร้อมใช้งาน' : '○ กำลังเชื่อมต่อ WebSocket'}
              </span>
              <span aria-hidden="true">·</span>
              <span className={deviceState?.online ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                {deviceState?.online ? '● บอร์ด ESP32-S3 ออนไลน์' : '○ รอบอร์ดเชื่อมต่อ'}
              </span>
            </div>
          </div>

          {toastMsg && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800">
              {toastMsg}
            </div>
          )}
        </div>

        {activeTab === 'studio' && (
          <TranscoderStudio
            currentMelody={studioMelody}
            onMelodyReady={setStudioMelody}
            onPushToEsp32={handlePushMelody}
            espOnline={Boolean(deviceState?.online)}
          />
        )}

        {activeTab === 'realtime' && (
          <RealtimeConsole
            wsConnected={wsConnected}
            deviceId={deviceId}
            onChangeDeviceId={(id) => setDeviceId(id.trim() || 'esp32s3-bobo')}
            deviceState={deviceState}
            logs={logs}
            studioMelody={studioMelody}
            onPushMelody={handlePushMelody}
            onSendCommand={handleSendCommand}
            onGoToFirmware={() => setActiveTab('firmware')}
          />
        )}

        {activeTab === 'firmware' && (
          <FirmwarePanel deviceId={deviceId} currentMelody={studioMelody} />
        )}

        {activeTab === 'guide' && (
          <BeginnerGuide
            onGoToStudio={() => setActiveTab('studio')}
            onGoToCode={() => setActiveTab('firmware')}
          />
        )}
      </main>
    </div>
  );
}
