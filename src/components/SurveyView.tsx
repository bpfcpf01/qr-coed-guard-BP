import React, { useState, useEffect } from 'react';
import { patrolEngine } from '../services/guardPatrolEngine';
import { sheetSync } from '../services/sheetSync';
import { Checkpoint, SystemConfig } from '../types';
import { Navigation, CheckCircle, AlertCircle, Radio, Compass, Save, MapPin } from 'lucide-react';

interface SurveyViewProps {
  adminKey: string;
  config: SystemConfig;
}

export const SurveyView: React.FC<SurveyViewProps> = ({ adminKey, config }) => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedCpId, setSelectedCpId] = useState<string>('');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null; accuracy: number | null }>({
    lat: null,
    lng: null,
    accuracy: null,
  });
  const [gpsMode, setGpsMode] = useState<'sim' | 'real'>('real');
  const [geoError, setGeoError] = useState<{ code: number; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'bad'; text: string } | null>(null);

  const maxAcc = config.MAX_ACCURACY_M || 60;

  const loadCheckpoints = () => {
    const list = patrolEngine.getCheckpoints();
    setCheckpoints([...list]);
    if (!selectedCpId && list.length > 0) {
      // Pick first unsaved checkpoint if available
      const unsaved = list.find((c) => c.lat === null || c.lng === null);
      setSelectedCpId(unsaved ? unsaved.checkpoint_id : list[0].checkpoint_id);
    }
  };

  useEffect(() => {
    loadCheckpoints();
  }, []);

  // GPS Simulation / Real GPS Watcher
  useEffect(() => {
    if (gpsMode === 'sim') {
      setGeoError(null);
      // Simulate high-precision factory coordinates in Saraburi
      const baseLat = 14.789200;
      const baseLng = 100.800800;
      const randOffset = (Math.random() - 0.5) * 0.001;
      setCoords({
        lat: baseLat + randOffset,
        lng: baseLng + randOffset,
        accuracy: Math.floor(Math.random() * 8) + 12, // ±12-20 meters (good GPS)
      });
    } else {
      if (!navigator.geolocation) {
        setGeoError({
          code: 1,
          message: 'ระบบต้องใช้ตำแหน่ง GPS เพื่อยืนยันว่าอยู่ที่จุดตรวจจริง กรุณาอนุญาตในตั้งค่าเบราว์เซอร์',
        });
        setCoords({ lat: null, lng: null, accuracy: null });
        return;
      }
      const watchId = navigator.geolocation.watchPosition(
        (p) => {
          setGeoError(null);
          setCoords({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: p.coords.accuracy,
          });
        },
        (err) => {
          console.warn('GPS Error:', err);
          setCoords({ lat: null, lng: null, accuracy: null });
          if (err.code === 1) {
            setGeoError({
              code: 1,
              message: 'ระบบต้องใช้ตำแหน่ง GPS เพื่อยืนยันว่าอยู่ที่จุดตรวจจริง กรุณาอนุญาตในตั้งค่าเบราว์เซอร์',
            });
          } else {
            setGeoError({
              code: err.code,
              message: 'ไม่สามารถอ่านพิกัด GPS ได้ กรุณาเปิด GPS หรือออกที่โล่งแจ้ง',
            });
          }
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [gpsMode, selectedCpId]);

  const acc = coords.accuracy !== null ? Math.round(coords.accuracy) : null;
  const isAccOk = acc !== null && acc <= maxAcc;

  // Status Bar
  let barClass = 'bg-slate-700 text-white';
  let barText = 'กำลังรอสัญญาณ GPS…';

  if (geoError?.code === 1) {
    barClass = 'bg-rose-600 text-white';
    barText = 'ระบบต้องใช้ตำแหน่ง GPS เพื่อยืนยันว่าอยู่ที่จุดตรวจจริง กรุณาอนุญาตในตั้งค่าเบราว์เซอร์';
  } else if (coords.lat === null || coords.lng === null) {
    barClass = 'bg-slate-700 text-white';
    barText = 'กำลังรอสัญญาณ GPS…';
  } else if (isAccOk) {
    barClass = 'bg-emerald-600 text-white';
    barText = 'สัญญาณดีพอ บันทึกพิกัดได้';
  } else {
    barClass = 'bg-amber-500 text-white';
    barText = `สัญญาณหยาบเกินไป (±${acc} ม.) รอสักครู่หรือออกที่โล่ง`;
  }

  /**
   * บันทึกพิกัดจุดตรวจ — ให้ชีตยืนยันสิทธิ์ก่อน แล้วค่อยเขียนลงเครื่อง
   *
   * ลำดับนี้สำคัญ: patrolEngine.saveCheckpointCoords ตรวจกุญแจกับค่าใน localStorage
   * ซึ่งใครก็ตั้งเองได้ ถ้าเขียนลงเครื่องก่อน คนที่ปลอมเป็นผู้ดูแลจะย้ายพิกัดจุดตรวจ
   * มาไว้ตรงที่ตัวเองยืนอยู่ แล้วสแกนผ่านรัศมีได้ทุกจุดโดยไม่ต้องเดินจริง
   * เมื่อให้เซิร์ฟเวอร์ตรวจ DASH_KEY ก่อน กุญแจปลอมจะถูกปฏิเสธตั้งแต่ต้น
   */
  const handleSave = () => {
    if (!selectedCpId || coords.lat === null || coords.lng === null || !isAccOk || isSaving || geoError?.code === 1) return;

    setIsSaving(true);
    setMessage(null);

    const lat = coords.lat;
    const lng = coords.lng;
    const accuracy = coords.accuracy || 15;

    void (async () => {
      try {
        if (sheetSync.isConfigured()) {
          sheetSync.setAdminKey(adminKey);
          const next = patrolEngine
            .getCheckpoints()
            .map((c) => (c.checkpoint_id === selectedCpId ? { ...c, lat, lng } : c));
          try {
            await sheetSync.saveCheckpoints(next);
          } catch (err: any) {
            setMessage({
              type: 'bad',
              text: `ส่งพิกัดขึ้นชีตไม่สำเร็จ จึงยังไม่บันทึก: ${err?.message || err}`,
            });
            return;
          }
        }

        const res = patrolEngine.saveCheckpointCoords(adminKey, selectedCpId, lat, lng, accuracy);

        if (res.ok) {
          loadCheckpoints();
          setMessage({
            type: 'ok',
            text: sheetSync.isConfigured()
              ? `บันทึกพิกัดจุด ${selectedCpId} และส่งขึ้นชีตเรียบร้อยแล้ว (${res.lat.toFixed(6)}, ${res.lng.toFixed(6)} ±${res.acc} ม.)`
              : `บันทึกพิกัดจุด ${selectedCpId} ในเครื่องแล้ว (${res.lat.toFixed(6)}, ${res.lng.toFixed(6)} ±${res.acc} ม.)`,
          });
        } else {
          setMessage({
            type: 'bad',
            text: res.error || 'บันทึกไม่สำเร็จ',
          });
        }
      } finally {
        setIsSaving(false);
      }
    })();
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] pb-16">
      {/* Top Status Bar */}
      <div className={`w-full py-3 px-4 text-center font-medium text-sm transition-colors shadow-sm ${barClass}`}>
        <div className="max-w-md mx-auto flex items-center justify-center gap-2">
          {isAccOk ? <CheckCircle className="w-4 h-4" /> : <Radio className="w-4 h-4 animate-pulse" />}
          <span>{barText}</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {/* Header & Source Switcher */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-blue-600" />
              สำรวจพิกัดจุดตรวจ (Survey)
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">เดินไปยืนที่จุดตรวจเพื่อบันทึกพิกัดจริงลงชีต</p>
          </div>
          {import.meta.env.DEV && (
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setGpsMode('sim')}
                className={`text-xs px-3 py-1 rounded-lg font-medium transition-all ${
                  gpsMode === 'sim' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                จำลอง GPS
              </button>
              <button
                onClick={() => setGpsMode('real')}
                className={`text-xs px-3 py-1 rounded-lg font-medium transition-all ${
                  gpsMode === 'real' ? 'bg-white text-slate-900 shadow-xs font-semibold' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                GPS จริง
              </button>
            </div>
          )}
        </div>

        {/* GPS Permission Denied Alert */}
        {geoError?.code === 1 && (
          <div className="bg-rose-50 border border-rose-300 rounded-2xl p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-rose-900">ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง GPS</h4>
                <p className="text-xs text-rose-700 mt-1">
                  ระบบต้องใช้ตำแหน่ง GPS เพื่อยืนยันว่าอยู่ที่จุดตรวจจริง กรุณาอนุญาตในตั้งค่าเบราว์เซอร์
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Hero Accuracy Typography */}
        <div className="text-center py-6 px-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="text-6xl font-bold tracking-tight text-slate-900 leading-none">
            {acc !== null ? (
              <span>
                ±{acc}
                <span className="text-xl font-semibold text-slate-400 ml-1.5">ม.</span>
              </span>
            ) : (
              '—'
            )}
          </div>
          <div className="text-xs text-slate-500 mt-2 font-medium">
            ความแม่นยำของสัญญาณ GPS (ยิ่งค่าน้อยยิ่งแม่นยำ)
          </div>
        </div>

        {/* GPS Detail Cards */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-2 text-xs">
          <div className="flex justify-between text-slate-500">
            <span>ละติจูด (Latitude):</span>
            <strong className="text-slate-900 font-mono">{coords.lat !== null ? coords.lat.toFixed(7) : '—'}</strong>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>ลองจิจูด (Longitude):</span>
            <strong className="text-slate-900 font-mono">{coords.lng !== null ? coords.lng.toFixed(7) : '—'}</strong>
          </div>
          <div className="flex justify-between text-slate-500">
            <span>เกณฑ์ที่ยอมรับ (Threshold):</span>
            <strong className="text-blue-600 font-semibold">ไม่เกิน {maxAcc} ม.</strong>
          </div>
        </div>

        {/* Checkpoint Selector */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <label className="block text-xs font-semibold text-slate-700 mb-2">
            เลือกจุดตรวจที่กำลังยืนอยู่ (CP01–CP20)
          </label>
          <select
            value={selectedCpId}
            onChange={(e) => setSelectedCpId(e.target.value)}
            className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600"
          >
            {checkpoints.map((c) => (
              <option key={c.checkpoint_id} value={c.checkpoint_id}>
                {c.checkpoint_id} - {c.name} {c.lat !== null && c.lng !== null ? '(ตั้งแล้ว)' : '(ยังไม่ตั้ง)'}
              </option>
            ))}
          </select>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={!isAccOk || !selectedCpId || isSaving || coords.lat === null || coords.lng === null || geoError?.code === 1}
          className="w-full py-3.5 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          <span>{isSaving ? 'กำลังบันทึกลงชีต…' : 'บันทึกพิกัดลงชีต Checkpoints'}</span>
        </button>

        {/* Message Banner */}
        {message && (
          <div
            className={`p-4 rounded-2xl border text-xs leading-relaxed shadow-sm ${
              message.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Checkpoints Status List */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-3">สถานะพิกัดทุกจุดตรวจ (20 จุด)</h2>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto pr-1">
            {checkpoints.map((c) => {
              const has = c.lat !== null && c.lng !== null;
              return (
                <div
                  key={c.checkpoint_id}
                  onClick={() => setSelectedCpId(c.checkpoint_id)}
                  className={`py-2.5 px-3 flex items-center justify-between cursor-pointer rounded-xl hover:bg-slate-50 transition-colors ${
                    selectedCpId === c.checkpoint_id ? 'bg-blue-50/70' : ''
                  }`}
                >
                  <div className="text-xs">
                    <span className="font-mono font-bold text-blue-600 mr-2">{c.checkpoint_id}</span>
                    <span className="text-slate-800 font-medium">{c.name}</span>
                  </div>
                  <div>
                    {has ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 font-mono">
                        {Number(c.lat).toFixed(4)}, {Number(c.lng).toFixed(4)}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-100">
                        ยังไม่ตั้ง
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
