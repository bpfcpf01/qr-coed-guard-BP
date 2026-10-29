import React, { useEffect, useState } from 'react';
import { patrolEngine } from '../services/guardPatrolEngine';
import { sheetSync } from '../services/sheetSync';
import { Guard } from '../types';
import {
  nextGuardId, guardUsageCount, validateGuards, canHardDelete,
  summarizeChanges, describeChanges, DiffRow,
} from '../services/rosterRules';
import { setUnsaved, confirmDiscard, installBeforeUnload } from '../services/unsavedGuard';
import { Users, Save, CheckCircle, AlertCircle, RotateCcw, Plus, Trash2, Download } from 'lucide-react';

interface GuardRosterViewProps {
  adminKey: string;
}

/**
 * จัดการรายชื่อเจ้าหน้าที่ รปภ. (โหมดผู้ดูแลเท่านั้น)
 * ชื่อจริงถูกเก็บใน localStorage ของเครื่องนี้เท่านั้น ไม่ได้อยู่ในซอร์สโค้ด
 */
export const GuardRosterView: React.FC<GuardRosterViewProps> = ({ adminKey }) => {
  const [rows, setRows] = useState<Guard[]>([]);
  const [message, setMessage] = useState<{ type: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /** ดึงบันทึกจากชีตแล้วหรือยัง — ต้องรู้ก่อนจึงจะยอมให้ลบถาวรได้ */
  const [logsSynced, setLogsSynced] = useState(false);

  /** ชุดข้อมูลที่โหลดมาล่าสุด ใช้เทียบว่ามีอะไรถูกแก้บ้าง */
  const [saved, setSaved] = useState<Guard[]>([]);

  const load = () => {
    const fresh = patrolEngine.getAllGuards();
    setRows(fresh);
    setSaved(fresh);
  };

  useEffect(() => {
    load();
  }, []);
  useEffect(() => installBeforeUnload(), []);

  const toDiff = (g: Guard): DiffRow => ({
    id: g.guard_id,
    label: `${g.guard_id} ${g.name}`.trim(),
    active: g.active === 'NO' ? 'NO' : 'YES',
    fingerprint: g.name.trim(),
  });
  const changes = summarizeChanges(saved.map(toDiff), rows.map(toDiff));

  // บอกเมนูและเบราว์เซอร์ว่ายังมีของค้าง จะได้เตือนก่อนพาออกจากหน้านี้
  useEffect(() => {
    setUnsaved(changes.total ? describeChanges(changes) : '');
    return () => setUnsaved('');
  }, [changes.total, changes.added.length, changes.removed.length]);

  const setName = (idx: number, name: string) => {
    setRows((prev) => prev.map((g, i) => (i === idx ? { ...g, name } : g)));
    setMessage(null);
  };

  const toggleActive = (idx: number) => {
    setRows((prev) =>
      prev.map((g, i) => (i === idx ? { ...g, active: g.active === 'NO' ? 'YES' : 'NO' } : g)),
    );
    setMessage(null);
  };

  const addRow = () => {
    setRows((prev) => [...prev, { guard_id: nextGuardId(prev), name: '', active: 'YES' }]);
    setMessage(null);
  };

  const removeRow = (idx: number) => {
    const row = rows[idx];
    const used = guardUsageCount(patrolEngine.getLogs(), row.name);
    const allowed = canHardDelete(used, logsSynced);
    if (!allowed.ok) {
      setMessage({ type: 'bad', text: `${row.guard_id}: ${allowed.error}` });
      return;
    }
    if (!window.confirm(`ลบ ${row.guard_id} ${row.name || '(ยังไม่มีชื่อ)'} ออกถาวร?`)) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setMessage(null);
  };

  /** ดึงบันทึกจากชีตเพื่อยืนยันว่าใครเคยตรวจจริง ก่อนจะยอมให้ลบถาวร */
  const syncLogs = async () => {
    if (!sheetSync.isConfigured()) {
      setMessage({ type: 'bad', text: 'ยังไม่ได้เชื่อมต่อชีต จึงตรวจไม่ได้ว่าใครเคยตรวจ' });
      return;
    }
    setBusy(true);
    sheetSync.setAdminKey(adminKey);
    try {
      const pulled = await sheetSync.pullLogs();
      patrolEngine.mergeLogs(pulled);
      setLogsSynced(true);
      setMessage({ type: 'ok', text: `ดึงบันทึกแล้ว ${pulled.length} รายการ — ตรวจการใช้งานได้แล้ว` });
    } catch (err: any) {
      setMessage({ type: 'bad', text: `ดึงบันทึกไม่สำเร็จ: ${err?.message || err}` });
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    const blank = rows.find((g) => !g.name.trim());
    if (blank) {
      setMessage({ type: 'bad', text: `กรุณากรอกชื่อให้ครบ (${blank.guard_id} ยังว่างอยู่)` });
      return;
    }
    // ใช้ตัวตรวจชุดเดียวกับที่เอนจินใช้ จะได้ไม่หลุดกันคนละทาง
    const valid = validateGuards(rows);
    if (!valid.ok) {
      setMessage({ type: 'bad', text: valid.error || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }
    if (changes.total === 0) {
      setMessage({ type: 'bad', text: 'ยังไม่มีการแก้ไขอะไรให้บันทึก' });
      return;
    }

    // การบันทึกเขียนทับทั้งแท็บในชีต ถ้ามีคนหายไปจากรายการต้องให้ยืนยันก่อน
    if (changes.destructive) {
      const lines = [
        changes.removed.length ? `ลบถาวร: ${changes.removed.join(', ')}` : '',
        changes.deactivated.length ? `ปิดใช้งาน: ${changes.deactivated.join(', ')}` : '',
      ].filter(Boolean).join('\n');
      if (!window.confirm(`ยืนยันการบันทึก\n\n${lines}\n\nรายชื่อเหล่านี้จะหายจากหน้าจอของ รปภ. ทันที`)) return;
    }
    // ให้ชีตยืนยันสิทธิ์ก่อนแล้วค่อยเขียนลงเครื่อง (เหตุผลเดียวกับหน้าสำรวจพิกัด)
    // updateGuards ตรวจกุญแจกับค่าใน localStorage ซึ่งใครก็ตั้งเองได้
    void (async () => {
      if (sheetSync.isConfigured()) {
        sheetSync.setAdminKey(adminKey);
        try {
          await sheetSync.saveGuards(rows);
        } catch (err: any) {
          setMessage({
            type: 'bad',
            text: `ส่งรายชื่อขึ้นชีตไม่สำเร็จ จึงยังไม่บันทึก: ${err?.message || err}`,
          });
          return;
        }
      }

      const res = patrolEngine.updateGuards(adminKey, rows);
      if (res.ok) {
        load();
        setUnsaved('');
        setMessage({
          type: 'ok',
          text: sheetSync.isConfigured()
            ? `บันทึกและส่งขึ้นชีตเรียบร้อยแล้ว (${res.count} คน)`
            : `บันทึกรายชื่อในเครื่องแล้ว (${res.count} คน)`,
        });
      } else {
        setMessage({ type: 'bad', text: res.error || 'บันทึกไม่สำเร็จ' });
      }
    })();
  };

  const activeCount = rows.filter((g) => g.active !== 'NO').length;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <Users className="w-4 h-4" />
          </div>
          จัดการรายชื่อเจ้าหน้าที่ รปภ.
        </h1>
        <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
          กรอกชื่อจริงของเจ้าหน้าที่แต่ละรหัส เพื่อให้ชื่อไปแสดงในหน้าบันทึกการตรวจและรายงาน
          <br />
          ชื่อเหล่านี้ถูกเก็บไว้ในเบราว์เซอร์ของเครื่องนี้เท่านั้น ไม่ได้อยู่ในซอร์สโค้ดของระบบ
        </p>
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3 leading-relaxed">
          หมายเหตุ: บันทึกการตรวจย้อนหลังเก็บ <strong>ชื่อ ณ ตอนที่บันทึก</strong> ไว้
          การแก้ชื่อที่นี่จะไม่เปลี่ยนบันทึกเก่า รายงานย้อนหลังจึงอาจแสดงทั้งชื่อเดิมและชื่อใหม่
        </p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-700">
            ทั้งหมด {rows.length} รหัส · เปิดใช้งาน {activeCount} คน
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={addRow}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>เพิ่มคน</span>
            </button>
            <button
              onClick={syncLogs}
              disabled={busy}
              title="ต้องดึงบันทึกก่อน จึงจะยืนยันได้ว่าใครไม่เคยตรวจ แล้วลบถาวรได้"
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1 transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>ดึงบันทึก</span>
            </button>
            <button
              onClick={() => { if (confirmDiscard('ยกเลิกการแก้ไข')) load(); }}
              disabled={changes.total === 0}
              className="text-xs text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>ยกเลิกการแก้ไข</span>
            </button>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {rows.map((g, idx) => (
            <div key={g.guard_id} className="px-5 py-3 flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-blue-600 w-10 shrink-0">
                {g.guard_id}
              </span>
              <input
                type="text"
                value={g.name}
                onChange={(e) => setName(idx, e.target.value)}
                placeholder="ชื่อ-นามสกุลเจ้าหน้าที่"
                className={`flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600 ${
                  g.active === 'NO' ? 'opacity-50' : ''
                }`}
              />
              <button
                onClick={() => toggleActive(idx)}
                title={g.active === 'NO' ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0 transition-colors ${
                  g.active === 'NO'
                    ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100'
                }`}
              >
                {g.active === 'NO' ? 'ปิดใช้งาน' : 'ใช้งาน'}
              </button>
              {(() => {
                const used = guardUsageCount(patrolEngine.getLogs(), g.name);
                const verdict = canHardDelete(used, logsSynced);
                const deletable = verdict.ok;
                return (
                  <button
                    onClick={() => removeRow(idx)}
                    title={deletable ? 'ลบถาวร (ยังไม่เคยมีบันทึก)' : verdict.error}
                    className={`p-1.5 rounded-lg shrink-0 transition-colors ${
                      deletable ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-300 cursor-not-allowed'
                    }`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                );
              })()}
            </div>
          ))}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between gap-3 flex-wrap">
          {changes.total > 0 && !message ? (
            <div className="text-xs font-medium text-blue-800 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-blue-600" />
              <span>
                <strong>ยังไม่ได้บันทึก</strong> — {describeChanges(changes)}
                {changes.destructive && ' · มีรายชื่อที่จะหายจากหน้าจอ รปภ.'}
              </span>
            </div>
          ) : message ? (
            <div
              className={`text-xs font-medium flex items-center gap-1.5 ${
                message.type === 'ok' ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {message.type === 'ok' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600" />
              )}
              <span>{message.text}</span>
            </div>
          ) : (
            <span className="text-xs text-slate-400">แก้ไขแล้วอย่าลืมกดบันทึก</span>
          )}

          <button
            onClick={handleSave}
            disabled={busy || changes.total === 0}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{changes.total ? `บันทึกรายชื่อ (${changes.total})` : 'บันทึกรายชื่อ'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
