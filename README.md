# 🛡️ ระบบเดินตรวจ รปภ. (Guard Patrol System)
**CPF โรงงานอาหารสัตว์ธารเกษม สระบุรี**  
**รหัสเอกสารควบคุม:** FM-SEC-01 Rev.00

ระบบเว็บแอปพลิเคชันสำหรับบันทึกและตรวจสอบการเดินตรวจการณ์ของเจ้าหน้าที่ รปภ. ประจำจุดตรวจทั่วโรงงาน โดยใช้ QR Code + GPS (Geolocation) และ Dashboard สำหรับติดตามผลการตรวจและความผิดปกติ

> **หลักคิดสำคัญ:** ระบบ Guard Patrol ต้องพิสูจน์ความถูกต้องของการตรวจและหลักฐานย้อนหลัง ไม่ใช่เพียงแสดงว่า “ตรวจครบ”

---

## 1. วัตถุประสงค์ของระบบ

ระบบนี้มีเป้าหมายเพื่อเปลี่ยนการเดินตรวจ รปภ. จากการบันทึกแบบ Manual ให้เป็น Digital Guard Patrol ที่สามารถตรวจสอบย้อนหลังได้ว่า

- ใครเป็นผู้ตรวจ
- ตรวจจุดไหน
- ตรวจเมื่อใด
- อยู่ในตำแหน่งที่ถูกต้องหรือไม่
- ตรวจตามรอบหรือไม่
- เดินตามเส้นทางหรือไม่
- พบความผิดปกติอะไร
- มีหลักฐานภาพ/ข้อมูลประกอบหรือไม่
- เหตุผิดปกติถูกแก้ไขและปิดงานแล้วหรือยัง

จำนวนจุดตรวจและรอบตรวจในระบบต้องถือเป็น **ข้อกำหนดขององค์กร/SOP/risk assessment** ไม่ควรอ้างว่าเป็นข้อบังคับโดยตรงของ ISO 45001 เว้นแต่มีเอกสารอ้างอิงที่กำหนดไว้จริง

---

## 2. โครงสร้างการตรวจการณ์โรงงาน

> ⚠️ **หมายเหตุด้านข้อมูล:** รายการจุดตรวจ พิกัด และข้อมูลเจ้าหน้าที่ที่อยู่ใน Repository นี้เป็น **ข้อมูลจริง/ข้อมูลภายในของโครงการ** ไม่ใช่ Dummy Data หรือข้อมูลตัวอย่างสาธารณะ ต้องพิจารณาสิทธิ์การเข้าถึงและความเหมาะสมของการเปิด Repository เป็น Public ก่อนนำไปใช้งานจริง

โครงสร้างปัจจุบันของระบบ:

- **จุดตรวจ 20 จุด (CP01–CP20)** ครอบคลุมพื้นที่โซนหน้าโรงงาน, อาคารสำนักงาน, คลังสินค้า, โรงผลิต, ไซโล, บอยเลอร์ และแนวรั้วรอบโรงงาน
- **รอบการเดินตรวจ 6 รอบต่อวัน (R1–R6 ทุก 4 ชั่วโมง)**
  - R1: 00:00 – 04:00 น.
  - R2: 04:00 – 08:00 น.
  - R3: 08:00 – 12:00 น.
  - R4: 12:00 – 16:00 น.
  - R5: 16:00 – 20:00 น.
  - R6: 20:00 – 00:00 น.
- เป้าหมายตาม Configuration ปัจจุบัน: **20 จุด × 6 รอบ = 120 รายการตรวจ/วัน**

> ตัวเลขข้างต้นเป็น Configuration ของหน่วยงานและต้องปรับตาม SOP จริงของโรงงาน

---

## 3. Development Workflow — สถานะปัจจุบัน

### ⚠️ Workflow ที่ใช้งานจริงในปัจจุบัน

ขณะนี้ Google AI Studio เป็น **ต้นทางหลักสำหรับการสร้าง/แก้ต้นฉบับของงานจาก AI Studio** และเมนู Export ของ AI Studio รองรับการ **Push to GitHub** เป็นหลัก ยังไม่ควรเขียน workflow ว่า GitHub สามารถถูกแก้แล้ว Pull/Import กลับเข้า AI Studio ได้โดยอัตโนมัติ

ดังนั้น Source of Truth ต้องอธิบายตามช่วงของโครงการดังนี้:

```text
                    👤 Project Owner
                         │
                         ▼
                  Requirement / SOP
                         │
                         ▼
               Google AI Studio
            Current Authoring Source
                         │
                         │ Push to GitHub
                         ▼
                       GitHub
                Version / Backup / Review
                         │
                         ▼
                   Claude Code
              Lead Developer (Phase ต่อไป)
                         │
                         ▼
                  GPT / Codex
              Independent Review
                         │
                         ▼
                    Fix / Test
                         │
                         ▼
                     GitHub
                         │
                         ▼
                    Production
```

### Google AI Studio — ปัจจุบัน

ใช้สำหรับ:

- Prototype
- UI/UX
- Rapid Development
- ทดลอง Feature ใหม่
- ทดลอง Gemini / Google Services
- สร้างและแก้ต้นฉบับของแอปใน AI Studio
- Export / Push งานขึ้น GitHub

> **ข้อควรระวัง:** เมื่อ AI Studio ยังเป็นต้นทางที่แก้ไขงานหลัก การแก้ไฟล์บน GitHub โดยตรงแล้วกลับมา Push จาก AI Studio อาจทำให้การเปลี่ยนแปลงบน GitHub ถูกเขียนทับได้ ดังนั้นต้องกำหนดให้ชัดว่าในแต่ละช่วงใครเป็นผู้แก้ Source หลัก

### GitHub — ปัจจุบัน

ใช้เป็น:

- Repository สำหรับเก็บ Source Code
- Version / Commit history
- Backup ของงานจาก AI Studio
- จุดกลางสำหรับตรวจสอบโค้ด
- จุดเตรียมเข้าสู่ workflow แบบ Git-based development
- Deployment / GitHub Pages ตามที่โครงการกำหนด

> **สถานะปัจจุบัน:** GitHub ยังไม่ควรถูกเรียกว่า “Source of Truth เดียว” หาก AI Studio ยังเป็นต้นทางที่สามารถ Push ทับโค้ดได้โดยตรง

