import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  DeviceState,
  MelodyPayload,
  PlaybackCommandPayload,
  WsLogEntry,
} from './shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const DEFAULT_DEVICE_ID = 'esp32s3-bobo';

interface ClientMeta {
  ws: WebSocket;
  role: 'web' | 'device';
  deviceId: string;
  ipAddress: string;
}

interface RoomStore {
  state: DeviceState;
  logs: WsLogEntry[];
  clients: Set<ClientMeta>;
}

const rooms = new Map<string, RoomStore>();

function getOrCreateRoom(deviceId: string): RoomStore {
  const normalized = deviceId.trim() || DEFAULT_DEVICE_ID;
  let room = rooms.get(normalized);
  if (!room) {
    room = {
      state: {
        deviceId: normalized,
        online: false,
        playing: false,
        loop: false,
        currentNoteIndex: 0,
        activeMelody: null,
        ipAddress: null,
        firmwareVersion: null,
        lastSeenAt: null,
        webClientsCount: 0,
        deviceClientsCount: 0,
      },
      logs: [],
      clients: new Set<ClientMeta>(),
    };
    rooms.set(normalized, room);
  }
  return room;
}

function appendLog(
  room: RoomStore,
  source: 'server' | 'web' | 'esp32',
  event: string,
  summary: string
): WsLogEntry {
  const entry: WsLogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    source,
    event,
    summary,
  };
  room.logs = [entry, ...room.logs].slice(0, 40);
  return entry;
}

function refreshCounts(room: RoomStore) {
  let webCount = 0;
  let deviceCount = 0;
  let latestDeviceIp: string | null = room.state.ipAddress;

  for (const client of room.clients) {
    if (client.ws.readyState === WebSocket.OPEN) {
      if (client.role === 'web') webCount += 1;
      if (client.role === 'device') {
        deviceCount += 1;
        latestDeviceIp = client.ipAddress;
      }
    }
  }

  room.state.webClientsCount = webCount;
  room.state.deviceClientsCount = deviceCount;
  room.state.online = deviceCount > 0;
  if (deviceCount > 0) {
    room.state.ipAddress = latestDeviceIp;
    room.state.lastSeenAt = Date.now();
  } else {
    room.state.playing = false;
  }
}

function broadcastToRoom(room: RoomStore, payload: unknown, onlyRole?: 'web' | 'device') {
  const serialized = JSON.stringify(payload);
  for (const client of room.clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (onlyRole && client.role !== onlyRole) continue;
    client.ws.send(serialized);
  }
}

