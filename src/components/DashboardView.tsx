import React, { useState, useEffect } from 'react';
import { patrolEngine } from '../services/guardPatrolEngine';
import { sheetSync, SyncStatus } from '../services/sheetSync';
import { DashboardData, ReportData, SystemConfig } from '../types';
import { Printer, Calendar, Filter, AlertTriangle, CheckCircle, Shield, Clock, User, FileText, ChevronRight, ExternalLink } from 'lucide-react';
import { localDateStr } from '../utils/datetime';

interface DashboardViewProps {
  adminKey: string;
  config: SystemConfig;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ adminKey, config }) => {
  const [activeTab, setActiveTab] = useState<'today' | 'report'>('today');
  
  // Today's state
  const [todayDate, setTodayDate] = useState<string>(() => localDateStr(new Date()));
  const [dashData, setDashData] = useState<DashboardData | null>(null);

  // Report state
  const [fromDate, setFromDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return localDateStr(d);
  });
  const [toDate, setToDate] = useState<string>(() => localDateStr(new Date()));
  const [selectedGuard, setSelectedGuard] = useState<string>('');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [guardLogs, setGuardLogs] = useState<any[]>([]);

  const guards = patrolEngine.getGuards();

  // เซิร์ฟเวอร์ตัดบันทึกให้เหลือเฉพาะรายการล่าสุดเมื่อชีตโตเกิน MAX_PULL_LOGS
  // ต้องบอกผู้ดูแล ไม่งั้นวันเก่า ๆ จะขึ้น 0% เหมือนไม่มีใครเดินตรวจ ทั้งที่ตรวจครบ
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => sheetSync.getStatus());
  useEffect(() => sheetSync.subscribe(setSyncStatus), []);

  const loadTodayData = () => {
    const data = patrolEngine.getDashboard(adminKey, todayDate);
    setDashData(data);
  };

  const loadReportData = () => {
    const data = patrolEngine.getReport(adminKey, fromDate, toDate);
    setReportData(data);
    if (selectedGuard) {
      const gLogs = patrolEngine.getGuardLog(adminKey, fromDate, toDate, selectedGuard);
      setGuardLogs(gLogs.rows || []);
    } else {
      setGuardLogs([]);
    }
  };

  useEffect(() => {
    loadTodayData();
  }, [adminKey, todayDate]);

  useEffect(() => {
    if (activeTab === 'report') {
      loadReportData();
    }
  }, [activeTab, adminKey, fromDate, toDate, selectedGuard]);

  // Color helper: >=95% green, >=80% yellow, <80% red
  const getLevelClass = (pct: number) => {
    if (pct >= 95) return 'text-emerald-700 bg-emerald-50 border border-emerald-100';
    if (pct >= 80) return 'text-amber-700 bg-amber-50 border border-amber-100';
    return 'text-rose-700 bg-rose-50 border border-rose-100';
  };

  const getBarColor = (pct: number) => {
    if (pct >= 95) return 'bg-emerald-500';
    if (pct >= 80) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 text-[#1E293B]">
      {/* ISO Document Header (Visible on print) */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3">
        <div className="text-xl font-bold text-center">รายงานการเดินตรวจของพนักงานรักษาความปลอดภัย</div>
        <div className="flex justify-between text-xs mt-2 font-medium">
          <span>{config.SITE_NAME}</span>
          <span>รหัสเอกสาร: {config.DOC_CODE}</span>
        </div>
        <div className="flex justify-between text-xs mt-1 text-gray-700">
          <span>
            {activeTab === 'today'
              ? `ประจำวันที่: ${todayDate.split('-').reverse().join('/')}`
              : `ช่วงวันที่: ${fromDate.split('-').reverse().join('/')} ถึง ${toDate.split('-').reverse().join('/')}`}
          </span>
          <span>พิมพ์เมื่อ: {new Date().toLocaleDateString('th-TH')} {new Date().toLocaleTimeString('th-TH')}</span>
        </div>
      </div>

      {syncStatus.logsTruncated && (
        <div className="noprint mb-6 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 leading-relaxed">
            <span className="font-semibold">ข้อมูลย้อนหลังไม่ครบ</span> — บันทึกในชีตมีมากเกินกว่าที่ดึงได้ในครั้งเดียว
            ระบบจึงดึงมาเฉพาะรายการล่าสุด ตัวเลขของวันเก่า ๆ ในรายงานนี้อาจต่ำกว่าความเป็นจริง
            กรุณาดูข้อมูลย้อนหลังทั้งหมดจาก Google Sheet โดยตรง
          </p>
        </div>
      )}

      {/* Tabs Bar */}
      <div className="noprint flex items-center justify-between flex-wrap gap-4 mb-8">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200/70">
          <button
            onClick={() => setActiveTab('today')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'today'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ภาพรวมวันนี้ (Today Grid)
          </button>
          <button
            onClick={() => setActiveTab('report')}
            className={`px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-colors ${
              activeTab === 'report'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            รายงานย้อนหลัง & สรุปผล (Historical)
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {(() => {
            const hasUrl = Boolean(config.WEBAPP_URL && config.WEBAPP_URL.trim());
            const isDev = /\/dev\/?$/.test(config.WEBAPP_URL || '');
            let targetUrl = '#';
            try {
              if (hasUrl) {
                const u = new URL(config.WEBAPP_URL);
                u.searchParams.set('cp', 'CP02');
                targetUrl = u.toString();
              }
            } catch {
              targetUrl = config.WEBAPP_URL || '#';
            }

            return (
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                title={
                  !hasUrl
                    ? 'ยังไม่ได้ตั้งค่า WEBAPP_URL'
                    : isDev
                    ? 'คำเตือน: URL ลงท้ายด้วย /dev รปภ. จะเข้าไม่ได้ กรุณาใช้ /exec'
                    : 'เปิด Web App สแกนจุดตรวจ CP02 บนแท็บใหม่'
                }
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold shadow-xs transition-colors border ${
                  !hasUrl
                    ? 'opacity-50 pointer-events-none bg-slate-100 text-slate-400 border-slate-200'
                    : isDev
                    ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                }`}
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                <span>เปิด Web App สแกน (CP02)</span>
                {isDev && <span className="text-[10px] bg-amber-200 text-amber-900 px-1 rounded font-bold">/dev</span>}
              </a>
            );
          })()}

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            <span>พิมพ์รายงาน (ISO 45001)</span>
          </button>
        </div>
      </div>

      {/* TAB 1: TODAY GRID */}
      {activeTab === 'today' && dashData && (
        <div className="space-y-8">
          {/* Controls */}
          <div className="noprint flex items-center gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <Calendar className="w-4 h-4 text-slate-400" />
            <label className="text-xs font-medium text-slate-600">เลือกวันที่:</label>
            <input
              type="date"
              value={todayDate}
              onChange={(e) => setTodayDate(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
            <button
              onClick={loadTodayData}
              className="px-4 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 shadow-sm transition-colors"
            >
              แสดงข้อมูล
            </button>
          </div>

          {/* Metric Tiles */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-2">ความครบถ้วนการตรวจ</p>
              <div className={`text-3xl font-bold tracking-tight ${dashData.summary.pct >= 95 ? 'text-emerald-600' : dashData.summary.pct >= 80 ? 'text-amber-600' : 'text-rose-600'}`}>
                {dashData.summary.pct}%
              </div>
              <div className="text-xs text-slate-400 mt-2">
                ตรวจแล้ว {dashData.summary.done} จาก {dashData.summary.expected} ช่อง
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-2">บันทึกที่ตรวจสำเร็จ</p>
              <div className="text-3xl font-bold tracking-tight text-slate-900">{dashData.summary.done}</div>
              <div className="text-xs text-slate-400 mt-2">เป้าหมาย {dashData.summary.expected} ช่อง/วัน</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-2">รายการติดธงตรวจสอบ</p>
              <div className={`text-3xl font-bold tracking-tight ${dashData.summary.flagged > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {dashData.summary.flagged}
              </div>
              <div className="text-xs text-slate-400 mt-2">ธง GPS / ความเร็ว / ยกเว้น</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-2">พบสิ่งผิดปกติในพื้นที่</p>
              <div className={`text-3xl font-bold tracking-tight ${dashData.summary.abnormal > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {dashData.summary.abnormal}
              </div>
              <div className="text-xs text-slate-400 mt-2">เหตุการณ์ที่ รปภ. รายงาน</div>
            </div>
          </div>

          {/* Patrol Matrix Grid */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center justify-between">
              <span>กระดานจุดตรวจ x รอบตรวจ (Patrol Matrix Grid)</span>
              <span className="text-xs font-normal text-slate-500">20 จุดตรวจ × 6 รอบ (120 สล็อต)</span>
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="py-3 px-4 text-xs font-semibold text-slate-600 sticky left-0 bg-slate-50 z-10 w-48">
                      จุดตรวจ / โซน
                    </th>
                    {dashData.rounds.map((r) => (
                      <th key={r.id} className="py-3 px-2 text-xs font-semibold text-slate-600 text-center min-w-[90px]">
                        {r.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {dashData.grid.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/50">
                      <td className="py-3 px-4 sticky left-0 bg-white z-10 border-r border-slate-100">
                        <div className="font-semibold text-slate-900">
                          <span className="text-blue-600 font-mono mr-1.5">{row.id}</span>
                          {row.name}
                        </div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                          <span>{row.zone}</span>
                          {!row.hasCoords && (
                            <span className="text-[10px] text-rose-600 font-medium">ไม่มีพิกัด</span>
                          )}
                        </div>
                      </td>
                      {row.cells.map((cell, idx) => {
                        const roundId = dashData.rounds[idx].id;
                        return (
                          <td key={roundId} className="p-2 text-center align-middle">
                            {cell ? (
                              <div
                                className={`rounded-xl p-2 text-xs font-semibold border ${
                                  cell.status !== 'ปกติ'
                                    ? 'bg-rose-50 border-rose-200 text-rose-800'
                                    : cell.flags
                                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                                    : 'bg-emerald-50 border-emerald-100 text-emerald-800'
                                }`}
                              >
                                <div className="font-mono text-xs">{cell.time}</div>
                                <div className="text-[10px] font-normal truncate max-w-[80px] mx-auto mt-0.5 opacity-90">
                                  {cell.guard}
                                </div>
                                {cell.flags && (
                                  <div className="text-[9px] font-bold text-rose-700 mt-0.5 truncate" title={cell.flags}>
                                    {cell.flags.split(',')[0]}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="rounded-xl p-2 text-xs text-slate-400 bg-slate-50 border border-slate-100 font-medium">
                                ไม่ได้ตรวจ
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 7-Day Trend Chart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4">ความครบถ้วน 7 วันย้อนหลัง</h2>
            <div className="flex items-end gap-3 h-44 pt-4 px-2">
              {dashData.trend.map((t) => (
                <div key={t.date} className="flex-1 flex flex-col justify-end items-center h-full gap-1.5">
                  <span className="text-xs font-bold font-mono text-slate-700">{t.pct}%</span>
                  <div className="w-full bg-slate-100 rounded-t-lg h-full flex items-end">
                    <div
                      className={`w-full rounded-t-lg transition-all ${getBarColor(t.pct)}`}
                      style={{ height: `${Math.max(6, t.pct)}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500 mt-1 font-mono">{t.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: HISTORICAL REPORT */}
      {activeTab === 'report' && reportData && (
        <div className="space-y-8">
          {/* Filter Controls */}
          <div className="noprint flex flex-wrap items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600">ตั้งแต่:</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600">ถึง:</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600">ผู้ตรวจ:</label>
              <select
                value={selectedGuard}
                onChange={(e) => setSelectedGuard(e.target.value)}
                className="bg-slate-50 border border-slate-200 text-xs text-slate-800 rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-600"
              >
                <option value="">ทุกคน (All Guards)</option>
                {guards.map((g) => (
                  <option key={g.guard_id} value={g.name}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={loadReportData}
              className="px-4 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 shadow-sm transition-colors"
            >
              สร้างรายงาน
            </button>
          </div>

          {/* Report Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-2">ความครบถ้วนรวม ({reportData.days} วัน)</p>
              <div className={`text-3xl font-bold tracking-tight ${reportData.summary.pct >= 95 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {reportData.summary.pct}%
              </div>
              <div className="text-xs text-slate-400 mt-2">{reportData.summary.done} / {reportData.summary.expected} ช่อง</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-2">บันทึกทั้งหมด</p>
              <div className="text-3xl font-bold tracking-tight text-slate-900">{reportData.summary.records}</div>
              <div className="text-xs text-slate-400 mt-2">รายการในช่วงที่เลือก</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-2">รายการติดธง (Flags)</p>
              <div className={`text-3xl font-bold tracking-tight ${reportData.summary.flagged > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {reportData.summary.flagged}
              </div>
              <div className="text-xs text-slate-400 mt-2">GPS / ความเร็ว / ยกเว้น</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-slate-500 font-medium mb-2">พบสิ่งผิดปกติ</p>
              <div className={`text-3xl font-bold tracking-tight ${reportData.summary.abnormal > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {reportData.summary.abnormal}
              </div>
              <div className="text-xs text-slate-400 mt-2">จุดที่ต้องติดตามแก้ไข</div>
            </div>
          </div>

          {/* Daily Completion Chart */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 mb-4">ความครบถ้วนรายวัน</h2>
            <div className="flex items-end gap-2 h-40 pt-4 px-2 overflow-x-auto">
              {reportData.daily.map((t) => (
                <div key={t.date} className="flex-1 min-w-[28px] flex flex-col justify-end items-center h-full gap-1.5">
                  <span className="text-[10px] font-bold font-mono text-slate-700">{t.pct}%</span>
                  <div className="w-full bg-slate-100 rounded-t-lg h-full flex items-end">
                    <div
                      className={`w-full rounded-t-lg ${getBarColor(t.pct)}`}
                      style={{ height: `${Math.max(6, t.pct)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 font-mono">{t.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Breakdown Tables (Rounds & Zones) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-4">แยกตามรอบตรวจ (Rounds)</h3>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">รอบ</th>
                    <th className="py-2.5 px-2 text-center">บันทึก</th>
                    <th className="py-2.5 px-2 text-center">ครบถ้วน</th>
                    <th className="py-2.5 px-2 text-center">ติดธง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {reportData.rounds.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-medium text-slate-900">{r.label}</td>
                      <td className="py-2.5 px-2 text-center font-mono">{r.count} / {r.expected}</td>
                      <td className="py-2.5 px-2 text-center">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${getLevelClass(r.pct)}`}>
                          {r.pct}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center font-mono text-amber-600 font-semibold">{r.flagged}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-4">แยกตามโซน (Zones)</h3>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">โซน</th>
                    <th className="py-2.5 px-2 text-center">จำนวนบันทึก</th>
                    <th className="py-2.5 px-2 text-center">ติดธง</th>
                    <th className="py-2.5 px-2 text-center">ผิดปกติ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-600">
                  {reportData.zones.map((z) => (
                    <tr key={z.key} className="hover:bg-slate-50/50">
                      <td className="py-2.5 px-3 font-medium text-slate-900">{z.key}</td>
                      <td className="py-2.5 px-2 text-center font-mono">{z.count}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-amber-600 font-semibold">{z.flagged}</td>
                      <td className="py-2.5 px-2 text-center font-mono text-rose-600 font-semibold">{z.abnormal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Issues List */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              รายการที่ต้องตรวจสอบ / ติดธง ({reportData.issues.length} รายการ)
            </h3>
            {reportData.issues.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                ไม่มีรายการติดธงหรือผิดปกติในช่วงเวลานี้
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-3">วัน/เวลา</th>
                      <th className="py-3 px-2">รอบ</th>
                      <th className="py-3 px-2">จุดตรวจ</th>
                      <th className="py-3 px-2">ผู้ตรวจ</th>
                      <th className="py-3 px-2 text-center">สถานะ</th>
                      <th className="py-3 px-2 text-center">ระยะ</th>
                      <th className="py-3 px-2">ธงตรวจสอบ</th>
                      <th className="py-3 px-2">หมายเหตุ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {reportData.issues.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                          {it.date.split('-').reverse().join('/')} {it.time}
                        </td>
                        <td className="py-2.5 px-2 font-mono">{it.round}</td>
                        <td className="py-2.5 px-2 font-semibold">
                          <span className="text-blue-600 mr-1 font-mono">{it.cp}</span> {it.cpName}
                        </td>
                        <td className="py-2.5 px-2 text-slate-800">{it.guard}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              it.status === 'ปกติ' ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-rose-700 bg-rose-50 border border-rose-100'
                            }`}
                          >
                            {it.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono">
                          {it.distance !== '' ? `${it.distance} ม.` : '—'}
                        </td>
                        <td className="py-2.5 px-2 text-rose-600 font-mono font-medium">
                          {it.flags || '—'}
                        </td>
                        <td className="py-2.5 px-2 text-slate-500 max-w-xs truncate">{it.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Guard Log (if guard filtered) */}
          {selectedGuard && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <User className="w-4 h-4 text-blue-600" />
                บันทึกการเดินตรวจของ: {selectedGuard} ({guardLogs.length} รายการ)
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-400 font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-3">วัน/เวลา</th>
                      <th className="py-3 px-2">รอบ</th>
                      <th className="py-3 px-2">จุดตรวจ</th>
                      <th className="py-3 px-2">โซน</th>
                      <th className="py-3 px-2 text-center">สถานะ</th>
                      <th className="py-3 px-2 text-center">ระยะ</th>
                      <th className="py-3 px-2">ผล GPS</th>
                      <th className="py-3 px-2">ธง</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-600">
                    {guardLogs.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                          {r.date.split('-').reverse().join('/')} {r.time}
                        </td>
                        <td className="py-2.5 px-2 font-mono">{r.round}</td>
                        <td className="py-2.5 px-2 font-semibold">
                          <span className="text-blue-600 mr-1 font-mono">{r.cp}</span> {r.cpName}
                        </td>
                        <td className="py-2.5 px-2 text-slate-500">{r.zone}</td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.status === 'ปกติ' ? 'text-emerald-700 bg-emerald-50 border border-emerald-100' : 'text-rose-700 bg-rose-50 border border-rose-100'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-center font-mono">
                          {r.distance !== '' ? `${r.distance} ม.` : '—'}
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[11px]">{r.geo}</td>
                        <td className="py-2.5 px-2 text-rose-600 font-mono text-[11px]">{r.flags || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ISO 45001 Official Sign-off Boxes (Printed at bottom) */}
      <div className="hidden print-only mt-12 pt-4 border-t border-gray-400">
        <div className="grid grid-cols-3 gap-6 text-center text-xs">
          <div>
            <div className="h-14 border-b border-black mb-1.5" />
            <div className="font-semibold">ผู้จัดทำ / หัวหน้าชุด รปภ.</div>
            <div className="text-[11px] text-gray-600 mt-0.5">วันที่ ........................................</div>
          </div>
          <div>
            <div className="h-14 border-b border-black mb-1.5" />
            <div className="font-semibold">ผู้ตรวจสอบ / หัวหน้าแผนกความปลอดภัย</div>
            <div className="text-[11px] text-gray-600 mt-0.5">วันที่ ........................................</div>
          </div>
          <div>
            <div className="h-14 border-b border-black mb-1.5" />
            <div className="font-semibold">ผู้อนุมัติ / ผู้จัดการโรงงาน</div>
            <div className="text-[11px] text-gray-600 mt-0.5">วันที่ ........................................</div>
          </div>
        </div>
      </div>
    </div>
  );
};
