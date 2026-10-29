/**
 * เทสต์หน้า /__health ของ Cloudflare Worker
 *
 * สตับ fetch เพื่อจำลองคำตอบของ Apps Script ในสถานะต่าง ๆ
 * แล้วตรวจว่าหน้าตรวจสภาพบอกสถานะถูกต้อง โดยเฉพาะกรณีที่พลาดกันบ่อย:
 * ตั้ง DASH_KEY ที่ Cloudflare (ซึ่งไม่มีผล) แทนที่จะตั้งในแท็บ Config ของชีต
 *
 * รันด้วย: npm run test:worker
 */
import worker from '../worker/index.js';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const EXEC = 'https://script.google.com/macros/s/AKfycbTEST/exec';

/** จำลอง Apps Script: newCode = มี KEY_SET, keySet = ชีตตั้ง DASH_KEY แล้ว */
function stubAppsScript({ newCode, keySet, sheetToken, tz = 'Asia/Bangkok',
                         discordSet = true, discordMode = 'ABNORMAL', discordLast = null,
                         omitDiscordLast = false }) {
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.action === 'pullPublic') {
      const config = { SITE_NAME: 'CPF ธารเกษม', DEFAULT_RADIUS_M: 40 };
      if (newCode) {
        config.KEY_SET = Boolean(keySet);
        config.TZ = tz;
        config.SERVER_TIME = '2026-09-08 14:30';
        config.DISCORD_SET = discordSet;
        config.DISCORD_NOTIFY = discordMode;
        // omitDiscordLast จำลอง Code.gs รุ่นก่อนที่ยังไม่มีการจดผลการส่ง
        if (!omitDiscordLast) config.DISCORD_LAST = discordLast;
      }
      return new Response(JSON.stringify({
        ok: true, config,
        checkpoints: new Array(20).fill({}), rounds: new Array(6).fill({}), guards: new Array(12).fill({}),
      }));
    }
    if (body.action === 'push') {
      const want = sheetToken || '';
      if (want && String(body.token || '') !== want) {
        return new Response(JSON.stringify({ ok: false, error: 'โทเคนไม่ถูกต้อง' }));
      }
      return new Response(JSON.stringify({ ok: true, accepted: [], written: 0 }));
    }
    return new Response(JSON.stringify({ ok: false, error: 'unknown' }));
  };
}

async function health(env) {
  const req = new Request('https://x.workers.dev/__health', {
    headers: { Authorization: 'Basic ' + Buffer.from(`${env.SITE_USER}:${env.SITE_PASS}`).toString('base64') },
  });
  const res = await worker.fetch(req, env);
  return { status: res.status, html: await res.text() };
}

console.log('\n== 1. สถานะจริงตอนนี้: ชีตตั้ง DASH_KEY แล้ว แต่ Apps Script ยังเป็นโค้ดเก่า ==');
stubAppsScript({ newCode: false, keySet: true, sheetToken: '' });
let r = await health({ SITE_USER: 'TKF', SITE_PASS: '123456', WEBAPP_URL: EXEC, PUSH_TOKEN: 'tok' });
check('เข้าหน้าได้', r.status === 200);
check('บอกว่า Apps Script ยังเป็นโค้ดเก่า', r.html.includes('ยังเป็นโค้ดเก่า'));
check('บอกว่ายังตรวจ DASH_KEY ไม่ได้', r.html.includes('ตรวจไม่ได้ จนกว่าจะ deploy'));
check('เห็นจำนวนจุดตรวจจากชีต', r.html.includes('20 จุด'));
check('ไม่หลุดค่า PUSH_TOKEN ออกหน้าเว็บ', !r.html.includes('tok'), 'token leaked!');
check('ไม่หลุดรหัสผ่านออกหน้าเว็บ', !r.html.includes('123456'), 'password leaked!');

console.log('\n== 2. deploy โค้ดใหม่แล้ว แต่ลืมใส่ DASH_KEY ในชีต ==');
stubAppsScript({ newCode: true, keySet: false, sheetToken: '' });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: EXEC, PUSH_TOKEN: '' });
check('เตือนว่าตั้งที่ Cloudflare ไม่มีผล', r.html.includes('ตั้งที่ Cloudflare ไม่มีผล'));
check('บอกว่าเป็นเวอร์ชันใหม่แล้ว', r.html.includes('เป็นเวอร์ชันใหม่'));

console.log('\n== 3. PUSH_TOKEN สองฝั่งไม่ตรงกัน ==');
stubAppsScript({ newCode: true, keySet: true, sheetToken: 'ค่าในชีต' });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: EXEC, PUSH_TOKEN: 'ค่าที่worker' });
check('จับได้ว่าโทเคนไม่ตรงกัน', r.html.includes('ไม่ตรงกัน — ทุกเครื่องส่งบันทึกขึ้นชีตไม่ได้'));

