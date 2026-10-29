/**
 * ซิงก์ข้อมูลระหว่างเว็บแอปกับ Google Sheets ผ่าน Apps Script
 *
 * หลักการ
 *   - บันทึกลงเครื่องก่อนเสมอ (localStorage) แล้วค่อยส่งขึ้นชีตทีหลัง
 *     เพื่อให้ รปภ. บันทึกได้แม้สัญญาณขาด
 *   - รายการที่ยังส่งไม่สำเร็จจะค้างอยู่ในคิว (outbox) และลองใหม่อัตโนมัติ
 *   - ไม่ใช้ mode:'no-cors' เพราะอ่านผลลัพธ์ไม่ได้ ทำให้แยกไม่ออกว่า
 *     ข้อมูลถึงชีตจริงหรือหายไปเงียบ ๆ
 */

import { LogEntry, Checkpoint, Round, Guard } from '../types';

const OUTBOX_KEY = 'cpf_patrol_outbox';
const SYNC_META_KEY = 'cpf_patrol_sync_meta';

export interface SyncMeta {
  /** เวลาที่ส่งขึ้นชีตสำเร็จครั้งล่าสุด (ISO) */
  lastPushAt: string | null;
  /** เวลาที่ดึงข้อมูลจากชีตสำเร็จครั้งล่าสุด (ISO) */
  lastPullAt: string | null;
  /** ข้อความผิดพลาดล่าสุด (null = ครั้งล่าสุดสำเร็จ) */
  lastError: string | null;
  /**
   * ครั้งล่าสุดที่ดึงบันทึก เซิร์ฟเวอร์ตัดข้อมูลทิ้งเพราะเกิน MAX_PULL_LOGS หรือไม่
   * ถ้าจริง = รายงานย้อนหลังไม่ครบ ต้องเตือนผู้ดูแล ไม่ใช่ปล่อยให้เห็น 0% เฉย ๆ
   */
  logsTruncated?: boolean;
}

export interface SyncStatus extends SyncMeta {
  /** จำนวนบันทึกที่ยังส่งขึ้นชีตไม่สำเร็จ */
  pending: number;
  /** ตั้งค่า WEBAPP_URL แล้วหรือยัง */
  configured: boolean;
  /** กำลังส่ง/ดึงอยู่หรือไม่ */
  busy: boolean;
}

export interface PullPublicResult {
  checkpoints: Checkpoint[];
  rounds: Round[];
  guards: Guard[];
  config: Record<string, unknown>;
}

type Listener = (status: SyncStatus) => void;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** เขียนลงเครื่อง — คืน false เมื่อเขียนไม่สำเร็จ (พื้นที่เต็ม / โหมดส่วนตัว) */
function write<T>(key: string, value: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.warn('localStorage error', e);
    return false;
  }
}

/** URL ของ Apps Script ต้องเป็น /exec ของ deployment จริงเท่านั้น */
export function isValidWebAppUrl(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec\/?$/.test(u)) return false;
  return true;
}

class SheetSync {
  private webAppUrl = '';
  private adminKey = '';
  private pushToken = '';
  private busy = false;
  private listeners: Listener[] = [];

  // ---------------------------------------------------------------- config

  public configure(webAppUrl: string, adminKey?: string, pushToken?: string): void {
    this.webAppUrl = String(webAppUrl || '').trim();
    if (adminKey !== undefined) this.adminKey = adminKey;
    if (pushToken !== undefined) this.pushToken = String(pushToken || '').trim();
    this.emit();
  }

  public setAdminKey(key: string): void {
    this.adminKey = key;
  }

  public isConfigured(): boolean {
    return isValidWebAppUrl(this.webAppUrl);
  }

  // ---------------------------------------------------------------- status

  public subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    fn(this.getStatus());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(): void {
    const s = this.getStatus();
    this.listeners.forEach((fn) => {
      try {
        fn(s);
      } catch (e) {
        console.warn('sync listener error', e);
      }
    });
  }

  public getStatus(): SyncStatus {
    const meta = read<SyncMeta>(SYNC_META_KEY, {
      lastPushAt: null,
      lastPullAt: null,
      lastError: null,
      logsTruncated: false,
    });
    return {
      ...meta,
      pending: this.getOutbox().length,
      configured: this.isConfigured(),
      busy: this.busy,
    };
  }

