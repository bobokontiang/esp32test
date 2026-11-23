import React, { useMemo, useState } from 'react';
import { Copy, Check, Download, Cpu, Wifi } from 'lucide-react';
import type { MelodyPayload } from '../../shared/types';
import {
  generateBuzzerDiagnosticCode,
  generateRealtimeFirmware,
  generateStandaloneFirmware,
} from '../esp32/firmwareGenerator';

interface FirmwarePanelProps {
  deviceId: string;
  currentMelody: MelodyPayload | null;
}

const SAFE_S3_PINS = [4, 5, 6, 7, 15, 16, 17, 18];

export const FirmwarePanel: React.FC<FirmwarePanelProps> = ({
  deviceId,
  currentMelody,
}) => {
  const [wifiSsid, setWifiSsid] = useState('Bobo');
  const [wifiPass, setWifiPass] = useState('Chorkaidum');
  const [buzzerPin, setBuzzerPin] = useState(7);
  const [activeLow, setActiveLow] = useState(false);

  const defaultUseCloud =
    typeof window !== 'undefined' &&
    !['localhost', '127.0.0.1'].includes(window.location.hostname);
  const [hostMode, setHostMode] = useState<'cloud' | 'local'>(
    defaultUseCloud ? 'cloud' : 'local'
  );
  const [localIp, setLocalIp] = useState('192.168.1.100');
  const [activeCodeTab, setActiveCodeTab] = useState<'realtime' | 'standalone' | 'test'>(
    'realtime'
  );
  const [copied, setCopied] = useState(false);

  const cloudHost =
    typeof window !== 'undefined' ? window.location.hostname : 'your-app-domain.onrender.com';
  const cloudUseSsl =
    typeof window !== 'undefined' ? window.location.protocol === 'https:' : true;
  const cloudPort =
    typeof window !== 'undefined' && window.location.port
      ? Number(window.location.port)
      : cloudUseSsl
      ? 443
      : 80;

  const generatedCode = useMemo(() => {
    const cfg = {
      wifiSsid,
      wifiPass,
      deviceId,
      buzzerPin,
      buzzerMode: currentMelody?.mode || 'passive_melody',
      activeLow,
      gapMs: currentMelody?.gapMs ?? 14,
      dutyPercent: currentMelody?.dutyPercent ?? 35,
      tempoScale: currentMelody?.tempoScale ?? 1.0,
      wsHost: hostMode === 'cloud' ? cloudHost : localIp.trim() || '192.168.1.100',
      wsPort: hostMode === 'cloud' ? cloudPort : 3000,
      wsUseSsl: hostMode === 'cloud' ? cloudUseSsl : false,
      title: currentMelody?.title || 'Sample Melody',
      notes: currentMelody?.notes || [],
    };

    if (activeCodeTab === 'realtime') return generateRealtimeFirmware(cfg);
    if (activeCodeTab === 'standalone') return generateStandaloneFirmware(cfg);
    return generateBuzzerDiagnosticCode(buzzerPin);
  }, [
    wifiSsid,
    wifiPass,
    deviceId,
    buzzerPin,
    activeLow,
    currentMelody,
    hostMode,
    cloudHost,
    cloudPort,
    cloudUseSsl,
    localIp,
    activeCodeTab,
  ]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(generatedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const filename =
      activeCodeTab === 'realtime'
        ? 'BuzzerLab_S3_Realtime.ino'
        : activeCodeTab === 'standalone'
        ? 'BuzzerLab_S3_Standalone.ino'
        : 'Check_Buzzer_Type.ino';
    const blob = new Blob([generatedCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left Configuration */}
      <div className="space-y-5 lg:col-span-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Wifi className="h-4 w-4 text-blue-600" />
            <h2 className="text-base font-semibold text-slate-900">ตั้งค่าบอร์ด ESP32-S3 N16R8</h2>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">ชื่อ WiFi (SSID)</label>
            <input
              type="text"
              value={wifiSsid}
              onChange={(e) => setWifiSsid(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">รหัสผ่าน WiFi</label>
            <input
              type="text"
              value={wifiPass}
              onChange={(e) => setWifiPass(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              ขา GPIO ต่อเข้าขา S (Signal) ของ Buzzer 3 ขา
            </label>
            <select
              value={buzzerPin}
              onChange={(e) => setBuzzerPin(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
            >
              {SAFE_S3_PINS.map((pin) => (
                <option key={pin} value={pin}>
                  GPIO {pin} {pin === 7 ? '(ขาที่คุณต่อไว้)' : ''}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">
              บอร์ด N16R8 ใช้ขา GPIO 33–37 สำหรับ Octal PSRAM ห้ามนำมาต่อ Buzzer เด็ดขาด (ขา GPIO 7 ปลอดภัย)
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              ลอจิกสั่งดังของโมดูล 3 ขา (Active Buzzer)
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setActiveLow(false)}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  !activeLow
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active HIGH (ปกติ)
              </button>
              <button
                type="button"
                onClick={() => setActiveLow(true)}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  activeLow
                    ? 'bg-white text-amber-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Active LOW (ดังค้าง)
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              ถ้าอัปโหลดแล้วบอร์ดร้องดังค้างไม่หยุด ให้สลับมาเลือก Active LOW
            </p>
          </div>

          <div className="border-t border-slate-100 pt-4">
            <label className="block text-xs font-medium text-slate-700">
              ปลายทางเซิร์ฟเวอร์ WebSocket
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setHostMode('cloud')}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  hostMode === 'cloud'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                เว็บออนไลน์นี้
              </button>
              <button
                type="button"
                onClick={() => setHostMode('local')}
                className={`rounded-md py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  hostMode === 'local'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                คอมพ์ใน WiFi บ้าน
              </button>
            </div>

            {hostMode === 'cloud' ? (
              <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-xs font-mono text-slate-600 break-all">
                {cloudUseSsl ? 'wss' : 'ws'}://{cloudHost}:{cloudPort}/ws?role=device&amp;deviceId={deviceId}
              </div>
            ) : (
              <div className="mt-2">
                <label className="block text-xs text-slate-500">
                  IP เครื่องคอมพิวเตอร์ที่รันเซิร์ฟเวอร์ (เช่น 192.168.1.45)
                </label>
                <input
                  type="text"
                  value={localIp}
                  onChange={(e) => setLocalIp(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-mono text-slate-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 text-slate-900">
            <Cpu className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-semibold">เช็คค่า Tools ใน Arduino IDE ก่อนกด Upload</h3>
          </div>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between border-b border-slate-100 pb-1.5">
              <dt className="text-slate-500">Board</dt>
              <dd className="font-mono font-medium text-slate-900">ESP32S3 Dev Module</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-1.5">
              <dt className="text-slate-500">USB CDC On Boot</dt>
              <dd className="font-mono font-medium text-emerald-700">Enabled</dd>
            </div>
            <div className="flex justify-between border-b border-slate-100 pb-1.5">
              <dt className="text-slate-500">Flash Size</dt>
              <dd className="font-mono font-medium text-slate-900">16MB (128Mb)</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">PSRAM</dt>
              <dd className="font-mono font-medium text-emerald-700">OPI PSRAM</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Right Code Viewer */}
      <div className="lg:col-span-8">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
              {(
                [
                  ['realtime', '1. Online Real-Time (.ino)'],
                  ['standalone', '2. ออฟไลน์มีเว็บในตัว (.ino)'],
                  ['test', '3. ทดสอบ Buzzer 5 วิ'],
                ] as const
              ).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveCodeTab(tab)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeCodeTab === tab
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                ดาวน์โหลด .ino
              </button>
            </div>
          </div>

          <pre className="max-h-[600px] overflow-auto bg-[#0B1120] p-5 text-xs leading-relaxed text-slate-200 font-mono">
            <code>{generatedCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
