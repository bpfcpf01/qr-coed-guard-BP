/**
 * คำเตือน: การแบ่งโหมด guard/admin นี้เป็นการควบคุมการแสดงผลฝั่งหน้าเว็บ (UI-level) เท่านั้น
 * ผู้ที่มีความรู้ทางเทคนิคยังสามารถเปิด DevTools แก้ state ได้
 * การบังคับสิทธิ์จริงต้องทำที่ Google Apps Script ฝั่งเซิร์ฟเวอร์:
 *   - doGet(e) ต้องตรวจ e.parameter.k เทียบกับ DASH_KEY ในชีต Config
 *     ก่อนคืนหน้า Dashboard.html / Survey.html / QRPrint.html
 *   - ฟังก์ชัน getDashboard / getReport / saveCheckpointCoords / getGuardLog
 *     ต้องเรียก keyOk(key) ทุกครั้งก่อนคืนข้อมูล
 *   - หน้า Scan.html เป็นหน้าเดียวที่เปิดสาธารณะได้ (ไม่ต้องใช้กุญแจ)
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ScanView } from './components/ScanView';
import { HomeView } from './components/HomeView';
import { DashboardView } from './components/DashboardView';
import { SurveyView } from './components/SurveyView';
import { QRPrintView } from './components/QRPrintView';
import { AppsScriptHub } from './components/AppsScriptHub';
import { AdminKeyModal } from './components/AdminKeyModal';
import { FirstRunSetup } from './components/FirstRunSetup';
import { GuardRosterView } from './components/GuardRosterView';
import { CheckpointAdminView } from './components/CheckpointAdminView';
import { patrolEngine } from './services/guardPatrolEngine';
import { sheetSync, isValidWebAppUrl } from './services/sheetSync';
import { confirmDiscard } from './services/unsavedGuard';
import { SystemConfig } from './types';
import { ShieldAlert, Key, CheckCircle } from 'lucide-react';

export type UserMode = 'guard' | 'admin';

export default function App() {
  const [config, setConfig] = useState<SystemConfig>(() => patrolEngine.getConfig());
  const [needsSetup, setNeedsSetup] = useState<boolean>(() => patrolEngine.needsSetup());
  const [adminKey, setAdminKey] = useState<string>('');
  const [mode, setMode] = useState<UserMode>('guard');
  const [currentPage, setCurrentPage] = useState<'scan' | 'home' | 'dash' | 'survey' | 'qr' | 'roster' | 'checkpoints' | 'appscript'>('scan');
  const [targetCpId, setTargetCpId] = useState<string>('');
  // อ่าน ?cp= ตั้งแต่ render แรก เพื่อไม่ให้หน้าตั้งค่าครั้งแรกแวบขึ้นมาขวาง รปภ. ที่สแกน QR เข้ามา
  const [hasCpParam, setHasCpParam] = useState<boolean>(() => {
    try {
      return Boolean(new URLSearchParams(window.location.search).get('cp'));
    } catch {
      return false;
    }
  });
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [resetToast, setResetToast] = useState<boolean>(false);
  /** เคยปลดล็อกในเซสชันนี้ และกำลังรอ "ตรวจกับเซิร์ฟเวอร์" ก่อนคืนสิทธิ์ผู้ดูแล */
  const [pendingRestore, setPendingRestore] = useState<boolean>(false);
  /** หน้าที่ขอไว้ทาง ?page= จะพาไปก็ต่อเมื่อกุญแจผ่านการตรวจแล้วเท่านั้น */
  const [restorePage, setRestorePage] = useState<'dash' | 'home' | 'survey' | 'qr' | 'checkpoints' | 'appscript'>('home');
  /** ถาม /__config เสร็จหรือยัง — ต้องรู้ก่อนว่าเชื่อมชีตอยู่ไหม ค่อยตัดสินเรื่องกุญแจ */
  const [configProbed, setConfigProbed] = useState<boolean>(false);

  // Detect URL search params on mount
  //
  // สำคัญ: ที่นี่ "ห้าม" คืนสิทธิ์ผู้ดูแลเอง แม้ sessionStorage จะบอกว่าเคยปลดล็อกแล้ว
  // เพราะทั้ง sessionStorage และ DASH_KEY ในเครื่องเป็นค่าที่ใครก็แก้ได้จาก DevTools
  // ถ้าเชื่อตรงนี้ การย้ายไปตรวจกุญแจฝั่งเซิร์ฟเวอร์จะถูกข้ามไปทั้งหมด
  // ให้แค่ตั้งธงไว้ แล้วไปตรวจกับชีตจริงในเอฟเฟกต์ถัดไป
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cp = params.get('cp');
      const page = params.get('page');

      // Note: Do not accept 'k' parameter from URL query string for security
      if (cp) {
        // Scanned QR code URL: always guard mode and target checkpoint
        setTargetCpId(cp);
        setHasCpParam(true);
        setMode('guard');
        setCurrentPage('scan');
        return;
      }

      setMode('guard');
      setHasCpParam(false);
      setCurrentPage('scan');

      if (page === 'dash' || page === 'home' || page === 'survey' || page === 'qr' ||
          page === 'checkpoints' || page === 'appscript') {
        setRestorePage(page);
      }
      if (sessionStorage.getItem('gp_admin_unlocked') === '1') {
        setPendingRestore(true);
      }
    } catch (e) {
      setMode('guard');
      setHasCpParam(false);
      setCurrentPage('scan');
    }
  }, []);

  /**
   * คืนสิทธิ์ผู้ดูแลหลังรีเฟรช — ต้องผ่านการตรวจกับชีตก่อนเสมอ
   * รอให้ถาม /__config เสร็จก่อน เพราะถ้าตัดสินตอนที่ยังไม่รู้ว่ามี WEBAPP_URL ไหม
   * จะเผลอไปใช้ทางเทียบกับค่าในเครื่อง ซึ่งเป็นช่องที่ต้องการปิดพอดี
   */
  useEffect(() => {
    if (!pendingRestore || !configProbed) return;

    const clearSession = () => {
      try {
        sessionStorage.removeItem('gp_admin_unlocked');
      } catch {}
      setPendingRestore(false);
      setAdminKey('');
      setMode('guard');
      setCurrentPage('scan');
    };

    const cfgKey = String(patrolEngine.getConfig().DASH_KEY || '').trim();
    if (!cfgKey) {
      clearSession();
      return;
    }

    // ห้ามใช้ sheetSync.isConfigured() ตรงนี้ — มันสะท้อนค่าจาก configure() ครั้งล่าสุด
    // ซึ่งเอฟเฟกต์ที่เรียกอยู่ "ใต้" เอฟเฟกต์นี้ ในรอบเรนเดอร์ที่ /__config เพิ่งส่ง URL มา
    // ค่าจึงยังเก่าอยู่ แล้วจะหลุดไปเข้าทางที่เชื่อค่าในเครื่องพอดี
    const cfg = patrolEngine.getConfig();
    const sheetReady = isValidWebAppUrl(cfg.WEBAPP_URL);

    let cancelled = false;
    (async () => {
      if (sheetReady) {
        sheetSync.configure(cfg.WEBAPP_URL, undefined, cfg.WEBAPP_TOKEN);
        const ok = await sheetSync.verifyKey(cfgKey);
        if (cancelled) return;
        if (!ok) {
          clearSession();
          return;
        }
      }
      // ถ้ายังไม่ได้เชื่อมชีต (ติดตั้งครั้งแรก/ออฟไลน์) ไม่มีของจริงให้เทียบ
      // จึงคืนสิทธิ์ตามค่าในเครื่องไปก่อน
      if (cancelled) return;
      setAdminKey(cfgKey);
      setMode('admin');
      setCurrentPage(restorePage);

      // ปิดธงเฉพาะตอนที่ตรวจกับชีตไปแล้วจริง ๆ
      // ถ้ายังไม่เชื่อมชีต คงธงไว้ เพื่อให้ตรวจซ้ำทันทีที่ WEBAPP_URL มาถึง
      // (dependency มี config.WEBAPP_URL) แล้วเตะออกเองถ้ากุญแจไม่ตรงกับชีต
      if (sheetReady) setPendingRestore(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [pendingRestore, configProbed, config.WEBAPP_URL, restorePage]);

  // ดึงค่าตั้งค่ากลางจาก Worker (ตั้ง WEBAPP_URL เป็น env var ที่ Cloudflare ครั้งเดียว)
  // ทำให้มือถือ รปภ. ที่เปิดครั้งแรกรู้ปลายทางชีตเอง ไม่ต้องตั้งค่าทีละเครื่อง
  useEffect(() => {
    let cancelled = false;
    fetch('/__config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const url = String(data.webAppUrl || '').trim();
        const token = String(data.pushToken || '').trim();
        const patch: Partial<SystemConfig> = {};
        if (url && url !== patrolEngine.getConfig().WEBAPP_URL) patch.WEBAPP_URL = url;
        // เก็บโทเคนลงเครื่องด้วย เพื่อให้ส่งคิวที่ค้างได้ทันทีตอนเปิดแอปครั้งถัดไป
        // โดยไม่ต้องรอ /__config ตอบก่อน
        if (token !== patrolEngine.getConfig().WEBAPP_TOKEN) patch.WEBAPP_TOKEN = token;
        if (Object.keys(patch).length) {
          const updated = patrolEngine.updateConfig(patch);
          setConfig({ ...updated });
        }
      })
      .catch(() => {
        // ไม่มี /__config ก็ไม่เป็นไร ใช้ค่าที่ผู้ดูแลกรอกเองในเครื่องแทน
      })
      .finally(() => {
        // ต้องตั้งธงนี้ทั้งกรณีสำเร็จและล้มเหลว ไม่งั้นการคืนสิทธิ์ผู้ดูแลจะค้างตลอดไป
        if (!cancelled) setConfigProbed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // เชื่อมต่อ Google Sheets: ส่งคิวที่ค้าง และดึงข้อมูลจุดตรวจ/รายชื่อล่าสุดลงมา
  useEffect(() => {
    sheetSync.configure(config.WEBAPP_URL, adminKey, config.WEBAPP_TOKEN);
    if (!sheetSync.isConfigured()) return;

    sheetSync.startAutoFlush();
    sheetSync
      .pullPublic()
      .then((data) => {
        patrolEngine.applyRemoteMasterData(data as any);
        setConfig({ ...patrolEngine.getConfig() });
      })
      .catch((err) => {
        // ดึงไม่ได้ก็ใช้ข้อมูลที่แคชไว้ในเครื่องต่อได้ ไม่ขวางการบันทึก
        console.warn('ดึงข้อมูลจากชีตไม่สำเร็จ:', err?.message || err);
      });
  }, [config.WEBAPP_URL, config.WEBAPP_TOKEN, adminKey]);

  // ผู้ดูแลเข้าระบบแล้วดึงบันทึกของทุกเครื่องลงมารวมกัน
  useEffect(() => {
    if (mode !== 'admin' || !adminKey || !sheetSync.isConfigured()) return;
    sheetSync
      .pullLogs()
      .then((logs) => {
        const added = patrolEngine.mergeLogs(logs);
        if (added > 0) setConfig({ ...patrolEngine.getConfig() });
      })
      .catch((err) => {
        console.warn('ดึงบันทึกจากชีตไม่สำเร็จ:', err?.message || err);
      });
  }, [mode, adminKey]);

  /**
   * ตั้งกุญแจผู้ดูแลครั้งแรก แล้วเข้าโหมดผู้ดูแลให้เลย
   *
   * ถ้าเชื่อมชีตแล้วต้องเขียนกุญแจลงแท็บ Config ให้สำเร็จก่อน ไม่ใช่เก็บแค่ในเครื่อง
   * เพราะ keyOk_ ฝั่งเซิร์ฟเวอร์เทียบกับชีตอย่างเดียว ถ้าตั้งแต่ในเครื่อง
   * ผู้ดูแลจะเข้าระบบไม่ได้อีกเลยทั้งที่หน้าจอบอกว่าตั้งค่าสำเร็จ
   * คืนค่าเป็นข้อความผิดพลาด หรือ null เมื่อสำเร็จ
   */
  const handleFirstRunSetup = async (key: string): Promise<string | null> => {
    if (sheetSync.isConfigured()) {
      try {
        await sheetSync.setDashKey(key);
      } catch (err: any) {
        return `ตั้งกุญแจลงชีตไม่สำเร็จ: ${err?.message || err}`;
      }
    }

    const updated = patrolEngine.updateConfig({ DASH_KEY: key, KEY_SET: true });
    setConfig({ ...updated });
    setNeedsSetup(false);
    setShowAdminModal(false);
    setAdminKey(key);
    setMode('admin');
    try {
      sessionStorage.setItem('gp_admin_unlocked', '1');
    } catch {}
    setCurrentPage('home');
    return null;
  };

  const enterAdmin = (key: string) => {
    setAdminKey(key);
    setMode('admin');
    try {
      sessionStorage.setItem('gp_admin_unlocked', '1');
    } catch {}
    if (!hasCpParam && currentPage === 'scan') {
      setCurrentPage('home');
    }
  };

  /**
   * ตรวจกุญแจกับชีตเป็นหลัก เพื่อไม่ให้ใครตั้งกุญแจเองในเครื่องแล้วกลายเป็นผู้ดูแล
   * ถ้ายังไม่ได้เชื่อมชีต (ตอนติดตั้งครั้งแรก) จึงยอมให้เทียบกับค่าในเครื่อง
   */
  const handleUnlockAdmin = async (key: string): Promise<boolean> => {
    if (sheetSync.isConfigured()) {
      const ok = await sheetSync.verifyKey(key);
      if (!ok) return false;
      // เก็บกุญแจที่ผ่านแล้วไว้ใช้เรียก API ครั้งต่อ ๆ ไปในเครื่องนี้
      const updated = patrolEngine.updateConfig({ DASH_KEY: key });
      setConfig({ ...updated });
      setNeedsSetup(false);
      enterAdmin(key);
      return true;
    }

    if (patrolEngine.keyOk(key)) {
      enterAdmin(key);
      return true;
    }
    return false;
  };

  const handleLogoutAdmin = () => {
    try {
      sessionStorage.removeItem('gp_admin_unlocked');
    } catch {}
    setAdminKey('');
    setMode('guard');
    setCurrentPage('scan');
  };

  const handleNavigate = (page: 'scan' | 'home' | 'dash' | 'survey' | 'qr' | 'roster' | 'checkpoints' | 'appscript', cpId?: string) => {
    // Route guard: Guard mode cannot access management views
    if (mode === 'guard' && page !== 'scan') {
      return;
    }
    // หน้าจัดการของผู้ดูแลแก้ทีละหลายแถวแล้วค่อยกดบันทึกครั้งเดียว
    // ถ้าเผลอกดเมนูอื่นตอนยังไม่บันทึก งานที่แก้มาจะหายทันที จึงต้องถามก่อน
    if (page !== currentPage && !confirmDiscard('เปลี่ยนหน้า')) {
      return;
    }
    if (cpId) {
      setTargetCpId(cpId);
    }
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleUpdateConfig = (newCfg: Partial<SystemConfig>) => {
    const updated = patrolEngine.updateConfig(newCfg);
    setConfig({ ...updated });
  };

  const handleResetData = () => {
    patrolEngine.resetToDefault();
    setConfig({ ...patrolEngine.getConfig() });
    setResetToast(true);
    setTimeout(() => setResetToast(false), 3500);
  };

  // "เพิ่งติดตั้งครั้งแรก" ตัดสินจากฝั่งที่เป็นแหล่งอ้างอิงจริง
  //   - เชื่อมชีตแล้ว: ดูว่าแท็บ Config ยังไม่มี DASH_KEY (เซิร์ฟเวอร์เป็นคนบอกผ่าน KEY_SET)
  //     KEY_SET เป็น undefined ระหว่างที่ยังดึงไม่เสร็จ จึงยังไม่ขึ้นหน้าตั้งค่าให้ใคร
  //   - ยังไม่เชื่อมชีต: ใช้สถานะในเครื่อง (โหมดออฟไลน์/สาธิต)
  // แสดงหน้าตั้งกุญแจเฉพาะเมื่อผู้ดูแลกดไอคอนกุญแจเองเท่านั้น
  // ห้ามบังคับกับทุกคน ไม่งั้น รปภ. จะตั้งกุญแจของตัวเองแล้วกลายเป็นผู้ดูแลได้
  const sheetReady = isValidWebAppUrl(config.WEBAPP_URL);
  const isFirstInstall = sheetReady ? config.KEY_SET === false : needsSetup;
  if (isFirstInstall && showAdminModal) {
    return (
      <FirstRunSetup
        siteName={config.SITE_NAME}
        savesToSheet={sheetReady}
        onSetKey={handleFirstRunSetup}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#1E293B] flex flex-col">
      {/* Global Navbar */}
      <Navbar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        config={config}
        adminKey={adminKey}
        mode={mode}
        onUnlockAdmin={handleUnlockAdmin}
        onLogoutAdmin={handleLogoutAdmin}
        onResetData={handleResetData}
        firstInstall={isFirstInstall}
        onRequestFirstSetup={() => setShowAdminModal(true)}
      />

      {/* Main Content Area with Route Protection */}
      <main className="flex-1">
        {mode === 'guard' && currentPage !== 'scan' ? (
          <div className="min-h-[70vh] flex items-center justify-center p-4">
            <div className="bg-white border border-rose-200 p-8 rounded-2xl max-w-md text-center shadow-sm">
              <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-slate-900 mb-2">จำกัดสิทธิ์เฉพาะผู้ดูแลระบบ</h2>
              <p className="text-sm text-slate-500 mb-5 leading-relaxed">
                หน้านี้สำหรับหัวหน้าชุดหรือผู้ดูแลระบบเท่านั้น กรุณากรอกรหัสกุญแจ DASH_KEY เพื่อเข้าใช้งาน
              </p>
              <button
                onClick={() => setShowAdminModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
              >
                <Key className="w-4 h-4" />
                <span>เข้าสู่ระบบผู้ดูแล</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {currentPage === 'scan' && (
              <ScanView
                initialCpId={targetCpId || (mode === 'admin' ? 'CP02' : '')}
                mode={mode}
                hasCpParam={hasCpParam}
                onSelectCp={(cpId) => {
                  setTargetCpId(cpId);
                  setHasCpParam(true);
                }}
              />
            )}
            {currentPage === 'home' && (
              <HomeView
                adminKey={adminKey}
                config={config}
                onNavigate={handleNavigate}
              />
            )}
            {currentPage === 'dash' && (
              <DashboardView
                adminKey={adminKey}
                config={config}
              />
            )}
            {currentPage === 'survey' && (
              <SurveyView
                adminKey={adminKey}
                config={config}
              />
            )}
            {currentPage === 'qr' && (
              <QRPrintView
                config={config}
              />
            )}
            {currentPage === 'roster' && <GuardRosterView adminKey={adminKey} />}
            {currentPage === 'checkpoints' && <CheckpointAdminView adminKey={adminKey} />}
            {currentPage === 'appscript' && (
              <AppsScriptHub
                config={config}
                onUpdateConfig={handleUpdateConfig}
              />
            )}
          </>
        )}
      </main>

      {/* Admin Key Modal for Restricted View */}
      <AdminKeyModal
        isOpen={showAdminModal}
        onClose={() => setShowAdminModal(false)}
        onUnlock={handleUnlockAdmin}
      />

      {/* Toast Notification */}
      {resetToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-xl shadow-xl border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>รีเซ็ตข้อมูลตัวอย่างกลับเป็นค่าเริ่มต้นตามเอกสาร CPF เรียบร้อยแล้ว</span>
        </div>
      )}
    </div>
  );
}