function sendCompactMelodyToDevice(room: RoomStore, melody: MelodyPayload, autoPlay: boolean) {
  // Compact format optimized for ESP32-S3 RAM & ArduinoJson parsing
  const compactPayload = {
    type: 'melody:load',
    autoPlay,
    id: melody.id,
    title: melody.title,
    bpm: melody.bpm,
    mode: melody.mode,
    gapMs: melody.gapMs,
    dutyPercent: melody.dutyPercent,
    tempoScale: melody.tempoScale,
    loop: room.state.loop,
    notes: melody.notes.map((n) => [Math.round(n.f), Math.round(n.d)]),
  };
  broadcastToRoom(room, compactPayload, 'device');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.get('/api/device/:deviceId/state', (req, res) => {
    const room = getOrCreateRoom(req.params.deviceId);
    refreshCounts(room);
    res.json({
      state: room.state,
      logs: room.logs,
    });
  });

  app.post('/api/device/:deviceId/melody', (req, res) => {
    const room = getOrCreateRoom(req.params.deviceId);
    const body = req.body as { melody?: MelodyPayload; autoPlay?: boolean };
    if (!body?.melody || !Array.isArray(body.melody.notes)) {
      res.status(400).json({ error: 'Invalid melody payload' });
      return;
    }

    const melody = body.melody;
    const autoPlay = Boolean(body.autoPlay);
    room.state.activeMelody = melody;
    room.state.currentNoteIndex = 0;
    room.state.playing = autoPlay && room.state.online;

    const log = appendLog(
      room,
      'web',
      'melody:push',
      `อัปโหลดเพลง "${melody.title}" (${melody.notes.length} โน้ต, ${melody.bpm} BPM)`
    );

    sendCompactMelodyToDevice(room, melody, autoPlay);
    broadcastToRoom(room, { type: 'state:sync', state: room.state, log }, 'web');
    res.json({ ok: true, state: room.state });
  });

  app.post('/api/device/:deviceId/command', (req, res) => {
    const room = getOrCreateRoom(req.params.deviceId);
    const cmd = req.body as PlaybackCommandPayload;
    if (!cmd?.command) {
      res.status(400).json({ error: 'Missing command' });
      return;
    }

    let logSummary = `คำสั่ง ${cmd.command}`;
    if (cmd.command === 'play') {
      room.state.playing = true;
      logSummary = 'สั่งเล่นเพลงบน ESP32-S3';
    } else if (cmd.command === 'pause') {
      room.state.playing = false;
      logSummary = 'สั่งพักการเล่นชั่วคราว';
    } else if (cmd.command === 'stop') {
      room.state.playing = false;
      room.state.currentNoteIndex = 0;
      logSummary = 'สั่งหยุดเล่นและรีเซ็ตตำแหน่งโน้ต';
    } else if (cmd.command === 'set_loop') {
      room.state.loop = Boolean(cmd.value);
      logSummary = `ตั้งค่าเล่นวนซ้ำ: ${room.state.loop ? 'เปิด' : 'ปิด'}`;
    } else if (cmd.command === 'set_tempo' && typeof cmd.value === 'number' && room.state.activeMelody) {
      room.state.activeMelody.tempoScale = Math.max(0.5, Math.min(2.0, cmd.value));
      logSummary = `ปรับความเร็วเป็น ${room.state.activeMelody.tempoScale.toFixed(2)}x`;
    } else if (cmd.command === 'set_duty' && typeof cmd.value === 'number' && room.state.activeMelody) {
      room.state.activeMelody.dutyPercent = Math.max(5, Math.min(50, Math.round(cmd.value)));
      logSummary = `ปรับความแรง PWM Duty Cycle เป็น ${room.state.activeMelody.dutyPercent}%`;
    }

    const log = appendLog(room, 'web', `cmd:${cmd.command}`, logSummary);
    broadcastToRoom(room, { type: 'playback:command', ...cmd }, 'device');
    broadcastToRoom(room, { type: 'state:sync', state: room.state, log }, 'web');
    res.json({ ok: true, state: room.state });
  });

  // Compact polling endpoint for constrained devices if WebSocket drops
  app.get('/api/device/:deviceId/compact', (req, res) => {
    const room = getOrCreateRoom(req.params.deviceId);
    if (!room.state.activeMelody) {
      res.json({ hasMelody: false });
      return;
    }
    const m = room.state.activeMelody;
    res.json({
      hasMelody: true,
      id: m.id,
      title: m.title,
      bpm: m.bpm,
      mode: m.mode,
      gapMs: m.gapMs,
      dutyPercent: m.dutyPercent,
      tempoScale: m.tempoScale,
      loop: room.state.loop,
      playing: room.state.playing,
      notes: m.notes.map((n) => [Math.round(n.f), Math.round(n.d)]),
    });
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/ws', `http://${req.headers.host || 'localhost'}`);
    const roleParam = url.searchParams.get('role');
    const role: 'web' | 'device' = roleParam === 'device' ? 'device' : 'web';
    const deviceId = url.searchParams.get('deviceId') || DEFAULT_DEVICE_ID;

    const forwardedFor = req.headers['x-forwarded-for'];
    const rawIp =
      typeof forwardedFor === 'string'
        ? forwardedFor.split(',')[0].trim()
        : req.socket.remoteAddress || 'unknown';

    const room = getOrCreateRoom(deviceId);
    const meta: ClientMeta = {
      ws,
      role,
      deviceId,
      ipAddress: rawIp.replace(/^::ffff:/, ''),
    };
    room.clients.add(meta);
    refreshCounts(room);

    if (role === 'device') {
      const log = appendLog(
        room,
        'esp32',
        'device:connected',
        `ESP32-S3 เชื่อมต่อเข้ามาแล้ว (IP: ${meta.ipAddress})`
      );
      if (room.state.activeMelody) {
        sendCompactMelodyToDevice(room, room.state.activeMelody, false);
      }
      broadcastToRoom(room, { type: 'state:sync', state: room.state, log }, 'web');
    } else {
      ws.send(
        JSON.stringify({
          type: 'init',
          state: room.state,
          logs: room.logs,
        })
      );
      broadcastToRoom(room, { type: 'state:sync', state: room.state }, 'web');
    }

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString()) as Record<string, unknown>;
      } catch {
        return;
      }

      const msgType = typeof msg.type === 'string' ? msg.type : '';

      if (role === 'device') {
        room.state.lastSeenAt = Date.now();
        if (msgType === 'device:hello') {
          if (typeof msg.ip === 'string') room.state.ipAddress = msg.ip;
          if (typeof msg.firmware === 'string') room.state.firmwareVersion = msg.firmware;
          const log = appendLog(
            room,
            'esp32',
            'device:hello',
            `อุปกรณ์รายงานตัว (${room.state.firmwareVersion || 'ESP32-S3'}) IP ${room.state.ipAddress || meta.ipAddress}`
          );
          broadcastToRoom(room, { type: 'state:sync', state: room.state, log }, 'web');
        } else if (msgType === 'device:progress') {
          if (typeof msg.noteIndex === 'number') {
            room.state.currentNoteIndex = msg.noteIndex;
          }
          if (typeof msg.playing === 'boolean') {
            room.state.playing = msg.playing;
          }
          broadcastToRoom(
            room,
            {
              type: 'device:progress',
              noteIndex: room.state.currentNoteIndex,
              playing: room.state.playing,
            },
            'web'
          );
        } else if (msgType === 'device:finished') {
          room.state.playing = false;
          room.state.currentNoteIndex = 0;
          const log = appendLog(room, 'esp32', 'device:finished', 'ESP32-S3 เล่นเพลงจบแล้ว');
          broadcastToRoom(room, { type: 'state:sync', state: room.state, log }, 'web');
        }
        return;
      }

      // Messages from Web Clients
      if (msgType === 'melody:push' && msg.melody && typeof msg.melody === 'object') {
        const melody = msg.melody as MelodyPayload;
        const autoPlay = Boolean(msg.autoPlay);
        room.state.activeMelody = melody;
        room.state.currentNoteIndex = 0;
        room.state.playing = autoPlay && room.state.online;
        const log = appendLog(
          room,
          'web',
          'melody:push',
          `ส่งเพลง "${melody.title}" (${melody.notes.length} โน้ต) ไปยัง ESP32-S3`
        );
        sendCompactMelodyToDevice(room, melody, autoPlay);
        broadcastToRoom(room, { type: 'state:sync', state: room.state, log }, 'web');
      } else if (msgType === 'playback:command' && typeof msg.command === 'string') {
        const cmd = msg.command;
        let summary = `คำสั่ง ${cmd}`;
        if (cmd === 'play') {
          room.state.playing = true;
          summary = 'เริ่มเล่นเพลงบน ESP32-S3';
        } else if (cmd === 'pause') {
          room.state.playing = false;
          summary = 'พักการเล่นชั่วคราว';
        } else if (cmd === 'stop') {
          room.state.playing = false;
          room.state.currentNoteIndex = 0;
          summary = 'หยุดเล่นเพลง';
        } else if (cmd === 'set_loop') {
          room.state.loop = Boolean(msg.value);
          summary = `โหมดเล่นวนซ้ำ: ${room.state.loop ? 'เปิด' : 'ปิด'}`;
        } else if (cmd === 'set_tempo' && typeof msg.value === 'number' && room.state.activeMelody) {
          room.state.activeMelody.tempoScale = Math.max(0.5, Math.min(2.0, msg.value));
          summary = `ปรับความเร็วเป็น ${room.state.activeMelody.tempoScale.toFixed(2)}x`;
        } else if (cmd === 'set_duty' && typeof msg.value === 'number' && room.state.activeMelody) {
          room.state.activeMelody.dutyPercent = Math.max(5, Math.min(50, Math.round(msg.value)));
          summary = `ปรับความแรง PWM Duty Cycle เป็น ${room.state.activeMelody.dutyPercent}%`;
        }
        const log = appendLog(room, 'web', `cmd:${cmd}`, summary);
        broadcastToRoom(room, { type: 'playback:command', command: cmd, value: msg.value }, 'device');
        broadcastToRoom(room, { type: 'state:sync', state: room.state, log }, 'web');
      }
    });

    ws.on('close', () => {
      room.clients.delete(meta);
      refreshCounts(room);
      if (role === 'device') {
        const log = appendLog(room, 'esp32', 'device:disconnected', 'ESP32-S3 ตัดการเชื่อมต่อแล้ว');
        broadcastToRoom(room, { type: 'state:sync', state: room.state, log }, 'web');
      } else {
        broadcastToRoom(room, { type: 'state:sync', state: room.state }, 'web');
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`BuzzerLab S3 server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
