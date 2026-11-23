import type { BuzzerMode, BuzzerNote } from '../../shared/types';

export interface FirmwareConfig {
  wifiSsid: string;
  wifiPass: string;
  deviceId: string;
  buzzerPin: number;
  buzzerMode: BuzzerMode;
  activeLow?: boolean;
  gapMs: number;
  dutyPercent: number;
  tempoScale: number;
  wsHost: string;
  wsPort: number;
  wsUseSsl: boolean;
  title: string;
  notes: BuzzerNote[];
}

function formatCppNoteArray(notes: BuzzerNote[]): string {
  const safeNotes =
    notes.length > 0
      ? notes
      : [
          { f: 523, d: 220 },
          { f: 659, d: 220 },
          { f: 784, d: 350 },
        ];
  const lines: string[] = [];
  for (let i = 0; i < safeNotes.length; i += 6) {
    const chunk = safeNotes
      .slice(i, i + 6)
      .map((n) => `{${Math.round(n.f)}, ${Math.round(n.d)}}`)
      .join(', ');
    lines.push(`  ${chunk}${i + 6 < safeNotes.length ? ',' : ''}`);
  }
  return lines.join('\n');
}

export function generateRealtimeFirmware(cfg: FirmwareConfig): string {
  const wsPath = `/ws?role=device&deviceId=${cfg.deviceId}`;
  const noteArrayBody = formatCppNoteArray(cfg.notes);
  const modeStr = cfg.buzzerMode;
  const activeLvl = cfg.activeLow ? 'LOW' : 'HIGH';
  const idleLvl = cfg.activeLow ? 'HIGH' : 'LOW';

  return `/*
 * ============================================================================
 *  BuzzerLab S3 — ESP32-S3 N16R8 Online Real-Time WebSocket Firmware
 *  สร้างอัตโนมัติสำหรับเพลง: ${cfg.title || 'Untitled Melody'}
 * ============================================================================
 *  การต่อสายโมดูล Buzzer 3 ขา (-, S, VCC) กับ ESP32-S3 N16R8:
 *   - ขา S   -> GPIO ${cfg.buzzerPin}
 *   - ขา VCC -> 3V3 (หรือ 5V หากโมดูลระบุ 5V)
 *   - ขา -   -> GND
 *
 *  ตั้งค่าใน Arduino IDE (สำคัญมากสำหรับ ESP32-S3 N16R8):
 *   - Board          : ESP32S3 Dev Module
 *   - USB CDC On Boot: Enabled (เพื่อให้ดู Serial Monitor ผ่านสาย USB ได้)
 *   - Flash Size     : 16MB (128Mb)
 *   - PSRAM          : OPI PSRAM
 *
 *  Library ที่ต้องติดตั้ง (ฟรี 100% ผ่าน Library Manager):
 *   1. WebSockets by Markus Sattler
 *   2. ArduinoJson by Benoit Blanchon
 * ============================================================================
 */

#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

// -------- 1. ตั้งค่า WiFi และพิน Buzzer --------
const char* WIFI_SSID = "${cfg.wifiSsid}";
const char* WIFI_PASS = "${cfg.wifiPass}";

const int BUZZER_PIN = ${cfg.buzzerPin};   // ขา S ต่อเข้า GPIO ${cfg.buzzerPin}
const int BOOT_BTN_PIN = 0;                // ปุ่ม BOOT บนบอร์ด กดเพื่อเล่นเพลงสำรองแบบออฟไลน์

// หากต่อ Active Buzzer 3 ขาแล้ว "ดังค้างตลอดเวลา" ให้สลับค่าสองบรรทัดนี้เป็น LOW / HIGH
#define BUZZER_ACTIVE_LEVEL ${activeLvl}
#define BUZZER_IDLE_LEVEL   ${idleLvl}

// -------- 2. ตั้งค่าเซิร์ฟเวอร์ WebSocket Real-Time --------
const char* WS_HOST = "${cfg.wsHost}";
const uint16_t WS_PORT = ${cfg.wsPort};
const char* WS_PATH = "${wsPath}";
const bool WS_USE_SSL = ${cfg.wsUseSsl ? 'true' : 'false'};

// -------- 3. โครงสร้างโน้ตเพลง --------
struct Note {
  uint16_t freq;      // ความถี่ Hz (0 = เงียบ/พักจังหวะ)
  uint16_t duration;  // ความยาว ms
};

// เพลงสำรองในตัวเครื่อง (ใช้เพลงล่าสุดที่คุณแปลงจากหน้าเว็บ)
const Note FALLBACK_MELODY[] = {
${noteArrayBody}
};
const size_t FALLBACK_COUNT = sizeof(FALLBACK_MELODY) / sizeof(FALLBACK_MELODY[0]);

// บัฟเฟอร์สำหรับเพลงที่รับมาจากหน้าเว็บแบบ Real-Time (สูงสุด 1,200 โน้ต)
const size_t MAX_NOTES = 1200;
Note liveMelody[MAX_NOTES];
size_t liveNoteCount = 0;

// สถานะการเล่นแบบ Non-Blocking (ไม่ค้าง รับคำสั่งหยุด/เปลี่ยนเพลงได้ทันที)
String buzzerMode = "${modeStr}"; // "passive_melody" หรือ "active_rhythm"
uint16_t gapMs = ${cfg.gapMs};
uint8_t dutyPercent = ${cfg.dutyPercent};
float tempoScale = ${cfg.tempoScale.toFixed(2)};
bool loopPlayback = false;
bool isPlaying = false;
bool inGapPhase = false;
size_t currentIndex = 0;
unsigned long phaseStartMs = 0;
unsigned long phaseDurationMs = 0;
unsigned long lastHeartbeatMs = 0;

WebSocketsClient webSocket;

// -------- ฟังก์ชันขับเสียง Buzzer (รองรับทั้ง ESP32 Core 2.x และ 3.x) --------
bool ledcAttachedFlag = false;

void ensureBuzzerModePin(bool usePwm) {
  if (usePwm && !ledcAttachedFlag) {
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    ledcAttach(BUZZER_PIN, 2000, 10);
    ledcWrite(BUZZER_PIN, 0);
#else
    ledcSetup(0, 2000, 10);
    ledcAttachPin(BUZZER_PIN, 0);
    ledcWrite(0, 0);
#endif
    ledcAttachedFlag = true;
  } else if (!usePwm && ledcAttachedFlag) {
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    ledcDetach(BUZZER_PIN);
#else
    ledcDetachPin(BUZZER_PIN);
#endif
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, BUZZER_IDLE_LEVEL);
    ledcAttachedFlag = false;
  }
}

void initBuzzerHardware() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, BUZZER_IDLE_LEVEL);
  ensureBuzzerModePin(buzzerMode != "active_rhythm");
}

void stopBuzzerTone() {
  if (buzzerMode == "active_rhythm") {
    ensureBuzzerModePin(false);
    digitalWrite(BUZZER_PIN, BUZZER_IDLE_LEVEL);
    return;
  }
  ensureBuzzerModePin(true);
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcWrite(BUZZER_PIN, 0);
#else
  ledcWrite(0, 0);
#endif
}

void playBuzzerTone(uint16_t freq) {
  if (freq == 0) {
    stopBuzzerTone();
    return;
  }

  if (buzzerMode == "active_rhythm") {
    // Active Buzzer 3 ขา: สั่งเปิด-ปิดตามจังหวะ (เลี่ยงการติดค้างจาก PWM)
    ensureBuzzerModePin(false);
    digitalWrite(BUZZER_PIN, BUZZER_ACTIVE_LEVEL);
    return;
  }

  // Passive Buzzer: สร้างคลื่น PWM ความถี่ตามโน้ตเป๊ะ + คุมความดังด้วย Duty Cycle
  ensureBuzzerModePin(true);
  uint32_t dutyVal = map(constrain(dutyPercent, 5, 50), 0, 100, 0, 1023);
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcWriteTone(BUZZER_PIN, freq);
  ledcWrite(BUZZER_PIN, dutyVal);
#else
  ledcWriteTone(0, freq);
  ledcWrite(0, dutyVal);
#endif
}

void sendProgressToWeb() {
  if (!webSocket.isConnected()) return;
  JsonDocument doc;
  doc["type"] = "device:progress";
  doc["noteIndex"] = currentIndex;
  doc["playing"] = isPlaying;
  String out;
  serializeJson(doc, out);
  webSocket.sendTXT(out);
}

void startNoteAt(size_t idx) {
  if (idx >= liveNoteCount) {
    if (loopPlayback && liveNoteCount > 0) {
      idx = 0;
    } else {
      isPlaying = false;
      currentIndex = 0;
      stopBuzzerTone();
      if (webSocket.isConnected()) {
        webSocket.sendTXT("{\\"type\\":\\"device:finished\\"}");
      }
      return;
    }
  }

  currentIndex = idx;
  inGapPhase = false;
  uint32_t scaledDur = max((uint32_t)20, (uint32_t)(liveMelody[idx].duration / tempoScale));
  uint32_t effectiveGap = min((uint32_t)gapMs, scaledDur / 2);
  phaseDurationMs = scaledDur - effectiveGap;
  phaseStartMs = millis();

  playBuzzerTone(liveMelody[idx].freq);

  if (idx % 3 == 0) {
    sendProgressToWeb();
  }
}

void updateBuzzerPlayback() {
  if (!isPlaying || liveNoteCount == 0) return;

  unsigned long now = millis();
  if (now - phaseStartMs < phaseDurationMs) return;

  if (!inGapPhase) {
    uint32_t scaledDur = max((uint32_t)20, (uint32_t)(liveMelody[currentIndex].duration / tempoScale));
    uint32_t effectiveGap = min((uint32_t)gapMs, scaledDur / 2);
    if (effectiveGap > 0) {
      inGapPhase = true;
      phaseStartMs = now;
      phaseDurationMs = effectiveGap;
      stopBuzzerTone();
      return;
    }
  }

  startNoteAt(currentIndex + 1);
}

void loadFallbackMelody() {
  liveNoteCount = min(FALLBACK_COUNT, MAX_NOTES);
  for (size_t i = 0; i < liveNoteCount; i++) {
    liveMelody[i] = FALLBACK_MELODY[i];
  }
}

void handleWsMessage(uint8_t* payload, size_t length) {
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload, length);
  if (err) {
    Serial.printf("[WS] JSON Parse Error: %s\\n", err.c_str());
    return;
  }

  String type = doc["type"] | "";

  if (type == "melody:load") {
    stopBuzzerTone();
    isPlaying = false;
    buzzerMode = doc["mode"] | "passive_melody";
    gapMs = doc["gapMs"] | 12;
    dutyPercent = doc["dutyPercent"] | 35;
    tempoScale = doc["tempoScale"] | 1.0f;
    loopPlayback = doc["loop"] | false;

    JsonArray arr = doc["notes"].as<JsonArray>();
    size_t count = 0;
    for (JsonArray item : arr) {
      if (count >= MAX_NOTES) break;
      liveMelody[count].freq = item[0] | 0;
      liveMelody[count].duration = item[1] | 100;
      count++;
    }
    liveNoteCount = count;
    Serial.printf("[WS] โหลดเพลงใหม่สำเร็จ: %u โน้ต (โหมด: %s)\\n", (unsigned)liveNoteCount, buzzerMode.c_str());

    bool autoPlay = doc["autoPlay"] | false;
    if (autoPlay && liveNoteCount > 0) {
      isPlaying = true;
      startNoteAt(0);
    }
  } else if (type == "playback:command") {
    String cmd = doc["command"] | "";
    if (cmd == "play") {
      if (liveNoteCount == 0) loadFallbackMelody();
      isPlaying = true;
      startNoteAt(currentIndex < liveNoteCount ? currentIndex : 0);
    } else if (cmd == "pause") {
      isPlaying = false;
      stopBuzzerTone();
      sendProgressToWeb();
    } else if (cmd == "stop") {
      isPlaying = false;
      currentIndex = 0;
      stopBuzzerTone();
      sendProgressToWeb();
    } else if (cmd == "set_loop") {
      loopPlayback = doc["value"] | false;
    } else if (cmd == "set_tempo") {
      tempoScale = constrain((float)(doc["value"] | 1.0f), 0.5f, 2.0f);
    } else if (cmd == "set_duty") {
      dutyPercent = constrain((int)(doc["value"] | 35), 5, 50);
    }
  }
}

void onWebSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("[WS] ขาดการเชื่อมต่อ กำลังเชื่อมต่อใหม่...");
      break;
    case WStype_CONNECTED: {
      Serial.println("[WS] เชื่อมต่อเว็บ Real-Time สำเร็จ!");
      JsonDocument hello;
      hello["type"] = "device:hello";
      hello["ip"] = WiFi.localIP().toString();
      hello["firmware"] = "ESP32-S3 N16R8 v1.0";
      String out;
      serializeJson(hello, out);
      webSocket.sendTXT(out);
      break;
    }
    case WStype_TEXT:
      handleWsMessage(payload, length);
      break;
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(400);
  pinMode(BOOT_BTN_PIN, INPUT_PULLUP);

  initBuzzerHardware();
  loadFallbackMelody();

  Serial.printf("\\n[WiFi] กำลังเชื่อมต่อ WiFi: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 40) {
    delay(350);
    Serial.print(".");
    tries++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\\n[WiFi] เชื่อมต่อสำเร็จ! IP: %s\\n", WiFi.localIP().toString().c_str());
    if (WS_USE_SSL) {
      webSocket.beginSSL(WS_HOST, WS_PORT, WS_PATH);
    } else {
      webSocket.begin(WS_HOST, WS_PORT, WS_PATH);
    }
    webSocket.onEvent(onWebSocketEvent);
    webSocket.setReconnectInterval(3000);
    webSocket.enableHeartbeat(15000, 3000, 2);
  } else {
    Serial.println("\\n[WiFi] เชื่อมต่อไม่สำเร็จ (กดปุ่ม BOOT เพื่อเล่นเพลงสำรองแบบออฟไลน์ได้)");
  }
}

void loop() {
  webSocket.loop();
  updateBuzzerPlayback();

  // กดปุ่ม BOOT บนบอร์ดเพื่อเล่น/หยุดเพลงทันทีแบบออฟไลน์
  static bool lastBtn = HIGH;
  bool btn = digitalRead(BOOT_BTN_PIN);
  if (lastBtn == HIGH && btn == LOW) {
    delay(30);
    if (digitalRead(BOOT_BTN_PIN) == LOW) {
      if (isPlaying) {
        isPlaying = false;
        stopBuzzerTone();
      } else {
        if (liveNoteCount == 0) loadFallbackMelody();
        isPlaying = true;
        startNoteAt(0);
      }
    }
  }
  lastBtn = btn;
}
`;
}