console.log('\n== 4. ตั้งครบทุกอย่าง ==');
stubAppsScript({ newCode: true, keySet: true, sheetToken: 'same' });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: EXEC, PUSH_TOKEN: 'same' });
check('DASH_KEY ผ่าน', r.html.includes('ตั้งแล้วในชีต'));
check('โทเคนผ่าน', r.html.includes('ส่งข้อมูลเข้าชีตได้'));
check('เขตเวลาผ่าน', r.html.includes('ตรงกับเวลาไทย'));
check('บอกว่าแจ้งเตือน Discord พร้อมแล้ว', r.html.includes('แจ้งเฉพาะรายการที่ผิดปกติ'));
check('ไม่มี ❌ เหลืออยู่', !r.html.includes('❌'), 'ยังมีข้อผิดพลาดค้าง');

console.log('\n== 5. WEBAPP_URL ผิดรูปแบบ (ใช้ /dev) ==');
stubAppsScript({ newCode: true, keySet: true, sheetToken: '' });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: 'https://script.google.com/macros/s/ABC/dev', PUSH_TOKEN: '' });
check('จับรูปแบบ URL ผิดได้', r.html.includes('ต้องเป็นลิงก์ที่ลงท้าย /exec'));
check('ข้ามการตรวจ Apps Script', r.html.includes('ข้ามการตรวจ'));

console.log('\n== 6. เขตเวลาของชีตตั้งผิด (รอบตรวจจะเพี้ยนทั้งระบบ) ==');
stubAppsScript({ newCode: true, keySet: true, sheetToken: '', tz: 'America/New_York' });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: EXEC, PUSH_TOKEN: '' });
check('จับได้ว่าเขตเวลาไม่ใช่ Asia/Bangkok', r.html.includes('ไม่ใช่ Asia/Bangkok'));
check('บอกวิธีแก้ที่ชีต', r.html.includes('File &gt; Settings &gt; Time zone'));

console.log('\n== 7. โค้ดเก่า: ตรวจเขตเวลาไม่ได้ แต่ต้องไม่เดาว่าถูก ==');
stubAppsScript({ newCode: false, keySet: true, sheetToken: '' });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: EXEC, PUSH_TOKEN: '' });
check('ไม่อ้างว่าเขตเวลาตรง', !r.html.includes('ตรงกับเวลาไทย'));

console.log('\n== 8. ยังไม่ได้ตั้ง Discord webhook ==');
stubAppsScript({ newCode: true, keySet: true, sheetToken: '', discordSet: false });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: EXEC, PUSH_TOKEN: '' });
check('เตือนว่ายังไม่มีข้อความเข้าห้องแชท', r.html.includes('จะไม่มีข้อความเข้าห้องแชท'));

console.log('\n== 9. บอกสาเหตุเมื่อแจ้งเตือน Discord ไม่เข้า ==');
stubAppsScript({ newCode: true, keySet: true, sheetToken: '',
  discordLast: { ok: false, reason: 'Discord ปฏิเสธ (HTTP 404) — webhook ถูกลบหรือลิงก์ผิด', at: '2026-09-09 10:00' } });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: EXEC, PUSH_TOKEN: '' });
check('แสดงสาเหตุที่ส่งไม่สำเร็จ', r.html.includes('webhook ถูกลบหรือลิงก์ผิด'));
check('ขึ้นเป็นสถานะผิดพลาด', r.html.includes('❌'));

stubAppsScript({ newCode: true, keySet: true, sheetToken: '', discordLast: null });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: EXEC, PUSH_TOKEN: '' });
check('ยังไม่เคยส่ง = แนะนำให้รัน testDiscordNow', r.html.includes('testDiscordNow'));
check('อธิบายว่าถูกบล็อกนอกรัศมีก็ไม่มีอะไรให้แจ้ง', r.html.includes('ข้อมูลจะไม่ถึงชีต'));

// Code.gs เวอร์ชันที่ยังไม่จดผลการส่ง (ไม่มีคีย์ DISCORD_LAST เลย)
// ต้องบอกให้ deploy ใหม่ ไม่ใช่บอกว่า "ยังไม่เคยส่ง" ซึ่งชวนให้ไล่ผิดทาง
stubAppsScript({ newCode: true, keySet: true, sheetToken: '', omitDiscordLast: true });
r = await health({ SITE_USER: 'TKF', SITE_PASS: 'x', WEBAPP_URL: EXEC, PUSH_TOKEN: '' });
check('โค้ดเก่า = บอกให้ deploy ใหม่ ไม่ใช่บอกว่ายังไม่เคยส่ง',
  r.html.includes('ยังเป็นเวอร์ชันที่ไม่ได้จดผลการส่ง'));
check('ไม่บอกว่ายังไม่เคยพยายามส่ง', !r.html.includes('ยังไม่เคยพยายามส่ง'));

console.log('\n== 10. /__health ต้องอยู่หลังรหัสผ่าน ==');
const noAuth = await worker.fetch(new Request('https://x.workers.dev/__health'), {
  SITE_USER: 'TKF', SITE_PASS: '123456', WEBAPP_URL: EXEC, PUSH_TOKEN: '',
});
check('ไม่ใส่รหัสผ่าน = 401', noAuth.status === 401, `got ${noAuth.status}`);

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
