import React, { useState } from 'react';
import { SystemConfig } from '../types';
// เก็บโค้ด .gs เป็นไฟล์จริงเพื่อไม่ต้อง escape backtick และแก้ไขง่าย
import APPS_SCRIPT_CODE from '../apps-script/Code.gs?raw';
import { patrolEngine } from '../services/guardPatrolEngine';
import { Code, CheckCircle, AlertTriangle, Copy, ExternalLink, Database, Server, Terminal, Settings } from 'lucide-react';

interface AppsScriptHubProps {
  config: SystemConfig;
  onUpdateConfig: (newCfg: Partial<SystemConfig>) => void;
}

export const AppsScriptHub: React.FC<AppsScriptHubProps> = ({ config, onUpdateConfig }) => {
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [testUrl, setTestUrl] = useState<string>(config.WEBAPP_URL);
  const [appUrl, setAppUrl] = useState<string>(config.APP_URL);
  const [appUrlMsg, setAppUrlMsg] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'loading' | 'success' | 'warn' | 'error'; message: string }>({
    status: 'idle',
    message: '',
  });

  const isDev = /\/dev\/?$/.test(testUrl);

  const handleCopy = (fileName: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedFile(fileName);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const handleSaveUrl = () => {
    onUpdateConfig({ WEBAPP_URL: testUrl.trim() });
    setTestResult({ status: 'success', message: 'บันทึกค่า WEBAPP_URL เรียบร้อยแล้ว' });
  };

  const handleSaveAppUrl = () => {
    const v = appUrl.trim();
    if (v) {
      try {
        new URL(v);
      } catch {
        setAppUrlMsg('รูปแบบ URL ไม่ถูกต้อง');
        return;
      }
      if (/script\.google\.com/.test(v)) {
        setAppUrlMsg('นี่คือ URL ของ Apps Script ไม่ใช่ของเว็บแอป — QR ต้องชี้มาที่เว็บแอปนี้');
        return;
      }
    }
    onUpdateConfig({ APP_URL: v });
    setAppUrlMsg(v ? 'บันทึกแล้ว QR จะชี้มาที่ URL นี้' : 'ล้างค่าแล้ว ระบบจะใช้ URL ของหน้าที่เปิดอยู่แทน');
  };

  const handleTestUrl = async () => {
    setTestResult({ status: 'loading', message: 'กำลังตรวจสอบรูปแบบ URL...' });

    if (!testUrl || !testUrl.trim()) {
      setTestResult({
        status: 'error',
        message: 'กรุณาระบุ URL ของ Web App',
      });
      return;
    }

    try {
      const u = new URL(testUrl.trim());
      if (u.protocol !== 'https:' && u.protocol !== 'http:') {
        throw new Error('ต้องใช้โปรโตคอล https://');
      }
      if (isDev) {
        setTestResult({
          status: 'warn',
          message: 'ลิงก์ลงท้ายด้วย /dev ซึ่งต้องล็อกอิน Google บัญชีผู้พัฒนา — รปภ. จะเข้าไม่ได้ กรุณาใช้ลิงก์ /exec',
        });
        return;
      }
      setTestResult({
        status: 'warn',
        message: 'รูปแบบ URL ถูกต้อง (ยังไม่ได้ทดสอบการเชื่อมต่อจริง — กรุณาเปิดลิงก์นี้ในแท็บใหม่เพื่อยืนยัน)',
      });
    } catch (e: any) {
      setTestResult({
        status: 'error',
        message: `รูปแบบ URL ไม่ถูกต้อง: ${e.message || 'กรุณาตรวจสอบ URL'}`,
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 bg-[#F5F7FA] text-[#1B2430]">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1B2430] flex items-center gap-2">
          <Code className="w-6 h-6 text-[#2F6FD0]" />
          ศูนย์จัดการ Google Apps Script & Google Sheets
        </h1>
        <p className="text-xs text-[#6B7887] mt-1">
          เอกสารโครงสร้างฐานข้อมูล, ซอร์สโค้ดไฟล์ .gs ทั้งหมด และข้อควรระวังในการ deploy
        </p>
      </div>

      {/* APP_URL — ปลายทางของ QR */}
      <div className="bg-white border border-[#DDE3EA] rounded-xl p-5 shadow-sm mb-6">
        <h2 className="text-base font-bold text-[#1B2430] mb-2 flex items-center gap-2">
          <Server className="w-4 h-4 text-[#2F6FD0]" />
          URL ของเว็บแอปนี้ (APP_URL) — ปลายทางของ QR Code
        </h2>
        <p className="text-xs text-[#6B7887] mb-3">
          QR ทุกดวงจะชี้มาที่ <code>APP_URL?cp=CP01</code> เพื่อให้ รปภ. สแกนแล้วเปิดหน้าบันทึกได้ทันที
          <br />
          <strong className="text-[#A5241B]">ห้ามใส่ URL ของ Apps Script ที่ช่องนี้</strong>{' '}
          เพราะ Apps Script ไม่มีหน้าเว็บสำหรับ รปภ. ถ้าเว้นว่างระบบจะใช้ URL ของหน้าที่กำลังเปิดอยู่แทน
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input
            type="text"
            value={appUrl}
            onChange={(e) => {
              setAppUrl(e.target.value);
              setAppUrlMsg(null);
            }}
            placeholder="https://qr-coed-guard.pages.dev"
            className="flex-1 min-w-[320px] bg-[#F5F7FA] border border-[#DDE3EA] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#2F6FD0]"
          />
          <button
            onClick={handleSaveAppUrl}
            className="px-4 py-2 bg-[#2F6FD0] text-white text-xs font-semibold rounded-lg hover:bg-[#2558A5]"
          >
            บันทึก APP_URL
          </button>
        </div>
        {appUrlMsg && <div className="text-xs text-[#6B7887] mt-1">{appUrlMsg}</div>}
      </div>

      {/* WEBAPP_URL Configuration & Health Check */}
      <div className="bg-white border border-[#DDE3EA] rounded-xl p-5 shadow-sm mb-6">
        <h2 className="text-base font-bold text-[#1B2430] mb-2 flex items-center gap-2">
          <Server className="w-4 h-4 text-[#2F6FD0]" />
          URL ของ Apps Script (WEBAPP_URL) — ปลายทางซิงก์ข้อมูล
        </h2>
        <p className="text-xs text-[#6B7887] mb-3">
          ใช้สำหรับส่งบันทึกผลตรวจขึ้น Google Sheets และดึงข้อมูลของทุกเครื่องกลับมารวมกัน
          ต้องเป็นลิงก์ที่ลงท้ายด้วย <code>/exec</code> เท่านั้น
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-2">
          <input
            type="text"
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
            placeholder="https://script.google.com/macros/s/.../exec"
            className="flex-1 min-w-[320px] bg-[#F5F7FA] border border-[#DDE3EA] rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-[#2F6FD0]"
          />
          <button
            onClick={handleSaveUrl}
            className="px-4 py-2 bg-[#2F6FD0] text-white text-xs font-semibold rounded-lg hover:bg-[#2558A5]"
          >
            บันทึกค่าลงระบบ
          </button>
          <button
            onClick={handleTestUrl}
            className="px-4 py-2 bg-white border border-[#DDE3EA] text-xs font-semibold rounded-lg hover:bg-gray-50"
          >
            ทดสอบ URL
          </button>
        </div>

        {testResult.message && (
          <div
            className={`p-3 rounded-lg text-xs font-medium mt-2 flex items-center justify-between gap-3 flex-wrap ${
              testResult.status === 'success'
                ? 'bg-[#00A651]/15 text-[#00722F] border border-[#00A651]/30'
                : testResult.status === 'warn'
                ? 'bg-[#FFF4D6] text-[#7A5300] border border-[#FFB000]'
                : 'bg-[#E03A2F]/15 text-[#A5241B] border border-[#E03A2F]/30'
            }`}
          >
            <span>{testResult.message}</span>
            {testUrl && testResult.status === 'warn' && (
              <a
                href={(() => {
                  try {
                    const u = new URL(testUrl.trim());
                    u.searchParams.set('cp', 'CP02');
                    return u.toString();
                  } catch {
                    return testUrl.trim();
                  }
                })()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-xs font-semibold rounded-md shadow-xs transition-colors"
              >
                <span>เปิดหน้าสแกน CP02 ในแท็บใหม่เพื่อยืนยัน</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
      </div>

      {/* Critical Checklist */}
      <div className="bg-white border border-[#DDE3EA] rounded-xl p-5 shadow-sm mb-6">
        <h2 className="text-base font-bold text-[#1B2430] mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[#FFB000]" />
          รายการตรวจสอบความถูกต้อง 8 ข้อสำคัญก่อนเปิดใช้งานจริง
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA] space-y-1">
            <strong className="text-[#1B2430] block">1. แก้ WEBAPP_URL ต้องเป็นลิงก์ /exec เสมอ</strong>
            <p className="text-[#6B7887]">
              ห้ามใช้ลิงก์ที่ลงท้ายด้วย <code>/dev</code> เพราะจะบังคับล็อกอิน Google บัญชีผู้พัฒนา ทำให้ รปภ. เปิดไม่ได้
            </p>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA] space-y-1">
            <strong className="text-[#1B2430] block">2. สิทธิ์การ Deployment</strong>
            <p className="text-[#6B7887]">
              ตั้ง <strong>ดำเนินการในชื่อ: ฉัน (Me)</strong> และ <strong>ผู้มีสิทธิ์เข้าถึง: ทุกคน (Anyone)</strong>
            </p>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA] space-y-1">
            <strong className="text-[#1B2430] block">3. การอัปเดตโค้ดใน Apps Script</strong>
            <p className="text-[#6B7887]">
              กด <em>จัดการการทำให้ใช้งานได้ → ดินสอ → เวอร์ชัน: ใหม่</em> ห้ามกด "การทำให้ใช้งานได้ใหม่" เพราะ URL จะเปลี่ยน
            </p>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA] space-y-1">
            <strong className="text-[#1B2430] block">4. ตรวจสอบคอลัมน์ในชีต Config</strong>
            <p className="text-[#6B7887]">
              ย้ายค่า <code>SITE_NAME</code> และ <code>DOC_CODE</code> มาไว้ในคอลัมน์ <code>value</code> (ไม่ใช่คอลัมน์คำอธิบาย)
            </p>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA] space-y-1">
            <strong className="text-[#1B2430] block">5. รูปแบบเวลาในชีต Rounds</strong>
            <p className="text-[#6B7887]">
              ตั้งรูปแบบเซลล์คอลัมน์ <code>start</code> และ <code>end</code> เป็นข้อความธรรมดา (<code>@</code>) เช่น <code>00:00</code>
            </p>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA] space-y-1">
            <strong className="text-[#1B2430] block">6. เดินเก็บพิกัดจริงให้ครบ 20 จุด</strong>
            <p className="text-[#6B7887]">
              ใช้หน้า <strong>สำรวจพิกัด</strong> ยืนที่ตำแหน่งจริง จุดในอาคารตั้งรัศมี 80–100ม. กลางแจ้ง 40–50ม. ไซโล 60ม.
            </p>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA] space-y-1">
            <strong className="text-[#1B2430] block">7. เปิดโหมดเก็บข้อมูลใน 2 สัปดาห์แรก</strong>
            <p className="text-[#6B7887]">
              ตั้ง <code>BLOCK_OUT_OF_RANGE=NO</code> ชั่วคราวเพื่อให้ รปภ. คุ้นชินและเก็บสถิติระยะจริงก่อนเปิดโหมดบล็อก
            </p>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA] space-y-1">
            <strong className="text-[#1B2430] block">8. ล้างแคชการตั้งค่าเมื่อแก้ Config</strong>
            <p className="text-[#6B7887]">
              กดเมนู <em>ระบบเดินตรวจ รปภ. → ล้างแคชการตั้งค่า</em> ใน Google Sheets หรือรอ 5 นาทีให้หมดอายุแคช
            </p>
          </div>
        </div>
      </div>

      {/* 5 Google Sheets Specs */}
      <div className="bg-white border border-[#DDE3EA] rounded-xl p-5 shadow-sm mb-6">
        <h2 className="text-base font-bold text-[#1B2430] mb-3 flex items-center gap-2">
          <Database className="w-4 h-4 text-[#2F6FD0]" />
          โครงสร้าง 5 แท็บใน Google Sheets
        </h2>

        <div className="space-y-3 text-xs">
          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA]">
            <div className="font-bold text-[#1B2430] mb-1">1. Checkpoints (20 จุด)</div>
            <code className="text-[#2F6FD0] font-mono">checkpoint_id | name | zone | lat | lng | radius_m | active</code>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA]">
            <div className="font-bold text-[#1B2430] mb-1">2. Rounds (6 รอบตรวจ รอบละ 4 ชม.)</div>
            <code className="text-[#2F6FD0] font-mono">round_id | label | start | end</code>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA]">
            <div className="font-bold text-[#1B2430] mb-1">3. Guards (12 นาย)</div>
            <code className="text-[#2F6FD0] font-mono">guard_id | name | active</code>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA]">
            <div className="font-bold text-[#1B2430] mb-1">4. Logs (19 คอลัมน์ ห้ามสลับลำดับ - บันทึกผลตรวจอัตโนมัติ)</div>
            <code className="text-[#2F6FD0] font-mono break-all">
              timestamp | date | time | round | checkpoint_id | checkpoint_name | zone | guard | status | note | lat | lng | accuracy_m | distance_m | geo_result | flags | device_id | photo_url | maps_link
            </code>
          </div>

          <div className="p-3 bg-[#F5F7FA] rounded-lg border border-[#DDE3EA]">
            <div className="font-bold text-[#1B2430] mb-1">5. Config (ตัวแปรระบบ)</div>
            <code className="text-[#2F6FD0] font-mono">key | value | คำอธิบาย</code>
          </div>
        </div>
      </div>

      {/* Ready-to-copy Google Apps Script Code */}
      <div className="bg-white border border-[#DDE3EA] rounded-xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-base font-bold text-[#1B2430] flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#00A651]" />
              โค้ด Google Apps Script (Code.gs) พร้อมใช้งานทันที
            </h2>
            <p className="text-xs text-[#6B7887] mt-0.5">
              คัดลอกโค้ดนี้ไปวางในเมนู <strong>ส่วนขยาย &gt; Apps Script</strong> ของชีตของคุณ
            </p>
          </div>
          <button
            onClick={() => handleCopy('code.gs', APPS_SCRIPT_CODE)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00A651] hover:bg-[#008742] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            {copiedFile === 'code.gs' ? (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                <span>คัดลอกเรียบร้อยแล้ว!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>คัดลอกโค้ด Code.gs ทั้งหมด</span>
              </>
            )}
          </button>
        </div>

        {/* 3 Steps Guide */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-xs">
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
            <span className="inline-block w-5 h-5 bg-blue-600 text-white font-bold rounded-full text-center leading-5 text-[11px] mb-1">1</span>
            <div className="font-semibold text-blue-900">เปิด Apps Script</div>
            <div className="text-blue-700 mt-1">ใน Google Sheets กดเมนู <strong>ส่วนขยาย &gt; Apps Script</strong></div>
          </div>
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
            <span className="inline-block w-5 h-5 bg-blue-600 text-white font-bold rounded-full text-center leading-5 text-[11px] mb-1">2</span>
            <div className="font-semibold text-blue-900">วางโค้ดสคริปต์</div>
            <div className="text-blue-700 mt-1">ลบโค้ดเดิมทั้งหมด วางโค้ดด้านล่างนี้ แล้วกดปุ่มบันทึก 💾</div>
          </div>
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg">
            <span className="inline-block w-5 h-5 bg-blue-600 text-white font-bold rounded-full text-center leading-5 text-[11px] mb-1">3</span>
            <div className="font-semibold text-blue-900">Deploy เป็น Web App</div>
            <div className="text-blue-700 mt-1">กด <strong>Deploy &gt; New deployment &gt; Web app</strong> เลือก <em>Anyone</em> แล้วนำลิงก์ <code>/exec</code> มาใส่ในช่องด้านบน</div>
          </div>
        </div>

        <div className="relative">
          <pre className="bg-[#1E293B] text-[#E2E8F0] p-4 rounded-lg text-[11px] font-mono overflow-x-auto max-h-[380px] leading-relaxed select-all">
            {APPS_SCRIPT_CODE}
          </pre>
        </div>
      </div>
    </div>
  );
};
