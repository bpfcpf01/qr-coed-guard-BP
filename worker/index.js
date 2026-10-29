/**
 * Worker หน้าด่านของเว็บแอป — ใส่รหัสผ่านก่อนเข้าถึงไฟล์ทั้งหมด
 *
 * ใช้แทน Cloudflare Access (ซึ่งเป็นบริการเสียเงิน) โดยไม่มีค่าใช้จ่ายเพิ่ม
 * จุดสำคัญคือรหัสผ่านอยู่ใน environment variable ของ Worker ฝั่งเซิร์ฟเวอร์
 * ไม่ได้ฝังอยู่ในไฟล์ JS ที่ส่งให้เบราว์เซอร์ จึงเปิด DevTools อ่านไม่ได้
 *
 * วิธีเปิดใช้งาน
 *   Cloudflare dashboard > โปรเจกต์นี้ > Settings > Variables and Secrets
 *   เพิ่ม secret 2 ตัว
 *     SITE_USER = ชื่อผู้ใช้ที่ต้องการ (เช่น cpf)
 *     SITE_PASS = รหัสผ่านที่ต้องการ
 *   และตั้งค่าอีก 2 ตัวสำหรับเชื่อมกับ Google Sheets
 *     WEBAPP_URL = ลิงก์ /exec ของ Apps Script (ห้ามใส่ไว้ในซอร์สโค้ด)
 *     PUSH_TOKEN = โทเคนส่งบันทึก ตั้งให้ตรงกับแท็บ Config ในชีต
 *   แล้ว redeploy หนึ่งครั้ง
 *
 * ถ้าไม่ได้ตั้ง SITE_PASS ระบบจะปล่อยผ่านตามปกติ เพื่อไม่ให้ล็อกตัวเองออก
 * โดยไม่ตั้งใจตอน deploy ครั้งแรก
 *
 * ปลายทางพิเศษ (อยู่หลังการตรวจรหัสผ่านทั้งคู่)
 *   /__config  ค่าตั้งค่าที่เว็บแอปต้องใช้ (WEBAPP_URL, PUSH_TOKEN)
 *   /__health  หน้าตรวจว่า Worker / Apps Script / ชีต ต่อกันครบหรือยัง
 */

const REALM = 'Guard Patrol';

/**
 * เทียบสตริงโดยไม่หยุดกลางคันเมื่อเจอตัวอักษรที่ต่าง
 *
 * ไม่คืนค่าทันทีตอนความยาวไม่เท่ากัน เพราะการคืนเร็วบอกความยาวของรหัสผ่านจริงได้
 * (JavaScript ไม่การันตี constant-time จริง ๆ แต่ปิดช่องที่ชัดที่สุดไว้ก่อน)
 */
