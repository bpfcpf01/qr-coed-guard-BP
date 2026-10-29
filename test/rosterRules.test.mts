/**
 * เทสต์กฎการเพิ่ม/ลบจุดตรวจและรายชื่อ (src/services/rosterRules.ts)
 *
 * เน้นข้อที่พลาดแล้วเสียหายจริง:
 *   - รหัสจุดตรวจต้องไม่ถูกใช้ซ้ำ ไม่งั้นสติกเกอร์ QR เดิมจะชี้ผิดจุด
 *   - ห้ามลบถาวรของที่เคยมีบันทึกอ้างถึง ไม่งั้นรายงานย้อนหลังพัง
 *
 * รันด้วย: npm run test:roster
 */
import {
  nextId, nextCheckpointId, nextGuardId,
  checkpointUsageCount, guardUsageCount,
  validateCheckpoints, validateGuards, canHardDelete,
  summarizeChanges, describeChanges, type DiffRow,
} from '../src/services/rosterRules.ts';
import type { Checkpoint, Guard, LogEntry } from '../src/types.ts';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${extra}`); }
};

const cp = (id: string, o: Partial<Checkpoint> = {}): Checkpoint => ({
  checkpoint_id: id, name: 'จุด ' + id, zone: 'โรงงาน',
  lat: 14.78, lng: 100.8, radius_m: 40, active: 'YES', ...o,
});
const gd = (id: string, name: string, active: 'YES' | 'NO' = 'YES'): Guard =>
  ({ guard_id: id, name, active });
const log = (o: Partial<LogEntry>): LogEntry => ({
  id: 'L', timestamp: '', date: '', time: '', round: 'R1',
  checkpoint_id: '', checkpoint_name: '', zone: '', guard: '', status: 'ปกติ',
  note: '', lat: null, lng: null, accuracy_m: null, distance_m: '',
  geo_result: 'IN_RANGE', flags: '', device_id: '', photo_url: '', maps_link: '', ...o,
} as LogEntry);

console.log('\n== 1. ออกรหัสใหม่ ต้องนับต่อจากเลขสูงสุด ==');
check('ต่อจากรายการเดิม', nextCheckpointId([cp('CP01'), cp('CP02')]) === 'CP03');
check('รายการว่าง = เริ่มที่ 01', nextCheckpointId([]) === 'CP01');
check('รหัสเจ้าหน้าที่ก็เช่นกัน', nextGuardId([gd('G01', 'ก'), gd('G02', 'ข')]) === 'G03');
check('เลขเกินสองหลักยังทำงาน', nextId(['CP99'], 'CP') === 'CP100');
check('ข้ามรหัสที่ผิดรูปแบบ', nextId(['CPxx', 'CP04'], 'CP') === 'CP05');

console.log('\n== 2. ห้ามใช้รหัสเดิมซ้ำ แม้จะมีเลขว่างตรงกลาง ==');
// สติกเกอร์ QR ที่ติดผนังฝัง ?cp=CP02 ไว้ ถ้าจุดใหม่ได้ CP02 ซ้ำ สติกเกอร์เดิมจะชี้ผิดจุด
check('ลบ CP02 ไปแล้ว จุดใหม่ต้องไม่ได้ CP02',
  nextCheckpointId([cp('CP01'), cp('CP03')]) === 'CP04');
check('ลบตัวท้ายไปแล้วก็ยังไม่ใช้ซ้ำ… (นับจากที่เหลือ)',
  nextCheckpointId([cp('CP01'), cp('CP02')]) === 'CP03');

console.log('\n== 3. นับการใช้งานจากบันทึก ==');
const logs = [
  log({ checkpoint_id: 'CP01', guard: 'สมชาย' }),
  log({ checkpoint_id: 'CP01', guard: 'สมหญิง' }),
  log({ checkpoint_id: 'CP02', guard: 'สมชาย' }),
];
check('นับจุดตรวจถูก', checkpointUsageCount(logs, 'CP01') === 2);
check('จุดที่ไม่เคยใช้ = 0', checkpointUsageCount(logs, 'CP09') === 0);
check('นับผู้ตรวจถูก (เทียบด้วยชื่อ)', guardUsageCount(logs, 'สมชาย') === 2);
check('คนที่ไม่เคยตรวจ = 0', guardUsageCount(logs, 'สมศรี') === 0);
check('ชื่อว่างไม่ไปนับมั่ว', guardUsageCount(logs, '  ') === 0);

console.log('\n== 4. ลบถาวรได้เฉพาะของที่ไม่เคยใช้ ==');
check('เคยใช้แล้ว = ลบไม่ได้', canHardDelete(3, true).ok === false);
check('บอกจำนวนที่อ้างถึง', (canHardDelete(3, true).error || '').includes('3 รายการ'));
check('ไม่เคยใช้ + ดึงบันทึกแล้ว = ลบได้', canHardDelete(0, true).ok === true);
check('ยังไม่ได้ดึงบันทึก = ยังลบไม่ได้', canHardDelete(0, false).ok === false);
check('บอกให้ไปดึงข้อมูลก่อน', (canHardDelete(0, false).error || '').includes('ดึงบันทึก'));

console.log('\n== 5. ตรวจความถูกต้องก่อนบันทึกจุดตรวจ ==');
check('ปกติผ่าน', validateCheckpoints([cp('CP01'), cp('CP02')]).ok === true);
check('ว่างเปล่าไม่ผ่าน', validateCheckpoints([]).ok === false);
check('รหัสซ้ำไม่ผ่าน', validateCheckpoints([cp('CP01'), cp('CP01')]).ok === false);
check('ชื่อว่างไม่ผ่าน', validateCheckpoints([cp('CP01', { name: '  ' })]).ok === false);
check('รัศมีน้อยเกินไม่ผ่าน', validateCheckpoints([cp('CP01', { radius_m: 1 })]).ok === false);
check('รัศมีมากเกินไม่ผ่าน', validateCheckpoints([cp('CP01', { radius_m: 9999 })]).ok === false);
check('รัศมีขอบล่างผ่าน', validateCheckpoints([cp('CP01', { radius_m: 5 })]).ok === true);
check('จุดที่ยังไม่มีพิกัดยังบันทึกได้ (ไว้ไปสำรวจทีหลัง)',
  validateCheckpoints([cp('CP01', { lat: null, lng: null })]).ok === true);

console.log('\n== 6. ตรวจความถูกต้องก่อนบันทึกรายชื่อ ==');
check('ปกติผ่าน', validateGuards([gd('G01', 'สมชาย'), gd('G02', 'สมหญิง')]).ok === true);
check('ชื่อซ้ำไม่ผ่าน', validateGuards([gd('G01', 'สมชาย'), gd('G02', 'สมชาย')]).ok === false);
check('บอกว่าใครซ้ำกับใคร',
  (validateGuards([gd('G01', 'สมชาย'), gd('G02', 'สมชาย')]).error || '').includes('G01'));
check('รหัสซ้ำไม่ผ่าน', validateGuards([gd('G01', 'ก'), gd('G01', 'ข')]).ok === false);
check('ชื่อว่างไม่ผ่าน', validateGuards([gd('G01', '   ')]).ok === false);
check('ชื่อต่างกันแต่เว้นวรรคต่างกันถือว่าคนละคน',
  validateGuards([gd('G01', 'สมชาย'), gd('G02', 'สมชาย ก')]).ok === true);
check('คนที่ปิดใช้งานก็ยังต้องมีชื่อ', validateGuards([gd('G01', '', 'NO')]).ok === false);

console.log('\n== 7. สรุปการเปลี่ยนแปลงก่อนบันทึก (กันกดผิด) ==');
const row = (id: string, fp: string, active: 'YES' | 'NO' = 'YES'): DiffRow =>
  ({ id, label: id, active, fingerprint: fp });

const base = [row('CP01', 'a'), row('CP02', 'b'), row('CP03', 'c')];

check('ไม่แก้อะไรเลย = total 0', summarizeChanges(base, base).total === 0);
check('ไม่แก้อะไรเลย = ไม่อันตราย', summarizeChanges(base, base).destructive === false);

const addOne = summarizeChanges(base, [...base, row('CP04', 'd')]);
check('เพิ่มหนึ่งแถว', addOne.added.length === 1 && addOne.total === 1);
check('เพิ่มอย่างเดียวไม่อันตราย', addOne.destructive === false);

const delOne = summarizeChanges(base, base.slice(0, 2));
check('ลบหนึ่งแถว', delOne.removed.length === 1 && delOne.removed[0] === 'CP03');
check('การลบถือว่าอันตราย', delOne.destructive === true);

const editOne = summarizeChanges(base, [row('CP01', 'zzz'), base[1], base[2]]);
check('แก้ค่าในแถว', editOne.edited.length === 1 && editOne.total === 1);
check('การแก้ค่าเฉย ๆ ไม่อันตราย', editOne.destructive === false);

const offOne = summarizeChanges(base, [row('CP01', 'a', 'NO'), base[1], base[2]]);
check('ปิดใช้งาน', offOne.deactivated.length === 1);
check('สลับเปิด/ปิดไม่ถูกนับซ้ำเป็นการแก้ไข', offOne.edited.length === 0, JSON.stringify(offOne));
check('การปิดใช้งานถือว่าอันตราย', offOne.destructive === true);

const onAgain = summarizeChanges([row('CP01', 'a', 'NO')], [row('CP01', 'a', 'YES')]);
check('เปิดใช้งานกลับ', onAgain.reactivated.length === 1);
check('การเปิดกลับไม่อันตราย', onAgain.destructive === false);

const mixed = summarizeChanges(base, [row('CP01', 'zzz'), row('CP04', 'd')]);
check('นับรวมหลายอย่างพร้อมกัน', mixed.total === 4, JSON.stringify(mixed));
check('ข้อความสรุปอ่านรู้เรื่อง',
  describeChanges(mixed) === 'เพิ่ม 1 · ลบ 2 · แก้ไข 1', describeChanges(mixed));
check('ไม่มีอะไรเปลี่ยน = ข้อความว่าง', describeChanges(summarizeChanges(base, base)) === '');

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
process.exit(fail ? 1 : 0);