### Claude Code — เป้าหมายสำหรับ Development แบบ Git-based

เมื่อ workflow ย้ายมาแก้ Source Code จาก Repository เป็นหลัก ให้ Claude Code ทำหน้าที่เป็น **Lead Developer** สำหรับ:

- อ่าน Repository
- Architecture Review
- Feature Development
- Refactoring
- Bug Fix
- Testing
- Code Cleanup
- Git Commit / Pull Request

ทุกครั้งที่แก้ระบบควรตรวจผลกระทบต่อ Components, Services, Data Model และ Integration ที่เกี่ยวข้อง ไม่ควรแก้เฉพาะไฟล์เดียวโดยไม่ดูภาพรวม

### GPT / Codex — Independent Reviewer

ทำหน้าที่ตรวจงานแยกจากผู้พัฒนาหลักในด้าน:

- Security
- Business Logic
- Anti-cheat
- Data Integrity
- UX
- API
- Authentication / Authorization
- Regression
- Code Quality

> หลักการ: AI ที่สร้างระบบไม่ควรเป็น AI ตัวเดียวที่ตรวจระบบตัวเอง

---

## 4. User Modes และสิทธิ์การใช้งาน

ระบบควรแบ่งบทบาทอย่างน้อย:

```text
ADMIN
 │
 ├── SUPERVISOR
 ├── GUARD_LEADER
 ├── GUARD
 └── VIEWER
```

### 🛡️ โหมดเจ้าหน้าที่ รปภ. (`guard`) — แผนระบบจริง

เมื่อพัฒนา Production ควรรองรับ:

- ยืนยันตัวตนเจ้าหน้าที่
- เข้าสู่หน้าปฏิบัติงาน
- ตรวจสอบ GPS / Accuracy / เวลา
- ทำ Checklist
- บันทึกสถานะจุดตรวจ
- แจ้งเหตุผิดปกติ
- บันทึก Evidence ตามสิทธิ์
- เห็นเฉพาะข้อมูลที่จำเป็นต่อการปฏิบัติงาน

**สำคัญ:** ชื่อ/ตัวตนของ Guard ไม่ควรเลือกจาก Dropdown อย่างอิสระสำหรับ Production ควรยืนยันตัวตนด้วย Login, PIN, QR Badge, SSO หรือกลไกที่องค์กรกำหนด และให้ Backend เป็นผู้ยืนยันตัวตน

### 🔑 โหมดหัวหน้าชุด / ผู้ดูแลระบบ (`admin`) — แผนระบบจริง

ใช้สำหรับ:

1. Dashboard / Home
2. Scan / ทดสอบระบบ
3. รายงานย้อนหลัง
4. สำรวจและจัดการพิกัด
5. สร้าง/พิมพ์ QR
6. จัดการ Configuration / Integration
7. ตรวจสอบ Audit Log
8. อนุมัติ Override ตามสิทธิ์

> การซ่อนเมนูใน Frontend ไม่ถือเป็น Security จริง สิทธิ์ต้องถูกบังคับใช้ที่ Backend/Server-side ด้วย

---

## 5. Guard Patrol Core Flow — Target Architecture

```text
Login / Identify Guard
        ↓
Start Patrol Session
        ↓
Scan QR
        ↓
Check GPS
        ↓
Check GPS Accuracy
        ↓
Validate Time
        ↓
Validate Route / Sequence
        ↓
Checklist
        ↓
Photo / Evidence
        ↓
Submit
        ↓
Next Checkpoint
        ↓
Patrol Complete
```

ระบบควรมีแนวคิด **Patrol Session** เพื่อรวมการตรวจแต่ละจุดให้อยู่ภายใต้รอบเดียวกัน เช่น `DATE + ROUND + GUARD + SESSION_ID`

> Flow ด้านบนเป็น **Target Architecture / Roadmap** ไม่ใช่การยืนยันว่า Feature ทุกส่วนมีอยู่แล้วในระบบปัจจุบัน

---

## 6. Checkpoint Validation

### ✅ สิ่งที่มีในระบบปัจจุบัน

ระบบปัจจุบันมีแนวคิด/การตรวจสอบเกี่ยวกับ:

- Checkpoint ID
- QR Checkpoint
- GPS
- GPS Accuracy
- Timestamp
- Duplicate Protection
- Speed / Abnormality Detection บางส่วน
- Override พร้อมเหตุผลในระดับ Frontend
- **Server-side Validation ของพิกัด** — Apps Script คำนวณ `distance_m`, `geo_result`,
  `round`, `date`, `time`, `checkpoint_name`, `zone` ใหม่ทุกครั้งที่รับบันทึก
  ไม่ใช้ค่าที่เครื่องส่งมา (ดู `handlePush_` ใน `src/apps-script/Code.gs`
  และเทสต์ที่ `test/appsScript.test.cjs`)
- **PUSH_TOKEN** — ปิดไม่ให้คนที่รู้แค่ URL `/exec` ยิงข้อมูลเข้ามาได้
- **ธงเวลาผิดปกติ** — `TIME_SKEW` เมื่อเวลาจากเครื่องเป็นอนาคตหรือเก่าเกิน 7 วัน

### 🚧 สิ่งที่ต้องพัฒนาต่อ

- Guard Identity ที่ยืนยันจาก Authentication จริง
  (ยังเลือกชื่อจาก dropdown ได้อิสระ — เป็นช่องที่เหลืออยู่ใหญ่ที่สุด)
- Mock Location / GPS Spoofing (พิกัดดิบยังมาจากเครื่อง)
- Patrol Session
- QR Token / Secret
- Route / Sequence Validation
- Replay Protection
- Audit Log ที่เชื่อถือได้จาก Backend

> `มี Log` ไม่เท่ากับ `ตรวจสำเร็จ`

---

## 7. Patrol Status

ผลการตรวจควรแยกให้ชัดเจน:

