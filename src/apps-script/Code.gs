/**
 * =========================================================================
 * ระบบเดินตรวจ รปภ. (Guard Patrol System) — Google Apps Script Backend
 * CPF โรงงานอาหารสัตว์ ธารเกษม สระบุรี | รหัสเอกสาร: FM-SEC-01 Rev.00
 * =========================================================================
 *
 * วิธีติดตั้ง
 *   1. สร้าง Google Spreadsheet ใหม่ 1 ไฟล์
 *   2. เมนู Extensions > Apps Script แล้ววางโค้ดนี้ทับทั้งหมด
 *   3. Deploy > New deployment > Web app
 *        Execute as      : Me
 *        Who has access  : Anyone
 *   4. คัดลอก URL ที่ลงท้ายด้วย /exec (ห้ามใช้ /dev) ไปใส่ในหน้า
 *      "Apps Script & ชีต" ของเว็บแอป ช่อง WEBAPP_URL
 *   5. เปิดชีต แล้วตั้งค่าในแท็บ Config ที่ระบบสร้างให้อัตโนมัติ
 *      อย่างน้อยต้องตั้ง DASH_KEY (กุญแจผู้ดูแล) ให้ตรงกับที่ตั้งในเว็บแอป
 *
 * หมายเหตุด้านสิทธิ์
 *   - action "push" (บันทึกผลตรวจ) ไม่ตรวจกุญแจผู้ดูแล เพราะเจ้าหน้าที่ รปภ.
 *     ไม่มีระบบล็อกอิน แต่ตรวจ PUSH_TOKEN เพื่อปิดไม่ให้คนที่รู้แค่ URL /exec
 *     ยิงข้อมูลเข้ามาได้ (ตั้ง PUSH_TOKEN ในแท็บ Config ให้ตรงกับ env var
 *     ชื่อเดียวกันที่ Cloudflare Worker ถ้าเว้นว่างไว้ = ไม่ตรวจ เพื่อไม่ให้
 *     ระบบที่ติดตั้งไปแล้วพังทันทีที่อัปเดตโค้ดนี้)
 *   - action ที่อ่าน/แก้ข้อมูลของผู้ดูแล ต้องส่ง key มาด้วยเสมอ
 *     และตรวจกับ DASH_KEY ในแท็บ Config ฝั่งเซิร์ฟเวอร์
 *
 * หมายเหตุด้านความถูกต้องของข้อมูล
 *   ค่าที่ใช้ตัดสินว่า "อยู่ที่จุดตรวจจริงหรือไม่" (distance_m, geo_result, round,
 *   date, time, checkpoint_name, zone) ถูกคำนวณใหม่ที่นี่เสมอ ไม่ใช้ค่าที่เว็บแอปส่งมา
 *   เพราะทุกอย่างในเบราว์เซอร์แก้ได้ ถ้าเชื่อค่าจากเครื่อง การตรวจรัศมีจะไม่มีความหมาย
 */

var SHEET = {
  LOGS: 'Logs',
  CHECKPOINTS: 'Checkpoints',
  ROUNDS: 'Rounds',
  GUARDS: 'Guards',
  CONFIG: 'Config',
};

var LOG_HEADERS = [
  'id', 'timestamp', 'date', 'time', 'round',
  'checkpoint_id', 'checkpoint_name', 'zone', 'guard', 'status',
  'note', 'lat', 'lng', 'accuracy_m', 'distance_m',
  'geo_result', 'flags', 'device_id', 'photo_url', 'maps_link',
];

var CHECKPOINT_HEADERS = ['checkpoint_id', 'name', 'zone', 'lat', 'lng', 'radius_m', 'active'];
var ROUND_HEADERS = ['round_id', 'label', 'start', 'end'];
var GUARD_HEADERS = ['guard_id', 'name', 'active'];
var CONFIG_HEADERS = ['key', 'value'];

/** จำนวนบันทึกสูงสุดที่ยอมให้ดึงกลับในครั้งเดียว กันไม่ให้ response ใหญ่เกิน */
var MAX_PULL_LOGS = 5000;

// ---------------------------------------------------------------- helpers

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/** คืนแท็บที่ต้องการ สร้างใหม่พร้อมหัวตารางถ้ายังไม่มี */
function sheet_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** อ่านทั้งแท็บออกมาเป็น array ของ object โดยใช้แถวแรกเป็นชื่อคอลัมน์ */
function readAll_(name, headers) {
  var sh = sheet_(name, headers);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];

  var head = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.join('') === '') continue; // ข้ามแถวว่าง
    var obj = {};
    for (var c = 0; c < head.length; c++) {
      obj[String(head[c]).trim()] = row[c];
    }
    out.push(obj);
  }
  return out;
}

