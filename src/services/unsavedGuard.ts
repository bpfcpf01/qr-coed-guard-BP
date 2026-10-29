/**
 * กันงานที่แก้ค้างไว้หายเพราะกดผิด
 *
 * หน้าจัดการของผู้ดูแลแก้ทีละหลายแถวแล้วค่อยกดบันทึกครั้งเดียว
 * ถ้าเผลอกดเมนูอื่น ปิดแท็บ หรือกด "ยกเลิกการแก้ไข" งานที่ทำมาจะหายทันที
 * โดยไม่มีอะไรถาม ตัวนี้เก็บสถานะ "ยังมีของค้าง" ไว้ที่เดียว ให้ทั้งเมนู
 * และตัวเบราว์เซอร์เรียกใช้ได้
 */

let pendingLabel = '';

/** ตั้ง/ล้างสถานะว่ามีการแก้ค้างอยู่ — ส่งสตริงว่างเพื่อล้าง */
export function setUnsaved(label: string): void {
  pendingLabel = label || '';
}

export function hasUnsaved(): boolean {
  return pendingLabel !== '';
}

/**
 * ถามก่อนทิ้งงานที่ค้างอยู่ — คืน true เมื่อผู้ใช้ยืนยันว่าจะทิ้ง
 * ไม่มีของค้างก็ผ่านไปเลย ไม่ต้องรบกวน
 */
export function confirmDiscard(action = 'ออกจากหน้านี้'): boolean {
  if (!hasUnsaved()) return true;
  const ok = window.confirm(
    `ยังมีการแก้ไขที่ยังไม่ได้บันทึก (${pendingLabel})\n\n` +
    `ถ้า${action}ตอนนี้ การแก้ไขทั้งหมดจะหายไป ต้องการทำต่อหรือไม่?`
  );
  if (ok) setUnsaved('');
  return ok;
}

/**
 * เตือนตอนปิดแท็บหรือกดรีเฟรชขณะมีของค้าง
 * เบราว์เซอร์บังคับใช้ข้อความมาตรฐานของตัวเอง กำหนดเองไม่ได้
 */
export function installBeforeUnload(): () => void {
  const handler = (e: BeforeUnloadEvent) => {
    if (!hasUnsaved()) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}
