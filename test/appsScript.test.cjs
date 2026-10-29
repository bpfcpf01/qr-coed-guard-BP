/**
 * เทสต์พฤติกรรมฝั่งเซิร์ฟเวอร์ของ src/apps-script/Code.gs
 *
 * Apps Script รันบน Google เท่านั้น จึงจำลอง SpreadsheetApp/Utilities/LockService
 * ไว้ใน appsScriptHarness.cjs แล้วโหลด Code.gs เข้ามารันตรง ๆ
 * จุดประสงค์หลักคือกันไม่ให้การตรวจพิกัดฝั่งเซิร์ฟเวอร์หายไปโดยไม่มีใครรู้
 *
 * รันด้วย: npm run test:appsscript
 */
const { sheets, FakeSheet, urlFetch, scriptProps } = require('./appsScriptHarness.cjs');
// โหลด Code.gs เข้า global scope (ไม่ใช่ module scope) ให้เหมือน Apps Script
const vm = require('vm'), fs = require('fs'), path = require('path');
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'apps-script', 'Code.gs'), 'utf8'),
  { filename: 'Code.gs' },
);

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};
const call = (body) => JSON.parse(doPost({ postData: { contents: JSON.stringify(body) } }).getContent());

function seedSheet(cfgRows) {
  sheets.clear();
  const cps = new FakeSheet('Checkpoints');
  cps.data = [
    ['checkpoint_id','name','zone','lat','lng','radius_m','active'],
    ['CP01','จุดที่ 1 โรงอาหาร','หน้าโรงงาน',14.788950,100.800350,40,'YES'],
    ['CP09','จุดปิดใช้งาน','โรงงาน',14.790750,100.801980,50,'NO'],
    ['CP20','จุดไม่มีพิกัด','โรงงาน','','',40,'YES'],
  ];
  sheets.set('Checkpoints', cps);

  const rounds = new FakeSheet('Rounds');
  rounds.data = [
    ['round_id','label','start','end'],
    ['R1','รอบ 1','00:00','04:00'], ['R2','รอบ 2','04:00','08:00'],
    ['R3','รอบ 3','08:00','12:00'], ['R4','รอบ 4','12:00','16:00'],
    ['R5','รอบ 5','16:00','20:00'], ['R6','รอบ 6','20:00','00:00'],
  ];
  sheets.set('Rounds', rounds);

  const cfg = new FakeSheet('Config');
  cfg.data = [['key','value'], ...cfgRows];
  sheets.set('Config', cfg);

  const logs = new FakeSheet('Logs');
  logs.data = [['id','timestamp','date','time','round','checkpoint_id','checkpoint_name','zone','guard','status','note','lat','lng','accuracy_m','distance_m','geo_result','flags','device_id','photo_url','maps_link']];
  sheets.set('Logs', logs);
}
const H = sheets;
const logRow = (i = 1) => {
  const s = H.get('Logs');
  const head = s.data[0];
  const row = s.data[i] || [];
  return Object.fromEntries(head.map((h, c) => [h, row[c]]));
};

console.log('\n== 1. เครื่องโกหกว่าอยู่ในรัศมี — เซิร์ฟเวอร์ต้องคำนวณใหม่ ==');
seedSheet([['DASH_KEY','secret123'],['MAX_ACCURACY_M',60],['DEFAULT_RADIUS_M',40]]);
let r = call({ action: 'push', logs: [{
  id: 'L1', timestamp: new Date(Date.now() - 3600000).toISOString(),
  date: '1999-01-01', time: '00:00:00', round: 'R1',
  checkpoint_id: 'CP01', checkpoint_name: 'ชื่อปลอม', zone: 'โซนปลอม',
  guard: 'ก', status: 'ปกติ', note: '',
  lat: 14.79500, lng: 100.80800,           // ~1 กม. จาก CP01
  accuracy_m: 10, distance_m: 5,            // อ้างว่าห่าง 5 ม.
  geo_result: 'IN_RANGE', flags: '', device_id: 'DEV_x',
}]});
let L = logRow();
check('accepted', r.ok && r.accepted.includes('L1'));
check('geo_result ถูกคำนวณใหม่เป็น OUT_OF_RANGE', L.geo_result === 'OUT_OF_RANGE', `got ${L.geo_result}`);
check('distance_m เป็นระยะจริง (>500 ม.)', Number(L.distance_m) > 500, `got ${L.distance_m}`);
check('flags มี OUT_OF_RANGE', String(L.flags).includes('OUT_OF_RANGE'), `got ${L.flags}`);
check('checkpoint_name เอาจากชีต ไม่ใช่จากเครื่อง', L.checkpoint_name === 'จุดที่ 1 โรงอาหาร', `got ${L.checkpoint_name}`);
check('zone เอาจากชีต', L.zone === 'หน้าโรงงาน', `got ${L.zone}`);
check('date ถูกคำนวณใหม่ ไม่ใช่ 1999-01-01', L.date !== '1999-01-01', `got ${L.date}`);
check('maps_link สร้างจากพิกัดจริง', String(L.maps_link).includes('14.795'), `got ${L.maps_link}`);

