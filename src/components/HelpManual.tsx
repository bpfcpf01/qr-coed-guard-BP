import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  X,
  QrCode,
  CheckCircle,
  AlertTriangle,
  Flag,
  ClipboardList,
  Wrench,
  WifiOff,
} from 'lucide-react';
import { SystemConfig } from '../types';
import { patrolEngine } from '../services/guardPatrolEngine';

interface HelpManualProps {
  isOpen: boolean;
  onClose: () => void;
  config: SystemConfig;
  mode: 'guard' | 'admin';
}

type TabId = 'guard' | 'signal' | 'admin' | 'trouble';

/**
 * คู่มือการใช้งานในตัวแอป — เปิดจากปุ่มมุมขวาบน
 *
 * เนื้อหาอยู่ในตัวแอปทั้งหมด ไม่ต้องต่อเน็ต จึงเปิดอ่านได้ตอนเดินตรวจในจุดที่สัญญาณอับ
 * ค่าเกณฑ์ต่าง ๆ (รัศมี ความแม่นยำ กันซ้ำ ความเร็ว) อ่านจาก config จริงที่ใช้อยู่
 * ไม่ใช่ตัวเลขที่พิมพ์ตายไว้ เพราะถ้าผู้ดูแลแก้เกณฑ์แล้วคู่มือบอกเลขเก่า
 * รปภ. จะเชื่อคู่มือแล้วเข้าใจผิดว่าระบบเสีย
 */