function num_(v) {
  if (v === '' || v === null || v === undefined) return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function str_(v) {
  return v === null || v === undefined ? '' : String(v);
}

/** อ่านแท็บ Config ออกมาเป็น object { key: value } */
function readConfig_() {
  var rows = readAll_(SHEET.CONFIG, CONFIG_HEADERS);
  var cfg = {};
  for (var i = 0; i < rows.length; i++) {
    var k = str_(rows[i].key).trim();
    if (k) cfg[k] = rows[i].value;
  }
  return cfg;
}

/**
 * ตรวจกุญแจผู้ดูแลฝั่งเซิร์ฟเวอร์
 * ยังไม่ได้ตั้ง DASH_KEY ในชีต = ปฏิเสธทุกคำขอ (fail closed)
 */
function keyOk_(key) {
  var want = str_(readConfig_().DASH_KEY).trim();
  if (!want) return false;
  return str_(key).trim() === want;
}

/**
 * ตรวจโทเคนสำหรับส่งบันทึก
 * ไม่ได้ตั้ง PUSH_TOKEN ในชีต = ไม่ตรวจ (fail open โดยตั้งใจ เพื่อไม่ให้ระบบที่
 * ติดตั้งไปแล้วหยุดรับข้อมูลทันทีที่อัปเดตโค้ด — ตั้งค่าแล้วจึงเริ่มบังคับ)
 */
function tokenOk_(body) {
  var want = str_(readConfig_().PUSH_TOKEN).trim();
  if (!want) return true;
  return str_(body.token).trim() === want;
}

/** ระยะทางแบบ Haversine (เมตร) — ต้องตรงกับสูตรฝั่งเว็บแอป */
function distM_(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var toRad = Math.PI / 180;
  var dLat = (lat2 - lat1) * toRad;
  var dLng = (lng2 - lng1) * toRad;
  var a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** "HH:mm" หรือ Date -> นาทีนับจากเที่ยงคืน */
function toMin_(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date) return v.getHours() * 60 + v.getMinutes();
  var m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** หารอบจากเวลา รองรับรอบข้ามเที่ยงคืน (start > end) */
function roundOf_(date, rounds) {
  var mins = Number(Utilities.formatDate(date, Session.getScriptTimeZone(), 'H')) * 60 +
    Number(Utilities.formatDate(date, Session.getScriptTimeZone(), 'm'));
  for (var i = 0; i < rounds.length; i++) {
    var s = toMin_(rounds[i].start);
    var e = toMin_(rounds[i].end);
    if (s === null || e === null) continue;
    if (e === 0) e = 1440;
    if (s <= e) {
      if (mins >= s && mins < e) return rounds[i].round_id;
    } else if (mins >= s || mins < e) {
      return rounds[i].round_id;
    }
  }
  return '';
}

/** อ่านจุดตรวจเป็น map ตาม checkpoint_id เพื่อใช้ตรวจพิกัดตอน push */
function checkpointMap_() {
  var rows = readAll_(SHEET.CHECKPOINTS, CHECKPOINT_HEADERS);
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var id = str_(rows[i].checkpoint_id).trim();
    if (!id) continue;
    map[id] = {
      checkpoint_id: id,
      name: str_(rows[i].name),
      zone: str_(rows[i].zone),
      lat: num_(rows[i].lat),
      lng: num_(rows[i].lng),
      radius_m: num_(rows[i].radius_m),
      active: str_(rows[i].active).toUpperCase() === 'NO' ? 'NO' : 'YES',
    };
  }
  return map;
}

// ---------------------------------------------------------------- Discord

/**
 * ตรวจว่าเป็นลิงก์ webhook ของ Discord จริง
 *
 * ต้องตรวจ เพราะถ้าพิมพ์ผิดเป็นโดเมนอื่น ระบบจะส่งข้อมูลการเดินตรวจ
 * (ชื่อ รปภ. พิกัด เวลา) ออกไปให้ปลายทางที่ไม่รู้จักโดยไม่มีใครสังเกต
 */
function validDiscordWebhook_(u) {
  return /^https:\/\/(canary\.|ptb\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(
    String(u || '').trim()
  );
}

/**
 * ลบลิงก์ webhook ออกจากข้อความ error ก่อนเก็บ
 * ข้อความ error ของ Apps Script มักมี URL เต็มติดมาด้วย ถ้าเก็บดิบ ๆ
 * แล้วเอาไปโชว์ในหน้า /__health เท่ากับเอาความลับไปแปะไว้ให้คนอ่าน
 */
function scrub_(msg) {
  return String(msg || '')
    .replace(/https:\/\/[^\s]*\/api\/webhooks\/[^\s]*/gi, '[ลิงก์ webhook]')
    .slice(0, 300);
}

/**
 * จดผลการส่งครั้งล่าสุดไว้ให้หน้า /__health อ่าน
 *
 * มีเพราะการแจ้งเตือนที่ล้มเหลวเงียบ ๆ แย่กว่าไม่มีการแจ้งเตือนเลย —
 * "ไม่มีข้อความเข้าห้องแชท" หน้าตาเหมือนกับ "ทุกอย่างปกติ" เป๊ะ
 * เก็บใน ScriptProperties ไม่ใช่ในชีต จะได้ไม่ไปชนกับล็อกตอนเขียนบันทึก
 */
function noteDiscord_(reason, ok) {
  try {
    PropertiesService.getScriptProperties().setProperty(
      'DISCORD_LAST',
      JSON.stringify({
        ok: Boolean(ok),
        reason: String(reason || ''),
        at: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
      })
    );
  } catch (e) {
    // จดไม่ได้ก็ไม่เป็นไร ห้ามให้เรื่องนี้ทำให้การบันทึกผลตรวจพัง
  }
  return Boolean(ok);
}

/** อ่านผลการส่งครั้งล่าสุด — ไม่มีความลับอยู่ในนี้ (ผ่าน scrub_ มาแล้ว) */
function lastDiscord_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('DISCORD_LAST');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

/** ตัดข้อความยาวให้พอดีช่องของ Discord */
function clip_(v, n) {
  var t = str_(v).trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

/**
 * แปลงธงที่ระบบติดไว้ ให้เป็นเหตุผลภาษาคนที่หัวหน้าชุดอ่านแล้วเข้าใจทันที
 * คืนอาร์เรย์ว่าง = รายการนี้ปกติ ไม่ต้องแจ้ง
 */
function alertReasons_(info) {
  var reasons = [];
  if (info.status && info.status !== 'ปกติ') reasons.push('เจ้าหน้าที่แจ้ง: ' + info.status);

  for (var i = 0; i < info.flags.length; i++) {
    var f = info.flags[i];
    if (f === 'OUT_OF_RANGE') {
      reasons.push('อยู่นอกรัศมีจุดตรวจ (ห่าง ' + info.distance + ' ม. / อนุญาต ' + info.radius + ' ม.)');
    } else if (f === 'NO_GPS') {
      reasons.push('ไม่มีสัญญาณ GPS ตอนบันทึก');
    } else if (f === 'LOW_ACCURACY') {
      reasons.push('สัญญาณ GPS หยาบเกินเกณฑ์ (±' + info.accuracy + ' ม.)');
    } else if (f === 'NO_REFERENCE') {
      reasons.push('จุดตรวจนี้ยังไม่มีพิกัดอ้างอิงในชีต');
    } else if (f === 'UNVERIFIED_CP') {
      reasons.push('ไม่พบจุดตรวจนี้ในชีต จึงตรวจพิกัดไม่ได้');
    } else if (f === 'CP_INACTIVE') {
      reasons.push('จุดตรวจนี้ถูกปิดใช้งานอยู่');
    } else if (f === 'OVERRIDE') {
      reasons.push('ขอบันทึกพิเศษ (ข้ามการตรวจรัศมี)');
    } else if (f === 'TIME_SKEW') {
      reasons.push('เวลาของเครื่องไม่ตรงกับเซิร์ฟเวอร์');
    } else if (f.indexOf('SPEED_') === 0) {
      reasons.push('เคลื่อนที่เร็วผิดปกติ (' + f.slice(6) + ' กม./ชม.)');
    }
  }
  return reasons;
}

/**
 * ส่งแจ้งเตือนเข้าห้องแชท Discord — เฉพาะรายการที่ผิดปกติเท่านั้น
 *
 * ส่งจากฝั่งเซิร์ฟเวอร์เสมอ ห้ามส่งจากเบราว์เซอร์ เพราะลิงก์ webhook จะติดไปกับ
 * มือถือของ รปภ. ทุกเครื่อง แล้วใครก็ยิงข้อความปลอมเข้าห้องแชทได้
 *
 * ส่งรวมเป็นข้อความเดียว เพราะตอนเครื่องที่ค้างออฟไลน์กลับมาออนไลน์
 * จะส่งบันทึกขึ้นมาพร้อมกันหลายรายการ ถ้าแยกส่งจะชน rate limit ของ Discord
 *
 * คืน false เมื่อไม่ได้ส่ง — และห้าม throw เด็ดขาด
 * การแจ้งเตือนล้มเหลวต้องไม่ทำให้บันทึกผลตรวจที่เขียนลงชีตแล้วเสียหาย
 */
/**
 * โหมดแจ้งเตือนจากแท็บ Config — ตั้งที่ชีตได้เลย ไม่ต้องแก้โค้ด
 *   ABNORMAL (ค่าเริ่มต้น) = แจ้งเฉพาะรายการที่ผิดปกติ
 *   ALL                    = แจ้งทุกครั้งที่บันทึก (แบบระบบเดิม)
 *   OFF                    = ปิดการแจ้งเตือน
 */
function discordMode_(cfg) {
  var v = str_(cfg.DISCORD_NOTIFY).trim().toUpperCase();
  if (v === 'ALL' || v === 'OFF') return v;
  return 'ABNORMAL';
}

function notifyDiscord_(alerts, cfg) {
  try {
    if (discordMode_(cfg) === 'OFF') return noteDiscord_('ปิดอยู่ (DISCORD_NOTIFY = OFF)');
    var url = str_(cfg.DISCORD_WEBHOOK).trim();
    if (!alerts.length) return false;
    if (!url) return noteDiscord_('ยังไม่ได้ตั้ง DISCORD_WEBHOOK ในแท็บ Config');
    if (!validDiscordWebhook_(url)) {
      return noteDiscord_('DISCORD_WEBHOOK ไม่ใช่ลิงก์ webhook ของ Discord จึงไม่ส่งออกไป');
    }

    var MAX_EMBEDS = 10; // เพดานของ Discord ต่อหนึ่งข้อความ
    var shown = alerts.slice(0, MAX_EMBEDS);
    var embeds = [];

    for (var i = 0; i < shown.length; i++) {
      var a = shown[i];
      var fields = [
        { name: 'ผู้ตรวจ', value: clip_(a.guard || '(ไม่ระบุ)', 100), inline: true },
        { name: 'รอบ', value: clip_(a.round || '-', 100), inline: true },
        { name: 'เวลา', value: clip_(a.time || '-', 100), inline: true },
      ];
      if (a.note) fields.push({ name: 'หมายเหตุ', value: clip_(a.note, 900), inline: false });
      if (a.mapsLink) fields.push({ name: 'ตำแหน่ง', value: a.mapsLink, inline: false });

      embeds.push({
        // แดง = ต้องดูทันที (คนแจ้งเหตุ/อยู่นอกรัศมี), เหลือง = ผิดปกติแต่ไม่ด่วนเท่า
        // เขียว = ปกติ (เห็นได้เฉพาะโหมด ALL)
        color: a.reasons.length ? (a.severe ? 0xdc2626 : 0xf59e0b) : 0x16a34a,
        title: clip_((a.checkpointName || a.checkpointId) + (a.zone ? ' · ' + a.zone : ''), 250),
        description: a.reasons.length
          ? clip_('• ' + a.reasons.join('\n• '), 3800)
          : 'ตรวจผ่านตามปกติ' + (a.distance === '' ? '' : ' (ห่าง ' + a.distance + ' ม.)'),
        fields: fields,
      });
    }

    var anySevere = false;
    for (var k = 0; k < alerts.length; k++) if (alerts[k].reasons.length) anySevere = true;

    var header = anySevere
      ? '🚨 พบการเดินตรวจผิดปกติ ' + alerts.length + ' รายการ'
      : '✅ บันทึกการเดินตรวจ ' + alerts.length + ' รายการ';
    if (alerts.length > shown.length) {
      header += ' (แสดง ' + shown.length + ' รายการแรก ที่เหลือดูในชีต)';
    }

    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      // หมายเหตุจาก รปภ. เป็นข้อความอิสระ ถ้าเผลอมี @everyone ติดมาจะเด้งทั้งเซิร์ฟเวอร์
      // parse: [] คือปิดการ mention ทั้งหมด
      payload: JSON.stringify({
        username: 'ระบบเดินตรวจ รปภ.',
        content: header,
        allowed_mentions: { parse: [] },
        embeds: embeds,
      }),
      muteHttpExceptions: true,
    });

    // ต้องดูรหัสตอบกลับด้วย muteHttpExceptions ทำให้ webhook ที่ถูกลบไปแล้ว (401/404)
    // ไม่โยน error ออกมา ถ้าไม่เช็กจะนับว่าส่งสำเร็จทั้งที่ไม่มีข้อความเข้าห้องแชทเลย
    var code = res.getResponseCode();
    if (code >= 200 && code < 300) {
      return noteDiscord_('ส่งสำเร็จ (' + alerts.length + ' รายการ)', true);
    }
    if (code === 401 || code === 403 || code === 404) {
      return noteDiscord_('Discord ปฏิเสธ (HTTP ' + code + ') — webhook ถูกลบหรือลิงก์ผิด');
    }
    if (code === 429) {
      return noteDiscord_('Discord จำกัดอัตราการส่ง (HTTP 429) ชั่วคราว');
    }
    return noteDiscord_('Discord ตอบ HTTP ' + code);
  } catch (err) {
    // ส่งไม่สำเร็จก็ต้องไม่กระทบการบันทึก ข้อมูลจริงอยู่ในชีตแล้ว
    // แต่ต้องบันทึกสาเหตุไว้ ไม่งั้นไม่มีใครรู้เลยว่าทำไมข้อความไม่เข้า
    return noteDiscord_(scrub_(String((err && err.message) || err)));
  }
}

function denied_() {
  return json_({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง (กุญแจผู้ดูแลไม่ถูกต้อง หรือยังไม่ได้ตั้ง DASH_KEY ในแท็บ Config)' });
}

// ---------------------------------------------------------------- entry points

function doGet(e) {
  // ใช้สำหรับทดสอบว่า deployment ใช้งานได้จริงเท่านั้น ไม่คืนข้อมูลใด ๆ
  return json_({
    ok: true,
    service: 'guard-patrol',
    message: 'Apps Script พร้อมใช้งาน กรุณาเรียกผ่าน POST',
    time: new Date().toISOString(),
  });
}

function doPost(e) {
  try {
    var raw = e && e.postData ? e.postData.contents : '';
    if (!raw) return json_({ ok: false, error: 'ไม่มีข้อมูลส่งมา' });

    var body = JSON.parse(raw);
    var action = str_(body.action);

    switch (action) {
      case 'push':
        return handlePush_(body);
      case 'pullPublic':
        return handlePullPublic_();
      case 'verifyKey':
        return handleVerifyKey_(body);
      case 'setDashKey':
        return handleSetDashKey_(body);
      case 'pullLogs':
        return handlePullLogs_(body);
      case 'saveCheckpoints':
        return handleSaveCheckpoints_(body);
      case 'saveGuards':
        return handleSaveGuards_(body);
      default:
        return json_({ ok: false, error: 'ไม่รู้จักคำสั่ง: ' + action });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ---------------------------------------------------------------- verify key

/**
 * ตรวจกุญแจผู้ดูแลฝั่งเซิร์ฟเวอร์
 * เว็บแอปเรียกตอนกดเข้าสู่ระบบผู้ดูแล เพื่อไม่ให้ใครตั้งกุญแจของตัวเอง
 * ในเครื่องแล้วกลายเป็นผู้ดูแลได้เอง — กุญแจจริงมีที่เดียวคือแท็บ Config
 */
function handleVerifyKey_(body) {
  if (!keyOk_(body.key)) return denied_();
  return json_({ ok: true });
}

/**
 * ตั้ง DASH_KEY ลงแท็บ Config ครั้งแรก (เรียกจากหน้า "ตั้งค่าระบบครั้งแรก" ของเว็บแอป)
 *
 * ยอมเฉพาะตอนที่ยังไม่เคยตั้งเท่านั้น ตั้งแล้วต้องไปแก้ในชีตเอง
 * ไม่งั้นใครก็ตามที่เปิดเว็บได้จะยิงคำสั่งนี้มาเปลี่ยนกุญแจของผู้ดูแลทิ้ง
 * มีขั้นตอนนี้เพราะกุญแจที่ตั้งไว้แค่ในเครื่องจะใช้เข้าระบบไม่ได้เลย
 * (keyOk_ เทียบกับชีตอย่างเดียว) ทำให้ผู้ดูแลล็อกตัวเองออกโดยไม่รู้ตัว
 */
function handleSetDashKey_(body) {
  var key = str_(body.key).trim();
  if (key.length < 6) {
    return json_({ ok: false, error: 'กุญแจต้องยาวอย่างน้อย 6 ตัวอักษร' });
  }

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'ระบบกำลังบันทึกรายการอื่นอยู่ กรุณาลองใหม่' });
  }

  try {
    if (str_(readConfig_().DASH_KEY).trim()) {
      return json_({
        ok: false,
        error: 'ชีตนี้ตั้ง DASH_KEY ไว้แล้ว หากต้องการเปลี่ยนให้แก้ในแท็บ Config โดยตรง',
      });
    }

    var sh = sheet_(SHEET.CONFIG, CONFIG_HEADERS);
    var rows = sh.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (str_(rows[i][0]).trim() === 'DASH_KEY') {
        sh.getRange(i + 1, 2).setValue(key);
        return json_({ ok: true });
      }
    }
    sh.appendRow(['DASH_KEY', key]);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// ---------------------------------------------------------------- push (บันทึกผลตรวจ)

/**
 * รับบันทึกผลตรวจจากเว็บแอป — ไม่ต้องใช้กุญแจผู้ดูแล แต่ต้องมี PUSH_TOKEN ถ้าตั้งไว้
 * กันซ้ำด้วยคอลัมน์ id เพื่อให้เว็บแอปส่งซ้ำได้อย่างปลอดภัยเมื่อสัญญาณหลุด
 * คืน accepted = รายการ id ที่ถือว่าอยู่ในชีตแล้ว (ทั้งที่เพิ่งเขียนและที่ซ้ำ)
 *
 * ค่าที่ใช้ตัดสินผล (ระยะทาง/ในรัศมีหรือไม่/รอบ/วันเวลา/ชื่อจุด/โซน) คำนวณใหม่ที่นี่
 * จากพิกัดที่ส่งมาเทียบกับแท็บ Checkpoints ไม่ใช้ค่าที่เครื่องส่งมา
 */
function handlePush_(body) {
  if (!tokenOk_(body)) {
    return json_({ ok: false, error: 'โทเคนไม่ถูกต้อง (ตรวจ PUSH_TOKEN ในแท็บ Config ให้ตรงกับที่ตั้งใน Worker)' });
  }

  var logs = body.logs;
  if (!logs || !logs.length) return json_({ ok: true, accepted: [], written: 0 });

  // เก็บรายการที่จะแจ้งเตือนไว้ก่อน แล้วค่อยส่งหลังปลดล็อก
  // จะได้ไม่ถือล็อกค้างไว้ระหว่างรอเครือข่าย ทำให้เครื่องอื่นบันทึกไม่ได้
  var alerts = [];
  var cfg;
  var result;

  var lock = LockService.getScriptLock();
  // หลาย รปภ. อาจกดบันทึกพร้อมกัน ต้องกันไม่ให้เขียนทับแถวเดียวกัน
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'ระบบกำลังบันทึกรายการอื่นอยู่ กรุณาลองใหม่' });
  }

  try {
    var sh = sheet_(SHEET.LOGS, LOG_HEADERS);
    cfg = readConfig_();
    var cps = checkpointMap_();
    var rounds = readAll_(SHEET.ROUNDS, ROUND_HEADERS).map(function (r) {
      return { round_id: str_(r.round_id).trim(), start: r.start, end: r.end };
    });
    var tz = Session.getScriptTimeZone();
    var defRadius = num_(cfg.DEFAULT_RADIUS_M) || 40;
    var maxAcc = num_(cfg.MAX_ACCURACY_M) || 60;
    var serverNow = new Date();
    var mode = discordMode_(cfg);
    var notifyAll = mode === 'ALL';

    // รวบรวม id ที่มีอยู่แล้วเพื่อกันซ้ำ
    var existing = {};
    var lastRow = sh.getLastRow();
    if (lastRow > 1) {
      var ids = sh.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        var v = str_(ids[i][0]).trim();
        if (v) existing[v] = true;
      }
    }

    var rows = [];
    var accepted = [];
    for (var j = 0; j < logs.length; j++) {
      var log = logs[j] || {};
      var id = str_(log.id).trim();
      if (!id) continue;

      accepted.push(id); // ส่งกลับทั้งที่เขียนใหม่และที่ซ้ำ เว็บแอปจะได้เอาออกจากคิว
      if (existing[id]) continue;
      existing[id] = true;

      var lat = num_(log.lat);
      var lng = num_(log.lng);
      var acc = num_(log.accuracy_m);
      var cpId = str_(log.checkpoint_id).trim();
      var cp = cps[cpId];

      // เก็บ flag ที่มีแต่ฝั่งเครื่องรู้ (OVERRIDE, SPEED_*) แต่ทิ้ง flag เรื่องพิกัด
      // เพราะกำลังจะคำนวณใหม่เอง
      var srvFlags = [];
      var clientFlags = str_(log.flags).split(',');
      for (var f = 0; f < clientFlags.length; f++) {
        var cf = clientFlags[f].trim();
        if (!cf) continue;
        if (cf === 'IN_RANGE' || cf === 'OUT_OF_RANGE' || cf === 'NO_GPS' ||
            cf === 'LOW_ACCURACY' || cf === 'NO_REFERENCE') continue;
        srvFlags.push(cf);
      }

      // เวลา: ยอมรับเวลาจากเครื่องเพราะต้องรองรับการส่งย้อนหลังตอนสัญญาณขาด
      // แต่เวลาอนาคตเป็นไปไม่ได้ ให้ใช้เวลาเซิร์ฟเวอร์แทนและติดธงไว้
      // ส่วนเวลาที่เก่าเกิน 7 วัน เก็บค่าเดิมไว้แต่ติดธงให้ผู้ดูแลเห็นว่าผิดปกติ
      var ts = new Date(str_(log.timestamp));
      if (isNaN(ts.getTime()) || ts.getTime() > serverNow.getTime() + 5 * 60000) {
        ts = serverNow;
        srvFlags.push('TIME_SKEW');
      } else if (serverNow.getTime() - ts.getTime() > 7 * 86400000) {
        srvFlags.push('TIME_SKEW');
      }

      // พิกัด: คำนวณระยะและผลตรวจใหม่จากแท็บ Checkpoints
      var dist = '';
      var geo;
      if (!cp) {
        // ไม่มีจุดตรวจนี้ในชีต จึงตรวจสอบไม่ได้ — บันทึกไว้แต่ติดธงให้เห็นชัด
        geo = 'NO_REFERENCE';
        srvFlags.push('UNVERIFIED_CP');
      } else if (lat === null || lng === null) {
        geo = 'NO_GPS';
      } else if (cp.lat === null || cp.lng === null) {
        geo = 'NO_REFERENCE';
      } else {
        dist = Math.round(distM_(lat, lng, cp.lat, cp.lng));
        if (acc !== null && acc > maxAcc) {
          geo = 'LOW_ACCURACY';
        } else {
          geo = dist <= (cp.radius_m || defRadius) ? 'IN_RANGE' : 'OUT_OF_RANGE';
        }
      }
      if (geo !== 'IN_RANGE') srvFlags.unshift(geo);
      if (cp && cp.active === 'NO') srvFlags.push('CP_INACTIVE');

      var roundId = roundOf_(ts, rounds) || '(นอกช่วงรอบ)';
      var statusText = str_(log.status);
      var info = {
        checkpointId: cpId,
        checkpointName: cp ? cp.name : str_(log.checkpoint_name),
        zone: cp ? cp.zone : str_(log.zone),
        guard: str_(log.guard),
        status: statusText,
        note: str_(log.note),
        round: roundId,
        time: Utilities.formatDate(ts, tz, 'HH:mm'),
        distance: dist,
        radius: cp ? (cp.radius_m || defRadius) : defRadius,
        accuracy: acc === null ? '-' : Math.round(acc),
        flags: srvFlags,
        mapsLink: lat === null || lng === null ? '' : 'https://www.google.com/maps?q=' + lat + ',' + lng,
      };
      info.reasons = alertReasons_(info);
      // แดงเฉพาะเรื่องที่หัวหน้าชุดต้องดูทันที
      info.severe = (statusText && statusText !== 'ปกติ') || geo === 'OUT_OF_RANGE';
      if (mode !== 'OFF' && (info.reasons.length || notifyAll)) alerts.push(info);

      rows.push([
        id,
        Utilities.formatDate(ts, tz, "yyyy-MM-dd'T'HH:mm:ss"),
        Utilities.formatDate(ts, tz, 'yyyy-MM-dd'),
        Utilities.formatDate(ts, tz, 'HH:mm:ss'),
        roundId,
        cpId,
        cp ? cp.name : str_(log.checkpoint_name),
        cp ? cp.zone : str_(log.zone),
        str_(log.guard),
        str_(log.status),
        str_(log.note),
        lat === null ? '' : lat,
        lng === null ? '' : lng,
        acc === null ? '' : acc,
        dist,
        geo,
        srvFlags.join(','),
        str_(log.device_id),
        str_(log.photo_url),
        lat === null || lng === null ? '' : 'https://www.google.com/maps?q=' + lat + ',' + lng,
      ]);
    }

    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, LOG_HEADERS.length).setValues(rows);
    }

    result = { ok: true, accepted: accepted, written: rows.length };
  } finally {
    lock.releaseLock();
  }

  // ส่งแจ้งเตือนหลังเขียนชีตเสร็จและปลดล็อกแล้วเท่านั้น
  // ข้อมูลจริงต้องปลอดภัยก่อน การแจ้งเตือนเป็นเรื่องรอง — ล้มเหลวได้โดยไม่กระทบกัน
  //
  // ส่งรวมเป็นข้อความเดียวต่อการบันทึกหนึ่งครั้ง (ไม่ใช่หนึ่งข้อความต่อหนึ่งรายการ)
  // เพราะเครื่องที่ค้างออฟไลน์ไว้ทั้งคืนจะส่งขึ้นมาทีเดียวหลายสิบรายการ
  // ถ้าแยกส่งจะโดน rate limit ของ Discord แล้วข้อความหายไปเงียบ ๆ
  if (alerts.length) notifyDiscord_(alerts, cfg || {});

  return json_(result);
}

