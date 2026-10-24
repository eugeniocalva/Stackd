import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.1.0 (IE-1, docs/import-export-plan.md §6b): the Auto reader used by the
// Import screen's Check, and the file-level date / amount readers the ledger
// and QIF imports build on. The restore readers (_readRecords,
// _detectDelimiter, _normalizeDate) are pinned elsewhere and stay unchanged;
// on ';' and ',' files the Auto reader must read exactly as they do.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

const I = () => global.window.StackdImport;

// The owner's MoneyStats layout (17 columns, ';', every field quoted, dd/MM/yyyy,
// decimal comma) with invented rows.
const MS_HEADER = '"Conto";"Data";"Ammontare";"Valuta";"Saldo";"Valuta";"Titolo";"Ricevente";"Uso";"Categoria";"Commento";"Hashtags";"Ammontare";"Valuta";"Tasso di cambio";"Stato del pagamento";"Marchio"';
const msRow = (acc, date, amt, cat, note = '') =>
  [acc, date, amt, 'EUR', '0,00', 'EUR', cat, '', '', cat, note, '', amt, 'EUR', '1,00', 'pagato', '']
    .map(v => '"' + v + '"').join(';');
const MS_TEXT = [
  MS_HEADER,
  '"Cash";"01/11/2021";"0,00";"EUR";"313,60";"EUR";"Saldo";"";"";"";"";"";"0,00";"EUR";"1,00";"pagato";""',
  msRow('Wallet', '01/11/2021', '-25,33', 'Shopping', 'Vetri; protezione'),
  msRow('Wallet', '14/11/2021', '-50,00', 'Trasferimento'),
  msRow('Cash', '14/11/2021', '50,00', 'Trasferimento')
].join('\n');

describe('Auto reader: delimiters and rows (1.1.0 IE-1)', () => {
  beforeEach(() => {
    global.window = { crypto: { randomUUID: () => 'x' }, localStorage: { getItem: vi.fn(), setItem: vi.fn() } };
    global.localStorage = global.window.localStorage;
    ['db.js', 'i18n.js', 'i18n/en.js', 'store.js', 'import.js'].forEach(executeFile);
  });

  it('reads the MoneyStats layout: ";" and 17 quoted columns, a ";" inside a quoted note kept', () => {
    const r = I()._readTextAuto(MS_TEXT);
    expect(r.delimiter).toBe(';');
    expect(r.rowDelimiter).toBe('lf');
    expect(r.rows).toHaveLength(5);
    expect(r.rows.every(f => f.length === 17)).toBe(true);
    expect(r.rows[2][10]).toBe('Vetri; protezione');
  });

  it('detects Tab and "|" files, which the restore reader cannot', () => {
    const tab = 'Date\tDescription\tAmount\n03/01/2026\tShop, Milano\t-45,90\n04/01/2026\tSalary\t1500,00';
    const pipe = 'Date|Description|Amount\n03/01/2026|Shop, Milano|-45.90\n04/01/2026|Salary|1500.00';
    expect(I()._readTextAuto(tab).delimiter).toBe('\t');
    expect(I()._readTextAuto(tab).rows[1]).toEqual(['03/01/2026', 'Shop, Milano', '-45,90']);
    expect(I()._readTextAuto(pipe).delimiter).toBe('|');
    expect(I()._readTextAuto(pipe).rows[2]).toEqual(['04/01/2026', 'Salary', '1500.00']);
    expect(I()._detectDelimiter('Date\tDescription\tAmount')).toBe(','); // why Auto exists
  });

  it('agrees with _detectDelimiter on ";" and "," files (quoted delimiters, inch marks)', () => {
    const cases = [
      'Date;TV 55" model, size;Amount\n01/01/2026;x;1',
      'Date,Screen 27";Size,Amount\n2026-01-01,x,1',
      '"Note; with semi",Amount,Date\n"a;b",1,2026-01-01',
      'Data;Descrizione;Importo\n03/01/2026;TV 55" SAMSUNG;-499,00\n04/01/2026;MONITOR 27" LG;-229,90',
      'Date,Time,Type,Amount,Account,Category,Note\n2026-01-01,,expense,12.5,Main,Groceries,"milk, eggs"',
      'Date;Type;Amount;Account;Category;Note\n01/02/2026;expense;12,50;Main;Groceries;latte',
      MS_TEXT
    ];
    cases.forEach(csv => {
      const legacy = I()._readRecords(csv).delimiter;
      expect(I()._readTextAuto(csv).delimiter).toBe(legacy);
    });
  });

  it('prefers the delimiter whose column count holds across the rows', () => {
    // The header alone favours ',' (3 columns against 2); only ';' keeps the
    // data rows at the header's width.
    const csv = 'a,b,c;d\n1;2\n3;4\n5;6';
    expect(I()._detectDelimiter('a,b,c;d')).toBe(',');
    expect(I()._readTextAuto(csv).delimiter).toBe(';');
  });

  it('reads a CR-only file (old Mac exports) instead of one long line', () => {
    const csv = 'Data;Descrizione;Importo\r03/01/2026;SPESA;-45,90\r04/01/2026;STIPENDIO;1850,00';
    const r = I()._readTextAuto(csv);
    expect(r.rowDelimiter).toBe('cr');
    expect(r.rows).toHaveLength(3);
    expect(r.rows[2]).toEqual(['04/01/2026', 'STIPENDIO', '1850,00']);
  });

  it('reports CRLF, strips a BOM and drops blank lines', () => {
    const r = I()._readTextAuto('\uFEFFA;B\r\n1;2\r\n\r\n3;4\r\n');
    expect(r.rowDelimiter).toBe('crlf');
    expect(r.rows).toEqual([['A', 'B'], ['1', '2'], ['3', '4']]);
  });

  it('honours a forced delimiter and row delimiter', () => {
    const csv = 'A,B;C\n1,2;3';
    expect(I()._readTextAuto(csv, { delimiter: ',' }).rows[1]).toEqual(['1', '2;3']);
    expect(I()._readTextAuto(csv, { delimiter: ';' }).rows[1]).toEqual(['1,2', '3']);
    expect(I()._readTextAuto('A;B\r1;2', { rowDelimiter: 'cr' }).rows).toHaveLength(2);
    expect(I()._readTextAuto(csv, { delimiter: 'nonsense' }).delimiter).toBe(I()._detectDelimiter('A,B;C'));
  });

  it('ignore quotes: a quote is an ordinary character', () => {
    const csv = 'Date;Note;Amount\n01/01/2026;"Shop;1\n02/01/2026;ok";2';
    const quoted = I()._readTextAuto(csv);
    const plain = I()._readTextAuto(csv, { ignoreQuotes: true });
    expect(plain.rows).toEqual([['Date', 'Note', 'Amount'], ['01/01/2026', '"Shop', '1'], ['02/01/2026', 'ok"', '2']]);
    expect(quoted.rows).not.toEqual(plain.rows);
  });

  it('an empty or blank text has no rows', () => {
    expect(I()._readTextAuto('').rows).toEqual([]);
    expect(I()._readTextAuto('\n\n  \n').rows).toEqual([]);
    expect(I()._readTextAuto(null).rows).toEqual([]);
  });
});

