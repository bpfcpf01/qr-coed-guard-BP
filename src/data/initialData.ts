import { Checkpoint, Round, Guard, SystemConfig, LogEntry } from '../types';
import { localDateStr } from '../utils/datetime';

export const INITIAL_CHECKPOINTS: Checkpoint[] = [
  { checkpoint_id: 'CP01', name: 'จุดที่ 1 โรงอาหาร', zone: 'หน้าโรงงาน', lat: 14.788950, lng: 100.800350, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP02', name: 'จุดที่ 2 สำนักงานบัญชี', zone: 'โรงงาน', lat: 14.78920201, lng: 100.8008092, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP03', name: 'จุดที่ 3 ห้องเก็บเอกสารบัญชี', zone: 'โรงงาน', lat: 14.789310, lng: 100.800920, radius_m: 80, active: 'YES' },
  { checkpoint_id: 'CP04', name: 'จุดที่ 4 มุมโกดัง K2', zone: 'โรงงาน', lat: 14.789540, lng: 100.801200, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP05', name: 'จุดที่ 5 ห้องน้ำตึก 2', zone: 'โรงงาน', lat: 14.789420, lng: 100.801500, radius_m: 80, active: 'YES' },
  { checkpoint_id: 'CP06', name: 'จุดที่ 6 ปั๊มดับเพลิง', zone: 'โรงงาน', lat: 14.789780, lng: 100.801650, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP07', name: 'จุดที่ 7 มุมโกดัง K3', zone: 'โรงงาน', lat: 14.790120, lng: 100.801820, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP08', name: 'จุดที่ 8 มุมโกดัง B2', zone: 'โรงงาน', lat: 14.790350, lng: 100.801450, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP09', name: 'จุดที่ 9 มุมรั้วท้ายลาน', zone: 'โรงงาน', lat: 14.790750, lng: 100.801980, radius_m: 50, active: 'YES' },
  { checkpoint_id: 'CP10', name: 'จุดที่ 10 มูมโกดัง B3', zone: 'โรงงาน', lat: 14.790480, lng: 100.801120, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP11', name: 'จุดที่ 11 มุมรั้วประตูไร่ข้าวโพด', zone: 'โรงงาน', lat: 14.790920, lng: 100.800650, radius_m: 50, active: 'YES' },
  { checkpoint_id: 'CP12', name: 'จุดที่ 12 ไซโล 3', zone: 'โรงงาน', lat: 14.790210, lng: 100.800420, radius_m: 60, active: 'YES' },
  { checkpoint_id: 'CP13', name: 'จุดที่ 13 ไซโล 1', zone: 'โรงงาน', lat: 14.789950, lng: 100.800310, radius_m: 60, active: 'YES' },
  { checkpoint_id: 'CP14', name: 'จุดที่ 14 มุมโกดัง K1', zone: 'โรงงาน', lat: 14.789650, lng: 100.800180, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP15', name: 'จุดที่ 15 โรงพักขยะ', zone: 'โรงงาน', lat: 14.789380, lng: 100.799820, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP16', name: 'จุดที่ 16 บอยเลอร์', zone: 'โรงงาน', lat: 14.789120, lng: 100.799650, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP17', name: 'จุดที่ 17 มุมรั้ววิศวกรรมติดรับเหมา', zone: 'โรงงาน', lat: 14.788750, lng: 100.799420, radius_m: 50, active: 'YES' },
  { checkpoint_id: 'CP18', name: 'จุดที่ 18 shop รับเหมา', zone: 'โรงงาน', lat: 14.788520, lng: 100.799780, radius_m: 40, active: 'YES' },
  { checkpoint_id: 'CP19', name: 'จุดที่ 19 มุมรั้วสนามบอล', zone: 'โรงงาน', lat: 14.788210, lng: 100.800120, radius_m: 50, active: 'YES' },
  { checkpoint_id: 'CP20', name: 'จุดที่ 20 ห้องน้ำลานจอดรถ', zone: 'หน้าโรงงาน', lat: 14.788480, lng: 100.800680, radius_m: 40, active: 'YES' },
];

export const INITIAL_ROUNDS: Round[] = [
  { round_id: 'R1', label: 'รอบ 1 (00:00)', start: '00:00', end: '04:00' },
  { round_id: 'R2', label: 'รอบ 2 (04:00)', start: '04:00', end: '08:00' },
  { round_id: 'R3', label: 'รอบ 3 (08:00)', start: '08:00', end: '12:00' },
  { round_id: 'R4', label: 'รอบ 4 (12:00)', start: '12:00', end: '16:00' },
  { round_id: 'R5', label: 'รอบ 5 (16:00)', start: '16:00', end: '20:00' },
  { round_id: 'R6', label: 'รอบ 6 (20:00)', start: '20:00', end: '00:00' },
];

/**
 * รปภ. G01–G12 เป็นค่าตั้งต้นแบบไม่ระบุตัวบุคคล เพื่อไม่ให้ชื่อจริงติดไปกับซอร์สโค้ด
 * (ปฏิบัติตามกฎหมาย PDPA) ผู้ดูแลกรอกชื่อจริงเองผ่านหน้า "จัดการรายชื่อ รปภ."
 * ในโหมดผู้ดูแล ซึ่งจะเก็บไว้ใน localStorage ของเครื่องเท่านั้น
 */
export const INITIAL_GUARDS: Guard[] = [
  { guard_id: 'G01', name: 'รปภ. ผลัด A (G01)', active: 'YES' },
  { guard_id: 'G02', name: 'รปภ. ผลัด A (G02)', active: 'YES' },
  { guard_id: 'G03', name: 'รปภ. ผลัด A (G03)', active: 'YES' },
  { guard_id: 'G04', name: 'รปภ. ผลัด B (G04)', active: 'YES' },
  { guard_id: 'G05', name: 'รปภ. ผลัด B (G05)', active: 'YES' },
  { guard_id: 'G06', name: 'รปภ. ผลัด B (G06)', active: 'YES' },
  { guard_id: 'G07', name: 'รปภ. ผลัด C (G07)', active: 'YES' },
  { guard_id: 'G08', name: 'รปภ. ผลัด C (G08)', active: 'YES' },
  { guard_id: 'G09', name: 'รปภ. ผลัด C (G09)', active: 'YES' },
  { guard_id: 'G10', name: 'รปภ. ตรวจเวรพิเศษ (G10)', active: 'YES' },
  { guard_id: 'G11', name: 'รปภ. หน.ชุดเวร 1 (G11)', active: 'YES' },
  { guard_id: 'G12', name: 'รปภ. หน.ชุดเวร 2 (G12)', active: 'YES' },
];

export const INITIAL_CONFIG: SystemConfig = {
  SITE_NAME: 'CPF โรงงานอาหารสัตว์ท่านเกษม สระบุรี',
  DOC_CODE: 'FM-SEC-01 Rev.00',
  /** ห้าม hard-code กุญแจผู้ดูแลในซอร์ส — ผู้ดูแลตั้งเองที่หน้า setup ครั้งแรก */
  DASH_KEY: '',
  // ปลายทางของ QR — ว่างไว้ ระบบจะใช้ URL ของหน้าที่กำลังเปิดอยู่แทน
  APP_URL: '',
  // ปลายทาง API ของ Apps Script — ผู้ดูแลกรอกเองหลัง deploy (ต้องลงท้าย /exec)
  WEBAPP_URL: '',
  // โทเคนส่งบันทึกขึ้นชีต — Worker แจกให้เองผ่าน /__config
  WEBAPP_TOKEN: '',
  DEFAULT_RADIUS_M: 40,
  MAX_ACCURACY_M: 60,
  BLOCK_OUT_OF_RANGE: true,
  ALLOW_OVERRIDE: true,
  DUPLICATE_WINDOW_MIN: 20,
  SPEED_FLAG_KMH: 25,
  PHOTO_FOLDER_ID: '',
};

// Seed realistic sample patrol records for today & previous days to test reports
export function generateSeedLogs(): LogEntry[] {
  const logs: LogEntry[] = [];
  const now = new Date();
  const todayStr = localDateStr(now);
  
  // Generate logs for the past 6 days + today
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const d = new Date(now.getTime() - dayOffset * 86400000);
    const dateStr = localDateStr(d);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    
    // For earlier days, complete most checkpoints; for today, complete according to current hour
    const maxRoundIdx = dayOffset === 0 ? Math.min(5, Math.floor(now.getHours() / 4)) : 5;
    
    for (let rIdx = 0; rIdx <= maxRoundIdx; rIdx++) {
      const round = INITIAL_ROUNDS[rIdx];
      const guard = INITIAL_GUARDS[rIdx % INITIAL_GUARDS.length].name;
      
      // Select subset of checkpoints (e.g. 17-20 checkpoints inspected)
      const count = dayOffset === 0 && rIdx === maxRoundIdx ? 12 : 18;
      
      for (let cpIdx = 0; cpIdx < count; cpIdx++) {
        const cp = INITIAL_CHECKPOINTS[cpIdx];
        const hour = parseInt(round.start.slice(0, 2)) + Math.floor(cpIdx / 5);
        const minute = (cpIdx * 7) % 60;
        const timeStr = `${('0' + hour).slice(-2)}:${('0' + minute).slice(-2)}:15`;
        
        // Occasionally simulate a flag or anomaly
        const isFlagged = (dayOffset === 2 && cpIdx === 4) || (dayOffset === 0 && cpIdx === 6);
        const isAbnormal = (dayOffset === 1 && cpIdx === 2);
        
        const dist = isFlagged ? 74 : Math.floor(Math.random() * 22) + 6;
        const geo = isFlagged ? 'OUT_OF_RANGE' : 'IN_RANGE';
        const flags = isFlagged ? 'OUT_OF_RANGE,OVERRIDE' : '';
        const status = isAbnormal ? 'พบสิ่งผิดปกติ' : 'ปกติ';
        const note = isAbnormal 
          ? 'พบไฟส่องสว่างดับ 1 ดวง บริเวณทางเชื่อม' 
          : (isFlagged ? 'ขอบันทึกพิเศษ: สัญญาณอับใต้โครงหลังคาโกดัง' : 'เรียบร้อยปกติ');
        
        logs.push({
          id: `LOG_${dateStr}_${round.round_id}_${cp.checkpoint_id}`,
          timestamp: new Date(year, month - 1, day, hour, minute, 15).toISOString(),
          date: dateStr,
          time: timeStr,
          round: round.round_id,
          checkpoint_id: cp.checkpoint_id,
          checkpoint_name: cp.name,
          zone: cp.zone,
          guard: guard,
          status: status,
          note: note,
          lat: cp.lat !== null ? cp.lat + 0.00005 : null,
          lng: cp.lng !== null ? cp.lng + 0.00005 : null,
          accuracy_m: 14,
          distance_m: dist,
          geo_result: geo,
          flags: flags,
          device_id: `DEV_${guard.slice(-3)}`,
          maps_link: cp.lat !== null && cp.lng !== null ? `https://www.google.com/maps?q=${cp.lat},${cp.lng}` : '',
        });
      }
    }
  }
  
  return logs;
}