// ---------------------------------------------------------------- pull

/**
 * ข้อมูลที่เจ้าหน้าที่ รปภ. ต้องใช้เพื่อบันทึกผลตรวจ — ไม่ต้องใช้กุญแจ
 * ไม่คืนบันทึกผลตรวจ และไม่คืน DASH_KEY
 */
function handlePullPublic_() {
  var cfg = readConfig_();

  var checkpoints = readAll_(SHEET.CHECKPOINTS, CHECKPOINT_HEADERS).map(function (r) {
    return {
      checkpoint_id: str_(r.checkpoint_id).trim(),
      name: str_(r.name),
      zone: str_(r.zone),
      lat: num_(r.lat),
      lng: num_(r.lng),
      radius_m: num_(r.radius_m) || 40,
      active: str_(r.active).toUpperCase() === 'NO' ? 'NO' : 'YES',
    };
  }).filter(function (r) { return r.checkpoint_id; });

  var rounds = readAll_(SHEET.ROUNDS, ROUND_HEADERS).map(function (r) {
    return {
      round_id: str_(r.round_id).trim(),
      label: str_(r.label),
      start: formatTime_(r.start),
      end: formatTime_(r.end),
    };
  }).filter(function (r) { return r.round_id; });

  var guards = readAll_(SHEET.GUARDS, GUARD_HEADERS).map(function (r) {
    return {
      guard_id: str_(r.guard_id).trim(),
      name: str_(r.name),
      active: str_(r.active).toUpperCase() === 'NO' ? 'NO' : 'YES',
    };
  }).filter(function (r) { return r.guard_id; });

  return json_({
    ok: true,
    checkpoints: checkpoints,
    rounds: rounds,
    guards: guards,
    config: publicConfig_(cfg),
  });
}