describe('File-level dates (1.1.0 IE-1)', () => {
  beforeEach(() => {
    global.window = { crypto: { randomUUID: () => 'x' }, localStorage: { getItem: vi.fn(), setItem: vi.fn() } };
    global.localStorage = global.window.localStorage;
    ['db.js', 'i18n.js', 'i18n/en.js', 'store.js', 'import.js'].forEach(executeFile);
  });

  it('decides one order for the whole file', () => {
    expect(I()._guessDateOrder(['01/11/2021', '14/11/2021'])).toEqual({ order: 'dmy', ambiguous: false, mixed: false });
    expect(I()._guessDateOrder(['11/01/2021', '11/14/2021'])).toEqual({ order: 'mdy', ambiguous: false, mixed: false });
    expect(I()._guessDateOrder(['2021-11-01', '2021-11-14'])).toEqual({ order: 'ymd', ambiguous: false, mixed: false });
  });

  it('a value deep in the file decides (not a 50-row sample)', () => {
    const vals = Array.from({ length: 60 }, () => '05/03/2026').concat(['20/03/2026']);
    expect(I()._guessDateOrder(vals).order).toBe('dmy');
    const us = Array.from({ length: 60 }, () => '05/03/2026').concat(['03/20/2026']);
    expect(I()._guessDateOrder(us).order).toBe('mdy');
  });

  it('all-ambiguous: the fallback (the install\'s export format), else day-first', () => {
    expect(I()._guessDateOrder(['01/02/2026', '03/04/2026'])).toEqual({ order: 'dmy', ambiguous: true, mixed: false });
    expect(I()._guessDateOrder(['01/02/2026'], 'mdy')).toEqual({ order: 'mdy', ambiguous: true, mixed: false });
    expect(I()._guessDateOrder(['01/02/2026'], 'bogus').order).toBe('dmy');
    expect(I()._guessDateOrder([]).ambiguous).toBe(true);
  });

  it('flags a file that contradicts itself', () => {
    const r = I()._guessDateOrder(['13/01/2026', '01/13/2026']);
    expect(r.mixed).toBe(true);
  });

  it('_parseDateStrict checks the calendar and reads 2-digit years', () => {
    expect(I()._parseDateStrict('14/11/2021', 'dmy')).toBe('2021-11-14');
    expect(I()._parseDateStrict('11/14/2021', 'mdy')).toBe('2021-11-14');
    expect(I()._parseDateStrict('2021-11-14', 'ymd')).toBe('2021-11-14');
    expect(I()._parseDateStrict('14.11.21', 'dmy')).toBe('2021-11-14');
    expect(I()._parseDateStrict('1-2-2026', 'dmy')).toBe('2026-02-01');
    expect(I()._parseDateStrict('29/02/2024', 'dmy')).toBe('2024-02-29');
    expect(I()._parseDateStrict('14/11/2021 10:30', 'dmy')).toBe('2021-11-14');
    expect(I()._parseDateStrict('2021-11-14T10:30:00', 'ymd')).toBe('2021-11-14');
    // invalid
    expect(I()._parseDateStrict('31/02/2026', 'dmy')).toBeNull();
    expect(I()._parseDateStrict('29/02/2025', 'dmy')).toBeNull();
    expect(I()._parseDateStrict('14/11/2021', 'mdy')).toBeNull();
    expect(I()._parseDateStrict('00/11/2021', 'dmy')).toBeNull();
    expect(I()._parseDateStrict('14/11/221', 'dmy')).toBeNull();
    expect(I()._parseDateStrict('2021-11-14', 'dmy')).toBeNull();
    expect(I()._parseDateStrict('Nov 14 2021', 'dmy')).toBeNull();
    expect(I()._parseDateStrict('', 'dmy')).toBeNull();
  });
});

