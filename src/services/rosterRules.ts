/**
 * กฎการเพิ่ม/ลบจุดตรวจและรายชื่อ รปภ.
 *
 * แยกออกมาเป็นฟังก์ชันล้วน ๆ ไม่แตะ localStorage หรือหน้าจอ เพื่อให้เทสต์ได้ตรง ๆ
 * ตรรกะพวกนี้พลาดแล้วเสียหายจริง จึงไม่ควรฝังอยู่ในคอมโพเนนต์
 */

// import type เท่านั้น เพื่อให้ไฟล์นี้ไม่มี import ที่ต้อง resolve ตอนรันจริง
// ทำให้เทสต์เรียกด้วย node ตรง ๆ ได้ โดยไม่ต้องตั้ง bundler
import type { Checkpoint, Guard, LogEntry } from '../types';

/** รูปแบบรหัส: ตัวอักษรนำหน้า + เลขสองหลักขึ้นไป เช่น CP01, G07 */
function numberOf(id: string, prefix: string): number {
  const m = new RegExp(`^${prefix}(\\d+)$`).exec(String(id || '').trim());
  return m ? Number(m[1]) : NaN;
}

/**
 * ออกรหัสใหม่โดยนับต่อจากเลขสูงสุดที่เคยใช้ **ห้ามเติมเลขที่ว่างอยู่ตรงกลาง**
 *
 * เหตุผลสำคัญสำหรับจุดตรวจ: สติกเกอร์ QR ที่ติดหน้างานฝัง ?cp=CP05 ไว้ในตัว
 * ถ้าลบ CP05 แล้วจุดใหม่ได้รหัส CP05 ซ้ำ สติกเกอร์เดิมที่ยังติดอยู่ที่ผนัง
 * จะชี้ไปยังจุดตรวจคนละที่ทันที โดยไม่มีอะไรฟ้อง กลายเป็นบันทึกผิดจุดทั้งระบบ
 */
export function nextId(existingIds: string[], prefix: string, pad = 2): string {
  let max = 0;
  for (const id of existingIds) {
    const n = numberOf(id, prefix);
    if (!isNaN(n) && n > max) max = n;
  }
  return prefix + String(max + 1).padStart(pad, '0');
}

export function nextCheckpointId(checkpoints: Checkpoint[]): string {
  return nextId(checkpoints.map((c) => c.checkpoint_id), 'CP');
}

export function nextGuardId(guards: Guard[]): string {
  return nextId(guards.map((g) => g.guard_id), 'G');
}

/** จุดตรวจนี้เคยมีบันทึกการตรวจไหม — ถ้าเคย ห้ามลบถาวร */
export function checkpointUsageCount(logs: LogEntry[], checkpointId: string): number {
  const id = String(checkpointId || '').trim();
  if (!id) return 0;
  return logs.filter((l) => String(l.checkpoint_id || '').trim() === id).length;
}

/**
 * เจ้าหน้าที่คนนี้เคยมีบันทึกการตรวจไหม
 * บันทึกเก็บ "ชื่อ" ไม่ใช่รหัส จึงต้องเทียบด้วยชื่อ
 */
export function guardUsageCount(logs: LogEntry[], guardName: string): number {
  const name = String(guardName || '').trim();
  if (!name) return 0;
  return logs.filter((l) => String(l.guard || '').trim() === name).length;
}

export interface ValidationResult {
  ok: boolean;
  error?: string;
}

/** ตรวจก่อนบันทึกจุดตรวจ — รหัสห้ามซ้ำ ชื่อห้ามว่าง รัศมีต้องสมเหตุผล */
export function validateCheckpoints(rows: Checkpoint[]): ValidationResult {
  if (!rows.length) return { ok: false, error: 'ต้องมีจุดตรวจอย่างน้อย 1 จุด' };

  const seenId = new Set<string>();
  for (const c of rows) {
    const id = String(c.checkpoint_id || '').trim();
    if (!id) return { ok: false, error: 'มีจุดตรวจที่ยังไม่มีรหัส' };
    if (seenId.has(id)) return { ok: false, error: `รหัสจุดตรวจซ้ำกัน: ${id}` };
    seenId.add(id);

    if (!String(c.name || '').trim()) {
      return { ok: false, error: `${id} ยังไม่ได้ตั้งชื่อจุดตรวจ` };
    }
    const r = Number(c.radius_m);
    if (!isFinite(r) || r < 5 || r > 500) {
      return { ok: false, error: `${id} รัศมีต้องอยู่ระหว่าง 5–500 เมตร (ตอนนี้ ${c.radius_m})` };
    }
  }
  return { ok: true };
}

/** ตรวจก่อนบันทึกรายชื่อ — รหัสห้ามซ้ำ ชื่อห้ามว่างและห้ามซ้ำ */
export function validateGuards(rows: Guard[]): ValidationResult {
  if (!rows.length) return { ok: false, error: 'ต้องมีรายชื่ออย่างน้อย 1 คน' };

  const seenId = new Set<string>();
  // บันทึกการตรวจเก็บ "ชื่อ" ไม่ใช่รหัส ถ้าชื่อซ้ำกันจะแยกไม่ออกว่าใครเป็นคนตรวจ
  const seenName = new Map<string, string>();

  for (const g of rows) {
    const id = String(g.guard_id || '').trim();
    if (!id) return { ok: false, error: 'มีรายชื่อที่ยังไม่มีรหัส' };
    if (seenId.has(id)) return { ok: false, error: `รหัสเจ้าหน้าที่ซ้ำกัน: ${id}` };
    seenId.add(id);

    const name = String(g.name || '').trim();
    if (!name) return { ok: false, error: `${id} ยังไม่ได้กรอกชื่อ` };

    const dup = seenName.get(name);
    if (dup) {
      return { ok: false, error: `ชื่อซ้ำกันระหว่าง ${dup} กับ ${id} — รายงานจะแยกไม่ออกว่าใครตรวจ` };
    }
    seenName.set(name, id);
  }
  return { ok: true };
}