/**
 * คืนเฉพาะค่าที่ไม่เป็นความลับ
 * ห้ามคืน DASH_KEY / PUSH_TOKEN / DISCORD_WEBHOOK ออกไปเด็ดขาด
 * (ใครก็เรียก pullPublic ได้โดยไม่ต้องมีกุญแจ)
 */
function publicConfig_(cfg) {
  return {
    // บอกแค่ว่า "ตั้งกุญแจแล้วหรือยัง" ไม่ใช่ตัวกุญแจ
    // เว็บแอปใช้ค่านี้ตัดสินว่าต้องขึ้นหน้าตั้งค่าครั้งแรกไหม จะได้ไม่ต้องเดาจากค่าในเครื่อง
    KEY_SET: !!str_(cfg.DASH_KEY).trim(),
    // เขตเวลาที่สคริปต์ใช้จริง — วันที่ เวลา และการหารอบทั้งหมดอิงค่านี้
    // ถ้าไม่ใช่ Asia/Bangkok รายงานจะเพี้ยนทั้งระบบโดยไม่มีอะไรฟ้อง
    // (แก้ที่ชีต: File > Settings > Time zone แล้ว Deploy เวอร์ชันใหม่)
    TZ: Session.getScriptTimeZone(),
    // บอกแค่ว่า "ตั้ง webhook แล้วหรือยัง" และโหมดไหน ไม่ใช่ตัวลิงก์
    DISCORD_SET: validDiscordWebhook_(cfg.DISCORD_WEBHOOK),
    DISCORD_NOTIFY: discordMode_(cfg),
    // ผลการส่งครั้งล่าสุด ใช้ตอบคำถาม "ทำไมข้อความไม่เข้าห้องแชท" ได้ในที่เดียว
    DISCORD_LAST: lastDiscord_(),
    SERVER_TIME: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
    SITE_NAME: str_(cfg.SITE_NAME),
    DOC_CODE: str_(cfg.DOC_CODE),
    DEFAULT_RADIUS_M: num_(cfg.DEFAULT_RADIUS_M) || 40,
    MAX_ACCURACY_M: num_(cfg.MAX_ACCURACY_M) || 60,
    BLOCK_OUT_OF_RANGE: str_(cfg.BLOCK_OUT_OF_RANGE).toUpperCase() !== 'FALSE',
    ALLOW_OVERRIDE: str_(cfg.ALLOW_OVERRIDE).toUpperCase() !== 'FALSE',
    DUPLICATE_WINDOW_MIN: num_(cfg.DUPLICATE_WINDOW_MIN) || 20,
    SPEED_FLAG_KMH: num_(cfg.SPEED_FLAG_KMH) || 25,
  };
}

