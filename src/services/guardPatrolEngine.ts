/**
 * Guard Patrol Engine - Server logic simulator & Apps Script interface
 * Matches Code.gs and Report.gs precisely.
 */

import {
  Checkpoint,
  Round,
  Guard,
  SystemConfig,
  LogEntry,
  ScanPayload,
  SubmitScanResponse,
  DashboardData,
  ReportData,
  GeoResult,
  GridRow,
  GridCell,
  TrendItem,
  StatGroup,
  IssueItem,
} from '../types';
import {
  INITIAL_CHECKPOINTS,
  INITIAL_ROUNDS,
  INITIAL_GUARDS,
  INITIAL_CONFIG,
  generateSeedLogs,
} from '../data/initialData';
import { localDateStr } from '../utils/datetime';
import { validateCheckpoints, validateGuards } from './rosterRules';
import { sheetSync } from './sheetSync';

const STORAGE_KEYS = {
  CHECKPOINTS: 'cpf_patrol_cps',
  ROUNDS: 'cpf_patrol_rounds',
  GUARDS: 'cpf_patrol_guards',
  LOGS: 'cpf_patrol_logs',
  CONFIG: 'cpf_patrol_config',
};

// Safe localStorage access
function getStorageItem<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    return JSON.parse(item);
  } catch (e) {
    return fallback;
  }
}

/**
 * เขียนลงเครื่อง — คืน false เมื่อเขียนไม่สำเร็จ (เช่นพื้นที่เต็ม หรือโหมดส่วนตัว)
 *
 * ต้องคืนค่าให้ผู้เรียกรู้ ไม่ใช่กลืนไว้เฉย ๆ เพราะการเขียนบันทึกผลตรวจไม่สำเร็จ
 * แปลว่าข้อมูลหายโดยที่ รปภ. เห็นข้อความ "บันทึกเรียบร้อย" ตามปกติ
 */
function setStorageItem<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('localStorage error', e);
    return false;
  }
}

/**
 * จำนวนบันทึกที่เก็บไว้ในเครื่อง
 *
 * เครื่อง รปภ. ใช้ทุกวันโดยไม่มีใครมาล้างข้อมูล ถ้าปล่อยให้โตไปเรื่อย ๆ
 * localStorage (ราว 5 MB) จะเต็มในที่สุด แล้วบันทึกใหม่จะเขียนไม่ลง
 * ของเก่าอยู่บนชีตแล้ว เครื่องเก็บไว้เท่าที่ต้องใช้กันซ้ำ/ดูย้อนหลังพอ
 */
const MAX_LOCAL_LOGS = 2000;

/**
 * ข้อมูลตัวอย่างมีไว้ทดสอบตอนพัฒนาเท่านั้น
 *
 * ห้ามสร้างในเครื่องจริงเด็ดขาด เพราะ generateSeedLogs() จะปั้นบันทึกปลอม ~750 รายการ
 * (พร้อมชื่อผู้ตรวจ พิกัด และเหตุ OUT_OF_RANGE/OVERRIDE ที่ไม่เคยเกิดขึ้น) ทำให้
 *   1. แดชบอร์ดรายงานผลการเดินตรวจที่ไม่ได้เกิดขึ้นจริง ซึ่งเป็นเอกสารควบคุม FM-SEC-01
 *   2. ตัวกันสแกนซ้ำเทียบกับบันทึกปลอม แล้วบล็อกการบันทึกของจริงได้
 * เครื่องจริงเริ่มจากศูนย์ แล้วดึงของจริงจากชีตแทน
 */
function seedLogsForDevOnly(): LogEntry[] {
  return import.meta.env.DEV ? generateSeedLogs() : [];
}

