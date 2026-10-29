/**
 * สร้างไอคอนแอป (PNG) สำหรับติดตั้งลงหน้าจอโฮมของมือถือ รปภ.
 *
 * เขียน PNG เองด้วย zlib ของ Node เพื่อไม่ต้องเพิ่ม dependency สำหรับงานที่รันแค่ครั้งเดียว
 * รันใหม่เมื่อจะแก้สี/รูปทรง:  node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

/** พื้นหลังน้ำเงินเดียวกับปุ่มหลักของแอป (blue-700) */
const BG = [29, 78, 216];
const FG = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, pixel) {
  // แต่ละแถวขึ้นต้นด้วย filter byte 0 (None) ตามรูปแบบ PNG
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // colour type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** รูปโล่ — สัดส่วนเป็นอัตราส่วนของด้าน จึงคมทุกขนาด */
function inShield(u, v) {
  if (v < 0.17 || v > 0.87) return false;
  let halfWidth;
  if (v <= 0.55) {
    halfWidth = 0.26;
  } else {
    // ช่วงล่างสอบเข้าหาปลายแหลม
    const t = (v - 0.55) / 0.32;
    halfWidth = 0.26 * Math.sqrt(Math.max(0, 1 - t * t));
  }
  return Math.abs(u - 0.5) <= halfWidth;
}

/** ปุ่มติ๊กถูกกลางโล่ — วาดจากระยะห่างถึงเส้นตรงสองท่อน */
function inCheck(u, v) {
  const seg = (ax, ay, bx, by, w) => {
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(u - (ax + t * dx), v - (ay + t * dy)) <= w;
  };
  return seg(0.40, 0.50, 0.47, 0.58, 0.035) || seg(0.47, 0.58, 0.61, 0.40, 0.035);
}

/** มุมมนของพื้นหลัง (maskable icon ต้องเต็มกรอบ จึงใช้เฉพาะไอคอนธรรมดา) */
function inRoundedRect(u, v, r) {
  const dx = Math.max(r - u, 0, u - (1 - r));
  const dy = Math.max(r - v, 0, v - (1 - r));
  return Math.hypot(dx, dy) <= r;
}

function draw({ size, maskable }) {
  // ไอคอนแบบ maskable ถูกระบบครอบเป็นวงกลม จึงย่อรูปโล่ให้อยู่ในพื้นที่ปลอดภัย
  const scale = maskable ? 0.72 : 1;
  return png(size, (x, y) => {
    const u = (x + 0.5) / size;
    const v = (y + 0.5) / size;
    if (!maskable && !inRoundedRect(u, v, 0.22)) return [0, 0, 0, 0];

    const su = 0.5 + (u - 0.5) / scale;
    const sv = 0.5 + (v - 0.5) / scale;
    if (inShield(su, sv) && !inCheck(su, sv)) return [...FG, 255];
    return [...BG, 255];
  });
}

mkdirSync(OUT_DIR, { recursive: true });
const files = [
  ['icon-192.png', { size: 192, maskable: false }],
  ['icon-512.png', { size: 512, maskable: false }],
  ['icon-maskable-512.png', { size: 512, maskable: true }],
  ['apple-touch-icon.png', { size: 180, maskable: true }], // iOS ไม่ทำมุมมนให้ ต้องเต็มกรอบ
];
for (const [name, opts] of files) {
  const buf = draw(opts);
  writeFileSync(join(OUT_DIR, name), buf);
  console.log(`${name}  ${opts.size}x${opts.size}  ${buf.length} bytes`);
}