  private setMeta(patch: Partial<SyncMeta>): void {
    const meta = read<SyncMeta>(SYNC_META_KEY, {
      lastPushAt: null,
      lastPullAt: null,
      lastError: null,
      logsTruncated: false,
    });
    write(SYNC_META_KEY, { ...meta, ...patch });
  }

  // ---------------------------------------------------------------- outbox

  public getOutbox(): LogEntry[] {
    return read<LogEntry[]>(OUTBOX_KEY, []);
  }

  private setOutbox(list: LogEntry[]): boolean {
    return write(OUTBOX_KEY, list);
  }

  /**
   * เข้าคิวรอส่งขึ้นชีต แล้วพยายามส่งทันทีแบบไม่บล็อกผู้ใช้
   *
   * คืน false เมื่อเขียนคิวลงเครื่องไม่สำเร็จ — ต้องบอกผู้เรียก เพราะแปลว่า
   * รายการนี้จะไม่ถูกส่งซ้ำหลังปิดแอป และจะหายไปโดยที่ รปภ. เห็นว่า "บันทึกแล้ว"
   */
  public enqueue(entry: LogEntry): boolean {
    const box = this.getOutbox();
    let saved = true;
    if (!box.some((e) => e.id === entry.id)) {
      box.push(entry);
      saved = this.setOutbox(box);
      if (!saved) {
        this.setMeta({
          lastError: 'พื้นที่ในเครื่องเต็ม เขียนคิวส่งข้อมูลไม่ได้ — กรุณาแจ้งผู้ดูแลระบบ',
        });
      }
    }
    this.emit();
    void this.flush();
    return saved;
  }

  // ---------------------------------------------------------------- transport

