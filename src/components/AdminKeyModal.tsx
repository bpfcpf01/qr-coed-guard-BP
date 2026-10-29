import React, { useState } from 'react';
import { Key, AlertTriangle, X } from 'lucide-react';

interface AdminKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUnlock: (key: string) => boolean | Promise<boolean>;
}

export const AdminKeyModal: React.FC<AdminKeyModalProps> = ({
  isOpen,
  onClose,
  onUnlock,
}) => {
  const [tempKey, setTempKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tempKey.trim()) {
      setKeyError('กรุณาระบุรหัสกุญแจ');
      return;
    }
    // การตรวจอาจต้องถามชีตก่อน จึงต้องรอผลจริง ห้ามเช็คค่า Promise ตรง ๆ
    setChecking(true);
    setKeyError(null);
    try {
      const success = await onUnlock(tempKey.trim());
      if (success) {
        setTempKey('');
        onClose();
      } else {
        setKeyError('กุญแจไม่ถูกต้อง');
      }
    } finally {
      setChecking(false);
    }
  };

  const handleClose = () => {
    setKeyError(null);
    setTempKey('');
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 text-slate-800 rounded-2xl max-w-md w-full p-6 shadow-xl relative">
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
          title="ปิด"
        >
          <X className="w-4 h-4" />
        </button>

        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-2">
          <Key className="w-4 h-4 text-amber-500" />
          เข้าสู่ระบบผู้ดูแล (DASH_KEY)
        </h3>
        <p className="text-xs text-slate-500 mb-4 leading-relaxed">
          สำหรับหัวหน้าชุดหรือผู้ดูแลระบบ กรุณาระบุรหัสกุญแจ DASH_KEY เพื่อเข้าถึงหน้าแดชบอร์ด, สำรวจพิกัด และรายงาน
        </p>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-xs font-medium text-slate-700 mb-1.5">รหัสกุญแจผู้ดูแล:</label>
            <input
              type="password"
              value={tempKey}
              onChange={(e) => {
                setTempKey(e.target.value);
                if (keyError) setKeyError(null);
              }}
              autoFocus
              placeholder="ระบุกุญแจผู้ดูแลระบบ"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600"
            />
            {keyError && (
              <p className="text-xs text-rose-600 font-medium mt-1.5 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                <span>{keyError}</span>
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={checking}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 shadow-sm transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {checking ? 'กำลังตรวจสอบ…' : 'เข้าสู่ระบบ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