| Status | ความหมาย |
|---|---|
| ✅ DONE | ตรวจสำเร็จ |
| 🟡 LATE | ตรวจล่าช้า |
| 🔴 MISSED | ไม่ได้ตรวจ |
| ⚠️ INVALID | ข้อมูลไม่ผ่าน Validation |
| 🔄 DUPLICATE | ตรวจซ้ำ |
| 🟠 OUT_OF_ORDER | ตรวจผิดลำดับ |
| 🔵 OVERRIDE | ใช้ Override |
| 🚨 ABNORMAL | พบความผิดปกติ |

Dashboard ต้องคำนวณ KPI จากสถานะเหล่านี้ ไม่ควรนับจำนวน Log เพียงอย่างเดียว

---

## 8. Anti-Cheat / Data Integrity

ระบบต้องออกแบบให้รับมือกับกรณี:

- QR ถูกถ่ายรูปหรือแชร์
- เลือกชื่อ Guard แทนคนอื่น
- GPS Spoofing / Mock Location
- เปลี่ยนเวลาเครื่อง
- ส่งข้อมูลย้อนหลัง / Replay
- Duplicate Scan
- Scan ผิดรอบ
- Scan ข้ามจุด
- Scan ผิดลำดับ
- ใช้ Screenshot แทนการตรวจจริง

แนวคิดควรใช้หลายปัจจัยร่วมกัน:

```text
Identity
+
QR
+
GPS
+
Accuracy
+
Timestamp
+
Patrol Session
+
Route
+
Server Validation
+
Audit Log
```

### QR Security

QR ไม่ควรพึ่ง `?cp=CPxx` เพียงอย่างเดียวสำหรับการยืนยันตัวตนของจุดตรวจใน Production ควรมี token/secret ที่สุ่มและสามารถ revoke/rotate ได้ เพื่อช่วยป้องกันการนำ QR ไปทำซ้ำ

### Device Identity

`localStorage` หรือ `sessionStorage` ไม่ควรใช้เป็น Device Identity ที่เชื่อถือได้เพียงอย่างเดียว เพราะผู้ใช้สามารถล้างหรือเปลี่ยน Storage ได้

---

## 9. Evidence และ Incident Management — Roadmap

### 📷 Evidence

Production ควรเก็บ Evidence จริง โดยผูกกับ:

- รูปภาพจริง
- รายละเอียด
- GPS
- เวลา
- ผู้ตรวจ
- จุดตรวจ
- ความรุนแรง
- Patrol Session

ปัจจุบันระบบยังไม่ควรตีความว่า Photo / Evidence Storage แบบ Production ถูกใช้งานสมบูรณ์แล้ว

### 🚨 Incident Workflow — Target

```text
Detected
   ↓
Reported
   ↓
Assigned
   ↓
Investigating
   ↓
Corrected
   ↓
Verified
   ↓
Closed
```

### Severity

- Minor
- Medium
- Major
- Critical

Incident ควรมี Audit Trail และผู้รับผิดชอบในแต่ละสถานะ

---

## 10. Override Policy

Override ควรเป็นกระบวนการควบคุม ไม่ใช่ปุ่มข้าม Validation โดยอิสระ

เมื่อมี Override ควรเก็บอย่างน้อย:

- ผู้ร้องขอ
- เวลา
- จุดตรวจ
- รอบตรวจ
- เหตุผล
- หลักฐานประกอบ
- ผู้อนุมัติ
- ผลการอนุมัติ
- Audit Log

Production ควรให้สิทธิ์ Override เฉพาะ Role ที่องค์กรอนุญาต

---

## 11. Dashboard KPI

Dashboard ควรแสดงอย่างน้อย:

- Planned Patrols
- Completed
- Late
- Missed
- Invalid
- Duplicate
- Out of Order
- Abnormal
- Override
- Incident Open / Closed
- Patrol Completion Rate
- GPS Exception
- Suspicious / Anti-cheat Flags

> KPI ต้องมาจากข้อมูลที่ผ่าน Validation ไม่ใช่การนับจำนวนรายการในตารางอย่างเดียว

---

## 12. Data Architecture — Target

```text
PWA / Web App
      │
      ▼
 Authentication
      │
      ▼
 Backend / API
      │
 ┌────┼───────────────┐
 ▼    ▼               ▼
DB  Evidence       Audit Log
 │      │               │
 └──────┼───────────────┘
        ▼
    Dashboard
        │
        ▼
   Reports / KPI
```

ไม่ควรเก็บข้อมูลสำคัญหรือสิทธิ์การเข้าถึงไว้ใน Frontend เพียงอย่างเดียว

---

## 13. Security Principles

- ห้ามเก็บ Secret สำคัญไว้ใน Frontend
- ห้ามใช้ Admin Password แบบ Hard-coded ใน Production
- ห้ามถือ Frontend UI เป็น Authorization
- Server-side ต้องตรวจสิทธิ์ทุกคำขอที่สำคัญ
- ใช้ RBAC
- Validate ข้อมูลฝั่ง Server
- ป้องกัน Replay / Duplicate
- ทำ Audit Log
- จำกัดสิทธิ์ตาม Role
- แยกข้อมูล Production ออกจาก Public Repository ที่ไม่จำเป็น
- ตรวจสอบข้อมูลบุคคล พิกัด และข้อมูลความปลอดภัยก่อนเปิด Repository เป็น Public

---

## 14. Public Repository Policy

Repository นี้มีข้อมูลที่เกี่ยวข้องกับพื้นที่และการปฏิบัติงานของโรงงาน ดังนั้นก่อนใช้งานจริงควรตรวจสอบอย่างน้อย:

- พิกัด GPS ของจุดตรวจ
- ชื่อหรือข้อมูลระบุตัวบุคคล
- Admin Key / Secret / Token
- URL ของระบบภายใน
- ข้อมูลภาพหลักฐาน
- Configuration ที่ไม่ควรเปิดเผย

> **ห้ามถือว่า Public GitHub เป็นพื้นที่ปลอดภัยสำหรับข้อมูลความมั่นคง/ข้อมูลส่วนบุคคลของโรงงาน**

---

## 15. Google Apps Script Integration — Target

หากใช้ Google Apps Script เป็น Backend / Integration ต้องแยกให้ชัดระหว่าง Demo และ Production

### Demo / Prototype

- `doGet()` ตรวจสอบการเชื่อมต่อ
- `doPost()` รับข้อมูลเพื่อทดสอบ Flow

