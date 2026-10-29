/**
 * เทสต์ Service Worker (public/sw.js)
 *
 * จำลอง self / caches / fetch ของเบราว์เซอร์ แล้วตรวจข้อที่พลาดไม่ได้:
 *   - ตอนไม่มีสัญญาณ ต้องยังเปิดแอปได้จากไฟล์ที่เก็บไว้
 *   - ห้ามเก็บ /__config ลงเครื่อง (มี PUSH_TOKEN อยู่ข้างใน)
 *   - ห้ามเก็บคำตอบ 401 จากด่านรหัสผ่าน ไม่งั้นจะค้างหน้า "ต้องใส่รหัสผ่าน" ตลอดไป
 *
 * รันด้วย: npm run test:sw
 */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const ORIGIN = 'https://qr-coed-guard.workers.dev';

/** Cache API แบบย่อ เก็บด้วย URL เป็นคีย์ พอสำหรับตรวจพฤติกรรมของ sw.js */
function makeCaches(fetchImpl) {
  const stores = new Map();
  const keyOf = (req) => (typeof req === 'string' ? new URL(req, ORIGIN).href : req.url);
  const open = async (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name);
    return {
      async put(req, res) { store.set(keyOf(req), res); },
      async add(req) {
        // ต้องใช้ fetch ที่จำลองไว้ ไม่ใช่ของ Node ไม่งั้นเทสต์จะยิงเน็ตจริง
        const res = await fetchImpl(req);
        if (!res.ok) throw new Error('add failed');
        store.set(keyOf(req), res);
      },
      async match(req) { return store.get(keyOf(req)) || undefined; },
    };
  };
  return {
    stores,
    api: {
      open,
      async keys() { return [...stores.keys()]; },
      async delete(name) { return stores.delete(name); },
      async match(req) {
        for (const store of stores.values()) {
          const hit = store.get(keyOf(req));
          if (hit) return hit;
        }
        return undefined;
      },
    },
  };
}

/** โหลด sw.js เข้า sandbox แล้วคืนตัวช่วยยิง event ใส่มัน */
function loadSW({ fetchImpl }) {
  const listeners = {};
  const cachesMock = makeCaches(fetchImpl);

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    caches: cachesMock.api,
  };

  const sandbox = {
    self,
    caches: cachesMock.api,
    fetch: fetchImpl,
    Request: globalThis.Request,
    Response: globalThis.Response,
    URL: globalThis.URL,
    Promise, console,
  };
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), sandbox);

  return {
    caches: cachesMock,
    async lifecycle(type) {
      let waited;
      await listeners[type]({ waitUntil: (p) => { waited = p; } });
      await waited;
    },
    /** คืน Response ที่ sw ตอบ หรือ null เมื่อปล่อยผ่านให้เบราว์เซอร์จัดการเอง */
    async fetchEvent(request) {
      let responded = null;
      await listeners.fetch({ request, respondWith: (p) => { responded = p; } });
      return responded ? await responded : null;
    },
  };
}

const shellHtml = '<!doctype html><title>Guard Patrol</title><div id="root"></div>';
// Request ของ Node ไม่ยอมรับ mode 'navigate' จึงใช้ออบเจกต์อย่างง่ายแทน
// sw.js ใช้แค่ method / url / mode ของคำขอ
const nav = (path) => ({ method: 'GET', url: ORIGIN + path, mode: 'navigate' });
const get = (url) => new Request(url);

/** ออนไลน์ปกติ: หน้าแอปและไฟล์ static ตอบ 200, /__config คืนโทเคน */
function onlineFetch() {
  return async (req) => {
    const url = new URL(typeof req === 'string' ? new URL(req, ORIGIN) : req.url);
    if (url.pathname === '/__config') {
      return new Response(JSON.stringify({ webAppUrl: 'x', pushToken: 'ความลับ' }), { status: 200 });
    }
    if (url.pathname.startsWith('/assets/')) return new Response('body{}', { status: 200 });
    return new Response(shellHtml, { status: 200, headers: { 'Content-Type': 'text/html' } });
  };
}

const offlineFetch = () => async () => { throw new TypeError('Failed to fetch'); };