/** ค่าเวลาในชีตอาจถูกอ่านกลับมาเป็น Date ต้องแปลงเป็น HH:mm */
function formatTime_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm');
  }
  return str_(v).trim();
}

/** ดึงบันทึกผลตรวจ — เฉพาะผู้ดูแล */
function handlePullLogs_(body) {
  if (!keyOk_(body.key)) return denied_();

  var from = str_(body.from).trim(); // yyyy-MM-dd (ไม่ระบุ = ทั้งหมด)
  var rows = readAll_(SHEET.LOGS, LOG_HEADERS);

  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var date = normalizeDate_(r.date);
    if (from && date < from) continue;

    out.push({
      id: str_(r.id),
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : str_(r.timestamp),
      date: date,
      time: formatClock_(r.time),
      round: str_(r.round),
      checkpoint_id: str_(r.checkpoint_id),
      checkpoint_name: str_(r.checkpoint_name),
      zone: str_(r.zone),
      guard: str_(r.guard),
      status: str_(r.status) || 'ปกติ',
      note: str_(r.note),
      lat: num_(r.lat),
      lng: num_(r.lng),
      accuracy_m: num_(r.accuracy_m),
      distance_m: r.distance_m === '' ? '' : num_(r.distance_m),
      geo_result: str_(r.geo_result),
      flags: str_(r.flags),
      device_id: str_(r.device_id),
      photo_url: str_(r.photo_url),
      maps_link: str_(r.maps_link),
    });
  }

  // เอาเฉพาะรายการล่าสุดเมื่อข้อมูลเยอะเกินกำหนด
  var truncated = false;
  if (out.length > MAX_PULL_LOGS) {
    out = out.slice(out.length - MAX_PULL_LOGS);
    truncated = true;
  }

  return json_({ ok: true, logs: out, truncated: truncated });
}

function normalizeDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return str_(v).trim();
}

function formatClock_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'HH:mm:ss');
  }
  return str_(v).trim();
}

// ---------------------------------------------------------------- admin writes

/** บันทึกพิกัดจุดตรวจที่สำรวจมา — เฉพาะผู้ดูแล */
function handleSaveCheckpoints_(body) {
  if (!keyOk_(body.key)) return denied_();

  var list = body.checkpoints || [];
  if (!list.length) return json_({ ok: false, error: 'ไม่มีข้อมูลจุดตรวจส่งมา' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'ระบบกำลังบันทึกรายการอื่นอยู่ กรุณาลองใหม่' });
  }

  try {
    var sh = sheet_(SHEET.CHECKPOINTS, CHECKPOINT_HEADERS);
    var rows = list.map(function (c) {
      return [
        str_(c.checkpoint_id).trim(),
        str_(c.name),
        str_(c.zone),
        c.lat === null || c.lat === undefined ? '' : c.lat,
        c.lng === null || c.lng === undefined ? '' : c.lng,
        num_(c.radius_m) || 40,
        str_(c.active).toUpperCase() === 'NO' ? 'NO' : 'YES',
      ];
    });

    rewriteSheet_(sh, CHECKPOINT_HEADERS, rows);
    return json_({ ok: true, count: rows.length });
  } finally {
    lock.releaseLock();
  }
}

