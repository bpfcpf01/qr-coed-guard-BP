/**
 * Service Worker — ทำให้แอปเปิดได้แม้จุดตรวจนั้นไม่มีสัญญาณ
 *
 * ทำไมต้องมี
 *   ระบบออกแบบให้ "บันทึกลงเครื่องก่อน แล้วค่อยส่งขึ้นชีตทีหลัง" (คิว outbox)
 *   แต่ถ้าไม่มีตัวนี้ ตัวเว็บเองยังต้องโหลดจากอินเทอร์เน็ตทุกครั้งที่เปิด
 *   รปภ. ที่สแกน QR ตรงจุดอับสัญญาณจึงเปิดแอปไม่ขึ้นเลย — ไม่ใช่แค่ "ส่งทีหลัง"
 *   แต่บันทึกไม่ได้ตั้งแต่แรก ตัวนี้เก็บไฟล์แอปไว้ในเครื่องเพื่อปิดช่องนั้น
 *
 * ข้อควรระวัง
 *   - เก็บเฉพาะคำขอแบบ GET ที่สำเร็จ (200) เท่านั้น
 *     ห้ามเก็บ 401 จากด่านรหัสผ่านของ Worker ไม่งั้นจะค้างหน้า "ต้องใส่รหัสผ่าน"
 *   - ห้ามแตะ /__config เด็ดขาด เพราะมี PUSH_TOKEN อยู่ในนั้น
 *   - การส่งข้อมูลขึ้น Apps Script เป็น POST จึงไม่ผ่านตัวนี้อยู่แล้ว
 *     ความทนต่อสัญญาณขาดของการส่งข้อมูลมาจากคิว outbox ใน sheetSync
 *
 * แก้ตัวเลขเวอร์ชันเมื่อแก้ตรรกะในไฟล์นี้ เพื่อให้เครื่องที่ติดตั้งไปแล้วล้างของเก่าทิ้ง
 */

const VERSION = 'v1';
const CACHE = `guard-patrol-${VERSION}`;

/**
 * เก็บหน้าแอปไว้ที่คีย์เดียว เพราะ ?cp=... ทุกจุดตรวจใช้ไฟล์ index.html เดียวกัน
 * ใช้ URL แบบเต็ม ไม่ใช่ path เปล่า เพื่อไม่ต้องพึ่งการเติม origin ให้อัตโนมัติ
 */
const SHELL_URL = self.location.origin + '/index.html';

const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

/** หน้าที่แสดงเมื่อยังไม่เคยเปิดแอปตอนออนไลน์เลย จึงไม่มีอะไรให้หยิบจากเครื่อง */
const OFFLINE_FALLBACK = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>ออฟไลน์</title>
<style>body{margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;
padding:24px;background:#f8fafc;color:#1e293b;font:15px/1.7 system-ui,"Noto Sans Thai",sans-serif}
div{max-width:340px;text-align:center}h1{font-size:17px;margin:0 0 8px}
p{margin:0;color:#64748b;font-size:13px}</style></head><body><div>
<h1>ยังเปิดใช้งานออฟไลน์ไม่ได้</h1>
<p>เครื่องนี้ยังไม่เคยเปิดแอปตอนมีสัญญาณ จึงยังไม่มีไฟล์เก็บไว้<br>
กรุณาเปิดแอปหนึ่งครั้งในที่ที่มีสัญญาณ แล้วจะใช้ต่อได้แม้ไม่มีเน็ต</p>
</div></body></html>`;

/**
 * เก็บหน้าแอปและไฟล์ที่หน้านั้นเรียกใช้ ตั้งแต่ตอนติดตั้ง
 *
 * ต้องเก็บไฟล์ .js/.css ด้วย ไม่ใช่แค่ index.html เพราะตอนเปิดแอปครั้งแรก
 * service worker ยังไม่ทันคุมหน้า ไฟล์พวกนั้นจึงไม่ผ่านตัวจัดการข้างล่างเลย
 * ถ้าเก็บแค่ index.html เครื่องที่เปิดออนไลน์มาแค่ครั้งเดียวจะยังใช้ออฟไลน์ไม่ได้
 * (ได้หน้าเปล่า) ซึ่งเป็นสถานการณ์จริงของ รปภ. ที่เพิ่งติดตั้งแล้วออกเดินตรวจ
 *
 * ชื่อไฟล์มีแฮชปนอยู่ จึงอ่านรายการจาก index.html ที่เพิ่งดึงมา แทนการเขียนตายตัว
 */
async function precache() {
  const res = await fetch(new Request(SHELL_URL, { cache: 'reload' }));
  if (!res.ok) return; // เช่นยังไม่ได้ใส่รหัสผ่าน — ไว้เก็บรอบหน้า

  const html = await res.clone().text();
  const cache = await caches.open(CACHE);
  await cache.put(new Request(SHELL_URL), res);

  const assets = new Set();
  const re = /(?:src|href)\s*=\s*["'](\/(?:assets|icons)\/[^"']+)["']/g;
  let m;
  while ((m = re.exec(html)) !== null) assets.add(self.location.origin + m[1]);

  // ขาดไฟล์ใดไฟล์หนึ่งไม่ควรทำให้ที่เหลือไม่ถูกเก็บ จึงเก็บทีละไฟล์
  await Promise.all([...assets].map((u) => cache.add(u).catch(() => {})));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      // คุมหน้าที่เปิดอยู่ทันที เพื่อให้เครื่องที่เพิ่งเปิดครั้งแรกได้ความสามารถออฟไลน์เลย
      await self.clients.claim();
    })(),
  );
});

/** เก็บลงแคชเฉพาะคำตอบที่ใช้ได้จริง — 401/404/redirect ห้ามเก็บ */
async function put(request, response) {
  if (!response || response.status !== 200 || response.type === 'error') return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response.clone());
}

/** หน้าแอป: เอาของใหม่จากเน็ตก่อนเสมอ ถ้าไม่ได้ค่อยใช้ของที่เก็บไว้ */
async function handleNavigation(request) {
  try {
    const fresh = await fetch(request);
    // เก็บไว้ที่คีย์กลาง ไม่ใช่ตาม URL ที่มี ?cp= ติดมา
    if (fresh.status === 200) await put(new Request(SHELL_URL), fresh);
    return fresh;
  } catch (err) {
    const cached = (await caches.match(SHELL_URL)) || (await caches.match(request));
    if (cached) return cached;
    return new Response(OFFLINE_FALLBACK, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

/** ไฟล์ที่ชื่อมีแฮชอยู่แล้ว: ใช้ของในเครื่องก่อน แล้วค่อยไปเอาจากเน็ตถ้ายังไม่มี */
async function handleAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  await put(request, fresh);
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // ปลายทางที่ต้องสดเสมอ — /__config มีโทเคนอยู่ข้างใน ห้ามเก็บลงเครื่องเด็ดขาด
  if (url.origin === self.location.origin &&
      (url.pathname === '/__config' || url.pathname === '/__health')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.includes(url.hostname);
  if (!sameOrigin && !isFont) return; // ปล่อยผ่านตามปกติ เช่นการเรียก Apps Script

  event.respondWith(handleAsset(request).catch(async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    return Response.error();
  }));
});

// ให้หน้าเว็บสั่งข้ามคิวรอได้ เมื่อผู้ใช้กดยืนยันว่าจะอัปเดตเป็นเวอร์ชันใหม่
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
