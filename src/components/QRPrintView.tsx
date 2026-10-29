import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { patrolEngine } from '../services/guardPatrolEngine';
import { Checkpoint, SystemConfig } from '../types';
import { Printer, AlertTriangle, QrCode, CheckSquare, Square, Shield } from 'lucide-react';

/** URL ของเว็บแอปที่กำลังเปิดอยู่ (ตัด query/hash ออก) ใช้เป็นค่าเริ่มต้นของปลายทาง QR */
function defaultAppUrl(): string {
  try {
    return window.location.origin + window.location.pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
}

interface QRPrintViewProps {
  config: SystemConfig;
}

export const QRPrintView: React.FC<QRPrintViewProps> = ({ config }) => {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [onlyActive, setOnlyActive] = useState<boolean>(true);
  const [qrImages, setQrImages] = useState<Record<string, string>>({});
  const [urlError, setUrlError] = useState<string | null>(null);

  // QR ต้องพา รปภ. มาที่ "เว็บแอป" ไม่ใช่ Apps Script
  // ถ้ายังไม่ได้ตั้ง APP_URL ให้ใช้ URL ของหน้าที่กำลังเปิดอยู่เป็นค่าเริ่มต้น
  const targetBase = (config.APP_URL || '').trim() || defaultAppUrl();
  const isAppsScriptUrl = /script\.google\.com/.test(targetBase);

  useEffect(() => {
    let cancelled = false;
    const list = patrolEngine.getCheckpoints();
    setCheckpoints(list);

    // Validate base URL first
    try {
      new URL(targetBase);
      setUrlError(null);
    } catch {
      setUrlError('รูปแบบ URL ของเว็บแอป (APP_URL) ไม่ถูกต้อง กรุณาตั้งค่าในหน้า Apps Script & ชีต');
      setQrImages({});
      return;
    }

    // Generate QR images for all checkpoints
    const images: Record<string, string> = {};
    const promises = list.map(async (cp) => {
      try {
        const u = new URL(targetBase);
        u.searchParams.set('cp', cp.checkpoint_id);
        const targetUrl = u.toString();

        const dataUrl = await QRCode.toDataURL(targetUrl, {
          width: 220,
          margin: 1,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
        });
        images[cp.checkpoint_id] = dataUrl;
      } catch (err) {
        console.error('Error generating QR code for', cp.checkpoint_id, err);
      }
    });

    Promise.all(promises).then(() => {
      if (!cancelled) {
        setQrImages(images);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [targetBase]);

  const displayedList = checkpoints.filter((c) => (onlyActive ? c.active !== 'NO' : true));

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 bg-[#F5F7FA] text-[#1B2430]">
      {/* Controls (Hidden on print) */}
      <div className="noprint mb-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1B2430] flex items-center gap-2">
              <QrCode className="w-6 h-6 text-[#2F6FD0]" />
              พิมพ์ QR Code จุดตรวจ (QR Print)
            </h1>
            <p className="text-xs text-[#6B7887] mt-0.5">
              พิมพ์ป้าย QR Code ขนาดมาตรฐานสำหรับนำไปติด ณ จุดตรวจทั่วโรงงาน
            </p>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-medium text-[#1B2430] cursor-pointer bg-white px-3 py-2 rounded-lg border border-[#DDE3EA] shadow-sm">
              <input
                type="checkbox"
                checked={onlyActive}
                onChange={(e) => setOnlyActive(e.target.checked)}
                className="w-4 h-4 text-[#2F6FD0] rounded focus:ring-0"
              />
              <span>เฉพาะจุดที่เปิดใช้งาน (Active only)</span>
            </label>

            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#2F6FD0] text-white font-semibold text-xs hover:bg-[#2558A5] shadow-sm"
            >
              <Printer className="w-4 h-4" />
              <span>พิมพ์ทั้งหมด ({displayedList.length} จุด)</span>
            </button>
          </div>
        </div>

        {/* Target URL Info & Warning Box */}
        <div className="bg-white border border-[#DDE3EA] rounded-xl p-3.5 shadow-sm text-xs space-y-1">
          <div className="text-[#6B7887]">
            <strong>QR ทุกดวงจะผูกกับ URL ปลายทาง:</strong>{' '}
            <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-black font-semibold">
              {targetBase}?cp=CPxx
            </code>
          </div>
          {urlError && (
            <div className="text-[#A5241B] font-semibold flex items-center gap-1.5 pt-1">
              <AlertTriangle className="w-4 h-4 text-[#E03A2F]" />
              {urlError}
            </div>
          )}
          {isAppsScriptUrl && !urlError && (
            <div className="text-[#A5241B] font-semibold flex items-center gap-1.5 pt-1">
              <AlertTriangle className="w-4 h-4 text-[#E03A2F]" />
              URL นี้ชี้ไปที่ Apps Script ซึ่งไม่ใช่หน้าเว็บที่ รปภ. ใช้บันทึก — สแกนแล้วจะไม่เจอหน้าสแกน
              กรุณาตั้ง APP_URL ให้เป็น URL ของเว็บแอปนี้ก่อนพิมพ์ไปติดหน้างาน
            </div>
          )}
          {!config.APP_URL && !urlError && (
            <div className="text-[#7A5300] flex items-center gap-1.5 pt-1">
              <AlertTriangle className="w-4 h-4 text-[#B8860B]" />
              ยังไม่ได้ตั้ง APP_URL ระบบใช้ URL ของหน้าที่เปิดอยู่แทนชั่วคราว
              ควรตั้งค่าให้ชัดเจนในหน้า "Apps Script &amp; ชีต" ก่อนพิมพ์
            </div>
          )}
        </div>
      </div>

      {/* Printable Grid of QR Cards (3-column layout on standard A4 paper) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-3 print:gap-3">
        {displayedList.map((cp) => {
          const imgUrl = qrImages[cp.checkpoint_id];
          const hasCoords = cp.lat !== null && cp.lng !== null;

          return (
            <div
              key={cp.checkpoint_id}
              className="bg-white border border-[#DDE3EA] rounded-xl p-4 text-center shadow-sm print:border print:border-dashed print:border-gray-500 print:rounded-none print:shadow-none print:p-3 print:break-inside-avoid"
            >
              {/* Checkpoint ID Header */}
              <div className="text-xl font-extrabold font-mono text-[#2F6FD0] tracking-wider print:text-black">
                {cp.checkpoint_id}
              </div>
              <div className="text-sm font-bold text-[#1B2430] mt-0.5 leading-snug min-h-[36px] flex items-center justify-center">
                {cp.name}
              </div>
              <div className="text-[11px] text-[#6B7887] font-medium">โซน: {cp.zone}</div>

              {/* QR Code Canvas/Image */}
              <div className="my-3 flex justify-center items-center">
                {imgUrl ? (
                  <img
                    src={imgUrl}
                    alt={`QR Code ${cp.checkpoint_id}`}
                    className="w-40 h-40 object-contain border border-gray-100 p-1 rounded"
                  />
                ) : (
                  <div className="w-40 h-40 bg-gray-100 animate-pulse flex items-center justify-center text-xs text-gray-400">
                    กำลังสร้าง QR...
                  </div>
                )}
              </div>

              {/* Footer text */}
              <div className="text-[10px] text-[#6B7887] leading-tight">
                <div className="font-semibold text-black">{config.SITE_NAME}</div>
                <div>สแกนด้วยกล้องมือถือเพื่อบันทึกการเดินตรวจ</div>
              </div>

              {!hasCoords && (
                <div className="noprint mt-2 text-[10px] font-bold text-[#A5241B] bg-[#E03A2F]/10 py-1 rounded">
                  คำเตือน: ยังไม่ได้ตั้งพิกัดจุดนี้
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