### Production

สถานะปัจจุบันของ `src/apps-script/Code.gs`:

| หัวข้อ | สถานะ |
| --- | --- |
| Authorization ของผู้ดูแล (`keyOk_` เทียบ DASH_KEY ในชีต) | ✅ มีแล้ว |
| Server-side validation ของพิกัด/เวลา/รอบ | ✅ มีแล้ว (`handlePush_`) |
| Request token (`PUSH_TOKEN`) | ✅ มีแล้ว (ต้องตั้งค่าเองจึงจะบังคับ) |
| Duplicate protection (กันซ้ำด้วย `id`) | ✅ มีแล้ว |
| ตรวจสอบ Input ก่อนเขียนลง Sheet | ✅ มีแล้ว |
| Authentication ของ รปภ. รายบุคคล | 🚧 ยังไม่มี |
| Replay protection แบบ nonce / signature | 🚧 ยังไม่มี |
| Audit log แยกต่างหาก | 🚧 ยังไม่มี |
| Rate limit การเดา DASH_KEY | 🚧 ยังไม่มี |

> URL `/exec` และ Secret ต่าง ๆ ไม่ควร Hard-code ไว้ใน Public Frontend
> ให้ตั้งเป็น environment variable ที่ Cloudflare (`WEBAPP_URL`, `PUSH_TOKEN`)
> แล้วเว็บแอปจะรับค่าผ่าน `/__config` ซึ่งอยู่หลังรหัสผ่านของ Worker อีกชั้น

---

## 16. Installation / Development

```bash
npm install
npm run dev
npm run lint            # tsc --noEmit
npm run test            # lint + เทสต์ Apps Script + Worker + Service Worker
npm run test:appsscript # เทสต์การตรวจพิกัดฝั่งเซิร์ฟเวอร์อย่างเดียว
npm run test:worker     # เทสต์หน้า /__health
npm run test:roster     # เทสต์กฎการเพิ่ม/ลบจุดตรวจและรายชื่อ
npm run test:sw         # เทสต์การทำงานออฟไลน์ (public/sw.js)
                        # (test:appsscript ครอบคลุมการแจ้งเตือน Discord ด้วย)
npm run icons           # สร้างไอคอนแอปใหม่ (แก้สี/รูปทรงใน scripts/make-icons.mjs)
npm run build
```

### ลำดับการติดตั้ง / อัปเดตระบบจริง

0. **`appsscript.json`** — วาง `src/apps-script/appsscript.json` ทับ (เปิดให้เห็นไฟล์นี้ได้ที่
   ⚙️ Project Settings > Show "appsscript.json") ตั้งเขตเวลาและสิทธิ์ที่จำเป็นให้ครบในทีเดียว
1. **เขตเวลาของชีต** — `File > Settings > Time zone` ต้องเป็น **(GMT+07:00) Bangkok**
   วันที่ เวลา และการหารอบทั้งหมดคำนวณจากค่านี้ ตั้งผิดแล้วรายงานจะเพี้ยนทั้งระบบ
   โดยไม่มีอะไรฟ้อง (หน้า `/__health` ตรวจให้)
2. **Google Sheet → Apps Script** — วาง `src/apps-script/Code.gs` ทับทั้งหมด
   แล้ว **Deploy > Manage deployments > แก้ไข > New version**
   (ถ้าไม่ออกเวอร์ชันใหม่ โค้ดเดิมจะยังทำงานอยู่ และการตรวจพิกัดฝั่งเซิร์ฟเวอร์จะไม่ทำงาน)
3. **แท็บ Config ในชีต** — ตั้ง `DASH_KEY` และ (ถ้าต้องการบังคับโทเคน) `PUSH_TOKEN`
4. **Cloudflare Worker** — ตั้ง environment variables
   `SITE_USER`, `SITE_PASS`, `WEBAPP_URL` (ลิงก์ `/exec`), `PUSH_TOKEN`
   ให้ `PUSH_TOKEN` ตรงกับที่ตั้งในชีต
5. `npm run build && npx wrangler deploy`

> ⚠️ `PUSH_TOKEN` ที่ตั้งในชีตแต่ไม่ได้ตั้งที่ Worker จะทำให้ทุกเครื่องส่งบันทึกไม่ได้
> ให้ตั้งที่ Worker ก่อน แล้วค่อยตั้งในชีต

### ตรวจว่าต่อกันครบหรือยัง — `/__health`

เปิด `https://<โดเมนของคุณ>/__health` (อยู่หลังรหัสผ่านของ Worker เช่นเดียวกับ `/__config`)
หน้านี้เรียก Apps Script จากฝั่งเซิร์ฟเวอร์ จึงตรวจได้ครบทั้งเส้นในที่เดียว:

| ตรวจอะไร | บอกอะไร |
| --- | --- |
| `SITE_USER` / `SITE_PASS` / `WEBAPP_URL` / `PUSH_TOKEN` | ตั้งที่ Worker แล้วหรือยัง และ URL ลงท้าย `/exec` ถูกต้องไหม |
| การเชื่อมต่อ Apps Script | ติดต่อได้ไหม และตอบเป็น JSON หรือคืนหน้า HTML ล็อกอิน (สิทธิ์ deployment ผิด) |
| เวอร์ชันโค้ด | ยังเป็น `Code.gs` เก่าอยู่หรือ deploy เวอร์ชันใหม่แล้ว (ดูจาก `KEY_SET`) |
| **เขตเวลาของชีต** | เป็น `Asia/Bangkok` ไหม — ถ้าไม่ใช่ วันที่/เวลา/รอบตรวจจะเพี้ยนทั้งระบบ |
| **แจ้งเตือน Discord** | ตั้ง `DISCORD_WEBHOOK` ในแท็บ Config แล้วหรือยัง และใช้โหมดไหน |
| **ส่ง Discord ครั้งล่าสุด** | ส่งสำเร็จไหม ถ้าไม่สำเร็จเพราะอะไร (ยังไม่ได้อนุญาตสิทธิ์ / webhook ถูกลบ / โดน rate limit) |
| `DASH_KEY` | ตั้งใน**แท็บ Config ของชีต**แล้วหรือยัง — ตั้งที่ Cloudflare ไม่มีผล เพราะ Worker ไม่อ่านค่านี้ |
| `PUSH_TOKEN` ตรงกันสองฝั่งไหม | ทดสอบด้วยการส่ง `push` ที่ไม่มีรายการเลย จึงไม่เขียนอะไรลงชีต |
| ข้อมูลหลัก | จำนวนจุดตรวจ / รอบ / รายชื่อ รปภ. ที่อ่านได้จากชีต |