/**
 * ลบถาวรได้หรือไม่
 *
 * ยอมให้ลบเฉพาะรายการที่ยังไม่เคยมีบันทึกอ้างถึง เพราะบันทึกผลตรวจเก็บ
 * checkpoint_id และชื่อผู้ตรวจไว้ ถ้าลบตัวที่เคยใช้งานแล้ว รายงานย้อนหลัง
 * จะอ้างถึงของที่ไม่มีอยู่ ทำให้ตรวจสอบตามเอกสาร FM-SEC-01 ไม่ได้
 *
 * `logsSynced` บอกว่าชุดบันทึกที่ใช้ตรวจมาจากชีตแล้วหรือยัง ถ้ายัง แปลว่า
 * เห็นแค่บันทึกในเครื่องนี้ ซึ่งอาจไม่ครบ จึงยังไม่ควรให้ลบถาวร
 */
export function canHardDelete(usageCount: number, logsSynced: boolean): ValidationResult {
  if (usageCount > 0) {
    return {
      ok: false,
      error: `มีบันทึกการตรวจอ้างถึงอยู่ ${usageCount} รายการ — ปิดใช้งานแทนการลบ`,
    };
  }
  if (!logsSynced) {
    return {
      ok: false,
      error: 'ยังไม่ได้ดึงบันทึกจากชีต จึงยืนยันไม่ได้ว่าไม่เคยถูกใช้ — กดดึงข้อมูลก่อน',
    };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- กันกดผิด

/** รูปแบบกลางสำหรับเทียบก่อน/หลังแก้ ใช้ได้ทั้งจุดตรวจและรายชื่อ */
export interface DiffRow {
  id: string;
  /** ชื่อที่เอาไว้แสดงให้คนอ่าน เช่น "CP05 มุมโกดัง K2" */
  label: string;
  active: 'YES' | 'NO';
  /** ค่าทุกช่องที่แก้ได้ รวมเป็นสตริงเดียวเพื่อเทียบว่าต่างไหม */
  fingerprint: string;
}

export interface ChangeSummary {
  added: string[];
  removed: string[];
  edited: string[];
  deactivated: string[];
  reactivated: string[];
  total: number;
  /** true = มีการเปลี่ยนแปลงที่ทำให้ของหายไปจากหน้าจอ รปภ. ต้องถามยืนยันก่อน */
  destructive: boolean;
}

/**
 * เทียบรายการก่อน/หลังแก้ แล้วสรุปว่าจะเปลี่ยนอะไรบ้าง
 *
 * มีเพราะการกดบันทึกเขียนทับทั้งแท็บในชีต ถ้าเผลอลบแถวหรือปิดใช้งานผิดคน
 * จะรู้ตัวก็ต่อเมื่อของถูกเขียนทับไปแล้ว การสรุปให้ดูก่อนกดจึงเป็นด่านสุดท้าย
 */
export function summarizeChanges(before: DiffRow[], after: DiffRow[]): ChangeSummary {
  const prev = new Map(before.map((r) => [r.id, r]));
  const next = new Map(after.map((r) => [r.id, r]));

  const added: string[] = [];
  const removed: string[] = [];
  const edited: string[] = [];
  const deactivated: string[] = [];
  const reactivated: string[] = [];

  for (const row of after) {
    const old = prev.get(row.id);
    if (!old) {
      added.push(row.label);
      continue;
    }
    if (old.active !== row.active) {
      (row.active === 'NO' ? deactivated : reactivated).push(row.label);
    }
    // นับเป็น "แก้ไข" เฉพาะตอนที่ค่าอื่นเปลี่ยน ไม่ใช่แค่สลับเปิด/ปิด
    if (old.fingerprint !== row.fingerprint) edited.push(row.label);
  }

  for (const row of before) {
    if (!next.has(row.id)) removed.push(row.label);
  }

  const total = added.length + removed.length + edited.length +
    deactivated.length + reactivated.length;

  return {
    added, removed, edited, deactivated, reactivated, total,
    destructive: removed.length > 0 || deactivated.length > 0,
  };
}

/** ข้อความสรุปสั้น ๆ สำหรับแสดงบนแถบเตือน */
export function describeChanges(s: ChangeSummary): string {
  const parts: string[] = [];
  if (s.added.length) parts.push(`เพิ่ม ${s.added.length}`);
  if (s.removed.length) parts.push(`ลบ ${s.removed.length}`);
  if (s.edited.length) parts.push(`แก้ไข ${s.edited.length}`);
  if (s.deactivated.length) parts.push(`ปิดใช้งาน ${s.deactivated.length}`);
  if (s.reactivated.length) parts.push(`เปิดใช้งาน ${s.reactivated.length}`);
  return parts.join(' · ');
}
