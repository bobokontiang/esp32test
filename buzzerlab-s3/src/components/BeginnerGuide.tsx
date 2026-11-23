import React from 'react';

export const BeginnerGuide: React.FC<{ onGoToStudio: () => void; onGoToCode: () => void }> = ({
  onGoToStudio,
  onGoToCode,
}) => {
  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-8">
      {/* Intro Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-bold text-slate-900">
          คู่มือเริ่มทำตั้งแต่ศูนย์จนเล่นเพลงบน ESP32-S3 N16R8 ผ่านเว็บ Real-Time (ฟรี 100% ไม่มี Free Trial)
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          ออกแบบมาสำหรับมือใหม่ที่ยังไม่เคยเขียนโค้ดหรือต่อวงจรมาก่อน ทำตามทีละขั้นตอนด้านล่างนี้ใช้เวลาประมาณ 15 นาที
          ก็สามารถอัปโหลดคลิปเพลงไม่เกิน 20 วินาที แล้วกดสั่งให้บอร์ด ESP32-S3 เล่นเสียงผ่าน WiFi <span className="font-mono font-semibold text-slate-800">Bobo</span> ได้ทันที
        </p>
      </div>

      {/* Step 1: Active vs Passive Buzzer + Wiring Diagram */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900">
          01. รู้จัก Buzzer ที่มีอยู่ &amp; การต่อสายเข้า ESP32-S3 N16R8
        </h3>
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <div className="space-y-3 text-sm leading-relaxed text-slate-600 lg:col-span-6">
            <p>
              <strong className="text-slate-900">ข้อควรรู้สำคัญที่สุด:</strong> Buzzer สีดำทรงกลมหน้าตาเหมือนกันเป๊ะมี 2 ชนิด:
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-blue-700">Passive Buzzer (เล่นเพลงเหมือนจริง):</strong> ข้างใต้แผ่นวงจรมักเห็นลายทองแดงเปลือยหรือขดลวด ไม่มีวงจรกำเนิดเสียงในตัว สามารถรับความถี่จาก ESP32-S3 เพื่อเล่นโน้ต โด-เร-มี ได้เหมือนจริง
              </li>
              <li>
                <strong className="text-amber-700">Active Buzzer แท้ (เล่นตามจังหวะ):</strong> ด้านใต้เทอีพ็อกซี่ดำปิดทึบ มีสติกเกอร์ปิดรูด้านบน มักมีเสียง &quot;ตี๊ด&quot; ความถี่เดียวตายตัว เมื่อป้อนไฟ 3.3V จะดังทันที ถ้าต่อแบบนี้ให้เลือกโหมด <span className="font-mono text-slate-800">Active แท้</span> ในหน้าถอดเสียง เพื่อให้มันเต้นจังหวะตรงตามเพลง (หรือหาซื้อ Passive Buzzer ตัวละ 10–15 บาทมาเสียบแทนช่องเดิมได้ทันที!)
              </li>
            </ul>
            <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <strong>การต่อสายโมดูล Buzzer 3 ขา (-, S, VCC) เข้ากับ ESP32-S3 N16R8:</strong><br />
              • ขา <strong>S (Signal)</strong> ต่อเข้าขา <strong>GPIO 7</strong><br />
              • ขา <strong>VCC (หรือขาตรงกลาง)</strong> ต่อเข้าขา <strong>3V3</strong><br />
              • ขา <strong>- (GND)</strong> ต่อเข้าขา <strong>GND</strong>
            </p>
          </div>

          {/* Crisp SVG Wiring Diagram */}
          <div className="rounded-lg border border-slate-200 bg-[#0B1120] p-4 lg:col-span-6">
            <svg
              viewBox="0 0 460 240"
              className="w-full h-auto"
              role="img"
              aria-label="แผนผังการต่อสาย ESP32-S3 N16R8 กับ Buzzer 3 ขา"
            >
              {/* ESP32-S3 Board */}
              <rect x="28" y="24" width="170" height="192" rx="10" fill="#1E293B" stroke="#475569" strokeWidth="2" />
              <rect x="75" y="12" width="76" height="22" rx="4" fill="#94A3B8" />
              <text x="113" y="27" textAnchor="middle" fill="#0F172A" fontSize="10" fontFamily="monospace" fontWeight="bold">USB-C (OTG)</text>

              <rect x="64" y="54" width="98" height="58" rx="4" fill="#0F172A" stroke="#334155" />
              <text x="113" y="81" textAnchor="middle" fill="#E2E8F0" fontSize="11" fontFamily="monospace" fontWeight="bold">ESP32-S3</text>
              <text x="113" y="97" textAnchor="middle" fill="#38BDF8" fontSize="10" fontFamily="monospace">N16R8</text>

              {/* Pins on right edge */}
              <circle cx="186" cy="128" r="5" fill="#F59E0B" />
              <text x="174" y="132" textAnchor="end" fill="#F8FAFC" fontSize="11" fontFamily="monospace">GPIO 7</text>

              <circle cx="186" cy="156" r="5" fill="#EF4444" />
              <text x="174" y="160" textAnchor="end" fill="#FCA5A5" fontSize="11" fontFamily="monospace">3V3</text>

              <circle cx="186" cy="184" r="5" fill="#94A3B8" />
              <text x="174" y="188" textAnchor="end" fill="#CBD5E1" fontSize="11" fontFamily="monospace">GND</text>

              <text x="113" y="206" textAnchor="middle" fill="#94A3B8" fontSize="9" fontFamily="monospace">หลีกเลี่ยง GPIO 33-37</text>

              {/* Wires */}
              <path d="M 191 128 C 245 128, 255 96, 312 96" fill="none" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
              <path d="M 191 156 C 245 156, 255 126, 312 126" fill="none" stroke="#EF4444" strokeWidth="3" strokeLinecap="round" />
              <path d="M 191 184 C 245 184, 255 156, 312 156" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />

              {/* 3-Pin Buzzer Module */}
              <rect x="312" y="74" width="120" height="106" rx="8" fill="#111827" stroke="#475569" strokeWidth="2" />
              <circle cx="386" cy="126" r="30" fill="#020617" stroke="#334155" strokeWidth="2" />
              <circle cx="386" cy="126" r="8" fill="#1E293B" />
              <text x="372" y="198" textAnchor="middle" fill="#CBD5E1" fontSize="11" fontFamily="monospace">โมดูล Buzzer 3 ขา</text>

              {/* Module Pins */}
              <circle cx="312" cy="96" r="4.5" fill="#F59E0B" />
              <text x="323" y="100" fill="#FDE68A" fontSize="11" fontFamily="monospace" fontWeight="bold">S</text>

              <circle cx="312" cy="126" r="4.5" fill="#EF4444" />
              <text x="323" y="130" fill="#FCA5A5" fontSize="11" fontFamily="monospace" fontWeight="bold">VCC</text>

              <circle cx="312" cy="156" r="4.5" fill="#94A3B8" />
              <text x="323" y="160" fill="#CBD5E1" fontSize="11" fontFamily="monospace" fontWeight="bold">-</text>
            </svg>
          </div>
        </div>
      </section>

      {/* Step 2: Arduino IDE Setup */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900">
          02. ติดตั้ง Arduino IDE &amp; ตั้งค่าเฉพาะรุ่น ESP32-S3 N16R8 (ฟรี)
        </h3>
        <ol className="mt-4 space-y-3 text-sm text-slate-700 list-decimal pl-5">
          <li>
            ดาวน์โหลด <strong>Arduino IDE 2.x</strong> จากเว็บไซต์ทางการ <span className="font-mono text-blue-700">arduino.cc</span> (ฟรี ไม่มีค่าใช้จ่าย)
          </li>
          <li>
            เปิดโปรแกรมไปที่เมนู <strong>File → Preferences</strong> ช่อง <em>Additional boards manager URLs</em> แล้ววางลิงก์นี้ลงไป:
            <div className="mt-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-mono text-slate-100 select-all">
              https://espressif.github.io/arduino-esp32/package_esp32_index.json
            </div>
          </li>
          <li>
            กดไอคอน <strong>Boards Manager</strong> ด้านซ้าย ค้นหาคำว่า <span className="font-mono font-semibold">esp32</span> ของ <em>Espressif Systems</em> แล้วกด <strong>Install</strong>
          </li>
          <li>
            กดไอคอน <strong>Library Manager</strong> ด้านซ้าย ติดตั้ง Library ฟรี 2 ตัวนี้:
            <ul className="mt-1 list-disc pl-5 text-xs text-slate-600 space-y-1">
              <li><strong className="font-mono text-slate-800">WebSockets</strong> โดย <em>Markus Sattler</em></li>
              <li><strong className="font-mono text-slate-800">ArduinoJson</strong> โดย <em>Benoit Blanchon</em></li>
            </ul>
          </li>
          <li>
            เสียบสาย USB-C เข้าช่อง <strong>USB / OTG</strong> (บางบอร์ดมี 2 ช่อง ให้ลองช่องที่เขียนว่า USB หรือ COM/UART) แล้วตั้งค่าเมนู <strong>Tools</strong> ให้ตรงกับ N16R8 ดังนี้:
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">หัวข้อในเมนู Tools</th>
                    <th className="px-3 py-2">ค่าที่ต้องเลือกสำหรับ ESP32-S3 N16R8</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  <tr><td className="px-3 py-2">Board</td><td className="px-3 py-2 text-slate-900">ESP32S3 Dev Module</td></tr>
                  <tr><td className="px-3 py-2">USB CDC On Boot</td><td className="px-3 py-2 text-emerald-700 font-semibold">Enabled</td></tr>
                  <tr><td className="px-3 py-2">Flash Size</td><td className="px-3 py-2 text-slate-900">16MB (128Mb)</td></tr>
                  <tr><td className="px-3 py-2">PSRAM</td><td className="px-3 py-2 text-emerald-700 font-semibold">OPI PSRAM</td></tr>
                  <tr><td className="px-3 py-2">Port</td><td className="px-3 py-2 text-slate-900">เลือก COM Port ของบอร์ด</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              เคล็ดลับ: หากกด Upload แล้วขึ้นข้อความ <em>Connecting...</em> ค้าง ให้กดปุ่ม <strong>BOOT</strong> บนบอร์ดค้างไว้ กดปุ่ม <strong>RST</strong> 1 ที แล้วค่อยปล่อยปุ่ม BOOT
            </p>
          </li>
        </ol>
      </section>

      {/* Step 3: Free Online Realtime Hosting */}
      <section className="rounded-xl border border-slate-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-slate-900">
          03. วิธีทำหน้าเว็บ Online Real-Time แบบไม่เสียเงิน &amp; ไม่ติด Free Trial
        </h3>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          เว็บนี้ทำงานด้วย <strong>Node.js + Express + WebSocket Server</strong> จริง ไม่ใช่แค่ไฟล์ HTML นิ่งๆ ทำให้หน้าเว็บและ ESP32-S3 สื่อสารกันได้ทันทีแบบ Real-Time โดยมี 2 วิธีใช้งานฟรี 100% ตลอดชีพ:
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-900">
              วิธีที่ A: ฝากเว็บขึ้น Cloud ฟรี 24 ชม. บน Render.com (ไม่ต้องใช้บัตรเครดิต)
            </h4>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-slate-600">
              <li>ดาวน์โหลดโค้ดโปรเจกต์นี้จากเมนู Export/Download ของ AI Studio แล้วอัปโหลดขึ้น <strong>GitHub</strong> (บัญชีฟรี)</li>
              <li>เข้าเว็บ <strong>render.com</strong> สมัครด้วย GitHub → กด <strong>New + → Web Service</strong></li>
              <li>ตั้งค่า Build Command: <span className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">npm install &amp;&amp; npm run build</span></li>
              <li>ตั้งค่า Start Command: <span className="font-mono bg-white px-1 py-0.5 rounded border border-slate-200">npm start</span> แล้วเลือกแพ็กเกจ <strong>Free</strong></li>
              <li>จะได้ลิงก์ถาวรเช่น <span className="font-mono">https://buzzer-bobo.onrender.com</span> เปิดเข้าเว็บนี้จากลิงก์นั้นแล้วคัดลอกโค้ดจากแท็บ <strong>โค้ด ESP32-S3</strong> ลงบอร์ดได้เลย</li>
            </ol>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="text-sm font-semibold text-slate-900">
              วิธีที่ B: รันในคอมตัวเอง + ออนไลน์ฟรีด้วย Cloudflare Tunnel
            </h4>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              ติดตั้ง <strong>Node.js (v22 ขึ้นไป)</strong> แล้วเปิด Terminal ในโฟลเดอร์โปรเจกต์ รันคำสั่ง:
            </p>
            <code className="mt-1.5 block rounded bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100">
              npm install &amp;&amp; npm run build &amp;&amp; npm start
            </code>
            <p className="mt-2 text-xs leading-relaxed text-slate-600">
              ใช้ใน WiFi <span className="font-mono">Bobo</span> ได้ทันที หรือหากอยากออนไลน์ข้ามโลกฟรีถาวร ให้ติดตั้ง <strong>cloudflared</strong> แล้วรัน:
            </p>
            <code className="mt-1.5 block rounded bg-slate-900 px-2.5 py-1.5 font-mono text-xs text-slate-100">
              cloudflared tunnel --url http://localhost:3000
            </code>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onGoToStudio}
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 whitespace-nowrap"
          >
            เริ่มอัปโหลดไฟล์เสียง / คลิป
          </button>
          <button
            type="button"
            onClick={onGoToCode}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            ไปคัดลอกโค้ดลง ESP32-S3
          </button>
        </div>
      </section>
    </div>
  );
};