> หน้านี้ไม่แสดงค่าความลับใด ๆ บอกแค่ "ตั้งแล้ว/ยังไม่ตั้ง" และ "ตรงกัน/ไม่ตรงกัน"

### คู่มือการใช้งานในตัวแอป

ปุ่ม **“คู่มือการใช้งาน”** มุมขวาบน เปิดได้ทั้งโหมด รปภ. และโหมดผู้ดูแล
เนื้อหาอยู่ในตัวแอปทั้งหมด จึงเปิดอ่านได้ตอนเดินตรวจในจุดที่สัญญาณอับ

| แท็บ | เนื้อหา | ใครเห็น |
| --- | --- | --- |
| **สำหรับ รปภ.** | ขั้นตอนสแกน ความหมายของแถบสี การขอบันทึกพิเศษ และการใช้งานออฟไลน์ | ทุกคน |
| **สัญลักษณ์ & ธง** | ความหมายของธงตรวจสอบ เกณฑ์ที่ใช้อยู่ และรอบตรวจ | ทุกคน |
| **สำหรับหัวหน้าชุด** | เมนูแต่ละหน้าใช้ตอนไหน กฎการลบ/ปิดใช้งาน และงานประจำวัน-สัปดาห์-เดือน | ผู้ดูแลเท่านั้น |
| **แก้ปัญหาที่พบบ่อย** | อาการที่ รปภ. เจอหน้างานและวิธีแก้ (แถว `/__health` เห็นเฉพาะผู้ดูแล) | ทุกคน |

เกณฑ์ที่คู่มือแสดง (รัศมี ความแม่นยำ กันซ้ำ ความเร็ว รอบตรวจ) อ่านจากค่าที่ระบบใช้อยู่จริง
ไม่ใช่ตัวเลขที่พิมพ์ตายไว้ — แก้ค่าในชีตแล้วคู่มือเปลี่ยนตาม จะได้ไม่มีคู่มือที่บอกเลขผิด

### จัดการจุดตรวจและรายชื่อผ่านหน้าเว็บ

โหมดผู้ดูแลมี 2 หน้าสำหรับแก้ข้อมูลหลักโดยไม่ต้องเปิดชีต

| หน้า | ทำอะไรได้ |
| --- | --- |
| **จัดการจุดตรวจ** | เพิ่ม / ลบ / แก้ชื่อ / แก้โซน / แก้รัศมี / เปิด-ปิดใช้งาน |
| **รายชื่อ รปภ.** | เพิ่ม / ลบ / แก้ชื่อ / เปิด-ปิดใช้งาน |

บันทึกแล้วจะส่งขึ้นชีตทันที (เขียนทับทั้งแท็บ) และเขียนลงเครื่องต่อเมื่อชีตยืนยันสิทธิ์แล้ว
ถ้าส่งขึ้นชีตไม่สำเร็จ จะไม่บันทึกลงเครื่องเลย เพื่อไม่ให้สองฝั่งข้อมูลต่างกัน

**กฎการลบ — ลบถาวรได้เฉพาะของที่ไม่เคยถูกใช้**

บันทึกผลตรวจเก็บ `checkpoint_id` และ**ชื่อ**ผู้ตรวจไว้ ถ้าลบของที่เคยใช้งานแล้ว
รายงานย้อนหลังจะอ้างถึงสิ่งที่ไม่มีอยู่ ตรวจสอบตามเอกสาร FM-SEC-01 ไม่ได้ ระบบจึง:

- **ปิดใช้งาน (`active = NO`)** = หายจากหน้าจอ รปภ. แต่รายงานเดิมยังอ่านได้ ← ใช้กรณีทั่วไป
- **ลบถาวร** = ทำได้เฉพาะรายการที่ไม่มีบันทึกใดอ้างถึงเลย (เช่นเพิ่งเพิ่มผิด)
- ต้องกด **"ดึงบันทึกจากชีต"** ก่อน ระบบจึงจะยอมให้ลบ — ถ้ายังไม่ดึง จะเห็นแค่บันทึกในเครื่องนี้
  ซึ่งอาจไม่ครบ แล้วเผลอลบของที่จริง ๆ เคยใช้ไปแล้ว

> ⚠️ **รหัสจุดตรวจจะไม่ถูกนำกลับมาใช้ซ้ำ** จุดใหม่นับต่อจากเลขสูงสุดเสมอ ไม่เติมเลขที่ว่างตรงกลาง
> เพราะสติกเกอร์ QR ที่ติดหน้างานฝัง `?cp=CP05` ไว้ในตัว ถ้าลบ CP05 แล้วจุดใหม่ได้รหัสเดิม
> สติกเกอร์ที่ยังติดอยู่ที่ผนังจะชี้ไปคนละจุดทันทีโดยไม่มีอะไรฟ้อง

**การกันกดผิด** — หน้าจัดการทั้งสองแก้ทีละหลายแถวแล้วค่อยกดบันทึกครั้งเดียว
และการบันทึกเขียนทับทั้งแท็บในชีต จึงมีด่านกันพลาดไว้หลายชั้น

| สถานการณ์ | ระบบทำอะไร |
| --- | --- |
| ยังไม่ได้แก้อะไร | ปุ่ม **บันทึก** และ **ยกเลิกการแก้ไข** ถูกปิดไว้ กดไม่ได้ |
| แก้อะไรไปแล้ว | ขึ้นแถบ **"ยังไม่ได้บันทึก"** พร้อมสรุป เช่น `เพิ่ม 1 · ลบ 2 · แก้ไข 3` |
| กด **ยกเลิกการแก้ไข** | ถามยืนยันก่อนทิ้งงานที่แก้มา |
| กด **บันทึก** ทั้งที่มีการลบ/ปิดใช้งาน | ถามยืนยันพร้อม**บอกชื่อรายการที่จะหาย**จากหน้าจอ รปภ. |
| กดเมนูอื่นขณะมีของค้าง | ถามก่อนเปลี่ยนหน้า |
| ปิดแท็บ / กดรีเฟรช | เบราว์เซอร์เตือนก่อนออก |
| กด **ลบ** | ถามยืนยัน + ลบได้เฉพาะของที่ไม่เคยใช้ (ดูด้านบน) |