console.log('\n== 2. บันทึกที่ซื่อสัตย์ ต้องผ่านเป็น IN_RANGE ==');
seedSheet([['DASH_KEY','secret123']]);
r = call({ action: 'push', logs: [{
  id: 'L2', timestamp: new Date(Date.now() - 60000).toISOString(),
  checkpoint_id: 'CP01', guard: 'ข', status: 'ปกติ', note: 'ปกติดี',
  lat: 14.788960, lng: 100.800360, accuracy_m: 8, flags: '', device_id: 'DEV_y',
}]});
L = logRow();
check('geo_result = IN_RANGE', L.geo_result === 'IN_RANGE', `got ${L.geo_result}`);
check('ไม่มี flags', String(L.flags) === '', `got "${L.flags}"`);
check('distance_m น้อยกว่ารัศมี', Number(L.distance_m) <= 40, `got ${L.distance_m}`);
check('round ถูกเติมให้', String(L.round).length > 0, `got ${L.round}`);

console.log('\n== 3. ตั้งเวลาเครื่องเป็นอนาคต ต้องติดธง TIME_SKEW ==');
seedSheet([['DASH_KEY','secret123']]);
call({ action: 'push', logs: [{
  id: 'L3', timestamp: new Date(Date.now() + 86400000).toISOString(),
  checkpoint_id: 'CP01', guard: 'ค', status: 'ปกติ',
  lat: 14.788960, lng: 100.800360, accuracy_m: 8, flags: '', device_id: 'DEV_z',
}]});
L = logRow();
check('flags มี TIME_SKEW', String(L.flags).includes('TIME_SKEW'), `got ${L.flags}`);
check('timestamp ถูกแทนด้วยเวลาเซิร์ฟเวอร์', !String(L.timestamp).startsWith(new Date(Date.now() + 86400000).toISOString().slice(0, 10)), `got ${L.timestamp}`);

console.log('\n== 4. flag ของเครื่อง (OVERRIDE/SPEED) ต้องถูกเก็บไว้ ==');
seedSheet([['DASH_KEY','secret123']]);
call({ action: 'push', logs: [{
  id: 'L4', timestamp: new Date().toISOString(), checkpoint_id: 'CP01', guard: 'ง', status: 'ปกติ',
  lat: 14.788960, lng: 100.800360, accuracy_m: 8,
  flags: 'IN_RANGE,OVERRIDE,SPEED_42', device_id: 'DEV_w',
}]});
L = logRow();
check('เก็บ OVERRIDE ไว้', String(L.flags).includes('OVERRIDE'), `got ${L.flags}`);
check('เก็บ SPEED_42 ไว้', String(L.flags).includes('SPEED_42'), `got ${L.flags}`);
check('ทิ้ง IN_RANGE ที่เครื่องอ้าง', !String(L.flags).includes('IN_RANGE'), `got ${L.flags}`);

console.log('\n== 5. จุดตรวจที่ไม่มีในชีต / ปิดใช้งาน / ไม่มีพิกัด ==');
seedSheet([['DASH_KEY','secret123']]);
call({ action: 'push', logs: [
  { id: 'A', timestamp: new Date().toISOString(), checkpoint_id: 'CP99', guard: 'x', lat: 14.7, lng: 100.8, accuracy_m: 8, flags: '' },
  { id: 'B', timestamp: new Date().toISOString(), checkpoint_id: 'CP09', guard: 'x', lat: 14.790750, lng: 100.801980, accuracy_m: 8, flags: '' },
  { id: 'C', timestamp: new Date().toISOString(), checkpoint_id: 'CP20', guard: 'x', lat: 14.7, lng: 100.8, accuracy_m: 8, flags: '' },
]});
check('จุดที่ไม่มีในชีต ติดธง UNVERIFIED_CP', String(logRow(1).flags).includes('UNVERIFIED_CP'), `got ${logRow(1).flags}`);
check('จุดที่ปิดใช้งาน ติดธง CP_INACTIVE', String(logRow(2).flags).includes('CP_INACTIVE'), `got ${logRow(2).flags}`);
check('จุดที่ไม่มีพิกัด ได้ NO_REFERENCE', logRow(3).geo_result === 'NO_REFERENCE', `got ${logRow(3).geo_result}`);

