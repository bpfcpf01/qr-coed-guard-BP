import React, { useState } from 'react';
import { Shield, QrCode, LayoutDashboard, Navigation, Home, AlertTriangle, Key, Code, RefreshCw, LogOut, Users, MapPin, BookOpen } from 'lucide-react';
import { SystemConfig } from '../types';
import { SyncStatusBadge } from './SyncStatusBadge';
import { AdminKeyModal } from './AdminKeyModal';
import { HelpManual } from './HelpManual';

interface NavbarProps {
  currentPage: 'scan' | 'home' | 'dash' | 'survey' | 'qr' | 'roster' | 'checkpoints' | 'appscript';
  onNavigate: (page: 'scan' | 'home' | 'dash' | 'survey' | 'qr' | 'roster' | 'checkpoints' | 'appscript') => void;
  config: SystemConfig;
  adminKey: string;
  mode: 'guard' | 'admin';
  onUnlockAdmin: (key: string) => boolean | Promise<boolean>;
  onLogoutAdmin: () => void;
  onResetData: () => void;
  /** ระบบยังไม่ได้ตั้งกุญแจและยังไม่ได้เชื่อมชีต = ต้องพาไปหน้าตั้งกุญแจครั้งแรกแทน */
  firstInstall?: boolean;
  onRequestFirstSetup?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPage,
  onNavigate,
  config,
  adminKey,
  mode,
  onUnlockAdmin,
  onLogoutAdmin,
  onResetData,
  firstInstall = false,
  onRequestFirstSetup,
}) => {
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const isDevUrl = /\/dev\/?$/.test(config.WEBAPP_URL || '');

  const navItems = [
    { id: 'scan', label: 'หน้าสแกน (Scan)', icon: QrCode },
    { id: 'home', label: 'หน้าหลัก (Home)', icon: Home },
    { id: 'dash', label: 'แดชบอร์ด & รายงาน', icon: LayoutDashboard },
    { id: 'checkpoints', label: 'จัดการจุดตรวจ', icon: MapPin },
    { id: 'survey', label: 'สำรวจพิกัด', icon: Navigation },
    { id: 'qr', label: 'พิมพ์ QR จุดตรวจ', icon: QrCode },
    { id: 'roster', label: 'รายชื่อ รปภ.', icon: Users },
    { id: 'appscript', label: 'Apps Script & ชีต', icon: Code },
  ] as const;

  return (
    <header className="noprint w-full bg-white text-slate-800 border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Site Branding */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold shadow-sm shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-900 flex items-center gap-2">
              <span>{config.SITE_NAME}</span>
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium border border-blue-100">
                {config.DOC_CODE}
              </span>
            </div>
            <div className="text-xs text-slate-500 font-medium">
              {mode === 'guard'
                ? 'โหมดเจ้าหน้าที่ รปภ. — บันทึกการเดินตรวจ'
                : 'ระบบบันทึกการเดินตรวจ รปภ. (GPS Guard Patrol)'}
            </div>
          </div>
        </div>

        {/* Navigation Tabs (Admin mode only) */}
        {mode === 'admin' && (
          <nav className="flex items-center flex-wrap gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm rounded-lg transition-colors whitespace-nowrap font-medium ${
                    isActive
                      ? 'bg-blue-50 text-blue-600 border border-blue-200 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Controls / Key and Utilities */}
        <div className="flex items-center gap-2">
          {/* คู่มือเปิดได้ทั้งสองโหมด เพราะ รปภ. ต้องเปิดอ่านเองกลางสนามได้โดยไม่ต้องรอหัวหน้าชุด */}
          <button
            onClick={() => setShowHelp(true)}
            title="คู่มือการใช้งาน"
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 shadow-sm transition-colors font-medium"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">คู่มือการใช้งาน</span>
          </button>
          <SyncStatusBadge compact />
          {mode === 'guard' ? (
            /* Guard mode: Small subtle key icon only, no label, no partial key */
            <button
              onClick={() => {
                // ยังไม่เคยตั้งกุญแจและยังไม่ได้เชื่อมชีต -> พาไปหน้าตั้งกุญแจครั้งแรก
                if (firstInstall && onRequestFirstSetup) {
                  onRequestFirstSetup();
                  return;
                }
                setShowKeyModal(true);
              }}
              title="เข้าสู่ระบบผู้ดูแล"
              className="p-2 rounded-lg border border-transparent hover:border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Key className="w-4 h-4" />
            </button>
          ) : (
            /* Admin mode: Full management controls */
            <>
              <div
                title="สิทธิ์ผู้ดูแลระบบเปิดใช้งานแล้ว"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 shadow-xs"
              >
                <Key className="w-3.5 h-3.5 text-amber-500" />
                <span className="font-medium">ผู้ดูแล</span>
              </div>

              <button
                onClick={() => {
                  if (window.confirm('ต้องการรีเซ็ตข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้นชีต CPF ใช่หรือไม่?')) {
                    onResetData();
                  }
                }}
                title="รีเซ็ตข้อมูลตัวอย่าง"
                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-900 shadow-sm transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onLogoutAdmin}
                title="ออกจากระบบผู้ดูแล"
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 shadow-sm transition-colors font-medium"
              >
                <LogOut className="w-3.5 h-3.5 text-rose-600" />
                <span className="hidden sm:inline">ออกจากระบบผู้ดูแล</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Warning banner if WEBAPP_URL ends with /dev (Admin mode only) */}
      {mode === 'admin' && isDevUrl && (
        <div className="bg-amber-50 text-amber-800 border-y border-amber-200 px-4 sm:px-6 py-2 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>คำเตือน:</strong> ค่า <code>WEBAPP_URL</code> ในชีต Config ลงท้ายด้วย <code>/dev</code>{' '}
              ซึ่งเปิดได้เฉพาะเจ้าของสคริปต์ — รปภ. จะสแกนแล้วเจอหน้าล็อกอิน Google
              กรุณาเปลี่ยนเป็นลิงก์ <code>/exec</code> ของ deployment แล้วกดเมนู “ล้างแคชการตั้งค่า”
            </span>
          </div>
          <button
            onClick={() => onNavigate('appscript')}
            className="ml-2 text-xs underline font-semibold text-amber-700 hover:text-amber-900 whitespace-nowrap"
          >
            ดูวิธีแก้
          </button>
        </div>
      )}

      {/* คู่มือการใช้งานในตัวแอป */}
      <HelpManual
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        config={config}
        mode={mode}
      />

      {/* Admin Key Modal */}
      <AdminKeyModal
        isOpen={showKeyModal}
        onClose={() => setShowKeyModal(false)}
        onUnlock={onUnlockAdmin}
      />
    </header>
  );
};
