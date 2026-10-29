/**
 * ลงทะเบียน Service Worker เพื่อให้แอปเปิดได้ตอนไม่มีสัญญาณ
 *
 * ลงทะเบียนเฉพาะตอน build จริงเท่านั้น ระหว่างพัฒนาการแคชไฟล์จะบังหน้าโค้ดใหม่
 * ทำให้แก้แล้วไม่เห็นผล จนหลงคิดว่าโค้ดไม่ทำงาน
 */
export function registerServiceWorker(): void {
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      // ลงทะเบียนไม่ได้ก็ยังใช้งานแบบออนไลน์ได้ตามปกติ ไม่ต้องขวางผู้ใช้
      console.warn('ลงทะเบียน service worker ไม่สำเร็จ:', err);
    });
  });
}