export function generateStandaloneFirmware(cfg: FirmwareConfig): string {
  const noteArrayBody = formatCppNoteArray(cfg.notes);
  const activeLvl = cfg.activeLow ? 'LOW' : 'HIGH';
  const idleLvl = cfg.activeLow ? 'HIGH' : 'LOW';
  return `/*
 * ============================================================================
 *  BuzzerLab S3 — โค้ดแบบ Standalone (มีหน้าเว็บควบคุมในตัว ESP32-S3 เอง)
 *  เพลง: ${cfg.title || 'Untitled Melody'}
 *  การต่อสายโมดูล 3 ขา (-, S, VCC): S -> GPIO ${cfg.buzzerPin}, VCC -> 3V3, - -> GND
 * ============================================================================
 */

#include <WiFi.h>
#include <WebServer.h>

const char* WIFI_SSID = "${cfg.wifiSsid}";
const char* WIFI_PASS = "${cfg.wifiPass}";
const int BUZZER_PIN = ${cfg.buzzerPin};

#define BUZZER_ACTIVE_LEVEL ${activeLvl}
#define BUZZER_IDLE_LEVEL   ${idleLvl}

struct Note {
  uint16_t freq;
  uint16_t duration;
};

const Note MELODY[] = {
${noteArrayBody}
};
const size_t MELODY_LEN = sizeof(MELODY) / sizeof(MELODY[0]);

WebServer server(80);
bool isPlaying = false;
bool loopMode = false;
uint16_t gapMs = ${cfg.gapMs};
float tempoScale = ${cfg.tempoScale.toFixed(2)};
size_t noteIdx = 0;
unsigned long phaseStart = 0;
unsigned long phaseDur = 0;
bool inGap = false;
String buzzerMode = "${cfg.buzzerMode}";

void initBuzzer() {
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, BUZZER_IDLE_LEVEL);
  if (buzzerMode != "active_rhythm") {
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    ledcAttach(BUZZER_PIN, 2000, 10);
    ledcWrite(BUZZER_PIN, 0);
#else
    ledcSetup(0, 2000, 10);
    ledcAttachPin(BUZZER_PIN, 0);
    ledcWrite(0, 0);
#endif
  }
}

void toneOut(uint16_t freq) {
  if (buzzerMode == "active_rhythm") {
    digitalWrite(BUZZER_PIN, freq == 0 ? BUZZER_IDLE_LEVEL : BUZZER_ACTIVE_LEVEL);
    return;
  }
  if (freq == 0) {
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
    ledcWrite(BUZZER_PIN, 0);
#else
    ledcWrite(0, 0);
#endif
    return;
  }
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcWriteTone(BUZZER_PIN, freq);
  ledcWrite(BUZZER_PIN, 350);
#else
  ledcWriteTone(0, freq);
  ledcWrite(0, 350);
#endif
}

void startStep(size_t idx) {
  if (idx >= MELODY_LEN) {
    if (loopMode) idx = 0;
    else {
      isPlaying = false;
      noteIdx = 0;
      toneOut(0);
      return;
    }
  }
  noteIdx = idx;
  inGap = false;
  uint32_t d = max((uint32_t)20, (uint32_t)(MELODY[idx].duration / tempoScale));
  uint32_t g = min((uint32_t)gapMs, d / 2);
  phaseDur = d - g;
  phaseStart = millis();
  toneOut(MELODY[idx].freq);
}

void updatePlayback() {
  if (!isPlaying) return;
  unsigned long now = millis();
  if (now - phaseStart < phaseDur) return;
  if (!inGap) {
    uint32_t d = max((uint32_t)20, (uint32_t)(MELODY[noteIdx].duration / tempoScale));
    uint32_t g = min((uint32_t)gapMs, d / 2);
    if (g > 0) {
      inGap = true;
      phaseStart = now;
      phaseDur = g;
      toneOut(0);
      return;
    }
  }
  startStep(noteIdx + 1);
}

void setup() {
  Serial.begin(115200);
  initBuzzer();
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.printf("\\nเปิดหน้าเว็บควบคุมในวง WiFi ได้ที่: http://%s/\\n", WiFi.localIP().toString().c_str());

  server.on("/", []() {
    String html = "<!doctype html><html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
                  "<body style='font-family:sans-serif;max-width:480px;margin:40px auto;padding:16px'>"
                  "<h2>ESP32-S3 Buzzer Player</h2>"
                  "<p>เพลง: ${cfg.title || 'Melody'} (" + String(MELODY_LEN) + " โน้ต)</p>"
                  "<button onclick=\\"fetch('/play')\\" style='padding:12px 24px;font-size:16px'>เล่นเพลง</button> "
                  "<button onclick=\\"fetch('/stop')\\" style='padding:12px 24px;font-size:16px'>หยุด</button>"
                  "</body></html>";
    server.send(200, "text/html", html);
  });
  server.on("/play", []() {
    isPlaying = true;
    startStep(0);
    server.send(200, "text/plain", "PLAYING");
  });
  server.on("/stop", []() {
    isPlaying = false;
    noteIdx = 0;
    toneOut(0);
    server.send(200, "text/plain", "STOPPED");
  });
  server.begin();
}

void loop() {
  server.handleClient();
  updatePlayback();
}
`;
}

