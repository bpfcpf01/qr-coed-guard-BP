import React, { useState, useEffect } from 'react';
import { Checkpoint, Guard, SubmitScanResponse, GeoResult } from '../types';
import { patrolEngine, distM } from '../services/guardPatrolEngine';
import { MapPin, AlertCircle, CheckCircle, Navigation, Radio, Compass, ShieldAlert, Sparkles, QrCode, Camera } from 'lucide-react';
import { QRCameraScanner } from './QRCameraScanner';
import { SyncStatusBadge } from './SyncStatusBadge';

interface ScanViewProps {
  initialCpId?: string;
  mode?: 'guard' | 'admin';
  hasCpParam?: boolean;
  onSelectCp?: (cpId: string) => void;
}

export const ScanView: React.FC<ScanViewProps> = ({
  initialCpId = 'CP02',
  mode = 'guard',
  hasCpParam = true,
  onSelectCp,
}) => {
  const [selectedCpId, setSelectedCpId] = useState<string>(initialCpId || 'CP02');
  const [isCpSelected, setIsCpSelected] = useState<boolean>(Boolean(initialCpId && hasCpParam));
  const [showScannerModal, setShowScannerModal] = useState<boolean>(false);

  useEffect(() => {
    if (initialCpId) {
      setSelectedCpId(initialCpId);
      if (hasCpParam) {
        setIsCpSelected(true);
      }
    }
  }, [initialCpId, hasCpParam]);
  const [context, setContext] = useState<any>(null);
  const [guardName, setGuardName] = useState<string>(() => {
    try {
      return localStorage.getItem('gp_guard') || '';
    } catch (e) {
      return '';
    }
  });
  const [status, setStatus] = useState<'ปกติ' | 'พบสิ่งผิดปกติ'>('ปกติ');
  const [note, setNote] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideMode, setOverrideMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scanResult, setScanResult] = useState<SubmitScanResponse | null>(null);

  // GPS Coordinates and Simulation
  const [gpsSource, setGpsSource] = useState<'real' | 'sim-in' | 'sim-out' | 'sim-weak' | 'sim-none'>('real');
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null; accuracy: number | null }>({
    lat: null,
    lng: null,
    accuracy: null,
  });
  const [geoError, setGeoError] = useState<{ code: number; message: string } | null>(null);

  const checkpoints = patrolEngine.getCheckpoints();

  // Load Scan Context whenever selectedCpId changes
  useEffect(() => {
    const ctx = patrolEngine.getScanContext(selectedCpId);
    setContext(ctx);
    setScanResult(null);
    setOverrideMode(false);
    setOverrideReason('');
  }, [selectedCpId]);

  // Handle GPS tracking / simulation
  useEffect(() => {
    const activeCp = checkpoints.find((c) => c.checkpoint_id === selectedCpId);
    const cpLat = activeCp?.lat !== null && activeCp?.lat !== undefined ? activeCp.lat : 14.78920201;
    const cpLng = activeCp?.lng !== null && activeCp?.lng !== undefined ? activeCp.lng : 100.8008092;

    if (gpsSource === 'sim-in') {
      setGeoError(null);
      // Simulate close by (~12 meters)
      setCoords({
        lat: cpLat + 0.00008,
        lng: cpLng + 0.00006,
        accuracy: 12,
      });
    } else if (gpsSource === 'sim-out') {
      setGeoError(null);
      // Simulate far away (~85 meters)
      setCoords({
        lat: cpLat + 0.00065,
        lng: cpLng + 0.00055,
        accuracy: 14,
      });
    } else if (gpsSource === 'sim-weak') {
      setGeoError(null);
      // Weak signal (±85m > 60m threshold)
      setCoords({
        lat: cpLat + 0.0001,
        lng: cpLng + 0.0001,
        accuracy: 85,
      });
    } else if (gpsSource === 'sim-none') {
      setGeoError(null);
      setCoords({ lat: null, lng: null, accuracy: null });
    } else if (gpsSource === 'real') {
      if (!navigator.geolocation) {
        setGeoError({
          code: 1,
          message: 'ระบบต้องใช้ตำแหน่ง GPS เพื่อยืนยันว่าอยู่ที่จุดตรวจจริง กรุณาอนุญาตในตั้งค่าเบราว์เซอร์',
        });
        setCoords({ lat: null, lng: null, accuracy: null });
        return;
      }
      const watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setGeoError(null);
          setCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        (err) => {
          console.warn('Geolocation error:', err);
          setCoords({ lat: null, lng: null, accuracy: null });
          if (err.code === 1) {
            setGeoError({
              code: 1,
              message: 'ระบบต้องใช้ตำแหน่ง GPS เพื่อยืนยันว่าอยู่ที่จุดตรวจจริง กรุณาอนุญาตในตั้งค่าเบราว์เซอร์',
            });
          } else {
            setGeoError({
              code: err.code,
              message: 'ไม่สามารถอ่านตำแหน่ง GPS ได้ กรุณาเปิดระบบระบุตำแหน่งหรือออกที่โล่งแจ้ง',
            });
          }
        },
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [gpsSource, selectedCpId]);

  if (mode === 'guard' && !hasCpParam && !isCpSelected) {
    return (
      <div className="min-h-[85vh] bg-[#F8FAFC] text-[#1E293B] flex flex-col items-center justify-center p-4 py-8">
        <div className="w-full max-w-md mb-4 text-center">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-semibold border border-blue-100 mb-2">
            <span>โรงงานอาหารสัตว์ CPF ธารเกษม สระบุรี</span>
          </span>
          <h2 className="text-lg font-bold text-slate-900">ระบบบันทึกการเดินตรวจ รปภ.</h2>
          <p className="text-xs text-slate-500 mt-1">ส่องกล้องไปที่ป้าย QR Code ประจำจุดตรวจเพื่อเริ่มบันทึก</p>
        </div>

        {/* บล็อกนี้เป็นเส้นทางของโหมด รปภ. เท่านั้น จึงไม่เปิดให้สแกนจากไฟล์รูปเด็ดขาด */}
        <QRCameraScanner
          allowFileUpload={import.meta.env.DEV}
          onScanSuccess={(cpId) => {
            setSelectedCpId(cpId);
            setIsCpSelected(true);
            if (onSelectCp) {
              onSelectCp(cpId);
            }
          }}
        />
      </div>
    );
  }

  if (!context || !context.ok) {
    return (
      <div className="min-h-[80vh] bg-[#F8FAFC] text-[#1E293B] flex items-center justify-center p-4">
        <div className="bg-white border border-rose-200 p-8 rounded-2xl max-w-md text-center shadow-sm">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-900 mb-2">ไม่พบจุดตรวจ</h2>
          <p className="text-sm text-slate-500 mb-5">{context?.error || 'กรุณาตรวจสอบรหัสจุดตรวจ'}</p>
          {mode === 'admin' ? (
            <button
              onClick={() => setSelectedCpId('CP02')}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
            >
              กลับสู่จุดตรวจ CP02
            </button>
          ) : (
            <button
              onClick={() => {
                setIsCpSelected(false);
                setShowScannerModal(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
            >
              <Camera className="w-4 h-4" />
              <span>เปิดกล้องสแกน QR Code ใหม่อีกครั้ง</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  const cp = context.cp;
  const hasCoords = cp.hasCoords;
  const radius = cp.radius;
  const maxAccuracy = context.maxAccuracy || 60;

  // Calculate client-side distance for live feedback display
  let clientDistance: number | null = null;
  if (coords.lat !== null && coords.lng !== null && cp.lat !== null && cp.lng !== null) {
    clientDistance = Math.round(distM(coords.lat, coords.lng, cp.lat, cp.lng));
  }

  // Status Bar Determination
  let barStatus: 'wait' | 'ok' | 'warn' | 'bad' = 'wait';
  let barMessage = 'กำลังรอสัญญาณ GPS…';

  if (geoError?.code === 1) {
    barStatus = 'bad';
    barMessage = 'ระบบต้องใช้ตำแหน่ง GPS เพื่อยืนยันว่าอยู่ที่จุดตรวจจริง กรุณาอนุญาตในตั้งค่าเบราว์เซอร์';
  } else if (coords.lat === null || coords.lng === null) {
    barStatus = 'wait';
    barMessage = 'กำลังรอสัญญาณ GPS…';
  } else if (!hasCoords) {
    barStatus = 'warn';
    barMessage = 'จุดตรวจนี้ยังไม่ได้ตั้งพิกัดอ้างอิง';
  } else if (coords.accuracy !== null && coords.accuracy > maxAccuracy) {
    barStatus = 'warn';
    barMessage = `สัญญาณหยาบเกินไป (±${Math.round(coords.accuracy)} ม.) กรุณาออกที่โล่ง`;
  } else if (clientDistance !== null) {
    if (clientDistance <= radius) {
      barStatus = 'ok';
      barMessage = 'อยู่ในระยะจุดตรวจ — บันทึกได้';
    } else {
      barStatus = 'bad';
      barMessage = `อยู่นอกรัศมี ห่าง ${clientDistance} ม.`;
    }
  }

  const hasGpsCoords = coords.lat !== null && coords.lng !== null;
  const isClientPass =
    hasGpsCoords &&
    (coords.accuracy || 0) <= maxAccuracy &&
    (clientDistance === null || clientDistance <= radius || !hasCoords);

  // When in real GPS mode and no GPS, or permission denied: strictly disable submit!
  const canSubmit =
    !isSubmitting &&
    Boolean(guardName) &&
    hasGpsCoords &&
    geoError?.code !== 1 &&
    (isClientPass || overrideMode || !context.blockOutOfRange || !hasCoords);

  const showOverrideButton =
    context.allowOverride &&
    !isClientPass &&
    !overrideMode &&
    hasGpsCoords &&
    geoError?.code !== 1 &&
    hasCoords;

  const handleGuardChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setGuardName(val);
    try {
      localStorage.setItem('gp_guard', val);
    } catch (err) {}
  };

  const handleSubmit = () => {
    if (!canSubmit) return;
    setIsSubmitting(true);

    const deviceId = (() => {
      try {
        let d = localStorage.getItem('gp_device');
        if (!d) {
          d = 'DEV_' + Math.random().toString(36).slice(2, 8);
          localStorage.setItem('gp_device', d);
        }
        return d;
      } catch (e) {
        return 'DEV_BROWSER';
      }
    })();

    setTimeout(() => {
      const res = patrolEngine.submitScan({
        cp: selectedCpId,
        guard: guardName,
        status: status,
        note: note,
        lat: coords.lat,
        lng: coords.lng,
        acc: coords.accuracy,
        deviceId: deviceId,
        override: overrideMode,
        overrideReason: overrideReason,
      });

      setScanResult(res);
      setIsSubmitting(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] pb-16">
      {/* Top Status Bar */}
      <div
        className={`w-full py-3.5 px-4 text-center font-medium text-sm transition-colors shadow-sm ${
          barStatus === 'ok'
            ? 'bg-emerald-600 text-white'
            : barStatus === 'warn'
            ? 'bg-amber-500 text-white'
            : barStatus === 'bad'
            ? 'bg-rose-600 text-white'
            : 'bg-slate-700 text-white'
        }`}
      >
        <div className="max-w-md mx-auto flex items-center justify-center gap-2 font-medium">
          {barStatus === 'ok' && <CheckCircle className="w-4 h-4" />}
          {barStatus === 'bad' && <AlertCircle className="w-4 h-4" />}
          {barStatus === 'warn' && <Radio className="w-4 h-4 animate-pulse" />}
          <span>{barMessage}</span>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {/* Checkpoint Selector (Admin only) or Readonly Checkpoint info (Guard) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              {mode === 'admin' ? 'จำลองสแกน QR Code:' : 'จุดตรวจที่สแกน:'}
            </span>
            {mode === 'admin' ? (
              <select
                value={selectedCpId}
                onChange={(e) => setSelectedCpId(e.target.value)}
                className="bg-slate-50 text-slate-900 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold focus:outline-none focus:border-blue-600 focus:bg-white"
              >
                {checkpoints.map((c) => (
                  <option key={c.checkpoint_id} value={c.checkpoint_id}>
                    {c.checkpoint_id} - {c.name}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 text-xs font-mono font-bold">
                  {cp.checkpoint_id} - {cp.name}
                </span>
                <button
                  type="button"
                  onClick={() => setShowScannerModal(true)}
                  title="เปิดกล้องสแกนจุดตรวจอื่น"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium border border-slate-200 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5 text-blue-600" />
                  <span>สแกนจุดอื่น</span>
                </button>
              </div>
            )}
          </div>

          {import.meta.env.DEV && (
            <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 flex-wrap">
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                โหมดทดสอบ GPS (Dev only):
              </span>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setGpsSource('sim-in')}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors font-medium ${
                    gpsSource === 'sim-in'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  ตรงจุด (~12ม.)
                </button>
                <button
                  onClick={() => setGpsSource('sim-out')}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors font-medium ${
                    gpsSource === 'sim-out'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  อยู่นอกรัศมี (~85ม.)
                </button>
                <button
                  onClick={() => setGpsSource('sim-weak')}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors font-medium ${
                    gpsSource === 'sim-weak'
                      ? 'bg-amber-500 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  สัญญาณหยาบ
                </button>
                <button
                  onClick={() => setGpsSource('real')}
                  className={`text-[11px] px-2.5 py-1 rounded-md transition-colors font-medium ${
                    gpsSource === 'real'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                  }`}
                >
                  GPS จริง
                </button>
              </div>
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

        {/* Checkpoint Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
              {cp.id}
            </span>
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              hasCoords ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
            }`}>
              {hasCoords ? 'ตั้งพิกัดแล้ว' : 'ยังไม่ตั้งพิกัด'}
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 mt-2">{cp.name}</h1>
          <div className="text-xs text-slate-500 mt-1">
            โซน: {cp.zone} • รัศมีที่กำหนด: {radius} ม.
          </div>

          {/* Distance Display */}
          <div className="text-center py-6 px-4 my-4 bg-slate-50 border border-slate-100 rounded-xl">
            <div className="text-6xl sm:text-7xl font-bold tracking-tight text-slate-900 leading-none">
              {clientDistance !== null && hasCoords ? (
                <span>
                  {clientDistance}
                  <span className="text-xl font-semibold text-slate-400 ml-1.5">ม.</span>
                </span>
              ) : (
                <span>
                  —<span className="text-xl font-semibold text-slate-400 ml-1.5">ม.</span>
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 mt-2 font-medium">
              ระยะห่างจากจุดตรวจจริง (เกณฑ์ ≤ {radius} ม.)
            </div>
          </div>

          {/* Status Metrics */}
          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 block mb-0.5">ความแม่นยำ GPS</span>
              <span className="text-slate-800 font-mono font-semibold">
                {coords.accuracy !== null ? `±${Math.round(coords.accuracy)} ม.` : '—'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block mb-0.5">รอบตรวจปัจจุบัน</span>
              <span className="text-blue-600 font-semibold">{context.round || '(นอกช่วงรอบ)'}</span>
            </div>
          </div>
        </div>

        {/* Scan Feedback Message (After submit) */}
        {scanResult && (
          <div
            className={`p-5 rounded-2xl border text-sm leading-relaxed shadow-sm ${
              scanResult.ok
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                : 'bg-rose-50/80 border-rose-200 text-rose-900'
            }`}
          >
            {scanResult.ok ? (
              <div>
                <div className="font-bold text-emerald-800 flex items-center gap-1.5 text-base mb-1">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  บันทึกการตรวจเรียบร้อยแล้ว
                </div>
                <div className="text-xs text-emerald-700 space-y-1 mt-2">
                  <div>
                    วันที่ {scanResult.date} เวลา {scanResult.time} (รอบ {scanResult.round})
                  </div>
                  {scanResult.distance !== '' && (
                    <div>ระยะที่เซิร์ฟเวอร์คำนวณจริง: <strong>{scanResult.distance} ม.</strong></div>
                  )}
                  {scanResult.flags && scanResult.flags.length > 0 && (
                    <div className="text-amber-800 font-semibold">
                      ธงติดสคริปต์: {scanResult.flags.join(', ')}
                    </div>
                  )}
                </div>

                {/* พื้นที่ในเครื่องเต็มจนเขียนไม่ลง = รายการนี้เสี่ยงหาย ต้องเห็นชัด ไม่ใช่เงียบ */}
                {scanResult.warning && (
                  <div className="mt-3 flex items-start gap-2 text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
                    <span>{scanResult.warning}</span>
                  </div>
                )}

                {/* แยกให้ชัดว่า "บันทึกในเครื่องแล้ว" ไม่เท่ากับ "ส่งขึ้นชีตแล้ว" */}
                <div className="mt-3">
                  <SyncStatusBadge />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 mt-4">
                  <button
                    onClick={() => {
                      setScanResult(null);
                      setNote('');
                      setOverrideMode(false);
                      setShowScannerModal(true);
                    }}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Camera className="w-4 h-4" />
                    <span>เปิดกล้องสแกนจุดถัดไป</span>
                  </button>
                  <button
                    onClick={() => {
                      setScanResult(null);
                      setNote('');
                      setOverrideMode(false);
                    }}
                    className="px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl shadow-xs transition-colors"
                  >
                    ตรวจจุดเดิมซ้ำ
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="font-bold text-rose-800 flex items-center gap-1.5 text-base mb-1">
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                  บันทึกไม่สำเร็จ
                </div>
                <div className="text-xs text-rose-700 mt-1">{scanResult.error}</div>
              </div>
            )}
          </div>
        )}

        {/* Scan Input Form */}
        {!scanResult?.ok && (
          <div className="space-y-4">
            {/* Guard Selector */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <label className="block text-xs text-slate-700 mb-2 font-semibold">ชื่อผู้ตรวจ (รปภ.)</label>
              <select
                value={guardName}
                onChange={handleGuardChange}
                className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600"
              >
                <option value="">— เลือกชื่อผู้ตรวจ —</option>
                {context.guards.map((g: any) => (
                  <option key={g.id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Checkpoint Status Segment */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <label className="block text-xs text-slate-700 mb-2.5 font-semibold">สถานะจุดตรวจ</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setStatus('ปกติ')}
                  className={`py-3 px-3 rounded-xl border text-sm font-semibold transition-all ${
                    status === 'ปกติ'
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-800 font-bold shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  ปกติ
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('พบสิ่งผิดปกติ')}
                  className={`py-3 px-3 rounded-xl border text-sm font-semibold transition-all ${
                    status === 'พบสิ่งผิดปกติ'
                      ? 'border-rose-500 bg-rose-50 text-rose-800 font-bold shadow-xs'
                      : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  พบสิ่งผิดปกติ
                </button>
              </div>
            </div>

            {/* Note Textarea */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <label className="block text-xs text-slate-700 mb-2 font-semibold">หมายเหตุ (ถ้ามี)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="เช่น ไฟส่องสว่างดับ / ประตูรั้วชำรุด / มีกลิ่นผิดปกติ"
                rows={2}
                className="w-full bg-slate-50 text-slate-900 border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:border-blue-600 focus:bg-white focus:ring-1 focus:ring-blue-600 resize-none"
              />
            </div>

            {/* Override Request Box */}
            {overrideMode && (
              <div className="bg-amber-50/60 border border-amber-300 rounded-2xl p-5 shadow-sm">
                <label className="block text-xs text-amber-800 mb-2 font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  เหตุผลที่ขอบันทึกทั้งที่ GPS ไม่ผ่าน (บังคับระบุ):
                </label>
                <input
                  type="text"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="เช่น สัญญาณอับใต้โครงหลังคาไซโล / โทรศัพท์ชำรุด"
                  className="w-full bg-white text-slate-900 border border-amber-300 rounded-xl p-3 text-sm focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            {/* Primary Submit Button */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`w-full py-3.5 rounded-xl text-sm font-semibold tracking-wide transition-all shadow-sm ${
                overrideMode
                  ? 'bg-amber-500 text-white hover:bg-amber-600'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed`}
            >
              {isSubmitting
                ? 'กำลังตรวจสอบและบันทึกข้อมูล…'
                : overrideMode
                ? 'ขอบันทึกพิเศษ (ติดธง OVERRIDE)'
                : 'บันทึกการตรวจ'}
            </button>

            {/* Request Override Trigger Button */}
            {showOverrideButton && (
              <button
                type="button"
                onClick={() => setOverrideMode(true)}
                className="w-full py-2.5 rounded-xl border border-amber-300 bg-amber-50/50 text-amber-800 hover:bg-amber-100 text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                <ShieldAlert className="w-4 h-4 text-amber-600" />
                ขอบันทึกทั้งที่ GPS ไม่ผ่าน (Override)
              </button>
            )}
          </div>
        )}
      </div>

      {/* QR Camera Scanner Modal Overlay */}
      {showScannerModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md animate-in fade-in zoom-in-95">
            <QRCameraScanner
              allowFileUpload={mode === 'admin' || import.meta.env.DEV}
              onScanSuccess={(cpId) => {
                setSelectedCpId(cpId);
                setIsCpSelected(true);
                setShowScannerModal(false);
                if (onSelectCp) onSelectCp(cpId);
              }}
              onCancel={() => setShowScannerModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
