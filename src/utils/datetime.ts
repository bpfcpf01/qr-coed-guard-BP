/**
 * Datetime helpers using device's local timezone (e.g. Asia/Bangkok UTC+7)
 * Fixes overnight shift date shift bugs.
 */

/** คืนค่า yyyy-MM-dd ตามเวลาท้องถิ่นของเครื่อง (ไม่ใช่ UTC) */
export function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** คืนค่า HH:mm:ss ตามเวลาท้องถิ่น */
export function localTimeStr(d: Date = new Date()): string {
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}