console.log('\n== 6. PUSH_TOKEN ==');
seedSheet([['DASH_KEY','secret123'],['PUSH_TOKEN','tok-abc']]);
r = call({ action: 'push', logs: [{ id: 'T1', timestamp: new Date().toISOString(), checkpoint_id: 'CP01', guard: 'x', lat: 14.78896, lng: 100.80036, accuracy_m: 8, flags: '' }] });
check('ไม่มีโทเคน = ถูกปฏิเสธ', r.ok === false, JSON.stringify(r));
check('ไม่มีแถวถูกเขียน', H.get('Logs').data.length === 1);
r = call({ action: 'push', token: 'tok-abc', logs: [{ id: 'T2', timestamp: new Date().toISOString(), checkpoint_id: 'CP01', guard: 'x', lat: 14.78896, lng: 100.80036, accuracy_m: 8, flags: '' }] });
check('โทเคนถูก = ผ่าน', r.ok === true, JSON.stringify(r));
seedSheet([['DASH_KEY','secret123']]);
r = call({ action: 'push', logs: [{ id: 'T3', timestamp: new Date().toISOString(), checkpoint_id: 'CP01', guard: 'x', lat: 14.78896, lng: 100.80036, accuracy_m: 8, flags: '' }] });
check('ไม่ได้ตั้ง PUSH_TOKEN = ยังรับได้ (ไม่พังของเดิม)', r.ok === true, JSON.stringify(r));

console.log('\n== 7. setDashKey ตั้งได้ครั้งเดียว ==');
seedSheet([['DASH_KEY',''],['SITE_NAME','x']]);
check('KEY_SET เป็น false ตอนยังไม่ตั้ง', call({ action: 'pullPublic' }).config.KEY_SET === false);
check('กุญแจสั้นเกินถูกปฏิเสธ', call({ action: 'setDashKey', key: 'abc' }).ok === false);
check('ตั้งครั้งแรกสำเร็จ', call({ action: 'setDashKey', key: 'newkey123' }).ok === true);
check('KEY_SET เป็น true หลังตั้ง', call({ action: 'pullPublic' }).config.KEY_SET === true);
check('ตั้งซ้ำถูกปฏิเสธ', call({ action: 'setDashKey', key: 'hijack999' }).ok === false);
check('verifyKey ผ่านด้วยกุญแจใหม่', call({ action: 'verifyKey', key: 'newkey123' }).ok === true);
check('verifyKey ไม่ผ่านด้วยกุญแจปลอม', call({ action: 'verifyKey', key: 'hijack999' }).ok === false);
check('pullPublic ไม่คืน DASH_KEY ออกไป', call({ action: 'pullPublic' }).config.DASH_KEY === undefined);

console.log('\n== 8. แจ้งเตือน Discord ==');
const HOOK = 'https://discord.com/api/webhooks/123456789/abcDEF-ghi_JKL';
// ต้องเป็นเวลาในอดีต เวลาอนาคตจะโดนติดธง TIME_SKEW แล้วกลายเป็นรายการผิดปกติ
const at = (minsAgo) => new Date(Date.now() - minsAgo * 60000).toISOString();
const scan = (o) => Object.assign({
  timestamp: at(1), checkpoint_id: 'CP01', guard: 'สมชาย', lat: 14.78896, lng: 100.80036,
  accuracy_m: 8, flags: '', status: 'ปกติ',
}, o);
const pushOne = (o) => call({ action: 'push', logs: [scan(o)] });
const sent = () => urlFetch.calls[0] && urlFetch.calls[0].payload;

// ตรวจปกติ ในโหมดเริ่มต้น ต้องเงียบ — ไม่งั้นห้องแชทจะท่วมวันละร้อยข้อความ
seedSheet([['DASH_KEY','k123456'],['DISCORD_WEBHOOK',HOOK]]);
urlFetch.reset();
pushOne({ id: 'D1' });
check('ตรวจปกติ = ไม่แจ้ง', urlFetch.calls.length === 0, JSON.stringify(urlFetch.calls));