describe('Amounts and the amount factor (1.1.0 IE-1)', () => {
  beforeEach(() => {
    global.window = { crypto: { randomUUID: () => 'x' }, localStorage: { getItem: vi.fn(), setItem: vi.fn() } };
    global.localStorage = global.window.localStorage;
    ['db.js', 'i18n.js', 'i18n/en.js', 'store.js', 'import.js'].forEach(executeFile);
  });

  it('_guessDecimal votes over the column, a tie follows the delimiter', () => {
    expect(I()._guessDecimal(['-25,33', '313,60', '0,00'], ';')).toBe('comma');
    expect(I()._guessDecimal(['-25.33', '1,850.00'], ',')).toBe('dot');
    expect(I()._guessDecimal(['12 EUR', '1500'], ';')).toBe('comma');
    expect(I()._guessDecimal(['12', '1500'], ',')).toBe('dot');
    expect(I()._guessDecimal(['€ 12,50', 'EUR -3,10'], ',')).toBe('comma');
  });

  it('_parseFactor reads signs, both separators and up to 6 decimals, never 0', () => {
    expect(I()._parseFactor('1')).toBe(1);
    expect(I()._parseFactor('-1')).toBe(-1);
    expect(I()._parseFactor('0.01')).toBe(0.01);
    expect(I()._parseFactor('1,95583')).toBe(1.95583);
    expect(I()._parseFactor(' 0,001 ')).toBe(0.001);
    expect(I()._parseFactor('.5')).toBe(0.5);
    expect(I()._parseFactor('−1')).toBe(-1);
    expect(I()._parseFactor('0')).toBeNull();
    expect(I()._parseFactor('0,000')).toBeNull();
    expect(I()._parseFactor('')).toBeNull();
    expect(I()._parseFactor('1.2345678')).toBeNull();
    expect(I()._parseFactor('1.000,5')).toBeNull();
    expect(I()._parseFactor('abc')).toBeNull();
  });

  it('_ledgerAmount: lenient cells, the factor, one rounding to cents', () => {
    expect(I()._ledgerAmount('-25,33', 'comma', 1)).toBe(-25.33);
    expect(I()._ledgerAmount('3324,91', 'comma')).toBe(3324.91);
    expect(I()._ledgerAmount('1.850,00 EUR', 'comma', 1)).toBe(1850);
    expect(I()._ledgerAmount('(12,34)', 'comma', 1)).toBe(-12.34);
    expect(I()._ledgerAmount('12,34-', 'comma', 1)).toBe(-12.34);
    expect(I()._ledgerAmount('-25,33', 'comma', -1)).toBe(25.33);
    expect(I()._ledgerAmount('2533', 'comma', 0.01)).toBe(25.33);
    expect(I()._ledgerAmount('100,00', 'comma', 1.95583)).toBe(195.58);
    expect(I()._ledgerAmount('0,00', 'comma', -1)).toBe(0);
    expect(Object.is(I()._ledgerAmount('0,00', 'comma', -1), -0)).toBe(false);
    expect(I()._ledgerAmount('', 'comma', 1)).toBeNull();
    expect(I()._ledgerAmount('n/a', 'comma', 1)).toBeNull();
  });
});