export function generateBuzzerDiagnosticCode(buzzerPin: number): string {
  return `/*
 * โค้ดทดสอบ 5 วินาที: เช็คว่า Buzzer ที่มีเป็น Passive หรือ Active แท้
 * ต่อขา + เข้า GPIO ${buzzerPin} และขา - เข้า GND
 */
const int BUZZER_PIN = ${buzzerPin};

void setup() {
  Serial.begin(115200);
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcAttach(BUZZER_PIN, 1000, 10);
#else
  ledcSetup(0, 1000, 10);
  ledcAttachPin(BUZZER_PIN, 0);
#endif
}

void playTestFreq(int hz) {
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcWriteTone(BUZZER_PIN, hz);
  ledcWrite(BUZZER_PIN, 400);
#else
  ledcWriteTone(0, hz);
  ledcWrite(0, 400);
#endif
  delay(400);
#if ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(3, 0, 0)
  ledcWrite(BUZZER_PIN, 0);
#else
  ledcWrite(0, 0);
#endif
  delay(150);
}

void loop() {
  // ถ้าเสียงดัง 3 ระดับสูงขึ้นเรื่อยๆ (โด -> โดสูง -> โดสูงมาก) = Passive Buzzer (เล่นเพลงได้เหมือนจริง!)
  // ถ้าเสียงดัง "ตี๊ด" โทนเดียวกันหมดทั้ง 3 ครั้ง = Active Buzzer แท้ (ให้เลือกโหมด Active Rhythm)
  playTestFreq(262);
  playTestFreq(523);
  playTestFreq(1047);
  delay(1500);
}
`;
}
