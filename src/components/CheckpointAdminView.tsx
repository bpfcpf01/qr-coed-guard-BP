import React, { useEffect, useState } from 'react';
import { patrolEngine } from '../services/guardPatrolEngine';
import { sheetSync } from '../services/sheetSync';
import { Checkpoint } from '../types';
import {
  nextCheckpointId, checkpointUsageCount, validateCheckpoints, canHardDelete,
  summarizeChanges, describeChanges, DiffRow,
} from '../services/rosterRules';
import { setUnsaved, confirmDiscard, installBeforeUnload } from '../services/unsavedGuard';
import { MapPin, Save, CheckCircle, AlertCircle, Plus, Trash2, RotateCcw, Download } from 'lucide-react';

interface CheckpointAdminViewProps {
  adminKey: string;
}

/**
 * จัดการจุดตรวจ (โหมดผู้ดูแลเท่านั้น) — เพิ่ม ลบ แก้ชื่อ โซน รัศมี เปิด/ปิดใช้งาน
 *
 * ไม่แก้พิกัดที่นี่ พิกัดมาจากหน้า "สำรวจพิกัด" ซึ่งต้องเดินไปยืนที่จุดจริงเท่านั้น
 * จุดที่เพิ่งเพิ่มจะยังไม่มีพิกัด ต้องไปสำรวจก่อนจึงจะตรวจรัศมีได้
 */