// อยู่นอกรัศมี = ต้องแจ้ง
urlFetch.reset();
pushOne({ id: 'D2', lat: 14.8, lng: 100.82 });
check('นอกรัศมี = แจ้ง 1 ข้อความ', urlFetch.calls.length === 1);
check('ยิงไปที่ webhook ที่ตั้งไว้', urlFetch.calls[0] && urlFetch.calls[0].url === HOOK);
check('บอกเหตุว่าอยู่นอกรัศมี',
  JSON.stringify(sent()).includes('อยู่นอกรัศมีจุดตรวจ'), JSON.stringify(sent()));
check('ปิด mention กันข้อความ @everyone จากช่องหมายเหตุ',
  sent() && sent().allowed_mentions && sent().allowed_mentions.parse.length === 0);

// เจ้าหน้าที่แจ้งเหตุเอง แม้พิกัดผ่าน ก็ต้องแจ้ง
urlFetch.reset();
pushOne({ id: 'D3', status: 'พบสิ่งผิดปกติ', note: 'ประตูฝั่งตะวันตกไม่ได้ล็อก' });
check('เจ้าหน้าที่แจ้งเหตุ = แจ้งแม้พิกัดผ่าน', urlFetch.calls.length === 1);
check('ส่งหมายเหตุไปด้วย', JSON.stringify(sent()).includes('ประตูฝั่งตะวันตกไม่ได้ล็อก'));

// ส่งค้างจากออฟไลน์หลายรายการ = ต้องรวมเป็นข้อความเดียว ไม่ยิงรัวจนโดน rate limit
urlFetch.reset();
const many = [];
for (let i = 0; i < 12; i++) {
  many.push(scan({ id: 'B' + i, lat: 14.8, lng: 100.82, timestamp: at(i + 1) }));
}
call({ action: 'push', token: '', logs: many });
check('12 รายการค้าง = ยิงออกครั้งเดียว', urlFetch.calls.length === 1, `ยิง ${urlFetch.calls.length} ครั้ง`);
check('บอกจำนวนจริงครบ 12', JSON.stringify(sent()).includes('12 รายการ'));
check('ไม่เกินเพดาน 10 embed ของ Discord', sent() && sent().embeds.length <= 10);

// Discord ล่ม ต้องไม่ทำให้บันทึกที่เขียนลงชีตแล้วพัง
seedSheet([['DASH_KEY','k123456'],['DISCORD_WEBHOOK',HOOK]]);
urlFetch.reset();
urlFetch.fail = true;
r = pushOne({ id: 'D4', lat: 14.8, lng: 100.82 });
check('Discord ล่ม = บันทึกยังสำเร็จ', r.ok === true && r.written === 1, JSON.stringify(r));
check('แถวยังถูกเขียนลงชีต', H.get('Logs').data.length === 2);
urlFetch.fail = false;

// ลิงก์ผิดโดเมน = ห้ามส่งข้อมูลการเดินตรวจออกไป
seedSheet([['DASH_KEY','k123456'],['DISCORD_WEBHOOK','https://evil.example.com/api/webhooks/1/x']]);
urlFetch.reset();
pushOne({ id: 'D5', lat: 14.8, lng: 100.82 });
check('ลิงก์ไม่ใช่ของ Discord = ไม่ส่งออกไปเลย', urlFetch.calls.length === 0, JSON.stringify(urlFetch.calls));

// โหมด ALL = แจ้งทุกครั้งแบบระบบเดิม
seedSheet([['DASH_KEY','k123456'],['DISCORD_WEBHOOK',HOOK],['DISCORD_NOTIFY','ALL']]);
urlFetch.reset();
pushOne({ id: 'D6' });
check('โหมด ALL = ตรวจปกติก็แจ้ง', urlFetch.calls.length === 1);

// โหมด OFF = เงียบสนิท
seedSheet([['DASH_KEY','k123456'],['DISCORD_WEBHOOK',HOOK],['DISCORD_NOTIFY','OFF']]);
urlFetch.reset();
pushOne({ id: 'D7', lat: 14.8, lng: 100.82 });
check('โหมด OFF = ไม่แจ้งแม้ผิดปกติ', urlFetch.calls.length === 0);

