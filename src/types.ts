/**
 * Types and interfaces for the Guard Patrol System (ระบบเดินตรวจ รปภ.)
 * โรงงานอาหารสัตว์ CPF ท่านเกษม สระบุรี
 */

export interface Checkpoint {
  checkpoint_id: string; // e.g. "CP01" - "CP20"
  name: string;          // e.g. "จุดที่ 1 โรงอาหาร"
  zone: string;          // e.g. "หน้าโรงงาน", "โรงงาน"
  lat: number | null;
  lng: number | null;
  radius_m: number;      // default 40
  active: 'YES' | 'NO';
}

export interface Round {
  round_id: string;      // R1 - R6
  label: string;         // e.g. "รอบ 1 (00:00)"
  start: string;         // e.g. "00:00"
  end: string;           // e.g. "04:00"
}

export interface Guard {
  guard_id: string;      // G01 - G12
  name: string;          // e.g. "รปภ. ประจำกะ 01"
  active: 'YES' | 'NO';
}

export type GeoResult = 
  | 'IN_RANGE' 
  | 'OUT_OF_RANGE' 
  | 'LOW_ACCURACY' 
  | 'NO_GPS' 
  | 'NO_REFERENCE';

export interface LogEntry {
  id?: string;
  timestamp: string;      // ISO string
  date: string;           // yyyy-MM-dd
  time: string;           // HH:mm:ss
  round: string;          // R1 - R6
  checkpoint_id: string;  // CP01
  checkpoint_name: string;
  zone: string;
  guard: string;
  status: 'ปกติ' | 'พบสิ่งผิดปกติ';
  note: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  distance_m: number | null | '';
  geo_result: GeoResult;
  flags: string;          // Comma-separated: "OUT_OF_RANGE", "OVERRIDE", "SPEED_35", etc.
  device_id: string;
  photo_url?: string;
  maps_link?: string;
}

export interface SystemConfig {
  SITE_NAME: string;
  DOC_CODE: string;
  DASH_KEY: string;
  /** URL ของเว็บแอปนี้ (เช่นที่ Cloudflare) — เป็นปลายทางที่ QR ประจำจุดตรวจชี้ไป */
  APP_URL: string;
  /** URL ของ Google Apps Script /exec — เป็นปลายทาง API สำหรับซิงก์ข้อมูล */
  WEBAPP_URL: string;
  /**
   * โทเคนร่วมสำหรับส่งบันทึกขึ้นชีต — Worker เป็นคนแจกผ่าน /__config
   * ไม่ใช่ความลับระดับสูง (อยู่ในเบราว์เซอร์อยู่แล้ว) แต่ปิดไม่ให้คนที่รู้แค่ URL
   * ของ Apps Script ยิงข้อมูลเข้ามาได้
   */
  WEBAPP_TOKEN: string;
  /** ชีตตั้ง DASH_KEY ไว้แล้วหรือยัง — เซิร์ฟเวอร์เป็นคนบอก ไม่ใช่ค่าที่ตั้งเองในเครื่อง */
  KEY_SET?: boolean;
  DEFAULT_RADIUS_M: number;
  MAX_ACCURACY_M: number;
  BLOCK_OUT_OF_RANGE: boolean;
  ALLOW_OVERRIDE: boolean;
  DUPLICATE_WINDOW_MIN: number;
  SPEED_FLAG_KMH: number;
  PHOTO_FOLDER_ID: string;
}

export interface ScanPayload {
  cp: string;
  guard: string;
  status: 'ปกติ' | 'พบสิ่งผิดปกติ';
  note?: string;
  lat: number | null;
  lng: number | null;
  acc: number | null;
  deviceId: string;
  override?: boolean;
  overrideReason?: string;
  photoData?: string;
}

export interface SubmitScanResponse {
  ok: boolean;
  geo?: GeoResult;
  distance?: number | '';
  flags?: string[];
  round?: string;
  time?: string;
  date?: string;
  error?: string;
  canOverride?: boolean;
  /** บันทึกสำเร็จ แต่มีเรื่องที่ผู้ใช้ต้องรู้ (เช่น เขียนลงเครื่องไม่ได้เพราะพื้นที่เต็ม) */
  warning?: string;
}

export interface DashboardSummary {
  expected: number;
  done: number;
  flagged: number;
  abnormal: number;
  pct: number;
  noCoords: number;
}

export interface TrendItem {
  date: string;
  label: string;
  done: number;
  expected: number;
  pct: number;
}

export interface GridCell {
  time: string;
  guard: string;
  flags: string;
  geo: GeoResult;
  status?: string;
}

export interface GridRow {
  id: string;
  name: string;
  zone: string;
  hasCoords: boolean;
  cells: (GridCell | null)[];
}

export interface DashboardData {
  ok: boolean;
  siteName: string;
  docCode: string;
  date: string;
  rounds: { id: string; label: string }[];
  grid: GridRow[];
  summary: DashboardSummary;
  trend: TrendItem[];
  error?: string;
}

export interface IssueItem {
  date: string;
  time: string;
  round: string;
  cp: string;
  cpName: string;
  guard: string;
  status: string;
  flags: string;
  distance: number | '';
  geo: string;
  note: string;
}

export interface StatGroup {
  key: string;
  count: number;
  flagged: number;
  abnormal: number;
}

export interface ReportData {
  ok: boolean;
  siteName: string;
  docCode: string;
  from: string;
  to: string;
  days: number;
  summary: {
    records: number;
    done: number;
    expected: number;
    pct: number;
    flagged: number;
    abnormal: number;
  };
  daily: {
    date: string;
    label: string;
    count: number;
    done: number;
    expected: number;
    flagged: number;
    abnormal: number;
    pct: number;
  }[];
  rounds: {
    id: string;
    label: string;
    count: number;
    flagged: number;
    abnormal: number;
    expected: number;
    pct: number;
  }[];
  zones: StatGroup[];
  checkpoints: StatGroup[];
  guards: StatGroup[];
  issues: IssueItem[];
  error?: string;
}
