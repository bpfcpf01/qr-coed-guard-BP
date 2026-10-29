import React, { useState } from 'react';
import { ShieldCheck, KeyRound, AlertCircle } from 'lucide-react';

interface FirstRunSetupProps {
  siteName: string;
  /**
   * ตั้งกุญแจผู้ดูแลครั้งแรก
   * คืนข้อความผิดพลาดถ้าเขียนลงชีตไม่สำเร็จ หรือ null เมื่อสำเร็จ
   */
  onSetKey: (key: string) => Promise<string | null>;
  /** เชื่อมชีตอยู่ไหม — ถ้าใช่ กุญแจจะถูกเขียนลงแท็บ Config ให้ทุกเครื่องใช้ร่วมกัน */
  savesToSheet?: boolean;
}

const MIN_LEN = 6;

/**
 * หน้าตั้งค่าครั้งแรก — แสดงเมื่อยังไม่เคยตั้ง DASH_KEY
 * เพื่อไม่ต้อง hard-code กุญแจผู้ดูแลไว้ในซอร์สโค้ด
 */
export const FirstRunSetup: React.FC<FirstRunSetupProps> = ({
  siteName,
  onSetKey,
  savesToSheet = false,
}) => {
  const [key1, setKey1] = useState('');
  const [key2, setKey2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const a = key1.trim();
    const b = key2.trim();

    if (a.length < MIN_LEN) {
      setError(`กุญแจต้องยาวอย่างน้อย ${MIN_LEN} ตัวอักษร`);
      return;
    }
    if (a !== b) {
      setError('กุญแจทั้งสองช่องไม่ตรงกัน');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      // ต้องรอผลจริง — ถ้าเขียนลงชีตไม่สำเร็จ ห้ามบอกผู้ใช้ว่าตั้งค่าเรียบร้อย
      const err = await onSetKey(a);
      if (err) setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm max-w-md w-full p-7">
        <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mb-4">
          <ShieldCheck className="w-5 h-5" />
        </div>

        <h1 className="text-lg font-bold text-slate-900">ตั้งค่าระบบครั้งแรก</h1>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          {siteName}
          <br />
          กรุณาตั้งกุญแจผู้ดูแลระบบ (DASH_KEY) เพื่อใช้เข้าหน้าแดชบอร์ด รายงาน
          และการตั้งค่าต่าง ๆ — เจ้าหน้าที่ รปภ. ไม่ต้องใช้กุญแจนี้ในการบันทึกการตรวจ
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              กุญแจผู้ดูแลระบบ
            </label>
            <input
              type="password"
              value={key1}
              onChange={(e) => {
                setKey1(e.target.value);
                setError(null);
              }}
              autoFocus
              placeholder={`อย่างน้อย ${MIN_LEN} ตัวอักษร`}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              ยืนยันกุญแจอีกครั้ง
            </label>
            <input
              type="password"
              value={key2}
              onChange={(e) => {
                setKey2(e.target.value);
                setError(null);
              }}
              placeholder="พิมพ์ซ้ำให้ตรงกัน"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors flex items-center justify-center gap-2 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            <KeyRound className="w-4 h-4" />
            <span>{saving ? 'กำลังบันทึกกุญแจ…' : 'บันทึกกุญแจและเริ่มใช้งาน'}</span>
          </button>
        </form>

        <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
          {savesToSheet ? (
            <>
              กุญแจนี้จะถูกบันทึกลงแท็บ Config ของ Google Sheet (ช่อง DASH_KEY)
              ซึ่งเป็นแหล่งอ้างอิงเดียวที่เซิร์ฟเวอร์ใช้ตรวจสิทธิ์ ตั้งได้ครั้งเดียว
              หากต้องการเปลี่ยนภายหลังให้แก้ในชีตโดยตรง
            </>
          ) : (
            <>
              ยังไม่ได้เชื่อมกับ Google Sheet กุญแจนี้จึงถูกเก็บไว้ในเบราว์เซอร์ของเครื่องนี้
              เท่านั้น และใช้แยกมุมมองผู้ดูแลกับเจ้าหน้าที่ รปภ. ในระดับหน้าจอ
              เมื่อเชื่อมชีตแล้วต้องตั้ง DASH_KEY ในแท็บ Config ให้ตรงกันด้วย
            </>
          )}{' '}
          หากต้องการจำกัดผู้เข้าถึงเว็บจริง ๆ ให้ตั้งค่าที่ระดับโฮสต์อีกชั้น
        </p>
      </div>
    </div>
  );
};