  private async call(payload: Record<string, unknown>): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('ยังไม่ได้ตั้งค่า WEBAPP_URL (ต้องเป็นลิงก์ /exec ของ Apps Script)');
    }
    // ใช้ text/plain เพื่อไม่ให้เบราว์เซอร์ยิง preflight ซึ่ง Apps Script ไม่รองรับ
    const res = await fetch(this.webAppUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      // แนบโทเคนไปทุกคำขอ ปิดไม่ให้คนที่รู้แค่ URL /exec ยิงข้อมูลเข้ามาได้
      body: JSON.stringify({ ...payload, token: this.pushToken }),
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`เซิร์ฟเวอร์ตอบกลับ HTTP ${res.status}`);
    }

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // มักเกิดเมื่อ deployment ตั้งสิทธิ์ผิด แล้ว Google คืนหน้า HTML ล็อกอินมาแทน
      throw new Error(
        'เซิร์ฟเวอร์ไม่ได้ตอบเป็น JSON — ตรวจว่า deployment ตั้ง Who has access เป็น Anyone และใช้ลิงก์ /exec'
      );
    }

    if (data && data.ok === false) {
      throw new Error(String(data.error || 'คำสั่งไม่สำเร็จ'));
    }
    return data;
  }

  // ---------------------------------------------------------------- push

  /**
   * ส่งรายการในคิวขึ้นชีต เอาเฉพาะรายการที่เซิร์ฟเวอร์ยืนยันแล้วออกจากคิว
   * คืน true เมื่อคิวว่างหลังทำงานเสร็จ
   */
  public async flush(): Promise<boolean> {
    if (this.busy) return false;
    if (!this.isConfigured()) return false;

    const box = this.getOutbox();
    if (!box.length) return true;

    this.busy = true;
    this.emit();

    try {
      const data = await this.call({ action: 'push', logs: box });
      const accepted: string[] = Array.isArray(data?.accepted) ? data.accepted : [];
      const acceptedSet = new Set(accepted);

      const remaining = this.getOutbox().filter((e) => !acceptedSet.has(String(e.id)));
      this.setOutbox(remaining);
      this.setMeta({ lastPushAt: new Date().toISOString(), lastError: null });
      return remaining.length === 0;
    } catch (err: any) {
      // เก็บไว้ในคิวต่อ ลองใหม่รอบหน้า
      this.setMeta({ lastError: err?.message ? String(err.message) : String(err) });
      return false;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  // ---------------------------------------------------------------- pull

  /** ดึงจุดตรวจ/รอบ/รายชื่อ/ค่าตั้งค่าสาธารณะ — ไม่ต้องใช้กุญแจ */
  public async pullPublic(): Promise<PullPublicResult> {
    this.busy = true;
    this.emit();
    try {
      const data = await this.call({ action: 'pullPublic' });
      this.setMeta({ lastPullAt: new Date().toISOString(), lastError: null });
      return {
        checkpoints: Array.isArray(data?.checkpoints) ? data.checkpoints : [],
        rounds: Array.isArray(data?.rounds) ? data.rounds : [],
        guards: Array.isArray(data?.guards) ? data.guards : [],
        config: data?.config || {},
      };
    } catch (err: any) {
      this.setMeta({ lastError: err?.message ? String(err.message) : String(err) });
      throw err;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  /**
   * ตรวจกุญแจผู้ดูแลกับชีต (แหล่งอ้างอิงเดียวของระบบ)
   * ใช้แทนการเทียบกับค่าใน localStorage ซึ่งใครก็ตั้งเองได้
   */
  public async verifyKey(key: string): Promise<boolean> {
    try {
      await this.call({ action: 'verifyKey', key });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * ตั้ง DASH_KEY ลงแท็บ Config ครั้งแรก
   * เซิร์ฟเวอร์จะยอมเฉพาะตอนที่ยังไม่เคยตั้งเท่านั้น (ตั้งแล้วต้องไปแก้ในชีตเอง)
   * ถ้าไม่ทำขั้นนี้ กุญแจที่ตั้งในเครื่องจะใช้เข้าระบบไม่ได้เลยเมื่อเชื่อมชีตแล้ว
   */
  public async setDashKey(key: string): Promise<void> {
    await this.call({ action: 'setDashKey', key });
    this.adminKey = key;
  }

  /** ดึงบันทึกผลตรวจของทุกเครื่อง — ต้องใช้กุญแจผู้ดูแล */
  public async pullLogs(from?: string): Promise<LogEntry[]> {
    this.busy = true;
    this.emit();
    try {
      const data = await this.call({ action: 'pullLogs', key: this.adminKey, from: from || '' });
      this.setMeta({
        lastPullAt: new Date().toISOString(),
        lastError: null,
        // เซิร์ฟเวอร์ตัดให้เหลือเฉพาะรายการล่าสุดเมื่อเกิน MAX_PULL_LOGS
        // ถ้าไม่ส่งต่อ ผู้ดูแลจะเห็นรายงานย้อนหลังไม่ครบโดยไม่รู้ตัว
        logsTruncated: Boolean(data?.truncated),
      });
      return Array.isArray(data?.logs) ? data.logs : [];
    } catch (err: any) {
      this.setMeta({ lastError: err?.message ? String(err.message) : String(err) });
      throw err;
    } finally {
      this.busy = false;
      this.emit();
    }
  }

  // ---------------------------------------------------------------- admin writes

  public async saveCheckpoints(checkpoints: Checkpoint[]): Promise<void> {
    await this.call({ action: 'saveCheckpoints', key: this.adminKey, checkpoints });
    this.setMeta({ lastPushAt: new Date().toISOString(), lastError: null });
    this.emit();
  }

  public async saveGuards(guards: Guard[]): Promise<void> {
    await this.call({ action: 'saveGuards', key: this.adminKey, guards });
    this.setMeta({ lastPushAt: new Date().toISOString(), lastError: null });
    this.emit();
  }

  // ---------------------------------------------------------------- auto retry

  private started = false;

  /** เริ่มลองส่งคิวอัตโนมัติ: ตอนกลับมาออนไลน์ ตอนสลับกลับมาที่แท็บ และทุก 2 นาที */
  public startAutoFlush(): void {
    if (this.started) return;
    this.started = true;

    const tryFlush = () => {
      if (navigator.onLine !== false) void this.flush();
    };

    window.addEventListener('online', tryFlush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') tryFlush();
    });
    window.setInterval(tryFlush, 120000);
    tryFlush();
  }
}

export const sheetSync = new SheetSync();