**จุดที่เพิ่งเพิ่มยังไม่มีพิกัด** ต้องไปหน้า "สำรวจพิกัด" แล้วเดินไปยืนที่จุดจริงเพื่อบันทึกพิกัด
จนกว่าจะทำ จุดนั้นจะตรวจรัศมีไม่ได้ (`NO_REFERENCE`) และอย่าลืมพิมพ์ QR ของจุดใหม่ไปติด

### แจ้งเตือนเข้า Discord

ตั้งใน **แท็บ Config ของชีต** เท่านั้น (ตั้งที่ Cloudflare ไม่มีผล) — ส่งจากฝั่ง Apps Script

| คีย์ | ค่า |
| --- | --- |
| `DISCORD_WEBHOOK` | ลิงก์ webhook ของห้องแชท (Discord: ตั้งค่าห้อง > Integrations > Webhooks > New Webhook > Copy URL) เว้นว่าง = ปิด |
| `DISCORD_NOTIFY` | `ABNORMAL` (ค่าเริ่มต้น) = แจ้งเฉพาะที่ผิดปกติ · `ALL` = แจ้งทุกครั้ง · `OFF` = ปิด |

**เรื่องที่ถือว่าผิดปกติ** (โหมด `ABNORMAL`): เจ้าหน้าที่กด "พบสิ่งผิดปกติ" · อยู่นอกรัศมี ·
ไม่มีสัญญาณ GPS · สัญญาณหยาบเกินเกณฑ์ · ขอบันทึกพิเศษ · เวลาเครื่องเพี้ยน ·
เคลื่อนที่เร็วผิดปกติ · จุดตรวจไม่มีในชีต/ถูกปิดใช้งาน

**ส่งจากเซิร์ฟเวอร์เสมอ ห้ามส่งจากเบราว์เซอร์** ถ้าเก็บลิงก์ webhook ไว้ในเว็บแอป
ลิงก์จะติดไปกับมือถือของ รปภ. ทุกเครื่อง แล้วใครก็ยิงข้อความปลอมเข้าห้องแชทได้

**⚠️ ต้องเพิ่มสิทธิ์ในไฟล์ manifest ก่อน มิฉะนั้นจะไม่มีข้อความเข้าเลย**

การส่งออกไปข้างนอกใช้ `UrlFetchApp` ซึ่งต้องมีสิทธิ์
`https://www.googleapis.com/auth/script.external_request`
สคริปต์เดิมไม่ได้ขอไว้ และ **แค่ deploy เวอร์ชันใหม่ไม่พอ**

ถ้าโปรเจกต์ระบุ `oauthScopes` ไว้ในไฟล์ `appsscript.json` Apps Script จะใช้เฉพาะที่ระบุ
และ**ไม่ตรวจจับสิทธิ์ใหม่จากโค้ดให้เอง** จึงไม่ขึ้นหน้าต่างขออนุญาต แต่โยน error ออกมาแทน:

```
You do not have permission to call UrlFetchApp.fetch.
Required permissions: .../auth/script.external_request
```

**วิธีแก้**

1. ตัวแก้ไข Apps Script → ⚙️ **Project Settings** → ติ๊ก **Show "appsscript.json" manifest file in editor**
2. เปิดไฟล์ `appsscript.json` ที่โผล่ขึ้นมาในรายการไฟล์
3. เพิ่มบรรทัดนี้เข้าไปใน `oauthScopes`
   ```json
   "https://www.googleapis.com/auth/script.external_request"
   ```
   (หรือลบทั้งบล็อก `oauthScopes` ทิ้ง เพื่อให้ Apps Script ตรวจจับสิทธิ์เองทั้งหมด)
   ดูตัวอย่างเต็มได้ที่ `src/apps-script/appsscript.json` ในโปรเจกต์นี้
4. บันทึก แล้ว **Run ฟังก์ชัน `testDiscordNow`** — คราวนี้จะขึ้นขออนุญาต ให้กดอนุญาต
5. Run ซ้ำอีกครั้ง ควรได้ข้อความเข้าห้องแชท และ Execution log ขึ้นว่าส่งสำเร็จ

> `appsscript.json` ในโปรเจกต์นี้ยังตั้ง `"timeZone": "Asia/Bangkok"` ไว้ด้วย
> ซึ่งแก้เรื่องรอบตรวจ/วันที่เพี้ยนไปในตัว

**แจ้งเตือนไม่เข้า ตรวจตามนี้**

| อาการ | สาเหตุที่พบบ่อย |
| --- | --- |
| กดบันทึกตอนอยู่นอกรัศมี แล้วไม่มีข้อความเข้า | **ปกติของระบบ** — `BLOCK_OUT_OF_RANGE=TRUE` ทำให้แอปไม่ยอมบันทึกตั้งแต่แรก ไม่มีข้อมูลถึงชีต จึงไม่มีอะไรให้แจ้ง ต้องกด "ขอบันทึกพิเศษ" พร้อมเหตุผล หรือตั้ง `BLOCK_OUT_OF_RANGE=FALSE` |
| ตั้งค่าครบแล้วแต่เงียบ | ยังไม่ได้เพิ่มสิทธิ์ `script.external_request` ใน `appsscript.json` (ดูด้านบน) |
| เคยเข้า แล้วอยู่ ๆ หยุด | webhook ถูกลบ — `/__health` จะขึ้น HTTP 401/404 |

**ดูสาเหตุได้ที่ `/__health`** แถว *"ส่ง Discord ครั้งล่าสุด"* บอกผลของการส่งครั้งล่าสุด
พร้อมเหตุผลและเวลา (ไม่แสดงลิงก์ webhook)

**ข้อควรรู้เรื่องปริมาณข้อความ**

