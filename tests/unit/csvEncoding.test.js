// 1.0.3 (BUG-152, D7) — a file that is not UTF-8 (an "ANSI" CSV saved by
// Excel on Windows, a Latin-1 MT940, an ISO-8859-15 camt) used to be read as
// UTF-8: every accented letter became U+FFFD, so a restore created a second
// "Caff� & Bar" category and the notes / bank descriptions were garbled.
// The importer now reads bytes: UTF-16 BOMs are honoured, then strict UTF-8,
// and on failure the XML-declared encoding or, silently, Windows-1252.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const BOM = String.fromCharCode(0xFEFF);
const BOM_AT_START = new RegExp('^' + BOM);

// Single-byte encoders for the fixtures (only the characters they use).
const encode1252 = (s) => Uint8Array.from([...s.replace(BOM_AT_START, '')].map(ch => {
  if (ch === '€') return 0x80;
  const c = ch.charCodeAt(0);
  if (c > 0xFF) throw new Error('not in the fixture encoder: ' + ch);
  return c;
}));
const encode885915 = (s) => Uint8Array.from([...s].map(ch => {
  if (ch === '€') return 0xA4;
  const c = ch.charCodeAt(0);
  if (c > 0xFF) throw new Error('not in the fixture encoder: ' + ch);
  return c;
}));
const utf8 = (s) => new TextEncoder().encode(s);
const utf16le = (s) => {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xFF; out[1] = 0xFE;
  for (let i = 0; i < s.length; i++) { out[2 + i * 2] = s.charCodeAt(i) & 0xFF; out[3 + i * 2] = s.charCodeAt(i) >> 8; }
  return out;
};
const utf16be = (s) => {
  const out = new Uint8Array(2 + s.length * 2);
  out[0] = 0xFE; out[1] = 0xFF;
  for (let i = 0; i < s.length; i++) { out[2 + i * 2] = s.charCodeAt(i) >> 8; out[3 + i * 2] = s.charCodeAt(i) & 0xFF; }
  return out;
};

let files;
let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'e' + (++bootNo) + '-uuid-';
  global.window = {
    crypto: { randomUUID: () => prefix + (++uid) },
    localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.window.DOMParser = global.DOMParser;
  // A browser FileReader over a byte "file": readAsArrayBuffer hands the
  // bytes, readAsText decodes them as UTF-8 (lossy), exactly as a browser does.
  global.FileReader = class {
    readAsArrayBuffer(f) { this.onload({ target: { result: f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength) } }); }
    readAsText(f) { this.onload({ target: { result: new TextDecoder('utf-8').decode(f.bytes) } }); }
  };
  for (const f of ['db.js', 'i18n.js', 'i18n/en.js', 'loan-engine.js', 'store.js', 'export.js', 'import.js']) executeFile(f);
  files = {};
  global.window.StackdExport._download = (name, content) => { files[name] = content; };
  global.window.Store.init();
  global.window.Store.dispatch('SET_CURRENCY', 'EUR');
};

const S = () => window.Store;
const I = () => window.StackdImport;
const importBytes = (bytes) => {
  let out;
  I().importCSV({ bytes }, S().getState(), (r) => { out = r; }, (e) => { throw e; });
  return out;
};

