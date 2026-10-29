import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, CameraOff, RefreshCw, Upload, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { patrolEngine } from '../services/guardPatrolEngine';

interface QRCameraScannerProps {
  onScanSuccess: (cpId: string) => void;
  onCancel?: () => void;
  /**
   * เปิดให้สแกนจากไฟล์รูปได้หรือไม่ (ค่าเริ่มต้น: ไม่เปิด)
   * โหมด รปภ. ต้องปิดเสมอ ไม่งั้นถ่ายรูป QR ทุกจุดเก็บไว้แล้วกดบันทึกจากที่ไหนก็ได้
   */
  allowFileUpload?: boolean;
}

export const QRCameraScanner: React.FC<QRCameraScannerProps> = ({
  onScanSuccess,
  onCancel,
  allowFileUpload = false,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [detectedCp, setDetectedCp] = useState<string | null>(null);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scannerContainerId = 'qr-camera-scanner-viewfinder';

  // Helper to extract checkpoint ID from scanned string
  const extractCheckpointId = (text: string): string | null => {
    if (!text) return null;
    const trimmed = text.trim();

    // Pattern 1: URL parameter ?cp=CPxx or &cp=CPxx
    const urlMatch = trimmed.match(/[?&]cp=([a-zA-Z0-9_-]+)/i);
    let id = urlMatch ? urlMatch[1] : null;

    if (!id) {
      // Pattern 2: Direct CP code like CP01, CP1, CP20
      const directMatch = trimmed.match(/\bCP(\d{1,2})\b/i);
      if (directMatch && directMatch[1]) {
        id = 'CP' + directMatch[1].padStart(2, '0');
      }
    }

    if (id) {
      const cpMatch = id.match(/^CP(\d{1,2})$/i);
      if (cpMatch) {
        return 'CP' + cpMatch[1].padStart(2, '0');
      }
      return id.toUpperCase();
    }

    return null;
  };

  const handleDecodedText = (decodedText: string) => {
    const cpId = extractCheckpointId(decodedText);
    const allCps = patrolEngine.getCheckpoints();
    const validCp = allCps.find((c) => c.checkpoint_id.toUpperCase() === (cpId || '').toUpperCase());

    if (validCp) {
      setDetectedCp(validCp.checkpoint_id);
      setScanFeedback(`พบจุดตรวจ ${validCp.checkpoint_id} - ${validCp.name}`);
      try {
        if (navigator.vibrate) navigator.vibrate(120);
      } catch {}

      // Stop scanner before invoking success callback
      stopScanner().then(() => {
        setTimeout(() => {
          onScanSuccess(validCp.checkpoint_id);
        }, 500);
      });
    } else {
      setScanFeedback(`QR Code ไม่ตรงกับจุดตรวจในระบบ ("${decodedText.slice(0, 30)}")`);
      setTimeout(() => setScanFeedback(null), 3000);
    }
  };

  const startScanner = async (cameraId?: string) => {
    setCameraError(null);
    setScanFeedback(null);

    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerContainerId);
      }

      // Check available cameras if not loaded yet
      if (cameras.length === 0) {
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameras(devices);
            if (!cameraId) {
              // Prefer back/environment camera
              const backCam = devices.find((d) => /back|rear|environment/i.test(d.label));
              cameraId = backCam ? backCam.id : devices[0].id;
              setActiveCameraId(cameraId);
            }
          }
        } catch {
          // Ignore camera enumeration failure, fall back to facingMode
        }
      }

      const cameraConfig = cameraId
        ? { deviceId: { exact: cameraId } }
        : { facingMode: 'environment' };

      await scannerRef.current.start(
        cameraConfig,
        {
          fps: 12,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.floor(minEdge * 0.72);
            return { width: size, height: size };
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          handleDecodedText(decodedText);
        },
        () => {
          // Ignore frame-by-frame non-matches
        }
      );

      setIsScanning(true);
    } catch (err: any) {
      setIsScanning(false);
      const errMsg = String(err?.message || err || '');
      if (/NotAllowedError|Permission/i.test(errMsg)) {
        setCameraError('เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตการเข้าถึงกล้องในการตั้งค่าเบราว์เซอร์');
      } else if (/NotFoundError|device/i.test(errMsg)) {
        setCameraError('ไม่พบอุปกรณ์กล้องบนอุปกรณ์นี้ หรือมีแอปอื่นกำลังใช้งานกล้องอยู่');
      } else {
        setCameraError(`ไม่สามารถเปิดกล้องได้ (${errMsg || 'เกิดข้อผิดพลาด'})`);
      }
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      setIsScanning(false);
    }
  };

  const switchCamera = async () => {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((c) => c.id === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCam = cameras[nextIndex];
    setActiveCameraId(nextCam.id);
    await stopScanner();
    await startScanner(nextCam.id);
  };

  // Handle image upload fallback
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setScanFeedback('กำลังสแกนภาพ QR Code...');
      const scanner = scannerRef.current || new Html5Qrcode(scannerContainerId);
      const result = await scanner.scanFile(file, true);
      handleDecodedText(result);
    } catch (err) {
      setScanFeedback('ไม่พบ QR Code ในรูปภาพที่เลือก กรุณาลองใหม่อีกครั้ง');
      setTimeout(() => setScanFeedback(null), 3000);
    }
  };

  // Auto-start camera when mounted
  useEffect(() => {
    startScanner();
    return () => {
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().then(() => scannerRef.current?.clear()).catch(() => {});
          } else {
            scannerRef.current.clear();
          }
        } catch {}
      }
    };
  }, []);

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shrink-0">
            <Camera className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 leading-tight">กล้องสแกนจุดตรวจ รปภ.</h3>
            <p className="text-xs text-slate-500">ส่องกล้องไปที่ป้าย QR Code ณ จุดตรวจ</p>
          </div>
        </div>

        {cameras.length > 1 && isScanning && (
          <button
            onClick={switchCamera}
            title="สลับกล้องหน้า/หลัง"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Viewfinder Area */}
      <div className="relative bg-slate-950 aspect-square flex items-center justify-center overflow-hidden">
        {/* HTML5 QR reader DOM target */}
        <div
          id={scannerContainerId}
          className="w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
        />

        {/* Viewfinder Target Overlay Guide */}
        {isScanning && !detectedCp && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-8">
            <div className="relative w-64 h-64 border-2 border-blue-400/80 rounded-2xl shadow-2xl">
              {/* Corner accents */}
              <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg" />
              <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg" />
              <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg" />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg" />

              {/* Scanning laser beam animation */}
              <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-blue-400 to-transparent animate-pulse absolute top-1/2 transform -translate-y-1/2 shadow-[0_0_8px_rgba(96,165,250,0.8)]" />
            </div>
          </div>
        )}

        {/* Detected State Overlay */}
        {detectedCp && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-xs flex flex-col items-center justify-center text-white p-6 text-center animate-in fade-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3 border border-emerald-500/30 animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <div className="text-lg font-bold">สแกนสำเร็จ!</div>
            <div className="text-sm text-emerald-300 font-semibold mt-1">จุดตรวจ {detectedCp}</div>
            <div className="text-xs text-slate-300 mt-2">กำลังเปิดหน้าบันทึกผลการเดินตรวจ...</div>
          </div>
        )}

        {/* Camera Error State */}
        {cameraError && (
          <div className="absolute inset-0 bg-slate-900/90 text-white p-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mb-3 border border-rose-500/30">
              <CameraOff className="w-6 h-6" />
            </div>
            <div className="text-sm font-bold text-rose-300 mb-1">ไม่สามารถเปิดกล้องได้</div>
            <p className="text-xs text-slate-300 mb-4 max-w-xs leading-relaxed">{cameraError}</p>
            <div className="flex flex-wrap gap-2 justify-center">
              <button
                onClick={() => startScanner(activeCameraId || undefined)}
                className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>ลองเปิดกล้องใหม่</span>
              </button>
              {allowFileUpload && (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>เลือกรูป QR จากเครื่อง</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Dynamic Feedback Banner */}
      {scanFeedback && (
        <div className="bg-blue-50 border-t border-b border-blue-100 px-4 py-2 text-xs text-blue-700 font-medium text-center flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>{scanFeedback}</span>
        </div>
      )}

      {/* Control Actions & Manual Selection */}
      <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          {allowFileUpload && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                type="button"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors shadow-xs"
              >
                <Upload className="w-3.5 h-3.5 text-slate-500" />
                <span>อัปโหลดรูป QR Code</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileUpload}
              />
            </>
          )}

          {onCancel && (
            <button
              onClick={onCancel}
              type="button"
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              ปิด
            </button>
          )}
        </div>

        {/* Checkpoint list cheat-sheet helper for guard reference */}
        <div className="bg-white rounded-xl p-3 border border-slate-200/80 text-[11px] text-slate-500 space-y-1">
          <div className="font-semibold text-slate-700 flex items-center gap-1">
            <span>คำแนะนำการใช้งาน:</span>
          </div>
          <div>• ถือมือถือให้นิ่งและให้ QR Code อยู่ในกรอบสี่เหลี่ยมสีน้ำเงิน</div>
          <div>• ระบบจะตรวจจับจุดตรวจ CP01 - CP20 โดยอัตโนมัติ</div>
          <div>• หลังจากสแกนผ่าน ระบบจะพาเข้าสู่หน้าตรวจเช็คความปลอดภัยทันที</div>
        </div>
      </div>
    </div>
  );
};