function safeEqual(a, b) {
  const x = String(a || '');
  const y = String(b || '');
  const len = Math.max(x.length, y.length);
  let diff = x.length ^ y.length;
  for (let i = 0; i < len; i++) {
    diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** URL ของ Apps Script ต้องเป็น /exec ของ deployment จริงเท่านั้น (ตรงกับฝั่งเว็บแอป) */
function validWebAppUrl(u) {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\/?$/.test(String(u || '').trim());
}

function esc(v) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** เรียก Apps Script จากฝั่ง Worker — ไม่ติด CORS จึงตรวจได้ครบในที่เดียว */
async function callAppsScript(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    redirect: 'follow',
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  try {
    return { ok: true, data: JSON.parse(text) };
  } catch {
    // มักเกิดเมื่อ deployment ตั้ง Who has access ผิด แล้ว Google คืนหน้า HTML ล็อกอินมาแทน
    return { ok: false, error: 'ตอบกลับไม่ใช่ JSON (ตรวจว่า Who has access = Anyone และใช้ลิงก์ /exec)' };
  }
}

/**
 * ตรวจสภาพการเชื่อมต่อทั้งเส้น: Worker -> Apps Script -> ชีต
 * ไม่คืนค่าความลับใด ๆ ออกไป บอกแค่ว่า "ตั้งแล้ว/ยังไม่ตั้ง" และ "ตรงกัน/ไม่ตรงกัน"
 */
async function probe(env) {
  const out = {
    urlSet: Boolean(env.WEBAPP_URL),
    urlValid: validWebAppUrl(env.WEBAPP_URL),
    tokenSet: Boolean(env.PUSH_TOKEN),
    userSet: Boolean(env.SITE_USER),
    passSet: Boolean(env.SITE_PASS),
    reachable: false,
    newCode: false,
    keySet: null,
    tz: null,
    serverTime: null,
    discordSet: null,
    discordMode: null,
    discordLastKnown: false,
    discordLast: null,
    tokenMatch: null,
    counts: null,
    error: '',
  };

  if (!out.urlValid) return out;

  let r;
  try {
    r = await callAppsScript(env.WEBAPP_URL, { action: 'pullPublic' });
  } catch (e) {
    out.error = String((e && e.message) || e);
    return out;
  }
  out.reachable = true;
  if (!r.ok) {
    out.error = r.error;
    return out;
  }

  const data = r.data || {};
  const cfg = data.config || {};
  // KEY_SET มีเฉพาะใน Code.gs เวอร์ชันใหม่ ใช้เป็นตัวบอกว่า deploy เวอร์ชันใหม่แล้วหรือยัง
  out.newCode = Object.prototype.hasOwnProperty.call(cfg, 'KEY_SET');
  out.keySet = out.newCode ? Boolean(cfg.KEY_SET) : null;
  out.tz = cfg.TZ ? String(cfg.TZ) : null;
  out.serverTime = cfg.SERVER_TIME ? String(cfg.SERVER_TIME) : null;
  out.discordSet = out.newCode && Object.prototype.hasOwnProperty.call(cfg, 'DISCORD_SET')
    ? Boolean(cfg.DISCORD_SET) : null;
  out.discordMode = cfg.DISCORD_NOTIFY ? String(cfg.DISCORD_NOTIFY) : null;
  // ต้องแยก "ยังไม่ได้ deploy โค้ดที่จดผลการส่ง" ออกจาก "deploy แล้วแต่ยังไม่เคยส่ง"
  // สองอย่างนี้ต้องแก้คนละทาง ถ้ารวมเป็นข้อความเดียวจะไล่ปัญหาต่อไม่ได้
  out.discordLastKnown = Object.prototype.hasOwnProperty.call(cfg, 'DISCORD_LAST');
  out.discordLast = cfg.DISCORD_LAST || null;
  out.counts = {
    checkpoints: (data.checkpoints || []).length,
    rounds: (data.rounds || []).length,
    guards: (data.guards || []).length,
  };

  // ส่ง push ที่ไม่มีรายการเลย เป็นการลองโทเคนแบบไม่เขียนอะไรลงชีต
  // (handlePush_ ตรวจโทเคนก่อน แล้วค่อยเช็กว่ามีรายการไหม)
  if (out.newCode) {
    try {
      const probeRes = await callAppsScript(env.WEBAPP_URL, {
        action: 'push',
        token: env.PUSH_TOKEN || '',
        logs: [],
      });
      out.tokenMatch = probeRes.ok && probeRes.data && probeRes.data.ok === true;
    } catch {
      out.tokenMatch = null;
    }
  }

  return out;
}

function row(state, label, detail) {
  const icon = { ok: '✅', bad: '❌', warn: '⚠️', na: '—' }[state] || '—';
  const color = { ok: '#15803d', bad: '#b91c1c', warn: '#b45309', na: '#64748b' }[state] || '#64748b';
  return `<tr><td class="i">${icon}</td><td class="l">${esc(label)}</td><td class="d" style="color:${color}">${esc(detail)}</td></tr>`;
}

async function healthPage(env) {
  const p = await probe(env);
  const rows = [];

  rows.push('<tr><th colspan="3">Cloudflare Worker</th></tr>');
  rows.push(row(p.passSet ? 'ok' : 'warn', 'SITE_PASS',
    p.passSet ? 'ตั้งแล้ว — เว็บถูกล็อกด้วยรหัสผ่าน' : 'ยังไม่ตั้ง — ใครก็เปิดเว็บนี้ได้'));
  rows.push(row(p.userSet ? 'ok' : 'na', 'SITE_USER',
    p.userSet ? 'ตั้งแล้ว' : 'ไม่ได้ตั้ง — ใส่ชื่อผู้ใช้อะไรก็ผ่าน ตรวจแค่รหัสผ่าน'));
  rows.push(row(!p.urlSet ? 'bad' : p.urlValid ? 'ok' : 'bad', 'WEBAPP_URL',
    !p.urlSet ? 'ยังไม่ตั้ง — เว็บแอปจะไม่ซิงก์กับชีตเลย'
      : p.urlValid ? 'ตั้งแล้ว รูปแบบถูกต้อง'
      : 'รูปแบบผิด — ต้องเป็นลิงก์ที่ลงท้าย /exec เท่านั้น (ห้าม /dev)'));
  rows.push(row(p.tokenSet ? 'ok' : 'warn', 'PUSH_TOKEN',
    p.tokenSet ? 'ตั้งแล้วที่ Worker' : 'ยังไม่ตั้ง — ใครรู้ลิงก์ /exec ก็ส่งข้อมูลเข้าชีตได้'));

  rows.push('<tr><th colspan="3">Google Apps Script</th></tr>');
  if (!p.urlValid) {
    rows.push(row('na', 'การเชื่อมต่อ', 'ข้ามการตรวจ เพราะ WEBAPP_URL ยังไม่ถูกต้อง'));
  } else if (!p.reachable || p.error) {
    rows.push(row('bad', 'การเชื่อมต่อ', p.error || 'ติดต่อไม่ได้'));
  } else {
    rows.push(row('ok', 'การเชื่อมต่อ', 'ติดต่อได้ และตอบกลับเป็น JSON'));
    rows.push(row(p.newCode ? 'ok' : 'bad', 'เวอร์ชันโค้ด',
      p.newCode ? 'เป็นเวอร์ชันใหม่ (ตรวจพิกัดฝั่งเซิร์ฟเวอร์ทำงานอยู่)'
        : 'ยังเป็นโค้ดเก่า — วาง Code.gs ใหม่ แล้ว Deploy > Manage deployments > New version'));
  }

  rows.push('<tr><th colspan="3">Google Sheet (แท็บ Config)</th></tr>');

  // วันที่ เวลา และการหารอบคำนวณจากเขตเวลาของสคริปต์ทั้งหมด
  // ตั้งผิดแล้วไม่มีอะไรฟ้อง แต่รายงานจะเพี้ยนทั้งระบบ จึงต้องตรวจก่อนเริ่มใช้จริง
  if (p.tz === null) {
    rows.push(row('na', 'เขตเวลา', 'ตรวจไม่ได้ จนกว่าจะ deploy Code.gs เวอร์ชันใหม่'));
  } else if (p.tz === 'Asia/Bangkok') {
    rows.push(row('ok', 'เขตเวลา', 'Asia/Bangkok — เวลาในชีตตรงกับเวลาไทย' +
      (p.serverTime ? ' (ตอนนี้ ' + p.serverTime + ')' : '')));
  } else {
    rows.push(row('bad', 'เขตเวลา',
      'เป็น ' + p.tz + ' ไม่ใช่ Asia/Bangkok — วันที่ เวลา และรอบตรวจจะเพี้ยนทั้งระบบ ' +
      'แก้ที่ชีต File > Settings > Time zone แล้ว Deploy เวอร์ชันใหม่' +
      (p.serverTime ? ' (สคริปต์คิดว่าตอนนี้คือ ' + p.serverTime + ')' : '')));
  }

  if (p.keySet === null) {
    rows.push(row('na', 'DASH_KEY', 'ตรวจไม่ได้ จนกว่าจะ deploy Code.gs เวอร์ชันใหม่'));
  } else {
    rows.push(row(p.keySet ? 'ok' : 'bad', 'DASH_KEY',
      p.keySet ? 'ตั้งแล้วในชีต — เข้าโหมดผู้ดูแลได้'
        : 'ยังไม่ตั้งในชีต — เข้าโหมดผู้ดูแลไม่ได้ (ตั้งที่ Cloudflare ไม่มีผล ต้องใส่ในแท็บ Config)'));
  }

  if (p.tokenMatch === null) {
    rows.push(row('na', 'PUSH_TOKEN ตรงกันไหม', 'ตรวจไม่ได้ จนกว่าจะ deploy Code.gs เวอร์ชันใหม่'));
  } else if (p.tokenMatch) {
    rows.push(row('ok', 'PUSH_TOKEN ตรงกันไหม',
      p.tokenSet ? 'ส่งข้อมูลเข้าชีตได้' : 'ชีตยังไม่บังคับโทเคน จึงส่งได้ (ยังไม่ปลอดภัยเต็มที่)'));
  } else {
    rows.push(row('bad', 'PUSH_TOKEN ตรงกันไหม',
      'ไม่ตรงกัน — ทุกเครื่องส่งบันทึกขึ้นชีตไม่ได้ ตรวจค่าใน Worker กับแท็บ Config ให้ตรงกัน'));
  }

  // แจ้งเตือนเข้า Discord ตั้งในแท็บ Config ของชีตเท่านั้น (ตั้งที่ Cloudflare ไม่มีผล)
  if (p.discordSet === null) {
    rows.push(row('na', 'แจ้งเตือน Discord', 'ตรวจไม่ได้ จนกว่าจะ deploy Code.gs เวอร์ชันใหม่'));
  } else if (p.discordMode === 'OFF') {
    rows.push(row('na', 'แจ้งเตือน Discord', 'ปิดไว้ (DISCORD_NOTIFY = OFF)'));
  } else if (p.discordSet) {
    rows.push(row('ok', 'แจ้งเตือน Discord',
      p.discordMode === 'ALL'
        ? 'ตั้งแล้ว — แจ้งทุกครั้งที่บันทึก'
        : 'ตั้งแล้ว — แจ้งเฉพาะรายการที่ผิดปกติ'));
  } else {
    rows.push(row('warn', 'แจ้งเตือน Discord',
      'ยังไม่ตั้ง DISCORD_WEBHOOK ในแท็บ Config (หรือลิงก์ผิดรูปแบบ) — จะไม่มีข้อความเข้าห้องแชท'));
  }

  // ผลการส่งครั้งล่าสุด — ตอบคำถาม "ตั้งค่าครบแล้วแต่ทำไมข้อความไม่เข้า" ได้ตรงนี้
  if (p.discordLast) {
    rows.push(row(p.discordLast.ok ? 'ok' : 'bad', 'ส่ง Discord ครั้งล่าสุด',
      (p.discordLast.at ? p.discordLast.at + ' — ' : '') + (p.discordLast.reason || '')));
  } else if (p.discordSet && !p.discordLastKnown) {
    rows.push(row('bad', 'ส่ง Discord ครั้งล่าสุด',
      'ตรวจไม่ได้ — Code.gs ในชีตยังเป็นเวอร์ชันที่ไม่ได้จดผลการส่ง ' +
      'ให้วาง Code.gs ล่าสุดแล้ว Deploy > New version ก่อน'));
  } else if (p.discordSet) {
    rows.push(row('warn', 'ส่ง Discord ครั้งล่าสุด',
      'ยังไม่เคยพยายามส่งเลย — แปลว่ายังไม่มีรายการผิดปกติเข้าชีต ' +
      '(ถ้าอยู่นอกรัศมีแล้วถูกบล็อก ข้อมูลจะไม่ถึงชีต จึงไม่มีอะไรให้แจ้ง) ' +
      'ลองรันฟังก์ชัน testDiscordNow ในตัวแก้ไข Apps Script เพื่อทดสอบการส่งโดยตรง'));
  }

  if (p.counts) {
    rows.push('<tr><th colspan="3">ข้อมูลหลักในชีต</th></tr>');
    rows.push(row(p.counts.checkpoints ? 'ok' : 'warn', 'จุดตรวจ',
      p.counts.checkpoints ? `${p.counts.checkpoints} จุด` : 'ยังไม่มีในชีต — เครื่อง รปภ. จะใช้ค่าตั้งต้นในเครื่องแทน'));
    rows.push(row(p.counts.rounds ? 'ok' : 'warn', 'รอบตรวจ',
      p.counts.rounds ? `${p.counts.rounds} รอบ` : 'ยังไม่มีในชีต'));
    rows.push(row(p.counts.guards ? 'ok' : 'warn', 'รายชื่อ รปภ.',
      p.counts.guards ? `${p.counts.guards} คน` : 'ยังไม่มีในชีต'));
  }

  const html = `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ตรวจสภาพระบบเดินตรวจ รปภ.</title>
<style>
 body{margin:0;padding:24px 16px;background:#f8fafc;color:#1e293b;
      font:14px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Thai",sans-serif}
 .w{max-width:720px;margin:0 auto}
 h1{font-size:18px;margin:0 0 4px}
 p.sub{margin:0 0 20px;color:#64748b;font-size:12px}
 table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}
 th{text-align:left;background:#f1f5f9;font-size:12px;padding:8px 12px;color:#475569;border-top:1px solid #e2e8f0}
 td{padding:9px 12px;border-top:1px solid #f1f5f9;vertical-align:top}
 td.i{width:28px;text-align:center}
 td.l{width:34%;font-weight:600;white-space:nowrap}
 td.d{font-size:13px}
 footer{margin-top:16px;color:#94a3b8;font-size:11px}
 @media(max-width:520px){td.l{white-space:normal;width:38%}}
</style></head><body><div class="w">
<h1>ตรวจสภาพระบบเดินตรวจ รปภ.</h1>
<p class="sub">หน้านี้ใช้ตอนติดตั้ง/แก้ปัญหาเท่านั้น ไม่แสดงค่าความลับใด ๆ · ${esc(new Date().toISOString())}</p>
<table><tbody>${rows.join('')}</tbody></table>
<footer>ลำดับที่ถูกต้อง: ตั้งค่าที่ Worker → Deploy Code.gs เวอร์ชันใหม่ → ใส่ DASH_KEY ในแท็บ Config → ใส่ PUSH_TOKEN ในแท็บ Config เป็นอันดับสุดท้าย</footer>
</div></body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function unauthorized() {
  return new Response('ต้องใส่รหัสผ่านเพื่อเข้าใช้งานระบบเดินตรวจ รปภ.', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export default {
  async fetch(request, env) {
    const wantUser = env.SITE_USER || '';
    const wantPass = env.SITE_PASS || '';

    // ยังไม่ได้ตั้งรหัส = ไม่ล็อก (กันตัวเองเข้าไม่ได้ตอน deploy ครั้งแรก)
    if (wantPass) {
      const header = request.headers.get('Authorization') || '';
      if (!header.startsWith('Basic ')) return unauthorized();

      let user = '';
      let pass = '';
      try {
        const decoded = atob(header.slice(6));
        const i = decoded.indexOf(':');
        user = i === -1 ? decoded : decoded.slice(0, i);
        pass = i === -1 ? '' : decoded.slice(i + 1);
      } catch {
        return unauthorized();
      }

      const userOk = wantUser ? safeEqual(user, wantUser) : true;
      if (!userOk || !safeEqual(pass, wantPass)) return unauthorized();
    }

    // ค่าตั้งค่าที่ทุกเครื่องต้องรู้ตั้งแต่เปิดครั้งแรก
    // ตั้ง WEBAPP_URL เป็น environment variable ที่ Cloudflare ครั้งเดียว
    // แล้วทุกเครื่อง (รวมมือถือ รปภ.) จะรู้ปลายทางชีตเอง ไม่ต้องตั้งทีละเครื่อง
    const url = new URL(request.url);
    if (url.pathname === '/__config') {
      // ปลายทางนี้อยู่หลังการตรวจรหัสผ่านด้านบนแล้ว จึงแจกโทเคนส่งข้อมูลได้
      // PUSH_TOKEN ต้องตั้งให้ตรงกับค่าในแท็บ Config ของชีต
      return new Response(JSON.stringify({
        webAppUrl: env.WEBAPP_URL || '',
        pushToken: env.PUSH_TOKEN || '',
      }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    // หน้าตรวจสภาพการเชื่อมต่อ อยู่หลังการตรวจรหัสผ่านเช่นเดียวกับ /__config
    if (url.pathname === '/__health') {
      return healthPage(env);
    }

    return env.ASSETS.fetch(request);
  },
};