/** Haversine formula - returns distance in meters */
export function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLng = (lng2 - lng1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Converts "HH:mm" string or Date to minutes from midnight */
export function toMin(v: string | Date | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    return v.getHours() * 60 + v.getMinutes();
  }
  const m = String(v).trim().match(/^(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Finds current round from date, supporting overnight shifts (start > end) */
export function roundOf(date: Date, rounds: Round[]): string {
  const mins = date.getHours() * 60 + date.getMinutes();
  for (let i = 0; i < rounds.length; i++) {
    const s = toMin(rounds[i].start);
    let e = toMin(rounds[i].end);
    if (s === null || e === null) continue;
    if (e === 0) e = 1440; // 00:00 end of round = midnight
    if (s <= e) {
      if (mins >= s && mins < e) return rounds[i].round_id;
    } else if (mins >= s || mins < e) {
      return rounds[i].round_id;
    }
  }
  return '';
}

export class GuardPatrolEngine {
  private checkpoints: Checkpoint[];
  private rounds: Round[];
  private guards: Guard[];
  private logs: LogEntry[];
  private config: SystemConfig;

  constructor() {
    this.checkpoints = getStorageItem<Checkpoint[]>(STORAGE_KEYS.CHECKPOINTS, structuredClone(INITIAL_CHECKPOINTS));
    this.rounds = getStorageItem<Round[]>(STORAGE_KEYS.ROUNDS, structuredClone(INITIAL_ROUNDS));
    this.guards = getStorageItem<Guard[]>(STORAGE_KEYS.GUARDS, structuredClone(INITIAL_GUARDS));
    this.config = getStorageItem<SystemConfig>(STORAGE_KEYS.CONFIG, structuredClone(INITIAL_CONFIG));

    const existingLogs = getStorageItem<LogEntry[]>(STORAGE_KEYS.LOGS, []);
    if (!existingLogs || existingLogs.length === 0) {
      this.logs = seedLogsForDevOnly();
      setStorageItem(STORAGE_KEYS.LOGS, this.logs);
    } else {
      this.logs = existingLogs;
    }
  }

  // Reload all from storage
  public reload(): void {
    this.checkpoints = getStorageItem<Checkpoint[]>(STORAGE_KEYS.CHECKPOINTS, structuredClone(INITIAL_CHECKPOINTS));
    this.rounds = getStorageItem<Round[]>(STORAGE_KEYS.ROUNDS, structuredClone(INITIAL_ROUNDS));
    this.guards = getStorageItem<Guard[]>(STORAGE_KEYS.GUARDS, structuredClone(INITIAL_GUARDS));
    this.config = getStorageItem<SystemConfig>(STORAGE_KEYS.CONFIG, structuredClone(INITIAL_CONFIG));

    const existingLogs = getStorageItem<LogEntry[]>(STORAGE_KEYS.LOGS, []);
    if (!existingLogs || existingLogs.length === 0) {
      this.logs = seedLogsForDevOnly();
      setStorageItem(STORAGE_KEYS.LOGS, this.logs);
    } else {
      this.logs = existingLogs;
    }
  }

  // Reset to initial clean state
  public resetToDefault(): void {
    // เก็บกุญแจผู้ดูแลเดิมไว้ — "รีเซ็ตข้อมูลตัวอย่าง" ไม่ควรเตะผู้ดูแลออกจากระบบ
    // ถ้าล้างทิ้ง keyOk() จะกลายเป็น false ทันทีและหน้าแดชบอร์ดจะขึ้น 0/0 แบบเงียบ ๆ
    const keepKey = this.config.DASH_KEY;

    this.checkpoints = structuredClone(INITIAL_CHECKPOINTS);
    this.rounds = structuredClone(INITIAL_ROUNDS);
    this.guards = structuredClone(INITIAL_GUARDS);
    this.config = { ...structuredClone(INITIAL_CONFIG), DASH_KEY: keepKey };
    this.logs = seedLogsForDevOnly();

    setStorageItem(STORAGE_KEYS.CHECKPOINTS, this.checkpoints);
    setStorageItem(STORAGE_KEYS.ROUNDS, this.rounds);
    setStorageItem(STORAGE_KEYS.GUARDS, this.guards);
    setStorageItem(STORAGE_KEYS.CONFIG, this.config);
    setStorageItem(STORAGE_KEYS.LOGS, this.logs);
  }

  public getConfig(): SystemConfig {
    return this.config;
  }

  public updateConfig(newConfig: Partial<SystemConfig>): SystemConfig {
    this.config = { ...this.config, ...newConfig };
    setStorageItem(STORAGE_KEYS.CONFIG, this.config);
    return this.config;
  }

  public getCheckpoints(): Checkpoint[] {
    return this.checkpoints.map((c) => ({ ...c }));
  }

  public getRounds(): Round[] {
    return this.rounds;
  }

  public getGuards(): Guard[] {
    return this.guards.filter((g) => g.active !== 'NO').map((g) => ({ ...g }));
  }

  /** รายชื่อทั้งหมดรวมที่ปิดใช้งาน (สำหรับหน้าจัดการของผู้ดูแล) */
  public getAllGuards(): Guard[] {
    return this.guards.map((g) => ({ ...g }));
  }

  /**
   * บันทึกรายชื่อ รปภ. ที่ผู้ดูแลกรอกเอง
   * เก็บใน localStorage ของเครื่องเท่านั้น ไม่ติดไปกับซอร์สโค้ด (PDPA)
   */
  public updateGuards(key: string, guards: Guard[]) {
    if (!this.keyOk(key)) return { ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' };

    // ตรวจซ้ำที่นี่ด้วย ไม่พึ่งหน้าจออย่างเดียว เพราะเป็นทางเดียวที่เขียนลงเครื่อง
    const valid = validateGuards(guards);
    if (!valid.ok) return { ok: false, error: valid.error };

    this.guards = guards.map((g) => ({
      guard_id: String(g.guard_id || '').trim(),
      name: String(g.name || '').trim(),
      active: g.active === 'NO' ? 'NO' : 'YES',
    }));
    setStorageItem(STORAGE_KEYS.GUARDS, this.guards);
    return { ok: true, count: this.guards.length };
  }

  /**
   * บันทึกรายการจุดตรวจที่ผู้ดูแลแก้ผ่านหน้าเว็บ (เพิ่ม/ลบ/แก้ชื่อ โซน รัศมี)
   *
   * เก็บพิกัดเดิมของจุดที่มีอยู่แล้วไว้เสมอ เพราะหน้าจัดการจุดตรวจไม่ได้แก้พิกัด
   * (พิกัดมาจากการเดินไปสำรวจที่หน้างานเท่านั้น) ถ้าเผลอเขียนทับด้วยค่าว่าง
   * การตรวจรัศมีของจุดนั้นจะหยุดทำงานทันทีโดยไม่มีอะไรฟ้อง
   */
  public updateCheckpoints(key: string, checkpoints: Checkpoint[]) {
    if (!this.keyOk(key)) return { ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' };

    const valid = validateCheckpoints(checkpoints);
    if (!valid.ok) return { ok: false, error: valid.error };

    const prev = new Map(this.checkpoints.map((c) => [c.checkpoint_id, c]));
    this.checkpoints = checkpoints.map((c) => {
      const id = String(c.checkpoint_id || '').trim();
      const old = prev.get(id);
      return {
        checkpoint_id: id,
        name: String(c.name || '').trim(),
        zone: String(c.zone || '').trim(),
        // พิกัดยึดของเดิมไว้ก่อนเสมอ จุดที่เพิ่งเพิ่มจะเป็น null รอไปสำรวจ
        lat: old ? old.lat : c.lat ?? null,
        lng: old ? old.lng : c.lng ?? null,
        radius_m: Number(c.radius_m) || this.config.DEFAULT_RADIUS_M,
        active: c.active === 'NO' ? 'NO' : 'YES',
      };
    });

    setStorageItem(STORAGE_KEYS.CHECKPOINTS, this.checkpoints);
    return { ok: true, count: this.checkpoints.length };
  }

  public getLogs(): LogEntry[] {
    return this.logs;
  }

  /**
   * =========================================================================
   * คำเตือนด้านความปลอดภัย (SECURITY WARNING):
   * ฟังก์ชัน keyOk นี้เป็นการจำลองการตรวจสิทธิ์ฝั่งไคลเอ็นต์ (Client-Side Simulation)
   * เท่านั้น เพื่อใช้ในการสลับมุมมองหน้าจอ ไม่ใช่ระบบความปลอดภัยจริง!
   * การตรวจสอบสิทธิ์ที่แท้จริงต้องทำใน Google Apps Script (Server-Side) เสมอ
   * ห้ามนำตรรกะนี้ไปใช้เป็นระบบความปลอดภัยในสภาพแวดล้อม Production เด็ดขาด
   * =========================================================================
   */
  public keyOk(k: string): boolean {
    const want = String(this.config.DASH_KEY || '').trim();
    // Fail closed: ยังไม่ได้ตั้งกุญแจ = ไม่อนุญาต (ให้ไปตั้งที่หน้า setup ครั้งแรกแทน)
    if (!want) return false;
    return String(k || '').trim() === want;
  }

  /** ยังไม่เคยตั้งกุญแจผู้ดูแล -> ต้องแสดงหน้าตั้งค่าครั้งแรก */
  public needsSetup(): boolean {
    return !String(this.config.DASH_KEY || '').trim();
  }

  /**
   * getScanContext: Context for Scan screen
   */
  public getScanContext(cpId: string) {
    const id = String(cpId || '').trim();
    const cp = this.checkpoints.find((r) => r.checkpoint_id === id);

    if (!cp) {
      return { ok: false, error: `ไม่พบจุดตรวจรหัส ${id}` };
    }
    if (cp.active === 'NO') {
      return { ok: false, error: `จุดตรวจ ${id} ถูกปิดใช้งานอยู่` };
    }

    const hasCoords = cp.lat !== null && cp.lng !== null;

    return {
      ok: true,
      siteName: this.config.SITE_NAME,
      cp: {
        id: id,
        name: cp.name,
        zone: cp.zone,
        lat: cp.lat,
        lng: cp.lng,
        hasCoords: hasCoords,
        radius: cp.radius_m || this.config.DEFAULT_RADIUS_M,
      },
      guards: this.guards
        .filter((g) => g.active !== 'NO')
        .map((g) => ({ id: g.guard_id, name: g.name })),
      maxAccuracy: this.config.MAX_ACCURACY_M,
      blockOutOfRange: this.config.BLOCK_OUT_OF_RANGE,
      allowOverride: this.config.ALLOW_OVERRIDE,
      photoEnabled: Boolean(this.config.PHOTO_FOLDER_ID),
      round: roundOf(new Date(), this.rounds),
    };
  }

  /**
   * submitScan: The core anti-cheat validation and scan recording
   */
  /**
   * เขียนบันทึกลงเครื่อง โดยตัดของเก่าทิ้งก่อนถ้าเกินโควตาที่ตั้งไว้
   *
   * ถ้าเขียนไม่ลงเพราะพื้นที่เต็มจริง ๆ จะตัดให้เหลือครึ่งเดียวแล้วลองใหม่อีกครั้ง
   * เพื่อให้ "บันทึกล่าสุด" ซึ่งสำคัญที่สุดยังเก็บได้ คืน false เมื่อยังไม่สำเร็จ
   * เพื่อให้ผู้เรียกเตือนผู้ใช้ ไม่ใช่ปล่อยให้ข้อมูลหายเงียบ ๆ
   */
  private persistLogs(): boolean {
    // ตัดเฉพาะตอนเขียนลงเครื่อง ไม่แตะรายการในหน่วยความจำ
    // เพราะผู้ดูแลที่เพิ่งดึงบันทึกจากชีตมาทำรายงาน ต้องเห็นครบตามที่ดึงมา
    let keep = Math.min(this.logs.length, MAX_LOCAL_LOGS);
    for (let attempt = 0; attempt < 4; attempt++) {
      if (setStorageItem(STORAGE_KEYS.LOGS, this.logs.slice(this.logs.length - keep))) return true;
      if (keep === 0) return false;
      keep = Math.floor(keep / 2); // เขียนไม่ลง = พื้นที่เต็ม ลดขนาดลงแล้วลองใหม่
    }
    return false;
  }

  public submitScan(p: ScanPayload): SubmitScanResponse {
    const now = new Date();
    const rnd = roundOf(now, this.rounds);
    const id = String(p.cp || '').trim();

    // 1. Checkpoint validation
    const cp = this.checkpoints.find((r) => r.checkpoint_id === id);
    if (!cp) return { ok: false, error: `ไม่พบจุดตรวจรหัส ${id}` };
    if (cp.active === 'NO') return { ok: false, error: `จุดตรวจ ${id} ถูกปิดใช้งานอยู่` };

    const guard = String(p.guard || '').trim();
    if (!guard) return { ok: false, error: 'กรุณาเลือกชื่อผู้ตรวจ' };

    // 2. Server-side distance calculation
    const lat = p.lat !== null && !isNaN(Number(p.lat)) ? Number(p.lat) : null;
    const lng = p.lng !== null && !isNaN(Number(p.lng)) ? Number(p.lng) : null;
    const acc = p.acc !== null && !isNaN(Number(p.acc)) ? Number(p.acc) : null;
    const cpLat = cp.lat;
    const cpLng = cp.lng;
    const radius = cp.radius_m || this.config.DEFAULT_RADIUS_M;
    const maxAcc = this.config.MAX_ACCURACY_M;

    let dist: number | '' = '';
    let geo: GeoResult;

    if (lat === null || lng === null) {
      geo = 'NO_GPS';
    } else if (cpLat === null || cpLng === null) {
      geo = 'NO_REFERENCE';
    } else {
      dist = Math.round(distM(lat, lng, cpLat, cpLng));
      if (acc !== null && acc > maxAcc) {
        geo = 'LOW_ACCURACY';
      } else {
        geo = dist <= radius ? 'IN_RANGE' : 'OUT_OF_RANGE';
      }
    }

    const override = Boolean(p.override && this.config.ALLOW_OVERRIDE);

    // 3. Out-of-range blocking logic (excluding NO_REFERENCE per section 5.1 of spec)
    const blockable = geo !== 'IN_RANGE' && geo !== 'NO_REFERENCE';
    if (blockable && this.config.BLOCK_OUT_OF_RANGE && !override) {
      let msg = '';
      if (geo === 'NO_GPS') msg = 'ยังไม่ได้ตำแหน่ง GPS กรุณาอนุญาตให้เข้าถึงตำแหน่งแล้วลองใหม่';
      else if (geo === 'LOW_ACCURACY') msg = `สัญญาณ GPS หยาบเกินไป (±${Math.round(acc || 0)} ม. / เกณฑ์ ≤${maxAcc} ม.) กรุณาออกที่โล่งแล้วลองใหม่`;
      else msg = `อยู่นอกรัศมีจุดตรวจ (ห่าง ${dist} ม. / อนุญาต ${radius} ม.) บันทึกไม่ได้`;

      return {
        ok: false,
        geo: geo,
        distance: dist,
        error: msg,
        canOverride: this.config.ALLOW_OVERRIDE,
      };
    }

    if (override && !String(p.overrideReason || '').trim()) {
      return { ok: false, error: 'กรุณาระบุเหตุผลของการขอบันทึกพิเศษ' };
    }

    // 4. Duplicate scan protection (same CP, same guard within window)
    const winMs = (this.config.DUPLICATE_WINDOW_MIN || 20) * 60000;
    for (let i = this.logs.length - 1; i >= 0; i--) {
      const r = this.logs[i];
      if (r.checkpoint_id === id && r.guard === guard) {
        const t = new Date(r.timestamp);
        if (!isNaN(t.getTime())) {
          const diff = now.getTime() - t.getTime();
          if (diff >= 0 && diff < winMs) {
            return {
              ok: false,
              error: `จุดนี้เพิ่งถูกบันทึกโดยผู้ตรวจคนเดิมเมื่อ ${Math.round(diff / 60000)} นาทีที่แล้ว (กันซ้ำภายใน ${this.config.DUPLICATE_WINDOW_MIN} นาที)`,
            };
          }
        }
      }
    }

    const flags: string[] = [];
    if (geo !== 'IN_RANGE') flags.push(geo);
    if (override) flags.push('OVERRIDE');

    // 5. Speed detection between consecutive checkpoints on same device
    const dev = String(p.deviceId || '').trim();
    if (dev && lat !== null && lng !== null) {
      for (let i = this.logs.length - 1; i >= 0; i--) {
        const r = this.logs[i];
        if (r.device_id === dev && r.lat !== null && r.lng !== null) {
          const t = new Date(r.timestamp);
          if (!isNaN(t.getTime())) {
            const hrs = (now.getTime() - t.getTime()) / 3600000;
            if (hrs > 0) {
              const kmh = distM(lat, lng, r.lat, r.lng) / 1000 / hrs;
              if (kmh > this.config.SPEED_FLAG_KMH) {
                flags.push(`SPEED_${Math.round(kmh)}`);
              }
            }
          }
          break; // Compare only with the immediate previous scan of this device
        }
      }
    }

    const dateStr = localDateStr(now);
    const timeStr = now.toTimeString().slice(0, 8);
    const mapsLink = lat !== null && lng !== null ? `https://www.google.com/maps?q=${lat},${lng}` : '';

    const note =
      String(p.note || '').trim() +
      (override
        ? (String(p.note || '').trim() ? ' | ' : '') +
          `ขอบันทึกพิเศษ: ${String(p.overrideReason || '').trim()}`
        : '');

    // 6. Append Row to Logs (all 19 columns)
    const newEntry: LogEntry = {
      // ต้องไม่ซ้ำข้ามเครื่อง — Date.now() อย่างเดียวชนกันได้ถ้าสองคนกดพร้อมกันในมิลลิวินาทีเดียว
      // แล้วเซิร์ฟเวอร์จะกันซ้ำด้วย id ทำให้บันทึกของอีกคนหายไปเงียบ ๆ
      id: `LOG_${Date.now()}_${dev || 'NODEV'}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: now.toISOString(),
      date: dateStr,
      time: timeStr,
      round: rnd || '(นอกช่วงรอบ)',
      checkpoint_id: id,
      checkpoint_name: cp.name,
      zone: cp.zone,
      guard: guard,
      status: p.status || 'ปกติ',
      note: note,
      lat: lat,
      lng: lng,
      accuracy_m: acc !== null ? Math.round(acc) : null,
      distance_m: dist,
      geo_result: geo,
      flags: flags.join(','),
      device_id: dev,
      photo_url: p.photoData ? 'https://drive.google.com/mock-photo-url' : '',
      maps_link: mapsLink,
    };

    this.logs.push(newEntry);
    // เขียน (พร้อมตัดของเก่า) ก่อนเข้าคิวส่ง เพื่อคืนพื้นที่ให้คิวได้เขียนลงแน่ ๆ
    const persisted = this.persistLogs();

    // Sync to Google Sheets via Web App if configured
    const queued = this.syncLogToGoogleSheets(newEntry);

    // เตือนเฉพาะตอนที่บันทึกไม่ได้ทั้งสองที่ = รายการนี้หายจริง
    // ถ้าเข้าคิวได้ ข้อมูลยังไปถึงชีตแน่นอน แม้ประวัติในเครื่องจะเขียนไม่ลง
    let warning = '';
    if (!queued) {
      warning = sheetSync.isConfigured()
        ? 'เขียนลงเครื่องไม่สำเร็จ (พื้นที่เต็ม) — รายการนี้อาจไม่ถูกส่งขึ้นชีต กรุณาแจ้งหัวหน้าชุดและจดไว้ก่อน'
        : !persisted
          ? 'เขียนลงเครื่องไม่สำเร็จ (พื้นที่เต็ม) — รายการนี้อาจหาย กรุณาแจ้งหัวหน้าชุดและจดไว้ก่อน'
          : '';
    }

    return {
      ok: true,
      geo: geo,
      distance: dist,
      flags: flags,
      round: rnd,
      time: timeStr,
      date: dateStr.split('-').reverse().join('/'),
      warning: warning || undefined,
    };
  }

  /**
   * ส่งบันทึกขึ้น Google Sheets ผ่านคิว
   * เข้าคิวก่อนเสมอเพื่อให้ไม่หายเมื่อสัญญาณขาด แล้ว sheetSync จะลองส่งซ้ำเอง
   */
  public syncLogToGoogleSheets(entry: LogEntry): boolean {
    if (!sheetSync.isConfigured()) return false;
    return sheetSync.enqueue(entry);
  }

  /** นำบันทึกจากชีตมารวมกับของในเครื่อง โดยยึด id เป็นตัวกันซ้ำ */
  public mergeLogs(incoming: LogEntry[]): number {
    if (!incoming || !incoming.length) return 0;
    const byId = new Map<string, LogEntry>();
    this.logs.forEach((l) => {
      if (l.id) byId.set(String(l.id), l);
    });

    let added = 0;
    incoming.forEach((l) => {
      const id = String(l.id || '').trim();
      if (!id || byId.has(id)) return;
      byId.set(id, l);
      added++;
    });

    if (added > 0) {
      this.logs = Array.from(byId.values()).sort((a, b) =>
        String(a.timestamp).localeCompare(String(b.timestamp)),
      );
      // ดึงจากชีตทีเดียวได้ถึง MAX_PULL_LOGS รายการ ซึ่งมากพอจะทำให้พื้นที่ในเครื่องเต็ม
      // จึงต้องเขียนผ่านตัวที่ตัดขนาดให้ ไม่ใช่ยัดลงไปทั้งก้อน
      this.persistLogs();
    }
    return added;
  }

  /**
   * แทนที่จุดตรวจ/รอบ/รายชื่อด้วยข้อมูลจากชีต (ชีตเป็นแหล่งอ้างอิงหลัก)
   *
   * เรียกเฉพาะตอน pullPublic สำเร็จ ดังนั้น "ว่าง" คือคำตอบจริงของชีต ไม่ใช่การดึงพลาด
   * ถ้าแท็บ Checkpoints มีข้อมูลแล้ว (ถือว่าชีตถูกตั้งค่าแล้ว) การลบแถวในชีต
   * ต้องมีผลกับทุกเครื่องด้วย ไม่งั้นจุดตรวจที่ยกเลิกไปแล้วจะค้างอยู่ในมือถือตลอดไป
   *
   * ข้อยกเว้นเดียวคือแท็บ Checkpoints ว่างทั้งแท็บ — แยกไม่ออกระหว่าง "ยังไม่ได้ตั้งค่า"
   * กับ "ตั้งใจลบทั้งหมด" จึงคงค่าในเครื่องไว้ก่อน เพื่อไม่ให้เครื่อง รปภ. ใช้งานไม่ได้
   * ระหว่างติดตั้ง (ถ้าต้องการปิดจุดตรวจ ให้ตั้ง active = NO ซึ่งซิงก์ได้ตามปกติ)
   */
  public applyRemoteMasterData(data: {
    checkpoints?: Checkpoint[];
    rounds?: Round[];
    guards?: Guard[];
    config?: Partial<SystemConfig>;
  }): void {
    const sheetInitialised = Array.isArray(data.checkpoints) && data.checkpoints.length > 0;

    if (sheetInitialised) {
      this.checkpoints = data.checkpoints as Checkpoint[];
      setStorageItem(STORAGE_KEYS.CHECKPOINTS, this.checkpoints);
    }
    if (sheetInitialised && Array.isArray(data.rounds)) {
      this.rounds = data.rounds;
      setStorageItem(STORAGE_KEYS.ROUNDS, this.rounds);
    }
    if (sheetInitialised && Array.isArray(data.guards)) {
      this.guards = data.guards;
      setStorageItem(STORAGE_KEYS.GUARDS, this.guards);
    }
    if (data.config) {
      // ห้ามให้ค่าจากชีตมาเขียนทับกุญแจผู้ดูแลที่ตั้งไว้ในเครื่อง
      const { DASH_KEY, ...rest } = data.config as SystemConfig;
      this.config = { ...this.config, ...rest };
      setStorageItem(STORAGE_KEYS.CONFIG, this.config);
    }
  }

  /**
   * saveCheckpointCoords: Save surveyed GPS coordinate to Checkpoints
   */
  public saveCheckpointCoords(key: string, cpId: string, lat: number, lng: number, acc: number) {
    if (!this.keyOk(key)) return { ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' };

    if (acc > this.config.MAX_ACCURACY_M) {
      return {
        ok: false,
        error: `ความแม่นยำ ±${Math.round(acc)} ม. หยาบเกินเกณฑ์ ${this.config.MAX_ACCURACY_M} ม. ยังไม่บันทึก`,
      };
    }

    const idx = this.checkpoints.findIndex((c) => c.checkpoint_id === cpId);
    if (idx === -1) return { ok: false, error: `ไม่พบจุดตรวจรหัส ${cpId}` };

    this.checkpoints[idx].lat = lat;
    this.checkpoints[idx].lng = lng;
    setStorageItem(STORAGE_KEYS.CHECKPOINTS, this.checkpoints);

    return {
      ok: true,
      lat: lat,
      lng: lng,
      acc: Math.round(acc),
    };
  }

  /**
   * getDashboard: Data for Dashboard today tab and 7-day trend
   */
  public getDashboard(key: string, dateStr?: string): DashboardData {
    if (!this.keyOk(key)) {
      return {
        ok: false,
        siteName: this.config.SITE_NAME,
        docCode: this.config.DOC_CODE,
        date: '',
        rounds: [],
        grid: [],
        summary: { expected: 0, done: 0, flagged: 0, abnormal: 0, pct: 0, noCoords: 0 },
        trend: [],
        error: 'ไม่มีสิทธิ์เข้าถึง',
      };
    }

    const day = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
      ? dateStr
      : localDateStr(new Date());

    const activeCps = this.checkpoints.filter((c) => c.active !== 'NO');
    const todayLogs = this.logs.filter((l) => l.date === day);

    // Matrix map: Checkpoint x Round
    const cellMap: Record<string, GridCell> = {};
    todayLogs.forEach((r) => {
      const k = `${r.checkpoint_id}|${r.round}`;
      const flags = r.flags || '';
      const prev = cellMap[k];
      const item: GridCell = {
        time: r.time.slice(0, 5),
        guard: r.guard,
        flags: flags,
        geo: r.geo_result,
        status: r.status,
      };

      if (!prev) {
        cellMap[k] = item;
      } else if (prev.flags && !flags) {
        cellMap[k] = item; // Prioritize cleaner record
      }
    });

    const grid: GridRow[] = activeCps.map((cp) => {
      return {
        id: cp.checkpoint_id,
        name: cp.name,
        zone: cp.zone,
        hasCoords: cp.lat !== null && cp.lng !== null,
        cells: this.rounds.map((rd) => {
          const k = `${cp.checkpoint_id}|${rd.round_id}`;
          return cellMap[k] || null;
        }),
      };
    });

    const expected = activeCps.length * this.rounds.length;
    const done = Object.keys(cellMap).length;
    const flagged = todayLogs.filter((r) => Boolean(r.flags)).length;
    const abnormal = todayLogs.filter((r) => r.status !== 'ปกติ').length;
    const noCoords = activeCps.filter((c) => c.lat === null || c.lng === null).length;

    // 7-day trend
    const trend: TrendItem[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = localDateStr(d);
      const seen: Record<string, number> = {};

      this.logs.forEach((r) => {
        if (r.date === ds) {
          seen[`${r.checkpoint_id}|${r.round}`] = 1;
        }
      });

      const n = Object.keys(seen).length;
      trend.push({
        date: ds,
        label: `${('0' + d.getDate()).slice(-2)}/${('0' + (d.getMonth() + 1)).slice(-2)}`,
        done: n,
        expected: expected,
        pct: expected ? Math.round((n * 1000) / expected) / 10 : 0,
      });
    }

    return {
      ok: true,
      siteName: this.config.SITE_NAME,
      docCode: this.config.DOC_CODE,
      date: day,
      rounds: this.rounds.map((r) => ({ id: r.round_id, label: r.label })),
      grid: grid,
      summary: {
        expected,
        done,
        flagged,
        abnormal,
        pct: expected ? Math.round((done * 1000) / expected) / 10 : 0,
        noCoords,
      },
      trend: trend,
    };
  }

  /**
   * getReport: Historical report analytics
   */
  public getReport(key: string, from: string, to: string): ReportData {
    if (!this.keyOk(key)) {
      return {
        ok: false,
        siteName: this.config.SITE_NAME,
        docCode: this.config.DOC_CODE,
        from,
        to,
        days: 0,
        summary: { records: 0, done: 0, expected: 0, pct: 0, flagged: 0, abnormal: 0 },
        daily: [],
        rounds: [],
        zones: [],
        checkpoints: [],
        guards: [],
        issues: [],
        error: 'ไม่มีสิทธิ์เข้าถึง',
      };
    }

    const [fromY, fromM, fromD] = from.split('-').map(Number);
    const [toY, toM, toD] = to.split('-').map(Number);
    const startDate = new Date(fromY, fromM - 1, fromD, 0, 0, 0);
    const endDate = new Date(toY, toM - 1, toD, 0, 0, 0);

    const activeCps = this.checkpoints.filter((c) => c.active !== 'NO');
    const perDay = activeCps.length * this.rounds.length;

    const filteredLogs = this.logs.filter((r) => r.date >= from && r.date <= to);

    const dayMap: Record<string, { date: string; count: number; flagged: number; abnormal: number; seen: Record<string, number> }> = {};
    const roundMap: Record<string, StatGroup> = {};
    const zoneMap: Record<string, StatGroup> = {};
    const cpMap: Record<string, StatGroup> = {};
    const guardMap: Record<string, StatGroup> = {};
    const issues: IssueItem[] = [];

    const bump = (map: Record<string, StatGroup>, k: string, flagged: boolean, abnormal: boolean) => {
      if (!map[k]) map[k] = { key: k, count: 0, flagged: 0, abnormal: 0 };
      map[k].count++;
      if (flagged) map[k].flagged++;
      if (abnormal) map[k].abnormal++;
    };

    filteredLogs.forEach((r) => {
      const d = r.date;
      const flagged = Boolean(r.flags);
      const abnormal = r.status !== 'ปกติ';

      if (!dayMap[d]) dayMap[d] = { date: d, count: 0, flagged: 0, abnormal: 0, seen: {} };
      dayMap[d].count++;
      if (flagged) dayMap[d].flagged++;
      if (abnormal) dayMap[d].abnormal++;
      dayMap[d].seen[`${r.checkpoint_id}|${r.round}`] = 1;

      bump(roundMap, r.round || '(ไม่ระบุรอบ)', flagged, abnormal);
      bump(zoneMap, r.zone || '(ไม่ระบุโซน)', flagged, abnormal);
      bump(cpMap, `${r.checkpoint_id} ${r.checkpoint_name}`, flagged, abnormal);
      bump(guardMap, r.guard || '(ไม่ระบุผู้ตรวจ)', flagged, abnormal);

      if (flagged || abnormal) {
        issues.push({
          date: d,
          time: r.time.slice(0, 5),
          round: r.round,
          cp: r.checkpoint_id,
          cpName: r.checkpoint_name,
          guard: r.guard,
          status: r.status,
          flags: r.flags,
          distance: r.distance_m ?? '',
          geo: r.geo_result,
          note: r.note,
        });
      }
    });

    const daily = [];
    const cur = new Date(startDate);
    while (cur <= endDate) {
      const ds = localDateStr(cur);
      const row = dayMap[ds];
      const done = row ? Object.keys(row.seen).length : 0;
      daily.push({
        date: ds,
        label: `${ds.slice(8, 10)}/${ds.slice(5, 7)}`,
        count: row ? row.count : 0,
        done: done,
        expected: perDay,
        flagged: row ? row.flagged : 0,
        abnormal: row ? row.abnormal : 0,
        pct: perDay ? Math.round((done * 1000) / perDay) / 10 : 0,
      });
      cur.setDate(cur.getDate() + 1);
    }

    const span = daily.length;
    const totalDone = daily.reduce((acc, cur) => acc + cur.done, 0);
    const totalExpected = perDay * span;

    const sortDesc = (map: Record<string, StatGroup>) =>
      Object.values(map).sort((x, y) => y.count - x.count);

    return {
      ok: true,
      siteName: this.config.SITE_NAME,
      docCode: this.config.DOC_CODE,
      from,
      to,
      days: span,
      summary: {
        records: filteredLogs.length,
        done: totalDone,
        expected: totalExpected,
        pct: totalExpected ? Math.round((totalDone * 1000) / totalExpected) / 10 : 0,
        flagged: issues.filter((i) => i.flags).length,
        abnormal: issues.filter((i) => i.status !== 'ปกติ').length,
      },
      daily,
      rounds: this.rounds.map((rd) => {
        const m = roundMap[rd.round_id] || { count: 0, flagged: 0, abnormal: 0 };
        const exp = activeCps.length * span;
        return {
          id: rd.round_id,
          label: rd.label,
          count: m.count,
          flagged: m.flagged,
          abnormal: m.abnormal,
          expected: exp,
          pct: exp ? Math.round((m.count * 1000) / exp) / 10 : 0,
        };
      }),
      zones: sortDesc(zoneMap),
      checkpoints: sortDesc(cpMap),
      guards: sortDesc(guardMap),
      issues: issues.sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time)).slice(0, 500),
    };
  }

  /**
   * getGuardLog: logs for a specific guard
   */
  public getGuardLog(key: string, from: string, to: string, guardName?: string) {
    if (!this.keyOk(key)) return { ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' };
    const want = String(guardName || '').trim();

    const filtered = this.logs.filter((r) => {
      if (r.date < from || r.date > to) return false;
      if (want && r.guard !== want) return false;
      return true;
    });

    const rows = filtered
      .slice(-400)
      .reverse()
      .map((r) => ({
        date: r.date,
        time: r.time.slice(0, 5),
        round: r.round,
        cp: r.checkpoint_id,
        cpName: r.checkpoint_name,
        zone: r.zone,
        guard: r.guard,
        status: r.status,
        distance: r.distance_m ?? '',
        geo: r.geo_result,
        flags: r.flags,
        note: r.note,
        maps: r.maps_link || '',
      }));

    return {
      ok: true,
      guard: want,
      total: filtered.length,
      rows: rows,
    };
  }

  /**
   * getLiveFeed: latest scan feed
   */
  public getLiveFeed(key: string, n = 20) {
    if (!this.keyOk(key)) return { ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' };
    const count = Math.max(1, Math.min(40, n));
    const rows = this.logs
      .slice(-count)
      .reverse()
      .map((r) => ({
        date: r.date,
        time: r.time.slice(0, 5),
        round: r.round,
        cp: r.checkpoint_id,
        cpName: r.checkpoint_name,
        guard: r.guard,
        status: r.status,
        distance: r.distance_m ?? '',
        geo: r.geo_result,
        flags: r.flags,
      }));

    return { ok: true, rows };
  }
}

export const patrolEngine = new GuardPatrolEngine();