export const HelpManual: React.FC<HelpManualProps> = ({ isOpen, onClose, config, mode }) => {
  const [tab, setTab] = useState<TabId>('guard');

  // รปภ. เปิดคู่มือกลางสนามด้วยมือข้างเดียว กดปุ่ม back/Esc ต้องปิดได้ทันที
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // ออกจากโหมดผู้ดูแลแล้วกลับมาเปิดคู่มือ ต้องไม่ค้างอยู่แท็บที่ตัวเองไม่มีสิทธิ์เห็น
  useEffect(() => {
    if (mode === 'guard' && tab === 'admin') setTab('guard');
  }, [mode, tab]);

  if (!isOpen) return null;

  const rounds = patrolEngine.getRounds();
  const maxAcc = config.MAX_ACCURACY_M || 60;
  const radius = config.DEFAULT_RADIUS_M || 40;
  const dupMin = config.DUPLICATE_WINDOW_MIN || 20;
  const speedKmh = config.SPEED_FLAG_KMH || 25;

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: 'guard', label: 'สำหรับ รปภ.', icon: QrCode },
    { id: 'signal', label: 'สัญลักษณ์ & ธง', icon: Flag },
    ...(mode === 'admin'
      ? [{ id: 'admin' as TabId, label: 'สำหรับหัวหน้าชุด', icon: ClipboardList }]
      : []),
    { id: 'trouble', label: 'แก้ปัญหาที่พบบ่อย', icon: Wrench },
  ];

  return (
    <div
      className="noprint fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 text-slate-800 rounded-2xl w-full max-w-2xl shadow-xl relative flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* หัวคู่มือ */}
        <div className="px-5 sm:px-6 pt-5 pb-3 border-b border-slate-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            title="ปิด"
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" />
            คู่มือการใช้งาน
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            {config.SITE_NAME} · {config.DOC_CODE}
          </p>

          <div className="flex items-center gap-1 flex-wrap mt-3">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors font-medium border ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 border-blue-200 shadow-xs'
                      : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* เนื้อหา */}
        <div className="px-5 sm:px-6 py-5 overflow-y-auto text-sm leading-relaxed space-y-5">
          {tab === 'guard' && (
            <>
              <section>
                <h4 className="text-sm font-bold text-slate-900 mb-2">ขั้นตอนการบันทึกการเดินตรวจ</h4>
                <ol className="list-decimal list-outside pl-5 space-y-1.5 text-xs text-slate-600">
                  <li>ส่องกล้องไปที่ป้าย QR Code ประจำจุดตรวจ</li>
                  <li>
                    ดู <strong className="text-slate-800">แถบสีด้านบนจอ</strong> ว่าเขียวแล้วหรือยัง
                    (ความหมายของแต่ละสีอยู่ด้านล่าง)
                  </li>
                  <li>เลือกชื่อตัวเอง — ครั้งต่อไประบบจำให้ ไม่ต้องเลือกซ้ำ</li>
                  <li>
                    เลือกสถานะ <strong className="text-slate-800">ปกติ</strong> หรือ{' '}
                    <strong className="text-slate-800">พบสิ่งผิดปกติ</strong> แล้วพิมพ์หมายเหตุถ้ามี
                  </li>
                  <li>กดปุ่มบันทึก รอจนขึ้นข้อความยืนยัน</li>
                </ol>
              </section>

              <section>
                <h4 className="text-sm font-bold text-slate-900 mb-2">แถบสีด้านบนจอบอกอะไร</h4>
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1 w-3 h-3 rounded-full bg-emerald-600 shrink-0" />
                    <p className="text-xs text-slate-600">
                      <strong className="text-slate-800">เขียว</strong> — อยู่ในระยะจุดตรวจแล้ว กดบันทึกได้เลย
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1 w-3 h-3 rounded-full bg-amber-500 shrink-0" />
                    <p className="text-xs text-slate-600">
                      <strong className="text-slate-800">เหลือง</strong> — สัญญาณหยาบเกิน ±{maxAcc} ม.
                      หรือจุดนี้ยังไม่ได้ตั้งพิกัด ให้ออกที่โล่งแล้วรอสักครู่
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1 w-3 h-3 rounded-full bg-rose-600 shrink-0" />
                    <p className="text-xs text-slate-600">
                      <strong className="text-slate-800">แดง</strong> — อยู่นอกรัศมี หรือยังไม่ได้อนุญาตให้ใช้ตำแหน่ง
                      ให้เดินเข้าใกล้จุดจริง หรือเปิดสิทธิ์ตำแหน่งในเครื่อง
                    </p>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="mt-1 w-3 h-3 rounded-full bg-slate-700 shrink-0" />
                    <p className="text-xs text-slate-600">
                      <strong className="text-slate-800">เทา</strong> — กำลังรอสัญญาณ GPS รอสักครู่
                    </p>
                  </div>
                </div>
              </section>

              <section className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <h4 className="text-xs font-bold text-amber-900 flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  ติดแดงทั้งที่ยืนอยู่ที่จุดจริง
                </h4>
                <p className="text-xs text-amber-800">
                  บางจุดสัญญาณอับ เช่น ใต้โครงหลังคาโกดัง ให้กดปุ่ม{' '}
                  <strong>“ขอบันทึกพิเศษ”</strong> แล้วพิมพ์เหตุผลตามจริง ระบบจะบันทึกให้
                  แต่รายการนั้นจะถูกติดธงไว้ให้หัวหน้าชุดตรวจสอบ จึงต้องเขียนเหตุผลให้ชัดเจนทุกครั้ง
                </p>
              </section>

              <section className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <h4 className="text-xs font-bold text-blue-900 flex items-center gap-1.5 mb-1.5">
                  <WifiOff className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  ใช้งานตอนไม่มีสัญญาณเน็ต
                </h4>
                <ul className="list-disc list-outside pl-4 space-y-1 text-xs text-blue-800">
                  <li>
                    <strong>ต้องเปิดแอปตอนมีสัญญาณอย่างน้อย 1 ครั้งก่อนออกเดินตรวจเสมอ</strong>
                  </li>
                  <li>ตอนไม่มีเน็ตยังบันทึกได้ตามปกติ ข้อมูลจะค้างในคิวแล้วส่งเองเมื่อกลับมามีสัญญาณ</li>
                  <li>ดูสถานะการส่งได้ที่ป้ายเล็ก ๆ มุมบนของจอ</li>
                  <li>แนะนำให้ติดตั้งลงหน้าจอโฮม จะได้ไม่ต้องใส่รหัสผ่านบ่อย</li>
                </ul>
              </section>

              <section>
                <h4 className="text-sm font-bold text-slate-900 mb-2">ข้อควรรู้</h4>
                <ul className="list-disc list-outside pl-5 space-y-1 text-xs text-slate-600">
                  <li>
                    จุดเดิม คนเดิม ภายใน {dupMin} นาที ระบบจะไม่ให้บันทึกซ้ำ
                  </li>
                  <li>ต้องอนุญาตให้แอปใช้ตำแหน่ง ไม่อย่างนั้นจะกดบันทึกไม่ได้เลย</li>
                  <li>
                    รอบตรวจแบ่งเป็น {rounds.length} รอบ ระบบจับรอบให้เองจากเวลาที่บันทึก
                    ไม่ต้องเลือกเอง
                  </li>
                </ul>
              </section>
            </>
          )}

          {tab === 'signal' && (
            <>
              <section>
                <h4 className="text-sm font-bold text-slate-900 mb-2">ธงตรวจสอบ (Flags) แปลว่าอะไร</h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-left">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold w-36">ธง</th>
                        <th className="py-2.5 px-3 font-semibold">ความหมาย</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      <tr>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">OUT_OF_RANGE</td>
                        <td className="py-2 px-3">บันทึกจากนอกรัศมีของจุดตรวจ</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">OVERRIDE</td>
                        <td className="py-2 px-3">ใช้ “ขอบันทึกพิเศษ” — ต้องอ่านเหตุผลที่ผู้ตรวจเขียนไว้</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">LOW_ACCURACY</td>
                        <td className="py-2 px-3">สัญญาณหยาบเกินเกณฑ์ ±{maxAcc} ม. (พบบ่อยในอาคาร)</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">NO_GPS</td>
                        <td className="py-2 px-3">ไม่มีพิกัดเลย — ตรวจว่าเครื่องเปิดระบบระบุตำแหน่งไหม</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">NO_REFERENCE</td>
                        <td className="py-2 px-3">จุดตรวจนี้ยังไม่ได้ตั้งพิกัดอ้างอิง ต้องไปเดินเก็บพิกัดก่อน</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">SPEED_xx</td>
                        <td className="py-2 px-3">
                          เคลื่อนที่ระหว่างจุดเร็วเกิน {speedKmh} กม./ชม. (ตัวเลขคือความเร็วที่คำนวณได้)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h4 className="text-sm font-bold text-slate-900 mb-2">เกณฑ์ที่ระบบใช้อยู่ตอนนี้</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="border border-slate-200 rounded-xl p-3">
                    <p className="text-xs text-slate-500">รัศมีมาตรฐานของจุดตรวจ</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{radius} เมตร</p>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3">
                    <p className="text-xs text-slate-500">ความแม่นยำ GPS ที่ยอมรับ</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">ไม่เกิน ±{maxAcc} เมตร</p>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3">
                    <p className="text-xs text-slate-500">กันบันทึกซ้ำ</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{dupMin} นาที</p>
                  </div>
                  <div className="border border-slate-200 rounded-xl p-3">
                    <p className="text-xs text-slate-500">เกณฑ์ธงความเร็ว</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{speedKmh} กม./ชม.</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  รัศมีของบางจุดตั้งไว้ต่างจากค่ามาตรฐานได้ ดูค่าจริงรายจุดที่หน้า “จัดการจุดตรวจ”
                </p>
              </section>

              <section>
                <h4 className="text-sm font-bold text-slate-900 mb-2">รอบตรวจ</h4>
                <div className="flex flex-wrap gap-1.5">
                  {rounds.map((r) => (
                    <span
                      key={r.round_id}
                      className="text-xs px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium"
                    >
                      {r.label}
                    </span>
                  ))}
                </div>
              </section>
            </>
          )}

          {tab === 'admin' && mode === 'admin' && (
            <>
              <section>
                <h4 className="text-sm font-bold text-slate-900 mb-2">เมนูแต่ละหน้าใช้ตอนไหน</h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-left">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold w-40">เมนู</th>
                        <th className="py-2.5 px-3 font-semibold">ใช้ทำอะไร</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">หน้าหลัก</td>
                        <td className="py-2 px-3">
                          ภาพรวมวันนี้ — ความครบถ้วน รายการติดธง สิ่งผิดปกติ จุดที่ยังไม่มีพิกัด และบันทึกล่าสุด
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">แดชบอร์ด &amp; รายงาน</td>
                        <td className="py-2 px-3">
                          กระดานจุดตรวจ × รอบรายวัน และรายงานตามช่วงวันที่ กรองรายคนได้ กดพิมพ์เก็บเข้าแฟ้มได้
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">จัดการจุดตรวจ</td>
                        <td className="py-2 px-3">เพิ่ม ลบ แก้ชื่อ โซน รัศมี และเปิด-ปิดใช้งานจุดตรวจ</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">สำรวจพิกัด</td>
                        <td className="py-2 px-3">เดินไปยืนที่จุดจริงแล้วเก็บพิกัดลงระบบ</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">พิมพ์ QR จุดตรวจ</td>
                        <td className="py-2 px-3">พิมพ์ป้าย QR ไปติดหน้างาน</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">รายชื่อ รปภ.</td>
                        <td className="py-2 px-3">เพิ่ม แก้ชื่อ และเปิด-ปิดใช้งานรายชื่อผู้ตรวจ</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">Apps Script &amp; ชีต</td>
                        <td className="py-2 px-3">ตั้งค่าการเชื่อมต่อกับ Google Sheets</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                <h4 className="text-xs font-bold text-rose-900 flex items-center gap-1.5 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                  กฎ 3 ข้อที่พลาดแล้วแก้ยาก
                </h4>
                <ol className="list-decimal list-outside pl-4 space-y-1.5 text-xs text-rose-800">
                  <li>
                    <strong>คนลาออก หรือจุดเลิกใช้ ให้ “ปิดใช้งาน” ไม่ใช่ “ลบถาวร”</strong>{' '}
                    ปิดใช้งานแล้วหายจากหน้าจอ รปภ. แต่รายงานย้อนหลังยังอ่านได้
                    ส่วนลบถาวรทำได้เฉพาะรายการที่ไม่เคยมีบันทึกเลย และต้องกด “ดึงบันทึกจากชีต” ก่อน
                  </li>
                  <li>
                    <strong>รหัสจุดตรวจไม่ถูกนำกลับมาใช้ซ้ำ</strong> จุดใหม่นับต่อจากเลขสูงสุดเสมอ
                    เพราะป้าย QR ที่ติดอยู่หน้างานฝังรหัสจุดไว้ในตัว ถ้าใช้เลขซ้ำป้ายเดิมจะชี้ผิดจุด
                  </li>
                  <li>
                    <strong>เพิ่มจุดใหม่แล้วต้องทำต่ออีก 2 อย่าง</strong> คือไปเก็บพิกัดที่จุดจริง
                    และพิมพ์ QR ไปติด ไม่อย่างนั้นจุดนั้นจะตรวจรัศมีไม่ได้
                  </li>
                </ol>
              </section>

              <section>
                <h4 className="text-sm font-bold text-slate-900 mb-2">งานประจำที่แนะนำ</h4>
                <ul className="space-y-2 text-xs text-slate-600">
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-800">ทุกวัน</strong> — เปิดหน้าหลัก ดูความครบถ้วนของเมื่อวาน
                      แล้วเปิดอ่านรายการติดธงและ “พบสิ่งผิดปกติ” ทุกใบ
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-800">ทุกสัปดาห์</strong> — ดูรายงานย้อนหลัง 7 วัน
                      แยกตามรอบ โซน และรายคน หาจุดที่ติดธงซ้ำ ๆ แล้วพิมพ์รายงานเก็บเข้าแฟ้ม
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    <span>
                      <strong className="text-slate-800">ทุกเดือน หรือเมื่อมีคนเข้า-ออก</strong> —
                      อัปเดตรายชื่อ รปภ. ตรวจสภาพป้าย QR หน้างาน และเปิดหน้า{' '}
                      <code className="font-mono bg-slate-100 px-1 rounded">/__health</code> ดูว่าระบบต่อกันครบ
                    </span>
                  </li>
                </ul>
              </section>

              <section className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-900 mb-1.5">ก่อนส่งเครื่องคืน รปภ.</h4>
                <p className="text-xs text-slate-600">
                  กด <strong>“ออกจากระบบผู้ดูแล”</strong> ทุกครั้ง มิฉะนั้นเครื่องนั้นจะเข้าถึงรายงานและหน้าจัดการได้
                </p>
              </section>
            </>
          )}

          {tab === 'trouble' && (
            <>
              <section>
                <h4 className="text-sm font-bold text-slate-900 mb-2">อาการที่พบบ่อย</h4>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-left">
                      <tr>
                        <th className="py-2.5 px-3 font-semibold w-48">อาการ</th>
                        <th className="py-2.5 px-3 font-semibold">สาเหตุและวิธีแก้</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-600">
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">กดบันทึกไม่ได้ ปุ่มเป็นสีเทา</td>
                        <td className="py-2 px-3">
                          ยังไม่ได้เลือกชื่อผู้ตรวจ หรือยังไม่มีสัญญาณ GPS หรืออยู่นอกรัศมี
                          ให้ดูข้อความบนแถบสีด้านบนจอ
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">ขึ้นว่าไม่ได้รับอนุญาตให้ใช้ตำแหน่ง</td>
                        <td className="py-2 px-3">
                          เปิดสิทธิ์ตำแหน่งให้เว็บนี้ในตั้งค่าเบราว์เซอร์ แล้วเปิดแอปใหม่
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">แถบสีค้างเหลืองไม่ยอมเขียว</td>
                        <td className="py-2 px-3">
                          สัญญาณหยาบเกิน ±{maxAcc} ม. ให้ออกที่โล่งสักครู่ ถ้าจุดนั้นอับสัญญาณประจำ
                          ให้แจ้งหัวหน้าชุดพิจารณาขยายรัศมีของจุด
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">ขึ้นว่าจุดนี้เพิ่งถูกบันทึกไปแล้ว</td>
                        <td className="py-2 px-3">
                          เป็นการกันบันทึกซ้ำภายใน {dupMin} นาที ถ้าต้องตรวจซ้ำจริงให้รอครบเวลา
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">สแกนแล้วขึ้นว่าไม่พบจุดตรวจ</td>
                        <td className="py-2 px-3">
                          ป้าย QR อาจเป็นของเก่าหรือจุดนั้นถูกปิดใช้งานไปแล้ว ให้แจ้งหัวหน้าชุด
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 font-semibold text-slate-800">บันทึกแล้วแต่ยังไม่ขึ้นในรายงาน</td>
                        <td className="py-2 px-3">
                          เครื่องนั้นอาจยังออฟไลน์ ข้อมูลค้างในคิวและจะส่งเองเมื่อกลับมามีสัญญาณ
                          ให้ดูป้ายสถานะการส่งที่มุมบนของจอ
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              {mode === 'admin' && (
                <section className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-blue-900 mb-1.5">ตรวจระบบทั้งเส้นในที่เดียว</h4>
                  <p className="text-xs text-blue-800">
                    เปิด <code className="font-mono bg-white/70 px-1 rounded">/__health</code> ต่อท้ายที่อยู่เว็บ
                    จะเห็นว่าการเชื่อมต่อกับ Google Sheets เขตเวลาของชีต และการแจ้งเตือนเข้าห้องแชท
                    ทำงานครบหรือยัง พร้อมบอกสาเหตุเมื่อมีอะไรไม่ผ่าน โดยไม่แสดงค่าความลับใด ๆ
                  </p>
                </section>
              )}

              <p className="text-xs text-slate-400">
                แก้ตามนี้แล้วยังไม่หาย ให้แจ้งหัวหน้าชุด พร้อมบอกรหัสจุดตรวจ เวลา และข้อความที่ขึ้นบนจอ
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
