import React, { useEffect, useState } from 'react';
import { sheetSync, SyncStatus } from '../services/sheetSync';
import { CloudOff, CloudUpload, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface SyncStatusBadgeProps {
  /** แสดงแบบย่อ (ใช้ใน Navbar) หรือแบบเต็มพร้อมรายละเอียด */
  compact?: boolean;
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'ยังไม่เคย';
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return 'ยังไม่เคย';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} ชม.ที่แล้ว`;
  return `${Math.floor(hr / 24)} วันที่แล้ว`;
}

/**
 * แสดงสถานะการส่งข้อมูลขึ้น Google Sheets
 * แยกให้ชัดระหว่าง "บันทึกในเครื่องแล้ว" กับ "ส่งขึ้นชีตแล้ว"
 * เพื่อไม่ให้เข้าใจผิดว่าข้อมูลถึงปลายทางทั้งที่ยังค้างอยู่
 */
export const SyncStatusBadge: React.FC<SyncStatusBadgeProps> = ({ compact = false }) => {
  const [status, setStatus] = useState<SyncStatus>(() => sheetSync.getStatus());

  useEffect(() => sheetSync.subscribe(setStatus), []);

  if (!status.configured) {
    if (compact) return null;
    return (
      <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
        <CloudOff className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
        <span>
          ยังไม่ได้เชื่อมต่อ Google Sheets — บันทึกอยู่ในเครื่องนี้เท่านั้น
          เครื่องอื่นและหัวหน้าชุดจะยังไม่เห็นข้อมูล
        </span>
      </div>
    );
  }

  const hasPending = status.pending > 0;
  const hasError = Boolean(status.lastError);

  if (compact) {
    if (!hasPending && !hasError) return null;
    return (
      <span
        title={status.lastError || `ค้างส่ง ${status.pending} รายการ`}
        className={`flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg border ${
          hasError
            ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-amber-50 text-amber-700 border-amber-200'
        }`}
      >
        {status.busy ? (
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <CloudUpload className="w-3.5 h-3.5" />
        )}
        <span>ค้างส่ง {status.pending}</span>
      </span>
    );
  }

  return (
    <div
      className={`rounded-xl px-3 py-2.5 border text-xs ${
        hasError
          ? 'bg-rose-50 border-rose-200 text-rose-800'
          : hasPending
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
      }`}
    >
      <div className="flex items-start gap-2">
        {hasError ? (
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
        ) : hasPending ? (
          <CloudUpload className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
        ) : (
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
        )}

        <div className="flex-1 leading-relaxed">
          {hasError ? (
            <>
              <strong>ส่งขึ้นชีตไม่สำเร็จ</strong> — ข้อมูลยังอยู่ครบในเครื่องและจะลองส่งใหม่อัตโนมัติ
              <div className="mt-1 font-mono text-[11px] opacity-80">{status.lastError}</div>
            </>
          ) : hasPending ? (
            <>
              <strong>ค้างรอส่งขึ้นชีต {status.pending} รายการ</strong> — บันทึกในเครื่องเรียบร้อยแล้ว
              ระบบจะส่งให้เองเมื่อสัญญาณกลับมา
            </>
          ) : (
            <>
              <strong>ส่งขึ้นชีตครบแล้ว</strong> — ล่าสุด {timeAgo(status.lastPushAt)}
            </>
          )}
        </div>

        <button
          onClick={() => void sheetSync.flush()}
          disabled={status.busy}
          title="ลองส่งอีกครั้ง"
          className="shrink-0 p-1 rounded-lg hover:bg-white/60 transition-colors disabled:opacity-40"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status.busy ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