/** บันทึกรายชื่อเจ้าหน้าที่ — เฉพาะผู้ดูแล */
function handleSaveGuards_(body) {
  if (!keyOk_(body.key)) return denied_();

  var list = body.guards || [];
  if (!list.length) return json_({ ok: false, error: 'ไม่มีรายชื่อส่งมา' });

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return json_({ ok: false, error: 'ระบบกำลังบันทึกรายการอื่นอยู่ กรุณาลองใหม่' });
  }

  try {
    var sh = sheet_(SHEET.GUARDS, GUARD_HEADERS);
    var rows = list.map(function (g) {
      return [
        str_(g.guard_id).trim(),
        str_(g.name),
        str_(g.active).toUpperCase() === 'NO' ? 'NO' : 'YES',
      ];
    });

    rewriteSheet_(sh, GUARD_HEADERS, rows);
    return json_({ ok: true, count: rows.length });
  } finally {
    lock.releaseLock();
  }
}

/** เขียนทับทั้งแท็บ (ยกเว้นหัวตาราง) ด้วยข้อมูลชุดใหม่ */
function rewriteSheet_(sh, headers, rows) {
  var lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }
  if (rows.length) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

// ---------------------------------------------------------------- setup helper

/**
 * ทดสอบการแจ้งเตือน Discord — เปิดตัวแก้ไข Apps Script แล้วกด Run ที่ฟังก์ชันนี้
 *
 * ทำสองอย่างพร้อมกัน
 *   1. ครั้งแรกที่รัน Google จะขอสิทธิ์ "เชื่อมต่อบริการภายนอก" ให้กดอนุญาต
 *      ถ้าไม่ทำขั้นนี้ UrlFetchApp จะถูกปฏิเสธ และข้อความจะไม่เข้าห้องแชทเลย
 *      แม้ตั้งค่าทุกอย่างถูกต้องแล้ว
 *   2. ยิงข้อความทดสอบจริงหนึ่งข้อความ แล้วบอกผลใน Execution log
 */