export const CheckpointAdminView: React.FC<CheckpointAdminViewProps> = ({ adminKey }) => {
  const [rows, setRows] = useState<Checkpoint[]>([]);
  const [message, setMessage] = useState<{ type: 'ok' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  /** ดึงบันทึกจากชีตแล้วหรือยัง — ต้องรู้ก่อนจึงจะยอมให้ลบถาวรได้ */
  const [logsSynced, setLogsSynced] = useState(false);

  /** ชุดข้อมูลที่โหลดมาล่าสุด ใช้เทียบว่ามีอะไรถูกแก้บ้าง */
  const [saved, setSaved] = useState<Checkpoint[]>([]);

  const load = () => {
    const fresh = patrolEngine.getCheckpoints();
    setRows(fresh);
    setSaved(fresh);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => installBeforeUnload(), []);

  const logs = patrolEngine.getLogs();

  const toDiff = (c: Checkpoint): DiffRow => ({
    id: c.checkpoint_id,
    label: `${c.checkpoint_id} ${c.name}`.trim(),
    active: c.active === 'NO' ? 'NO' : 'YES',
    fingerprint: [c.name, c.zone, c.radius_m].join('|'),
  });
  const changes = summarizeChanges(saved.map(toDiff), rows.map(toDiff));

  // บอกเมนูและเบราว์เซอร์ว่ายังมีของค้าง จะได้เตือนก่อนพาออกจากหน้านี้
  useEffect(() => {
    setUnsaved(changes.total ? describeChanges(changes) : '');
    return () => setUnsaved('');
  }, [changes.total, changes.added.length, changes.removed.length]);

  const patch = (idx: number, next: Partial<Checkpoint>) => {
    setRows((prev) => prev.map((c, i) => (i === idx ? { ...c, ...next } : c)));
    setMessage(null);
  };

  const addRow = () => {
    setRows((prev) => [...prev, {
      checkpoint_id: nextCheckpointId(prev),
      name: '',
      zone: prev.length ? prev[prev.length - 1].zone : 'โรงงาน',
      lat: null,
      lng: null,
      radius_m: patrolEngine.getConfig().DEFAULT_RADIUS_M || 40,
      active: 'YES',
    }]);
    setMessage(null);
  };

  const removeRow = (idx: number) => {
    const row = rows[idx];
    const used = checkpointUsageCount(logs, row.checkpoint_id);
    const allowed = canHardDelete(used, logsSynced);
    if (!allowed.ok) {
      setMessage({ type: 'bad', text: `${row.checkpoint_id}: ${allowed.error}` });
      return;
    }
    if (!window.confirm(
      `ลบ ${row.checkpoint_id} ${row.name} ออกถาวร?\n\n` +
      'รหัสนี้จะไม่ถูกนำกลับมาใช้ซ้ำ และสติกเกอร์ QR ของจุดนี้จะใช้ไม่ได้อีก'
    )) return;
    setRows((prev) => prev.filter((_, i) => i !== idx));
    setMessage(null);
  };

  /** ดึงบันทึกจากชีตเพื่อยืนยันว่าจุดไหนเคยถูกใช้จริง */
  const syncLogs = async () => {
    if (!sheetSync.isConfigured()) {
      setMessage({ type: 'bad', text: 'ยังไม่ได้เชื่อมต่อชีต จึงตรวจไม่ได้ว่าจุดไหนเคยถูกใช้' });
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
    const valid = validateCheckpoints(rows);
    if (!valid.ok) {
      setMessage({ type: 'bad', text: valid.error || 'ข้อมูลไม่ถูกต้อง' });
      return;
    }
    if (changes.total === 0) {
      setMessage({ type: 'bad', text: 'ยังไม่มีการแก้ไขอะไรให้บันทึก' });
      return;
    }

    // การบันทึกเขียนทับทั้งแท็บในชีต ถ้ามีของหายไปจากหน้าจอ รปภ. ต้องให้ยืนยันก่อน
    if (changes.destructive) {
      const lines = [
        changes.removed.length ? `ลบถาวร: ${changes.removed.join(', ')}` : '',
        changes.deactivated.length ? `ปิดใช้งาน: ${changes.deactivated.join(', ')}` : '',
      ].filter(Boolean).join('\n');
      if (!window.confirm(`ยืนยันการบันทึก\n\n${lines}\n\nจุดเหล่านี้จะหายจากหน้าจอของ รปภ. ทันที`)) return;
    }

    setBusy(true);
    // ให้ชีตยืนยันสิทธิ์ก่อนแล้วค่อยเขียนลงเครื่อง (เหตุผลเดียวกับหน้ารายชื่อ รปภ.)
    // กุญแจฝั่งเครื่องใครก็ตั้งเองได้ จึงเชื่อไม่ได้
    void (async () => {
      try {
        if (sheetSync.isConfigured()) {
          sheetSync.setAdminKey(adminKey);
          // ส่งพิกัดเดิมไปด้วย ไม่งั้นชีตจะโดนเขียนทับด้วยค่าว่าง
          const prev = new Map(patrolEngine.getCheckpoints().map((c) => [c.checkpoint_id, c]));
          await sheetSync.saveCheckpoints(rows.map((c) => {
            const old = prev.get(c.checkpoint_id);
            return { ...c, lat: old ? old.lat : c.lat, lng: old ? old.lng : c.lng };
          }));
        }

        const res = patrolEngine.updateCheckpoints(adminKey, rows);
        if (!res.ok) {
          setMessage({ type: 'bad', text: res.error || 'บันทึกไม่สำเร็จ' });
          return;
        }
        load();
        setUnsaved('');
        setMessage({
          type: 'ok',
          text: sheetSync.isConfigured()
            ? `บันทึกและส่งขึ้นชีตเรียบร้อยแล้ว (${res.count} จุด)`
            : `บันทึกในเครื่องแล้ว (${res.count} จุด) — ยังไม่ได้เชื่อมชีต`,
        });
      } catch (err: any) {
        setMessage({ type: 'bad', text: `ส่งขึ้นชีตไม่สำเร็จ จึงยังไม่บันทึก: ${err?.message || err}` });
      } finally {
        setBusy(false);
      }
    })();
  };

  const missingCoords = rows.filter((c) => c.lat === null || c.lng === null);

  return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <div className="flex items-start gap-3">
        <MapPin className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-lg font-bold text-slate-800">จัดการจุดตรวจ</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            เพิ่ม ลบ แก้ชื่อ โซน และรัศมีของจุดตรวจ — พิกัดตั้งได้ที่หน้า "สำรวจพิกัด" เท่านั้น
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={addRow}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" /> เพิ่มจุดตรวจ
        </button>
        <button
          onClick={syncLogs}
          disabled={busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> ดึงบันทึกจากชีต (เพื่อให้ลบได้)
        </button>
        <button
          onClick={() => { if (confirmDiscard('ยกเลิกการแก้ไข')) load(); }}
          disabled={changes.total === 0}
          title={changes.total === 0 ? 'ยังไม่มีการแก้ไข' : 'คืนค่ากลับเป็นตอนที่โหลดมา'}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <RotateCcw className="w-4 h-4" /> ยกเลิกการแก้ไข
        </button>
      </div>

      {changes.total > 0 && (
        <div className="flex items-start gap-2 text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-600" />
          <span>
            <strong>ยังไม่ได้บันทึก</strong> — {describeChanges(changes)}
            {changes.destructive && ' · มีรายการที่จะหายจากหน้าจอ รปภ.'}
          </span>
        </div>
      )}

      {missingCoords.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
          <span>
            มี {missingCoords.length} จุดที่ยังไม่มีพิกัด ({missingCoords.map((c) => c.checkpoint_id).join(', ')}) —
            จุดเหล่านี้จะตรวจรัศมีไม่ได้จนกว่าจะไปสำรวจพิกัดที่หน้างาน
            และอย่าลืมพิมพ์ QR ของจุดใหม่ไปติดด้วย
          </span>
        </div>
      )}

      <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="bg-slate-50 text-left text-xs text-slate-600">
              <th className="px-3 py-2.5 font-semibold w-20">รหัส</th>
              <th className="px-3 py-2.5 font-semibold">ชื่อจุดตรวจ</th>
              <th className="px-3 py-2.5 font-semibold w-36">โซน</th>
              <th className="px-3 py-2.5 font-semibold w-24">รัศมี (ม.)</th>
              <th className="px-3 py-2.5 font-semibold w-28">พิกัด</th>
              <th className="px-3 py-2.5 font-semibold w-24">สถานะ</th>
              <th className="px-3 py-2.5 font-semibold w-16">ลบ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c, idx) => {
              const used = checkpointUsageCount(logs, c.checkpoint_id);
              const verdict = canHardDelete(used, logsSynced);
              const deletable = verdict.ok;
              return (
                <tr key={c.checkpoint_id} className="border-t border-slate-100">
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{c.checkpoint_id}</td>
                  <td className="px-3 py-2">
                    <input
                      value={c.name}
                      onChange={(e) => patch(idx, { name: e.target.value })}
                      placeholder="เช่น จุดที่ 21 ประตูหลัง"
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={c.zone}
                      onChange={(e) => patch(idx, { zone: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={c.radius_m}
                      onChange={(e) => patch(idx, { radius_m: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {c.lat === null || c.lng === null
                      ? <span className="text-amber-700 font-semibold">ยังไม่มี</span>
                      : <span className="text-emerald-700">มีแล้ว</span>}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => patch(idx, { active: c.active === 'NO' ? 'YES' : 'NO' })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                        c.active === 'NO'
                          ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      }`}
                    >
                      {c.active === 'NO' ? 'ปิดใช้งาน' : 'ใช้งาน'}
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() => removeRow(idx)}
                      title={deletable ? 'ลบถาวร (ยังไม่เคยมีบันทึก)' : verdict.error}
                      className={`p-1.5 rounded-lg transition-colors ${
                        deletable
                          ? 'text-rose-600 hover:bg-rose-50'
                          : 'text-slate-300 cursor-not-allowed'
                      }`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {message && (
        <div className={`flex items-start gap-2 text-xs rounded-xl px-3 py-2.5 border ${
          message.type === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
            : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          {message.type === 'ok'
            ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />}
          <span>{message.text}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={busy || changes.total === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-xl shadow-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {busy ? 'กำลังบันทึก…' : changes.total ? `บันทึกจุดตรวจ (${changes.total} รายการ)` : 'บันทึกจุดตรวจ'}
        </button>
        <span className="text-xs text-slate-500">{rows.length} จุด</span>
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        การลบถาวรทำได้เฉพาะจุดที่ยังไม่เคยมีบันทึกการตรวจ เพราะรายงานย้อนหลังอ้างถึงรหัสจุดตรวจ
        จุดที่เคยใช้งานแล้วให้กด "ปิดใช้งาน" แทน — จะหายจากหน้าจอ รปภ. แต่รายงานเดิมยังอ่านได้
        รหัสที่ลบไปแล้วจะไม่ถูกนำกลับมาใช้ซ้ำ เพื่อไม่ให้สติกเกอร์ QR เดิมชี้ผิดจุด
      </p>
    </div>
  );
};