// ห้ามหลุด webhook ออกทาง pullPublic ซึ่งเรียกได้โดยไม่ต้องมีกุญแจ
seedSheet([['DASH_KEY','k123456'],['DISCORD_WEBHOOK',HOOK]]);
const pub = call({ action: 'pullPublic' });
check('pullPublic ไม่คืนลิงก์ webhook', !JSON.stringify(pub).includes('abcDEF-ghi_JKL'), JSON.stringify(pub.config));
check('บอกแค่ว่าตั้งแล้ว', pub.config.DISCORD_SET === true);

console.log('\n== 9. บอกสาเหตุได้เมื่อแจ้งเตือนไม่เข้าห้องแชท ==');
const last = () => JSON.parse(scriptProps.get('DISCORD_LAST') || 'null');

// webhook ถูกลบไปแล้ว Discord ตอบ 404 — ต้องไม่นับว่าสำเร็จ
seedSheet([['DASH_KEY','k123456'],['DISCORD_WEBHOOK',HOOK]]);
scriptProps.clear(); urlFetch.reset(); urlFetch.code = 404;
r = pushOne({ id: 'E1', lat: 14.8, lng: 100.82 });
check('webhook ถูกลบ = ไม่นับว่าสำเร็จ', last() && last().ok === false, JSON.stringify(last()));
check('บอกว่า webhook ถูกลบหรือลิงก์ผิด', last() && last().reason.includes('webhook ถูกลบ'));
check('บันทึกผลตรวจยังลงชีตตามปกติ', r.ok === true && r.written === 1);

// โดน rate limit
scriptProps.clear(); urlFetch.reset(); urlFetch.code = 429;
pushOne({ id: 'E2', lat: 14.8, lng: 100.82 });
check('บอกว่าโดนจำกัดอัตราการส่ง', last() && last().reason.includes('429'));

// ส่งสำเร็จ
scriptProps.clear(); urlFetch.reset();
pushOne({ id: 'E3', lat: 14.8, lng: 100.82 });
check('ส่งสำเร็จ = บันทึกว่า ok', last() && last().ok === true, JSON.stringify(last()));

// ยังไม่ได้ตั้ง webhook
seedSheet([['DASH_KEY','k123456']]);
scriptProps.clear(); urlFetch.reset();
pushOne({ id: 'E4', lat: 14.8, lng: 100.82 });
check('บอกว่ายังไม่ได้ตั้ง DISCORD_WEBHOOK', last() && last().reason.includes('ยังไม่ได้ตั้ง'));

// ลิงก์ผิดโดเมน
seedSheet([['DASH_KEY','k123456'],['DISCORD_WEBHOOK','https://evil.example.com/x']]);
scriptProps.clear(); urlFetch.reset();
pushOne({ id: 'E5', lat: 14.8, lng: 100.82 });
check('บอกว่าลิงก์ไม่ใช่ของ Discord', last() && last().reason.includes('ไม่ใช่ลิงก์ webhook'));

// ยังไม่ได้อนุญาตสิทธิ์เชื่อมต่อภายนอก (UrlFetchApp โยน error พร้อม URL ติดมา)
seedSheet([['DASH_KEY','k123456'],['DISCORD_WEBHOOK',HOOK]]);
scriptProps.clear(); urlFetch.reset(); urlFetch.fail = true;
pushOne({ id: 'E6', lat: 14.8, lng: 100.82 });
check('จดสาเหตุตอน UrlFetchApp พัง', last() && last().ok === false && last().reason.length > 0);
check('ไม่เก็บลิงก์ webhook ไว้ในข้อความสาเหตุ',
  last() && !last().reason.includes('hZElIZ') && !last().reason.includes('abcDEF-ghi_JKL'),
  JSON.stringify(last()));
urlFetch.fail = false;

// /__health อ่านผลนี้ได้ผ่าน pullPublic โดยไม่ต้องใช้กุญแจ
scriptProps.clear(); urlFetch.reset();
pushOne({ id: 'E7', lat: 14.8, lng: 100.82 });
const pub2 = call({ action: 'pullPublic' });
check('pullPublic คืนผลการส่งครั้งล่าสุด', pub2.config.DISCORD_LAST && pub2.config.DISCORD_LAST.ok === true);
check('และยังไม่หลุดลิงก์ webhook', !JSON.stringify(pub2).includes('hZElIZ'));

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