function testDiscordNow() {
  var cfg = readConfig_();
  var ok = notifyDiscord_([{
    checkpointId: 'TEST',
    checkpointName: 'ทดสอบระบบแจ้งเตือน',
    zone: '-',
    guard: '(ทดสอบ)',
    round: '-',
    time: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'),
    distance: '',
    note: 'ข้อความนี้ส่งจากปุ่มทดสอบ ไม่ใช่เหตุการณ์จริง',
    mapsLink: '',
    reasons: ['ทดสอบการเชื่อมต่อ'],
    severe: false,
  }], cfg);

  var last = lastDiscord_();
  Logger.log(ok ? 'ส่งสำเร็จ — ไปดูข้อความในห้องแชท Discord ได้เลย'
                : 'ส่งไม่สำเร็จ: ' + (last ? last.reason : 'ไม่ทราบสาเหตุ'));
  return last;
}

/**
 * รันครั้งเดียวจากตัวแก้ไข Apps Script เพื่อสร้างแท็บทั้งหมดพร้อมหัวตาราง
 * และใส่ค่าตั้งต้นในแท็บ Config ให้
 */
function setupSheets() {
  sheet_(SHEET.LOGS, LOG_HEADERS);
  sheet_(SHEET.CHECKPOINTS, CHECKPOINT_HEADERS);
  sheet_(SHEET.ROUNDS, ROUND_HEADERS);
  sheet_(SHEET.GUARDS, GUARD_HEADERS);

  var cfgSheet = sheet_(SHEET.CONFIG, CONFIG_HEADERS);
  if (cfgSheet.getLastRow() < 2) {
    cfgSheet.getRange(2, 1, 12, 2).setValues([
      ['DASH_KEY', ''],
      // ตั้งให้ตรงกับ env var PUSH_TOKEN ของ Cloudflare Worker
      // เว้นว่าง = ไม่ตรวจโทเคน (ใครที่รู้ URL /exec ก็ส่งข้อมูลเข้ามาได้)
      ['PUSH_TOKEN', ''],
      ['SITE_NAME', 'CPF โรงงานอาหารสัตว์ ธารเกษม สระบุรี'],
      ['DOC_CODE', 'FM-SEC-01 Rev.00'],
      ['DEFAULT_RADIUS_M', 40],
      ['MAX_ACCURACY_M', 60],
      ['BLOCK_OUT_OF_RANGE', 'TRUE'],
      ['ALLOW_OVERRIDE', 'TRUE'],
      ['DUPLICATE_WINDOW_MIN', 20],
      ['SPEED_FLAG_KMH', 25],
      // ลิงก์ webhook ของห้องแชท Discord — เว้นว่าง = ไม่แจ้งเตือน
      // เอามาจาก Discord: ตั้งค่าห้อง > Integrations > Webhooks > New Webhook > Copy URL
      ['DISCORD_WEBHOOK', ''],
      // ABNORMAL = แจ้งเฉพาะที่ผิดปกติ | ALL = แจ้งทุกครั้ง | OFF = ปิด
      ['DISCORD_NOTIFY', 'ABNORMAL'],
    ]);
  }

  var roundsSheet = sheet_(SHEET.ROUNDS, ROUND_HEADERS);
  if (roundsSheet.getLastRow() < 2) {
    roundsSheet.getRange(2, 1, 6, 4).setValues([
      ['R1', 'รอบ 1 (00:00)', '00:00', '04:00'],
      ['R2', 'รอบ 2 (04:00)', '04:00', '08:00'],
      ['R3', 'รอบ 3 (08:00)', '08:00', '12:00'],
      ['R4', 'รอบ 4 (12:00)', '12:00', '16:00'],
      ['R5', 'รอบ 5 (16:00)', '16:00', '20:00'],
      ['R6', 'รอบ 6 (20:00)', '20:00', '00:00'],
    ]);
  }
}