- **บันทึก 1 ครั้ง = ข้อความ 1 ข้อความ** ไม่ใช่ 1 ข้อความต่อ 1 รายการ
  เครื่องที่ค้างออฟไลน์ไว้ทั้งคืนแล้วส่งขึ้นมาทีเดียว 30 รายการ จะได้ข้อความเดียว
  (Discord จำกัด 5 คำขอ/2 วินาที ต่อหนึ่ง webhook — ถ้าแยกส่งจะโดนตัดแล้วข้อความหายเงียบ)
- หนึ่งข้อความแสดงได้ 10 รายการ (เพดานของ Discord) ที่เหลือบอกจำนวนไว้ ให้ไปดูในชีต
- โหลดจริงที่คาดไว้: 20 จุด × 6 รอบ = ~120 ครั้ง/วัน ต่อให้เปิดโหมด `ALL`
  ก็ยังห่างจากเพดาน `UrlFetchApp` ของ Apps Script (20,000 ครั้ง/วัน) มาก
- Discord ล่มหรือลิงก์ผิด **ไม่ทำให้บันทึกผลตรวจเสียหาย** ข้อมูลลงชีตก่อนเสมอ แล้วค่อยแจ้งเตือน
- ลิงก์ที่ไม่ใช่โดเมนของ Discord จะไม่ถูกส่งออกไปเลย (กันพิมพ์ผิดแล้วข้อมูลการตรวจหลุดไปปลายทางอื่น)

### การใช้งานออฟไลน์ (ติดตั้งลงหน้าจอโฮม)

จุดตรวจหลายจุดอยู่ในอาคาร/หลังโกดัง ซึ่งสัญญาณมือถือมักอ่อนหรือขาด
ระบบจึงเก็บไฟล์แอปไว้ในเครื่อง (`public/sw.js`) เพื่อให้ **เปิดแอปและบันทึกได้แม้ไม่มีเน็ต**
บันทึกที่ทำตอนออฟไลน์จะค้างอยู่ในคิว แล้วส่งขึ้นชีตเองเมื่อกลับมามีสัญญาณ

| สถานการณ์ | ผลที่ได้ |
| --- | --- |
| เคยเปิดแอปตอนมีสัญญาณอย่างน้อย 1 ครั้ง | เปิดใช้ได้ตามปกติแม้ไม่มีเน็ต บันทึกเข้าคิวไว้ |
| ยังไม่เคยเปิดตอนมีสัญญาณเลย | ขึ้นหน้าอธิบายเป็นภาษาไทย ไม่ใช่จอขาว |
| กลับมามีสัญญาณ | คิวถูกส่งขึ้นชีตอัตโนมัติ (ดูสถานะที่ป้ายบนหน้าจอ) |

> ⚠️ **ต้องเปิดแอปตอนมีสัญญาณหนึ่งครั้งก่อนออกเดินตรวจเสมอ** ให้ใส่ข้อนี้ในขั้นตอนแจกเครื่อง

**แนะนำให้ติดตั้งลงหน้าจอโฮม** (Chrome: เมนู > Add to Home screen / iOS Safari: แชร์ > Add to Home Screen)
จะได้ไม่ต้องใส่รหัสผ่านบ่อย และเปิดเต็มจอเหมือนแอปจริง

ก่อน Deploy ควรตรวจอย่างน้อย:

```text
Lint ✅
Build ✅
Functional QA ✅
Security Review ✅
Regression Test ✅
```

---

## 17. QA Status — แยกตามของที่มีจริงกับ Roadmap

### ✅ Functional Test — Current / Implemented Area

ตรวจเฉพาะ Feature ที่มีอยู่ในระบบปัจจุบัน เช่น:

- เปิดหน้าเว็บ
- Navigation / Mode ที่มีอยู่
- Scan / QR Flow ที่มีอยู่
- GPS Distance Check
- GPS Accuracy Check
- Duplicate Protection
- Speed / Abnormality Flag ที่มีอยู่
- Dashboard / รายงานที่มีอยู่
- Override Flow ระดับ Frontend ที่มีอยู่

### 🧪 Field Test — ต้องทดสอบหน้างานจริงก่อนเปิดใช้

รายการที่ทดสอบบนเครื่องพัฒนาไม่ได้ ต้องเดินจริงที่โรงงานพร้อมมือถือของ รปภ.:

| # | สิ่งที่ต้องทดสอบ | เกณฑ์ผ่าน |
| --- | --- | --- |
| 1 | เดินครบทุกจุดตรวจ อ่านค่า **ความแม่นยำ GPS (±ม.)** ที่แถบสถานะ | ทุกจุดได้ค่า ≤ `MAX_ACCURACY_M` (ค่าเริ่มต้น 60) ภายใน 20 วินาที |
| 2 | ยืนที่จุดตรวจแล้วดู **ระยะห่างที่แอปคำนวณ** | ทุกจุด ≤ `radius_m` ของจุดนั้น (ค่าเริ่มต้น 40 ม.) |
| 3 | สแกน QR ด้วยมือถือของ รปภ. **ทุกรุ่นที่จะใช้จริง** | กล้องเปิดได้ และหน้าเว็บโหลดขึ้น |
| 4 | สแกน QR ผ่านกล้องในแอปอื่น (LINE / Facebook) | ถ้าใช้ไม่ได้ ต้องสั่งให้ "เปิดในเบราว์เซอร์" แทน แล้วเขียนไว้ในคู่มือ |
| 5 | เปิดโหมดเครื่องบิน แล้วบันทึกที่จุดตรวจ | บันทึกได้ และป้ายสถานะขึ้นว่ายังค้างส่ง |
| 6 | ปิดโหมดเครื่องบิน รอสักครู่ | รายการที่ค้างขึ้นชีตครบ ป้ายสถานะกลับเป็นปกติ |
| 7 | ปิดแอปทิ้งตอนยังมีรายการค้าง แล้วเปิดใหม่ | รายการยังอยู่ ไม่หาย |
| 8 | บันทึกจุดเดิมซ้ำภายใน `DUPLICATE_WINDOW_MIN` | ถูกปฏิเสธพร้อมข้อความบอกเหตุผล |
| 9 | ยืนนอกรัศมีแล้วลองบันทึก | ถูกบล็อก และขอบันทึกพิเศษได้เมื่อระบุเหตุผล |
| 10 | เทียบวันที่/เวลา/รอบในชีต กับเวลาจริงที่กดบันทึก | ตรงกัน (ถ้าเพี้ยน = เขตเวลาของชีตตั้งผิด) |
| 11 | หลังทดสอบเสร็จ **ลบแถวทดสอบออกจากแท็บ Logs** | ชีตเหลือเฉพาะข้อมูลจริง |