describe('1.0.3 (BUG-152) non-UTF-8 files', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 6, 12, 0, 0));
    boot();
  });
  afterEach(() => { vi.useRealTimers(); });

  describe('_decodeBytes', () => {
    const text = 'Caffè € José Müller';
    it('reads UTF-8, with or without a BOM', () => {
      expect(I()._decodeBytes(utf8(text))).toBe(text);
      expect(I()._decodeBytes(utf8(BOM + text))).toBe(text);
      expect(I()._decodeBytes(utf8(text).buffer)).toBe(text);
    });
    it('reads Windows-1252 when the bytes are not UTF-8', () => {
      expect(I()._decodeBytes(encode1252(text))).toBe(text);
    });
    it('honours UTF-16 BOMs', () => {
      expect(I()._decodeBytes(utf16le(text))).toBe(text);
      expect(I()._decodeBytes(utf16be(text))).toBe(text);
    });
    it('uses the XML-declared encoding of a non-UTF-8 XML file', () => {
      const xml = '<?xml version="1.0" encoding="ISO-8859-15"?><a>€ è</a>';
      expect(I()._decodeBytes(encode885915(xml))).toBe(xml);
      // an unknown or lying (UTF-8) declaration falls back to Windows-1252
      expect(I()._decodeBytes(encode1252('<?xml version="1.0" encoding="bogus-x"?><a>è €</a>'))).toContain('è €');
      expect(I()._decodeBytes(encode1252('<?xml version="1.0" encoding="UTF-8"?><a>è €</a>'))).toContain('è €');
    });
    it('an empty file is an empty string', () => {
      expect(I()._decodeBytes(new Uint8Array(0))).toBe('');
    });
  });

  it('an ANSI transactions backup lands on the existing category with its notes intact', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Conto Più', openingBalance: 100, openingDate: '2026-01-01' });
    S().dispatch('ADD_CATEGORY', { name: 'Caffè & Bar', icon: 'coffee', typeHint: 'expense' });
    const st0 = S().getState();
    const accId = st0.accounts[0].id;
    const catId = st0.categories.find(c => c.name === 'Caffè & Bar').id;
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 3.5, accountId: accId, categoryId: catId, date: '2026-02-03', comment: 'Caffè con José' });
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 12, accountId: accId, categoryId: catId, date: '2026-02-04', comment: 'Brioche € 2 - Müller' });
    const E = window.StackdExport;
    const st = S().getState();
    E.exportAccounts(st); E.exportCategories(st); E.exportTransactions(st);
    const out = { ...files };

    boot();
    importBytes(utf8(out['stackd_accounts.csv']));
    importBytes(utf8(out['stackd_categories.csv']));
    const r = importBytes(encode1252(out['stackd_transactions.csv']));
    expect(r.kind).toBe('transactions');
    expect(r.newCategories || 0).toBe(0);
    const s = S().getState();
    const cats = s.categories.filter(c => /^Caff/.test(c.name));
    expect(cats.map(c => c.name)).toEqual(['Caffè & Bar']);
    const rows = s.transactions.filter(t => t.type === 'expense');
    expect(rows).toHaveLength(2);
    expect(rows.every(t => t.categoryId === cats[0].id)).toBe(true);
    expect(rows.map(t => t.comment).sort()).toEqual(['Brioche € 2 - Müller', 'Caffè con José']);
    expect(s.accounts.map(a => a.name)).toEqual(['Conto Più']);
  });

  it('an ANSI bank CSV keeps its accents for the mapping flow', () => {
    const csv = 'Data;Descrizione;Importo\n03/01/2026;CAFFÈ CENTRALE;-2,50\n05/01/2026;BONIFICO DA José Müller;150,00';
    const r = importBytes(encode1252(csv));
    expect(r.kind).toBe('bank');
    expect(r.csvText).toContain('CAFFÈ CENTRALE');
    expect(r.csvText).toContain('José Müller');
    expect(r.csvText).not.toContain('�');
  });

  it('a camt file declared ISO-8859-15 reads its euro sign and accents', () => {
    const xml = `<?xml version="1.0" encoding="ISO-8859-15"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
 <Acct><Id><IBAN>IT60X0542811101000000123456</IBAN></Id></Acct>
 <Ntry><Amt Ccy="EUR">2.50</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-01-03</Dt></BookgDt>
  <AddtlNtryInf>CAFFÈ CENTRALE € 2,50</AddtlNtryInf></Ntry>
</Stmt></BkToCstmrStmt></Document>`;
    const r = importBytes(encode885915(xml));
    expect(r.kind).toBe('statement');
    expect(r.statement.entries[0].description).toBe('CAFFÈ CENTRALE € 2,50');
  });

  it('a Latin-1 MT940 file reads its accents', () => {
    const mt = [
      ':20:STMT-2026-01',
      ':25:DE89370400440532013000',
      ':28C:1/1',
      ':60F:C260101EUR1000,00',
      ':61:2601030103D2,50NTRFNONREF//BK-1',
      ':86:CAFFÈ JOSÉ',
      ':62F:C260131EUR997,50',
      '-'
    ].join('\r\n');
    const r = importBytes(encode1252(mt));
    expect(r.kind).toBe('statement');
    expect(r.statement.entries[0].description).toBe('CAFFÈ JOSÉ');
  });

  it('a UTF-8 Stack\'d export still reads unchanged through the byte path', () => {
    const csv = BOM + 'id,name,icon,type_hint\ncat_x1,Caffè & Bar,coffee,expense';
    const r = importBytes(utf8(csv));
    expect(r.kind).toBe('categories');
    expect(S().getState().categories.some(c => c.name === 'Caffè & Bar')).toBe(true);
  });

  it('falls back to readAsText where the reader has no readAsArrayBuffer', () => {
    global.FileReader = class { readAsText(f) { this.onload({ target: { result: f.text } }); } };
    let out;
    I().importCSV({ text: 'Data;Descrizione;Importo\n03/01/2026;CAFFÈ;-2,50' }, S().getState(), (r) => { out = r; }, (e) => { throw e; });
    expect(out.kind).toBe('bank');
    expect(out.csvText).toContain('CAFFÈ');
  });

  it('a read error reaches onError once', () => {
    global.FileReader = class { readAsArrayBuffer() { this.onerror(new Error('x')); } };
    const errs = [];
    I().importCSV({}, S().getState(), () => { throw new Error('no'); }, (e) => errs.push(e));
    expect(errs).toHaveLength(1);
    expect(errs[0].message).toBe('Failed to read file');
  });
});
