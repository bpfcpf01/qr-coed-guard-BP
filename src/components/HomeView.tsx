import React, { useState, useEffect } from 'react';
import { patrolEngine } from '../services/guardPatrolEngine';
import { SystemConfig } from '../types';
import { Shield, AlertTriangle, CheckCircle, Navigation, QrCode, Clock, MapPin, RefreshCw, ExternalLink } from 'lucide-react';

interface HomeViewProps {
  adminKey: string;
  config: SystemConfig;
  onNavigate: (page: 'scan' | 'home' | 'dash' | 'survey' | 'qr' | 'roster' | 'appscript', cpId?: string) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ adminKey, config, onNavigate }) => {
  const [summary, setSummary] = useState<any>(null);
  const [checkpoints, setCheckpoints] = useState<any[]>([]);
  const [feed, setFeed] = useState<any[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = () => {
    setIsRefreshing(true);
    const dash = patrolEngine.getDashboard(adminKey);
    setSummary(dash.summary);
    setCheckpoints(patrolEngine.getCheckpoints());
    const live = patrolEngine.getLiveFeed(adminKey, 15);
    setFeed(live.rows || []);
    setIsRefreshing(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000); // Pull refresh every 60s
    return () => clearInterval(interval);
  }, [adminKey]);

  const lvl = (pct: number) => (pct >= 95 ? 'text-[#00722F]' : pct >= 80 ? 'text-[#7A5300]' : 'text-[#A5241B]');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-[#1E293B]">
      {/* Page Title & Quick Action Shortcuts */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Shield className="w-4 h-4" />
            </div>
            ศูนย์ควบคุมระบบเดินตรวจ รปภ.
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {config.SITE_NAME} • แบบฟอร์มควบคุม ISO 45001 ({config.DOC_CODE})
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={loadData}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>รีเฟรชข้อมูล</span>
          </button>
          <button
            onClick={() => onNavigate('scan', 'CP02')}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 shadow-sm transition-colors"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>ทดสอบสแกนตรวจ</span>
          </button>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500 font-medium mb-2">ความครบถ้วนการตรวจวันนี้</p>
          <div className="flex items-center justify-between">
            <span className="text-3xl font-bold tracking-tight text-slate-900">
              {summary?.pct ?? 0}%
            </span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              (summary?.pct || 0) >= 95 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                : (summary?.pct || 0) >= 80 
                ? 'bg-amber-50 text-amber-700 border border-amber-100'
                : 'bg-rose-50 text-rose-700 border border-rose-100'
            }`}>
              {(summary?.pct || 0) >= 95 ? 'ตามเป้า' : 'ต่ำกว่าเกณฑ์'}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            ตรวจแล้ว {summary?.done ?? 0} / {summary?.expected ?? 0} ช่อง
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500 font-medium mb-2">รายการติดธงตรวจสอบ</p>
          <div className="flex items-center justify-between">
            <span className={`text-3xl font-bold tracking-tight ${
              (summary?.flagged || 0) > 0 ? 'text-amber-600' : 'text-slate-900'
            }`}>
              {summary?.flagged ?? 0}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              (summary?.flagged || 0) > 0 
                ? 'bg-amber-50 text-amber-700 border border-amber-100' 
                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            }`}>
              {(summary?.flagged || 0) > 0 ? 'ต้องตรวจ' : 'ปกติ'}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-2">GPS / ความเร็ว / ขอยกเว้น</div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500 font-medium mb-2">พบสิ่งผิดปกติในพื้นที่</p>
          <div className="flex items-center justify-between">
            <span className={`text-3xl font-bold tracking-tight ${
              (summary?.abnormal || 0) > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}>
              {summary?.abnormal ?? 0}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              (summary?.abnormal || 0) > 0 
                ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                : 'bg-slate-100 text-slate-600'
            }`}>
              {(summary?.abnormal || 0) > 0 ? 'แจ้งเตือน' : 'เรียบร้อย'}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-2">สถานะที่ รปภ. รายงาน</div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500 font-medium mb-2">จุดที่ยังไม่ตั้งพิกัด GPS</p>
          <div className="flex items-center justify-between">
            <span className={`text-3xl font-bold tracking-tight ${
              (summary?.noCoords || 0) > 0 ? 'text-rose-600' : 'text-slate-900'
            }`}>
              {summary?.noCoords ?? 0}
            </span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
              (summary?.noCoords || 0) > 0 
                ? 'bg-rose-50 text-rose-700 border border-rose-100' 
                : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
            }`}>
              {(summary?.noCoords || 0) > 0 ? 'ต้องเก็บ' : 'ครบ 20 จุด'}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            {(summary?.noCoords || 0) > 0 ? (
              <span className="text-rose-600 font-medium cursor-pointer hover:underline" onClick={() => onNavigate('survey')}>
                ต้องเดินเก็บพิกัดก่อนบังคับใช้ →
              </span>
            ) : (
              'ครบถ้วนทุก 20 จุดแล้ว'
            )}
          </div>
        </div>
      </div>

      {/* Main Sections: Checkpoints & Live Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Checkpoint Coordinate Status Table (7 Cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-slate-900">สถานะพิกัดจุดตรวจ (20 จุด)</h2>
              <p className="text-xs text-slate-500 mt-0.5">จุดตรวจในระบบที่ รปภ. ต้องเดินตรวจตามรอบ</p>
            </div>
            <button
              onClick={() => onNavigate('survey')}
              className="text-xs text-blue-600 font-medium hover:text-blue-700 flex items-center gap-1.5 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 transition-colors"
            >
              <Navigation className="w-3.5 h-3.5" />
              <span>เดินเก็บพิกัด</span>
            </button>
          </div>

          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold sticky top-0 z-10 border-b border-slate-100">
                <tr>
                  <th className="py-3 px-4">รหัส</th>
                  <th className="py-3 px-3">ชื่อจุดตรวจ</th>
                  <th className="py-3 px-3">โซน</th>
                  <th className="py-3 px-3">สถานะพิกัด</th>
                  <th className="py-3 px-3 text-center">รัศมี</th>
                  <th className="py-3 px-4 text-center">ทดสอบ</th>
                </tr>
              </thead>
              <tbody className="text-sm text-slate-600 divide-y divide-slate-100">
                {checkpoints.map((c) => {
                  const has = c.lat !== null && c.lng !== null;
                  return (
                    <tr key={c.checkpoint_id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4 font-mono font-semibold text-blue-600 text-xs">{c.checkpoint_id}</td>
                      <td className="py-3 px-3 font-medium text-slate-900 text-xs">{c.name}</td>
                      <td className="py-3 px-3 text-slate-500 text-xs">{c.zone}</td>
                      <td className="py-3 px-3">
                        {has ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                              ตั้งแล้ว
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono hidden sm:inline">
                              {Number(c.lat).toFixed(4)}, {Number(c.lng).toFixed(4)}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-50 text-rose-700 border border-rose-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            ยังไม่ตั้งพิกัด
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-xs text-slate-600">{c.radius_m} ม.</td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => onNavigate('scan', c.checkpoint_id)}
                          className="px-2.5 py-1 bg-slate-50 border border-slate-200 hover:bg-slate-900 hover:text-white rounded-md text-[11px] font-medium text-slate-700 transition-colors"
                          title="จำลองการสแกนจุดตรวจนี้"
                        >
                          สแกน
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Live Feed Stream (5 Cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-bold text-base text-slate-900">บันทึกล่าสุด (Live Feed)</h2>
              <p className="text-xs text-slate-500 mt-0.5">รายการสแกนที่บันทึกเข้ามาในระบบ</p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              อัปเดตทุก 60 วิ
            </span>
          </div>

          <div className="p-6 space-y-3 max-h-[480px] overflow-y-auto">
            {feed.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">ยังไม่มีบันทึกในระบบ</div>
            ) : (
              feed.map((item, idx) => (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors text-xs"
                >
                  <div className="flex items-center justify-between gap-1 mb-1.5">
                    <span className="font-medium text-slate-900 flex items-center gap-1.5">
                      <span className="font-mono text-blue-600 font-bold text-[11px] bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100">
                        {item.cp}
                      </span>
                      <span className="truncate max-w-[150px]">{item.cpName}</span>
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">
                      {item.date.split('-').slice(1).join('/')} {item.time} ({item.round})
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
                    <span>รปภ: <strong className="text-slate-800 font-medium">{item.guard}</strong></span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          item.geo === 'IN_RANGE'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                            : item.flags
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          item.geo === 'IN_RANGE' ? 'bg-emerald-500' : 'bg-amber-500'
                        }`} />
                        {item.geo}
                      </span>
                      {item.distance !== '' && (
                        <span className="font-mono text-slate-700 font-medium text-[11px]">{item.distance} ม.</span>
                      )}
                    </div>
                  </div>

                  {item.flags && (
                    <div className="mt-2 text-[10px] font-medium text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded">
                      ธง: {item.flags}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