> ข้อ 1–2 ถ้าไม่ผ่าน อย่าเพิ่งปล่อยใช้งาน — ให้ปรับ `radius_m` รายจุด หรือ `MAX_ACCURACY_M`
> ในแท็บ Config ตามค่าที่วัดได้จริง ไม่ใช่ปิดการตรวจทิ้ง

### 🚧 Functional Test — Phase 2

ยังไม่ถือว่า Implemented จนกว่าจะพัฒนาและทดสอบจริง:

- **Login / Authentication**
- **Guard Identity ที่ยืนยันจาก Backend**
- **Patrol Session**
- **Route / Sequence Validation**
- **Checklist จริง**
- **Server-side Authorization**

### 🚧 Functional Test — Phase 3

ยังไม่ถือว่า Implemented จนกว่าจะพัฒนาและทดสอบจริง:

- **Photo Capture / Upload จริง**
- **Evidence Storage จริง**
- **Incident Management เต็มรูปแบบ**
- **Incident Workflow / Assignment / Verification / Close**
- **Audit Trail แบบ Production**
- **Override Approval Workflow**

### 🔐 Security / Anti-cheat QA — Target

ต้องทดสอบเพิ่มเติมเมื่อ Backend พร้อม:

- เปลี่ยนเวลาเครื่อง
- Mock GPS
- QR Copy / Replay
- ส่ง Request ซ้ำ
- ปลอม Guard Identity
- แก้ Payload
- ใช้ Token หมดอายุ
- ใช้สิทธิ์ข้าม Role
- เข้าถึงข้อมูลที่ไม่ควรเห็น

---

## 18. Development Rules

1. Requirement ต้องอ้างอิง SOP / Business Process จริง
2. ระบุให้ชัดว่า Feature ไหน **Implemented**, **Prototype**, หรือ **Roadmap**
3. ตราบใดที่ AI Studio ยังเป็นต้นทางการแก้ Source หลัก ให้ถือว่า **AI Studio → Push to GitHub** เป็น workflow หลัก
4. หลีกเลี่ยงการแก้ GitHub โดยตรงในไฟล์ที่ AI Studio ยังสามารถ Push ทับได้ โดยไม่มีการควบคุม Version/Workflow
5. เมื่อย้ายมาใช้ Git-based development จริง ให้กำหนด GitHub เป็น Source of Truth และให้การแก้ผ่าน Claude Code / Git workflow เป็นหลัก
6. AI ที่สร้างระบบควรได้รับการตรวจจาก AI อีกตัวหรือผู้ตรวจอิสระ
7. ห้ามเอา Prototype Security ไปใช้เป็น Production Security
8. ห้ามถือ Client-side Validation ว่าเป็น Security Boundary
9. ทุก Feature สำคัญต้องมี Test
10. ทุก Change สำคัญต้องมี Version / Commit ที่ตรวจสอบย้อนหลังได้
11. ห้ามเปิดเผย Secret หรือข้อมูลโรงงานที่ไม่ควรเปิด Public

---

## 19. Roadmap

### Phase 1 — Prototype / Existing Foundation

- QR Checkpoint
- GPS Validation
- GPS Accuracy
- Timestamp
- Duplicate Protection
- Speed / Abnormality Detection บางส่วน
- Dashboard / Monitoring พื้นฐาน
- QR Management / Scan ที่มีอยู่
- ใช้งานออฟไลน์ + ติดตั้งลงหน้าจอโฮม (PWA)
- กันข้อมูลหายเมื่อพื้นที่ในเครื่องเต็ม
- แจ้งเตือนเหตุผิดปกติเข้า Discord
- เพิ่ม/ลบจุดตรวจและรายชื่อ รปภ. ผ่านหน้าเว็บ

### Phase 2 — Core Production

- Authentication
- Guard Identity
- Patrol Session
- Server-side Validation
- RBAC
- Route / Sequence
- Database ที่เชื่อถือได้
- Audit Log

### Phase 3 — Evidence & Incident

- Photo Capture
- Evidence Storage
- Incident Management
- Incident Workflow
- Assignment / Verification
- Override Approval

### Phase 4 — Hardening

- Anti-cheat เพิ่มเติม
- Replay Protection
- Token Rotation
- Security Test
- Load / Stress Test
- Offline / Poor Network Handling
- Monitoring / Alerting

### Phase 5 — Production & Continuous Improvement

- SOP Alignment
- KPI Review
- User Feedback
- Monthly Security Review
- Audit / Compliance Evidence
- Continuous Improvement

---

## 20. Current Priority

ลำดับความสำคัญที่แนะนำ:

```text
1. 🔴 Remove / protect sensitive production data from Public exposure
2. 🔴 Real Authentication + Guard Identity
3. 🔴 Server-side Authorization / Validation
4. 🔴 Patrol Session + Data Model
5. 🟠 QR Token / Replay Protection
6. 🟠 Route / Sequence Validation
7. 🟠 Photo / Evidence จริง
8. 🟠 Incident Management จริง
9. 🟡 Audit / KPI / Reporting
10. 🟡 Hardening / Security / Stress Test
```

---

## 21. Guiding Principle

```text
สร้างเร็วด้วย Google AI Studio
        ↓
Push / Version ด้วย GitHub
        ↓
เมื่อพร้อม ย้ายมา Git-based Development
        ↓
Claude Code = Lead Developer
        ↓
GPT / Codex = Independent Reviewer
        ↓
Test + Security Review
        ↓
Production
```

> **เป้าหมายไม่ใช่แค่ “ทำให้ระบบใช้งานได้” แต่ต้องทำให้ข้อมูลการเดินตรวจมีความน่าเชื่อถือ ตรวจสอบย้อนหลังได้ และพร้อมรองรับการใช้งานจริงของโรงงาน**
