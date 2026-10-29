/**
 * ตัวจำลอง Google Apps Script ขั้นต่ำ เพื่อให้ Code.gs รันนอก Google ได้
 * รองรับเท่าที่ Code.gs เรียกใช้จริงเท่านั้น ไม่ได้ทำให้ครบทุก API
 */
const TZ_OFFSET_MIN = 7 * 60; // Asia/Bangkok

function shifted(d) { return new Date(d.getTime() + TZ_OFFSET_MIN * 60000); }
const pad = (n, w = 2) => String(n).padStart(w, '0');

global.Utilities = {
  formatDate(date, _tz, fmt) {
    const d = shifted(date);
    const map = {
      "yyyy-MM-dd'T'HH:mm:ss": `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
      'yyyy-MM-dd': `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`,
      'yyyy-MM-dd HH:mm': `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
      'HH:mm:ss': `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
      'HH:mm': `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
      'H': String(d.getUTCHours()),
      'm': String(d.getUTCMinutes()),
    };
    if (!(fmt in map)) throw new Error('unhandled format ' + fmt);
    return map[fmt];
  },
};
global.Session = { getScriptTimeZone: () => 'Asia/Bangkok' };

/**
 * จำลอง UrlFetchApp — เก็บทุกคำขอที่ยิงออกไปไว้ตรวจ
 * ตั้ง urlFetch.fail = true เพื่อจำลองว่าปลายทางล่ม
 */
const urlFetch = {
  calls: [], fail: false, code: 204,
  reset() { this.calls = []; this.fail = false; this.code = 204; },
};
global.UrlFetchApp = {
  fetch(url, opts) {
    urlFetch.calls.push({ url, opts, payload: opts && opts.payload ? JSON.parse(opts.payload) : null });
    if (urlFetch.fail) throw new Error('ปลายทางล่ม ' + url);
    return { getResponseCode: () => urlFetch.code, getContentText: () => '' };
  },
};

/** ScriptProperties แบบง่าย ใช้เก็บผลการส่งแจ้งเตือนครั้งล่าสุด */
const scriptProps = new Map();
global.PropertiesService = {
  getScriptProperties: () => ({
    setProperty: (k, v) => scriptProps.set(k, v),
    getProperty: (k) => (scriptProps.has(k) ? scriptProps.get(k) : null),
  }),
};
global.Logger = { log: () => {} };
global.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
global.ContentService = {
  MimeType: { JSON: 'json' },
  createTextOutput: (t) => ({ _t: t, setMimeType() { return this; }, getContent() { return t; } }),
};
// createTextOutput must return an object whose setMimeType returns itself
global.ContentService.createTextOutput = (t) => {
  const o = { getContent: () => t };
  o.setMimeType = () => o;
  return o;
};

class FakeSheet {
  constructor(name) { this.name = name; this.data = []; }
  appendRow(row) { this.data.push(row.slice()); }
  setFrozenRows() {}
  getLastRow() { return this.data.length; }
  getDataRange() {
    const width = this.data.reduce((m, r) => Math.max(m, r.length), 0);
    const grid = this.data.map((r) => { const c = r.slice(); while (c.length < width) c.push(''); return c; });
    return { getValues: () => grid };
  }
  getRange(row, col, nRows = 1, nCols = 1) {
    const sh = this;
    return {
      getValues() {
        const out = [];
        for (let r = 0; r < nRows; r++) {
          const src = sh.data[row - 1 + r] || [];
          const line = [];
          for (let c = 0; c < nCols; c++) line.push(src[col - 1 + c] === undefined ? '' : src[col - 1 + c]);
          out.push(line);
        }
        return out;
      },
      setValues(vals) {
        vals.forEach((line, r) => {
          const idx = row - 1 + r;
          while (sh.data.length <= idx) sh.data.push([]);
          line.forEach((v, c) => { sh.data[idx][col - 1 + c] = v; });
        });
      },
      setValue(v) { this.setValues([[v]]); },
      clearContent() {
        for (let r = 0; r < nRows; r++) {
          const idx = row - 1 + r;
          if (!sh.data[idx]) continue;
          for (let c = 0; c < nCols; c++) sh.data[idx][col - 1 + c] = '';
        }
      },
    };
  }
}

const sheets = new Map();
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (n) => sheets.get(n) || null,
    insertSheet: (n) => { const s = new FakeSheet(n); sheets.set(n, s); return s; },
  }),
};
module.exports = { sheets, FakeSheet, urlFetch, scriptProps };