console.log('\n== 1. เปิดออนไลน์หนึ่งครั้ง แล้วสัญญาณหลุด — ต้องยังเปิดแอปได้ ==');
{
  let online = true;
  const impl = onlineFetch();
  const sw = loadSW({ fetchImpl: async (r) => (online ? impl(r) : Promise.reject(new TypeError('offline'))) });
  await sw.lifecycle('install');
  await sw.lifecycle('activate');

  const first = await sw.fetchEvent(nav('/?cp=CP01'));
  check('ออนไลน์: ได้หน้าแอปจากเน็ต', first !== null && (await first.clone().text()) === shellHtml);

  online = false;
  const offline = await sw.fetchEvent(nav('/?cp=CP07'));
  check('ออฟไลน์: ยังเปิดแอปได้', offline !== null && (await offline.clone().text()) === shellHtml);
  check('ออฟไลน์: จุดตรวจอื่นก็เปิดได้ (ไม่ผูกกับ ?cp= เดิม)', offline !== null && offline.status === 200);
}

console.log('\n== 2. ไฟล์ static เก็บไว้ใช้ตอนออฟไลน์ได้ ==');
{
  let online = true;
  const impl = onlineFetch();
  const sw = loadSW({ fetchImpl: async (r) => (online ? impl(r) : Promise.reject(new TypeError('offline'))) });
  await sw.lifecycle('activate');

  const asset = ORIGIN + '/assets/index-D6p0zHkH.js';
  await sw.fetchEvent(get(asset));
  online = false;
  const cached = await sw.fetchEvent(get(asset));
  check('ออฟไลน์: ได้ไฟล์แอปจากเครื่อง', cached !== null && cached.status === 200);
}

console.log('\n== 3. ห้ามเก็บ /__config ลงเครื่อง (มี PUSH_TOKEN) ==');
{
  const sw = loadSW({ fetchImpl: onlineFetch() });
  await sw.lifecycle('activate');
  const res = await sw.fetchEvent(get(ORIGIN + '/__config'));
  check('ปล่อยผ่านให้เบราว์เซอร์ ไม่ผ่านแคช', res === null);

  const hit = await sw.caches.api.match(ORIGIN + '/__config');
  check('ไม่มี /__config อยู่ในแคช', hit === undefined, 'token cached!');

  const healthRes = await sw.fetchEvent(get(ORIGIN + '/__health'));
  check('/__health ก็ต้องสดเสมอ', healthRes === null);
}

console.log('\n== 4. ห้ามเก็บ 401 จากด่านรหัสผ่าน ==');
{
  const unauthorized = async () => new Response('ต้องใส่รหัสผ่าน', { status: 401 });
  const sw = loadSW({ fetchImpl: unauthorized });
  await sw.lifecycle('install');
  await sw.lifecycle('activate');

  const res = await sw.fetchEvent(nav('/'));
  check('ส่ง 401 ต่อให้เบราว์เซอร์ถามรหัสผ่าน', res !== null && res.status === 401);

  const hit = await sw.caches.api.match(ORIGIN + '/index.html');
  check('ไม่เก็บ 401 ไว้ในแคช', hit === undefined, 'จะค้างหน้าใส่รหัสผ่านตลอดไป');
}

console.log('\n== 5. ยังไม่เคยเปิดตอนออนไลน์ — ต้องบอกให้รู้เรื่อง ไม่ใช่จอขาว ==');
{
  const sw = loadSW({ fetchImpl: offlineFetch() });
  await sw.lifecycle('activate');
  const res = await sw.fetchEvent(nav('/?cp=CP01'));
  const html = res ? await res.text() : '';
  check('ได้หน้าอธิบายเป็นภาษาไทย', html.includes('ยังเปิดใช้งานออฟไลน์ไม่ได้'));
}

console.log('\n== 6. การส่งข้อมูลขึ้น Apps Script ต้องไม่ถูกแตะ ==');
{
  const sw = loadSW({ fetchImpl: onlineFetch() });
  await sw.lifecycle('activate');
  const post = new Request('https://script.google.com/macros/s/AKfycb/exec', { method: 'POST', body: '{}' });
  check('POST ปล่อยผ่านทั้งหมด', (await sw.fetchEvent(post)) === null);
  check('GET ข้ามโดเมนอื่นก็ปล่อยผ่าน',
    (await sw.fetchEvent(get('https://script.google.com/macros/s/AKfycb/exec'))) === null);
}

console.log('\n== 7. อัปเดตเวอร์ชันแล้วล้างแคชเก่าทิ้ง ==');
{
  const sw = loadSW({ fetchImpl: onlineFetch() });
  const stale = await sw.caches.api.open('guard-patrol-v0');
  await stale.put(ORIGIN + '/assets/old.js', new Response('old'));
  await sw.lifecycle('activate');
  check('แคชเวอร์ชันเก่าถูกลบ', !sw.caches.stores.has('guard-patrol-v0'));
}

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
