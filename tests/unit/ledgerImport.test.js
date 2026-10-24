import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.1.0 (IE-2, docs/import-export-plan.md §6c–§6f): ledger files — MoneyStats
// exports and Stack'd's own ledger export — read into several accounts, with
// opening balances, transfers, categories, tags and payment status; Check runs
// the real import inside Store.dryRun. The fixture is invented: it has the
// shape of the owner's MoneyStats export (17 quoted columns, ';', dd/MM/yyyy,
// decimal comma) and every case found in it, but none of its data.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let mem;
let setItem;
let bootNo = 0;
const boot = () => {
  let uid = 0;
  const prefix = 'l' + (++bootNo) + '-';
  mem = new Map();
  setItem = vi.fn((k, v) => { mem.set(k, String(v)); });
  // A real key/value store: Store.dryRun reloads the touched slices from it.
  const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem, removeItem: (k) => { mem.delete(k); } };
  global.window = { crypto: { randomUUID: () => prefix + (++uid) }, localStorage: ls };
  global.localStorage = ls;
  global.FileReader = class { readAsText(file) { this.onload({ target: { result: file.text } }); } };
  ['db.js', 'i18n.js', 'i18n/en.js', 'i18n/fr.js', 'i18n/it.js', 'i18n/es.js', 'i18n/pt.js',
    'loan-engine.js', 'store.js', 'export.js', 'import.js'].forEach(executeFile);
  window.Store.init();
  window.Store.dispatch('SET_CURRENCY', 'EUR');
};

const S = () => window.Store;
const I = () => window.StackdImport;
const acc = (name) => S().getState().accounts.find(a => a.name === name);
const bal = (name) => Math.round(S().getAccountBalance(acc(name).id) * 100) / 100;
const txsOf = (name) => S().getState().transactions.filter(t => t.accountId === acc(name).id);
const catName = (id) => (S().getState().categories.find(c => c.id === id) || {}).name || '';

const HEADERS = {
  it: ['Conto', 'Data', 'Ammontare', 'Valuta', 'Saldo', 'Valuta', 'Titolo', 'Ricevente', 'Uso', 'Categoria', 'Commento', 'Hashtags', 'Ammontare', 'Valuta', 'Tasso di cambio', 'Stato del pagamento', 'Marchio'],
  en: ['Account', 'Date', 'Amount', 'Currency', 'Account balance', 'Currency', 'Title', 'Receiver', 'Usage', 'Category', 'Comment', 'Tags', 'Amount', 'Currency', 'Exchange rate', 'Payment status', 'Mark'],
  de: ['Konto', 'Datum', 'Betrag', 'Währung', 'Kontostand', 'Währung', 'Titel', 'Empfänger', 'Verwendung', 'Kategorie', 'Notiz', 'Tags', 'Betrag', 'Währung', 'Wechselkurs', 'Zahlungsstatus', 'Markierung'],
  pt: ['Conta', 'Data', 'Montante', 'Moeda', 'Saldo', 'Moeda', 'Título', 'Recebedor', 'Uso', 'Categoria', 'Comentário', 'Hashtags', 'Montante', 'Moeda', 'Taxa de câmbio', 'Status do pagamento', 'Marca']
};
const PAID = { it: 'pagato', en: 'paid', de: 'bezahlt', pt: 'pago' };

// One MoneyStats row. status 'paid' is written in the file's language; ccy ''
// leaves the currency cells empty.
const row = (o, lang = 'it') => {
  const ccy = o.ccy === undefined ? 'EUR' : o.ccy;
  const ccy2 = o.ccy2 === undefined ? ccy : o.ccy2;
  const status = o.status === undefined || o.status === 'paid' ? PAID[lang] : o.status;
  return [o.acc, o.date, o.amt, ccy, o.saldo || '0,00', ccy, o.title || '', '', '', o.cat || '', o.note || '',
    o.tags || '', o.amt2 || o.amt, ccy2, '1,00', status, ''].map(v => '"' + v + '"').join(';');
};
const tr = (acc, date, amt, extra = {}) => Object.assign({ acc, date, amt, title: 'Trasferimento', cat: 'Trasferimento' }, extra);
const BASE = [
  { acc: 'Cash', date: '01/11/2021', amt: '0,00', saldo: '313,60', title: 'Saldo' },
  { acc: 'Card', date: '01/11/2021', amt: '0,00', saldo: '-84,00', title: 'Saldo' },
  { acc: 'Bank', date: '01/11/2021', amt: '0,00', saldo: '1000,00' }, // empty title, as MoneyStats' BPI row
  { acc: 'Bank', date: '01/11/2021', amt: '-25,33', title: 'Shopping', cat: 'Shopping', note: 'Vetri; protezione', tags: 'Elettronica e Accessori' },
  { acc: 'Bank', date: '01/11/2021', amt: '-100,00', note: 'Curso EDIT' },
  { acc: 'N26', date: '02/11/2021', amt: '-15,00', title: 'Sport', cat: 'Sport' }, // a name with digits
  tr('N26', '03/11/2021', '20,00'), tr('Cash', '03/11/2021', '-20,00'),
  { acc: 'Coverflex', date: '04/11/2021', amt: '0,00', saldo: '76,30', title: 'Saldo' },
  { acc: 'Coverflex', date: '04/11/2021', amt: '-8,10', title: 'Ristoranti', cat: 'Ristoranti' },
  { acc: 'Cash', date: '05/11/2021', amt: '-2,50', title: 'Giochi' },
  { acc: 'Bank', date: '07/11/2021', amt: '-9,36', title: 'Mediche', cat: 'Bellezza', note: 'Crema' },
  tr('Cash', '14/11/2021', '50,00'), tr('Bank', '14/11/2021', '-50,00'), // + leg first
  tr('Bank', '15/11/2021', '-84,00'), tr('Card', '15/11/2021', '84,00'), // - leg first
  { acc: 'Cash', date: '20/11/2021', amt: '-1,40', title: 'Tempo Libero', cat: 'Tempo Libero', tags: 'Bevande' },
  { acc: 'Cash', date: '20/11/2021', amt: '-1,40', title: 'Tempo Libero', cat: 'Tempo Libero', tags: 'Bevande' }, // a real twin
  { acc: 'Bank', date: '22/11/2021', amt: '-12,00', title: 'Casa', cat: 'Casa', status: 'non pagato' },
  { acc: 'Bank', date: '23/11/2021', amt: '-7,00', title: 'Casa', cat: 'Casa', status: 'in sospeso' },
  // six rows, three accounts, one day, one amount
  tr('Cash', '06/12/2021', '200,00'), tr('Bank', '06/12/2021', '-200,00'),
  tr('Bank', '06/12/2021', '200,00'), tr('Card', '06/12/2021', '-200,00'),
  tr('Card', '06/12/2021', '200,00'), tr('Cash', '06/12/2021', '-200,00'),
  // legs not next to each other
  tr('Bank', '07/12/2021', '-30,00'),
  { acc: 'Bank', date: '07/12/2021', amt: '-45,00', title: 'Supermercato e alimentari', cat: 'Supermercato e alimentari' },
  tr('Cash', '07/12/2021', '30,00'),
  // a one-sided "transfers to someone" category: never a transfer
  { acc: 'Bank', date: '10/12/2021', amt: '-10,00', title: 'Trasferimenti Mia', cat: 'Trasferimenti Mia' },
  { acc: 'Bank', date: '11/12/2021', amt: '-8,99', title: 'Trasferimenti Mia', cat: 'Trasferimenti Mia' },
  // across currencies: amounts differ
  tr('Revolut', '12/12/2021', '-110,00', { ccy: 'USD' }), tr('Bank', '12/12/2021', '100,00'),
  { acc: 'Bank', date: '15/12/2021', amt: '2363,58', title: 'Stipendio', cat: 'Stipendio', tags: 'Recibo de Vencimento' },
  { acc: 'Cash', date: '25/12/2021', amt: '-4,00', title: 'Regali', cat: 'Regali', tags: 'Natale | Regali Margarida, Mia' },
  // a transfer and a plain row of the same account, day and amount
  tr('Bank', '10/02/2024', '37,50', { note: 'Regalo F' }), tr('Card', '10/02/2024', '-37,50', { note: 'Regalo F' }),
  { acc: 'Card', date: '10/02/2024', amt: '-37,50', title: 'Regali', cat: 'Regali', note: 'Regalo F' },
  // an account opened at 0 with an entry dated before its opening
  { acc: 'Zero', date: '01/03/2022', amt: '0,00', saldo: '0,00', title: 'Saldo' },
  { acc: 'Zero', date: '15/02/2022', amt: '-5,00', title: 'Casa', cat: 'Casa' },
  { acc: 'Zero', date: '05/03/2022', amt: '-3,00', title: 'Casa', cat: 'Casa' },
  // planned
  { acc: 'Bank', date: '28/02/2099', amt: '-3,50', title: 'Shopping', cat: 'Shopping', tags: 'Spotify' }
];
const ROWS = 37;         // entries (BASE minus its 5 balance rows)
const PAIRS = 9;
const EXPECTED = { Cash: 364.3, Card: -75, Bank: 3138.4, Zero: -3, Revolut: -110, N26: 5, Coverflex: 68.2 };
const file = (rows = BASE, lang = 'it') =>
  [HEADERS[lang].map(h => '"' + h + '"').join(';')].concat(rows.map(r => row(r, lang))).join('\n');

const commit = (text, opts = {}) => {
  let out = null;
  let err = null;
  I().importText(text, Object.assign({ mode: 'commit' }, opts), (r) => { out = r; }, (e) => { err = e; });
  if (err) throw err;
  return out;
};
const restore = (text) => {
  let out = null;
  let err = null;
  I().importCSV({ text }, S().getState(), (r) => { out = r; }, (e) => { err = e; });
  return { out, err };
};
const snapshot = () => JSON.stringify({
  a: S().getState().accounts, c: S().getState().categories, t: S().getState().transactions,
  d: S().getState().defaultAccountId
});
const balances = () => Object.fromEntries(S().getState().accounts.map(a => [a.name, bal(a.name)]));

describe('Ledger detection (1.1.0 IE-2)', () => {
  beforeEach(boot);

  it('MoneyStats in Italian, English, German and Portuguese is a ledger', () => {
    Object.keys(HEADERS).forEach(lang => {
      const a = I().analyzeText(file(BASE, lang));
      expect(a.kind).toBe('ledger');
      expect(a.ledger.layout).toBe('header');
      expect(a.ledger.runningBalance).toBe(false);
      expect(a.ledger.cols).toMatchObject({ account: 0, date: 1, amount: 2, currency: 3, balance: 4, balanceCurrency: 5,
        title: 6, payee: 7, purpose: 8, category: 9, comment: 10, tags: 11, amount2: 12, currency2: 13, rate: 14, status: 15, brand: 16 });
    });
  });

  it('Stack\'d\'s own ledger headers in all five languages are a ledger (read from the dictionaries)', () => {
    const cols = ['account', 'date', 'amount', 'currency', 'balance', 'balanceCurrency', 'title', 'payee', 'purpose',
      'category', 'comment', 'tags', 'amount2', 'currency2', 'rate', 'status', 'brand'];
    ['en', 'fr', 'it', 'es', 'pt'].forEach(lang => {
      const d = window.I18n.dicts[lang];
      const header = cols.map(c => '"' + d['ledger.col.' + c] + '"').join(';');
      const a = I().analyzeText(header + '\n' + row(BASE[3]));
      expect(a.kind, lang).toBe('ledger');
      expect(a.ledger.cols.status, lang).toBe(15);
    });
  });

  it('pins the file vocabulary per language (values may never change)', () => {
    const col = (lang) => ['account', 'date', 'amount', 'currency', 'balance', 'balanceCurrency', 'title', 'payee', 'purpose',
      'category', 'comment', 'tags', 'amount2', 'currency2', 'rate', 'status', 'brand'].map(k => window.I18n.dicts[lang]['ledger.col.' + k]);
    const word = (lang) => ['balance', 'transfer', 'paid', 'unpaid'].map(k => window.I18n.dicts[lang]['ledger.word.' + k]);
    expect(col('it')).toEqual(HEADERS.it);
    expect(col('en')).toEqual(HEADERS.en);
    expect(col('pt')).toEqual(HEADERS.pt);
    expect(col('fr')).toEqual(['Compte', 'Date', 'Montant', 'Devise', 'Solde', 'Devise', 'Titre', 'Destinataire', 'Utilisation', 'Catégorie', 'Note', 'Tags', 'Montant', 'Devise', 'Taux de change', 'Statut de paiement', 'Marque']);
    expect(col('es')).toEqual(['Cuenta', 'Fecha', 'Cantidad', 'Moneda', 'Saldo', 'Moneda', 'Título', 'Receptor', 'Uso', 'Categoría', 'Comentario', 'Hashtags', 'Cantidad', 'Moneda', 'Tipo de cambio', 'Estado de pago', 'Marca']);
    expect(word('it')).toEqual(['Saldo', 'Trasferimento', 'pagato', 'non pagato']);
    expect(word('en')).toEqual(['Balance', 'Transfer', 'paid', 'not paid']);
    expect(word('pt')).toEqual(['Saldo', 'Transferência', 'pago', 'não pago']);
    expect(word('fr')).toEqual(['Solde', 'Virement', 'payé', 'impayé']);
    expect(word('es')).toEqual(['Saldo', 'Transferencia', 'pagado', 'no pagado']);
  });

  it('every dictionary value is in the built-in tables (detection never depends on loaded dictionaries)', () => {
    const all = new Set(Object.values(I().LEDGER_ALIASES).flat());
    const W = I().LEDGER_WORDS;
    ['en', 'fr', 'it', 'es', 'pt'].forEach(lang => {
      const d = window.I18n.dicts[lang];
      Object.keys(d).filter(k => k.startsWith('ledger.col.')).forEach(k => {
        expect(all.has(I()._foldKey(d[k])), lang + ' ' + k).toBe(true);
      });
      ['paid', 'unpaid', 'transfer', 'balance'].forEach(w => {
        expect(W[w].indexOf(I()._fold(d['ledger.word.' + w])), lang + ' ' + w).not.toBe(-1);
      });
    });
    expect(W.paid).toEqual(expect.arrayContaining(['pagato', 'paid', 'bezahlt', 'pago', 'pagado', 'paye']));
    expect(W.unpaid).toEqual(expect.arrayContaining(['non pagato', 'not paid', 'nicht bezahlt', 'nao pago', 'no pagado', 'impaye']));
  });

  it('the plain shape Account, Date, Amount, Category[, Note] is a ledger; one more column is not', () => {
    const a = I().analyzeText('Account;Date;Amount;Category;Note\nCash;01/02/2026;-12,50;Food;lunch\nBank;02/02/2026;1500,00;Salary;');
    expect(a).toMatchObject({ kind: 'ledger', ledger: { layout: 'plain' } });
    expect(I().analyzeText('Account;Date;Amount;Category\nCash;01/02/2026;-12,50;Food').kind).toBe('ledger');
    expect(I().analyzeText('Account;Date;Description;Amount;Category\nCash;01/02/2026;LIDL;-12,50;Food').kind).toBe('bank');
    expect(I().analyzeText('Date,Description,Original Description,Amount,Transaction Type,Category,Account Name,Labels\n01/02/2026,LIDL,LIDL 123,12.50,debit,Food,Visa,').kind).not.toBe('ledger');
  });

  it('a MoneyStats file in a language never seen is read by its structure', () => {
    const header = Array.from({ length: 17 }, (_, i) => '"K' + i + '"').join(';');
    const a = I().analyzeText(header + '\n' + BASE.slice(3, 8).map(r => row(r)).join('\n'));
    expect(a).toMatchObject({ kind: 'ledger', ledger: { layout: 'moneystats' } });
  });

  it('account names with digits ("N26") are names', () => {
    const rows = [1, 2, 3, 4, 5].map(d => ({ acc: 'N26', date: '0' + d + '/01/2022', amt: '-1,00', cat: 'X' }));
    expect(I().analyzeText(file(rows)).kind).toBe('ledger');
    expect(I()._isAccountName('N26')).toBe(true);
    expect(I()._isAccountName('Girokonto 0532013000')).toBe(true);
    expect(I()._isAccountName('DE89 3704 0044 0532 0130 00')).toBe(false);
    expect(I()._isAccountName('0012345678')).toBe(false);
    expect(I()._isAccountName('DE89 3704 **** **** 3000')).toBe(false);
    expect(I()._isAccountName('IBAN DE89 3704 0044 0532 0130 00')).toBe(false);
    expect(I()._isAccountName('IBAN: DE89370400440532013000')).toBe(false);
    expect(I()._isAccountName('5355 XXXX XXXX 1234')).toBe(false);
    expect(I()._isAccountName('Visa Gold')).toBe(true);
    ['DE89…3000', 'DE89 3704 0044 0532 0130 00 (EUR)', 'ES91 ···· ···· 1332', 'ES**************1332',
      'IBAN n. IT60X0542811101000000123456', 'IT60X0542811101000000123456/EUR'].forEach(v => expect(I()._isAccountName(v), v).toBe(false));
    ['CC 01 Mastercard Gold', 'PP 2023 Holiday Fund'].forEach(v => expect(I()._isAccountName(v), v).toBe(true));
  });

  it('never takes a Stack\'d backup, a bank statement or an account-number file', () => {
    expect(I().analyzeText('Date;Type;Amount;Account;Category;Note;Tags\n01/02/2026;expense;12,50;Main;Food;x;').kind).toBe('backup');
    expect(I().analyzeText('Data;Descrizione;Importo\n03/01/2026;SUPERMERCATO;-45,90').kind).toBe('bank');
    const iban = 'Konto;Buchungstag;Betrag;Saldo;Verwendungszweck;Kategorie\n' +
      'DE89 3704 0044 0532 0130 00;03.01.2026;-45,90;1200,10;REWE;Lebensmittel\n' +
      'DE89 3704 0044 0532 0130 00;04.01.2026;1850,00;3050,10;Gehalt;Einkommen';
    expect(I().analyzeText(iban).kind).toBe('bank');
    const numbers = 'Account;Date;Amount;Balance;Category\n0012345678;03/01/2026;-45,90;1200,10;Food\n0012345678;04/01/2026;10,00;1210,10;Food';
    expect(I().analyzeText(numbers).kind).toBe('bank');
  });

  it('a bank file with an account name and a running balance is a bank file, in five languages', () => {
    const files = [
      'Data;Conto;Descrizione;Importo;Saldo;Categoria\n03/01/2026;Conto Corrente Arancio;SPESA;-45,90;1200,10;Spesa\n04/01/2026;Conto Corrente Arancio;STIPENDIO;1850,00;3050,10;Stipendio',
      'Konto;Datum;Valuta;Gegenkonto Inhaber;Verwendungszweck;Betrag;Saldo;Kategorie\nGirokonto;03.01.2026;03.01.2026;REWE;Einkauf;-45,90;1200,10;Lebensmittel\nGirokonto;31.03.2026;31.03.2026;;Abschluss;0,00;3004,10;\nGirokonto;04.01.2026;04.01.2026;ACME;Gehalt;1850,00;3050,10;Einkommen',
      'Compte;Date;Libellé;Montant;Solde;Catégorie\nCompte courant;03/01/2026;CARREFOUR;-45,90;1200,10;Courses\nCompte courant;04/01/2026;SALAIRE;1850,00;3050,10;Salaire',
      'Cuenta;Fecha;Concepto;Importe;Saldo;Categoría\nCuenta nómina;03/01/2026;MERCADONA;-45,90;1200,10;Súper\nCuenta nómina;04/01/2026;NÓMINA;1850,00;3050,10;Nómina',
      'Conta;Data;Descrição;Montante;Saldo;Categoria\nConta à ordem;03/01/2026;PINGO DOCE;-45,90;1200,10;Supermercado\nConta à ordem;04/01/2026;ORDENADO;1850,00;3050,10;Salário'
    ];
    files.forEach(f => expect(I().analyzeText(f).kind, f.slice(0, 20)).toBe('bank'));
  });

  it('a running balance opens an account at its earliest row, never at a 0,00 closing row', () => {
    // Title + status make it a ledger anyway; the opening is the balance
    // before the first entry (1200,10 + 45,90).
    const text = 'Account;Date;Amount;Balance;Title;Category;Payment status\n' +
      'Giro;03/01/2026;-45,90;1200,10;Shop;Food;paid\nGiro;04/01/2026;1850,00;3050,10;Salary;Salary;paid\n' +
      'Giro;31/03/2026;0,00;3004,10;Closing;;paid\nGiro;31/03/2026;0,00;3004,10;Saldo;;paid';
    const a = I().analyzeText(text);
    expect(a).toMatchObject({ kind: 'ledger', ledger: { runningBalance: true } });
    const r = commit(text);
    expect(r.skipped).toEqual({ 'extra balance row': 2 });
    expect(S().getAccountOpeningDate(acc('Giro').id)).toBe('2026-01-03');
    expect(bal('Giro')).toBe(3050.1);
  });

  it('a hand-made ledger with running balances and "Saldo iniziale" rows keeps the stated balances', () => {
    const text = 'Conto;Data;Titolo;Categoria;Importo;Saldo\n' +
      'Contanti;01/01/2026;Saldo iniziale;;0,00;300,00\nBanca;01/01/2026;Saldo iniziale;;0,00;2500,00\n' +
      'Banca;02/01/2026;Spesa;Spesa;-250,00;2250,00\nContanti;03/01/2026;Bar;Bar;-1,20;298,80\n' +
      'Banca;05/01/2026;Affitto;Casa;-500,00;1750,00\nContanti;06/01/2026;Cibo;Spesa;-50,00;248,80';
    expect(I().analyzeText(text)).toMatchObject({ kind: 'ledger', ledger: { runningBalance: true } });
    commit(text);
    expect(bal('Contanti')).toBe(248.8);
    expect(bal('Banca')).toBe(1750);
  });

  it('a bank export of several accounts with their running balances is a ledger, not one account', () => {
    const text = 'Conto;Data;Descrizione;Importo;Saldo;Categoria\n' +
      'Conto Corrente;03/01/2026;SPESA;-45,90;1200,10;Spesa\nConto Deposito;03/01/2026;INTERESSI;1,20;5001,20;Interessi\n' +
      'Carta Prepagata;04/01/2026;AMAZON;-20,00;80,00;Shopping\nConto Corrente;05/01/2026;STIPENDIO;1850,00;3050,10;Stipendio';
    expect(I().analyzeText(text).kind).toBe('ledger');
    commit(text);
    expect(S().getState().accounts.map(a => a.name).sort()).toEqual(['Carta Prepagata', 'Conto Corrente', 'Conto Deposito']);
    expect(bal('Conto Corrente')).toBe(3050.1);
    expect(bal('Carta Prepagata')).toBe(80);
  });

  it('daily or sparse balances are a running balance too; an empty balance column is no signal', () => {
    const rows = [];
    for (let d = 1; d <= 4; d++) {
      for (let k = 0; k < 5; k++) {
        rows.push(`0${d}/01/2026;Conto Corrente Arancio;POS ${k};-${k + 1},00;${k === 4 ? (1000 - d * 15) + ',00' : ''};Spesa`);
      }
    }
    expect(I().analyzeText('Data;Conto;Descrizione;Importo;Saldo;Categoria\n' + rows.join('\n')).kind).toBe('bank');
    expect(I().analyzeText('Compte;Date;Libellé;Montant;Solde;Catégorie\nCompte courant;03/01/2026;CARREFOUR;-45,90;;Courses\nCompte courant;04/01/2026;SALAIRE;1850,00;;Salaire').kind).toBe('bank');
  });

  it('a closing "SALDO FINAL" row never opens the account at the end of its history', () => {
    const text = 'Conta;Data;Descrição;Montante;Saldo;Categoria\n' +
      'Conta à ordem;03/01/2026;PINGO DOCE;-45,90;;Supermercado\nConta à ordem;04/01/2026;ORDENADO;1850,00;;Salário\n' +
      'Conta à ordem;31/01/2026;SALDO FINAL;0,00;2804,10;';
    const r = commit(text);
    expect(r.skipped['extra balance row']).toBe(1);
    expect(S().getAccountOpeningDate(acc('Conta à ordem').id)).toBeNull();
    expect(bal('Conta à ordem')).toBe(1804.1);
  });

  it('balance rows with an empty amount, and a trailing delimiter, are still read', () => {
    const r = commit('Account;Date;Amount;Balance;Category\nCash;01/01/2026;;500,00;\nCash;02/01/2026;-5,00;;Food\nBank;01/01/2026;;1000,00;\nBank;02/01/2026;-10,00;;Food');
    expect(r.skippedCount).toBe(0);
    expect([bal('Cash'), bal('Bank')]).toEqual([495, 990]);
    expect(I().analyzeText('Account;Date;Amount;Category;\nCash;01/02/2026;-12,50;Food;\nBank;02/02/2026;1500,00;Salary;').kind).toBe('ledger');
  });

  it('a file listed newest first (each day in entry order) keeps every opening', () => {
    const rows = BASE.slice();
    const toKey = (d) => d.split('/').reverse().join('');
    const sorted = rows.map((r, i) => [r, i]).sort((a, b) => (toKey(b[0].date) > toKey(a[0].date) ? 1 : toKey(b[0].date) < toKey(a[0].date) ? -1 : a[1] - b[1])).map(x => x[0]);
    commit(file(sorted));
    expect(balances()).toEqual(EXPECTED);
  });

  it('running balances on some rows only, several accounts: the opening comes from the first balance', () => {
    const text = 'Conto;Data;Descrizione;Importo;Saldo;Categoria\n' +
      'Conto Corrente;03/01/2026;SPESA;-45,90;;Spesa\nConto Corrente;03/01/2026;BAR;-4,10;1150,00;Bar\n' +
      'Conto Deposito;03/01/2026;INTERESSI;1,20;5001,20;Interessi\nConto Corrente;05/01/2026;STIPENDIO;1850,00;3000,00;Stipendio';
    commit(text);
    expect(bal('Conto Corrente')).toBe(3000);
    expect(bal('Conto Deposito')).toBe(5001.2);
    expect(S().getAccountOpeningDate(acc('Conto Corrente').id)).toBe('2026-01-03');
  });

  it('a hand-made ledger with empty-amount balance rows and one checkpoint balance', () => {
    commit('Account;Date;Amount;Balance;Category\nCash;01/01/2026;;500,00;\nCash;02/01/2026;-5,00;;Food\nCash;03/01/2026;-5,00;490,00;Food\nBank;01/01/2026;;1000,00;\nBank;02/01/2026;-10,00;;Food');
    expect([bal('Cash'), bal('Bank')]).toEqual([490, 990]);
  });

  it('a blank-currency balance row takes its account\'s currency', () => {
    commit(file([{ acc: 'U', date: '01/01/2022', amt: '0,00', saldo: '100,00', title: 'Saldo', ccy: '' },
      { acc: 'U', date: '02/01/2022', amt: '-10,00', cat: 'X', ccy: 'USD' }]));
    expect(S().getState().accounts.filter(a => a.name === 'U')).toHaveLength(1);
    expect(acc('U').currency).toBe('USD');
    expect(bal('U')).toBe(90);
  });

  it('footer rows and empty exports do not make a bank file a ledger', () => {
    expect(I().analyzeText('Conto;Data;Descrizione;Importo;Saldo;Categoria\nConto Corrente Arancio;03/01/2026;SPESA;-45,90;1200,10;Spesa\n' +
      'Conto Corrente Arancio;04/01/2026;STIPENDIO;1850,00;3050,10;Stipendio\nTotale movimenti;;;1804,10;;').kind).toBe('bank');
    expect(I().analyzeText('Konto;Datum;Betrag;Saldo;Kategorie').kind).not.toBe('ledger');
  });

  it('one opening per account: a second balance row with or without its currency is extra', () => {
    const r = commit(file([
      { acc: 'Cash', date: '01/01/2022', amt: '0,00', saldo: '100,00', title: 'Saldo' },
      { acc: 'Cash', date: '01/01/2022', amt: '0,00', saldo: '999,00', title: 'Saldo', ccy: '' },
      { acc: 'Cash', date: '02/01/2022', amt: '-1,00', cat: 'X' }
    ]));
    expect(r.skipped['extra balance row']).toBe(1);
    expect(bal('Cash')).toBe(99);
  });

  it('a Tab-separated ledger and a header-only ledger', () => {
    const tab = file().replace(/"/g, '').replace(/;/g, '\t');
    expect(I().analyzeText(tab).kind).toBe('ledger');
    expect(I().analyzeText(HEADERS.en.join(';')).kind).toBe('ledger');
  });
});

describe('Restore mode is unchanged and never writes a ledger file (1.1.0 IE-2)', () => {
  beforeEach(boot);

  it('importCSV hands a MoneyStats file back unwritten', () => {
    const before = snapshot();
    const writes = setItem.mock.calls.length;
    const { out, err } = restore(file());
    expect(err).toBeNull();
    expect(out).toEqual({ kind: 'ledger', csvText: file(), rowCount: BASE.length });
    expect(snapshot()).toBe(before);
    expect(setItem.mock.calls.length).toBe(writes);
  });

  it('Tab, header-only and CR-only ledgers keep the errors they always had', () => {
    expect(restore(file().replace(/"/g, '').replace(/;/g, '\t')).err.message).toBe('unrecognised file');
    expect(restore(HEADERS.en.join(';')).err.message).toBe('File is empty or missing headers');
    expect(restore(file().replace(/\n/g, '\r')).err.message).toBe('File is empty or missing headers');
  });

  it('commit reads what restore cannot: a Tab ledger lands, a header-only one imports 0', () => {
    expect(commit(HEADERS.en.join(';'))).toMatchObject({ kind: 'ledger', importedCount: 0 });
    expect(S().getState().transactions).toHaveLength(0);
    const r = commit(file().replace(/"/g, '').replace(/;/g, '\t'));
    expect(r.importedCount).toBe(ROWS);
  });
});

describe('Committing a MoneyStats file (1.1.0 IE-2)', () => {
  beforeEach(boot);

  it('creates the accounts with their opening balances and currencies', () => {
    const r = commit(file());
    expect(r.kind).toBe('ledger');
    expect(r.newAccounts).toBe(7);
    expect(r.importedCount).toBe(ROWS);
    expect(r.skippedCount).toBe(0);
    expect(acc('Revolut').currency).toBe('USD');
    expect(acc('Cash').currency).toBe('EUR');
    expect(S().getAccountOpeningDate(acc('Bank').id)).toBe('2021-11-01');
    expect(S().getAccountOpeningDate(acc('Zero').id)).toBe('2022-03-01'); // a 0 opening keeps its date
    expect(S().getAccountOpeningDate(acc('Revolut').id)).toBeNull();
  });

  it('balances: paid rows only, none after today, none before an opening', () => {
    commit(file());
    expect(balances()).toEqual(EXPECTED);
  });

  it('pairs every transfer: either leg first, six rows on one day, legs apart, across currencies', () => {
    const r = commit(file());
    const legs = S().getState().transactions.filter(t => t.transferRef);
    expect(legs).toHaveLength(2 * PAIRS);
    expect(new Set(legs.map(t => t.transferRef)).size).toBe(PAIRS);
    legs.forEach(t => expect(t.categoryId).toBe(''));
    const byRef = {};
    legs.forEach(t => { (byRef[t.transferRef] = byRef[t.transferRef] || []).push(t); });
    Object.values(byRef).forEach(([a, b]) => {
      expect(a.accountId).not.toBe(b.accountId);
      expect(a.date).toBe(b.date);
      expect([a.type, b.type].sort()).toEqual(['expense', 'income']);
    });
    const cross = legs.find(t => t.accountId === acc('Revolut').id);
    const other = legs.find(t => t.transferRef === cross.transferRef && t !== cross);
    expect([cross.amount, other.amount]).toEqual([110, 100]);
    expect(r.ledger.transfers).toEqual({ paired: PAIRS, unpaired: 0,
      categories: [{ key: 'trasferimento', name: 'Trasferimento', learned: false, off: false, pairs: PAIRS }] });
  });

  it('cross-currency legs pair only as their counterpart columns say, also when apart', () => {
    // Stack'd's export writes the other leg's amount and currency in 13/14.
    const rows = [
      tr('Revolut', '12/12/2021', '-110,00', { ccy: 'USD', ccy2: 'EUR', amt2: '100,00' }),
      tr('Bank', '12/12/2021', '30,00'), tr('Cash', '12/12/2021', '-30,00'),
      tr('Bank', '12/12/2021', '100,00', { ccy2: 'USD', amt2: '-110,00' })
    ];
    const r = commit(file(rows));
    expect(r.ledger.transfers).toMatchObject({ paired: 2, unpaired: 0 });
    const rev = txsOf('Revolut')[0];
    const partner = S().getState().transactions.find(t => t.transferRef === rev.transferRef && t !== rev);
    expect(partner.amount).toBe(100);
  });

  it('unproven cross-currency neighbours never take a same-currency partner', () => {
    const rows = [tr('AEUR', '05/01/2024', '-100,00'), tr('BUSD', '05/01/2024', '200,00', { ccy: 'USD' }),
      tr('CEUR', '05/01/2024', '-180,00'), tr('DEUR', '05/01/2024', '100,00')];
    commit(file(rows));
    const a = txsOf('AEUR')[0];
    expect(S().getState().transactions.find(t => t.transferRef === a.transferRef && t !== a).accountId).toBe(acc('DEUR').id);
  });

  it('same-currency partners win in a group, whatever the file order', () => {
    const rows = [tr('Bus', '05/01/2024', '100,00', { ccy: 'USD' }), { acc: 'X', date: '05/01/2024', amt: '-1,00', cat: 'Food' },
      tr('Main', '05/01/2024', '-100,00'), { acc: 'X', date: '05/01/2024', amt: '-2,00', cat: 'Food' }, tr('Sav', '05/01/2024', '100,00')];
    commit(file(rows));
    const m = txsOf('Main')[0];
    expect(S().getState().transactions.find(t => t.transferRef === m.transferRef && t !== m).accountId).toBe(acc('Sav').id);
  });

  it('an account-sorted day of 500 same-amount transfers is matched fast', () => {
    const rows = [];
    for (let k = 0; k < 250; k++) rows.push(tr('In' + (k % 5), '06/12/2021', '10,00'));
    for (let k = 0; k < 250; k++) rows.push(tr('Out' + (k % 5), '06/12/2021', '-10,00'));
    const read = I()._readTextAuto(file(rows));
    const t0 = Date.now();
    const conv = I().ledgerToRows(read, I()._ledgerShape(read.rows));
    expect(conv.facts.transfers.paired).toBe(250);
    expect(Date.now() - t0).toBeLessThan(1500);
  });

  it('a big same-day group (20 rows, sorted by account) is fully paired', () => {
    const rows = [];
    for (let k = 0; k < 10; k++) rows.push(tr('A', '06/12/2021', '-50,00'));
    for (let k = 0; k < 10; k++) rows.push(tr('B', '06/12/2021', '50,00'));
    const t0 = Date.now();
    const r = commit(file(rows));
    expect(r.ledger.transfers).toMatchObject({ paired: 10, unpaired: 0 });
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('a lopsided 16-row group is matched quickly', () => {
    const rows = [];
    for (let k = 0; k < 10; k++) rows.push({ acc: 'A' + k, date: '06/12/2021', amt: '5,00', cat: 'Rimborsi' });
    for (let k = 0; k < 6; k++) rows.push({ acc: 'B' + k, date: '06/12/2021', amt: '-5,00', cat: 'Rimborsi' });
    const t0 = Date.now();
    I().ledgerToRows(I()._readTextAuto(file(rows)), I()._ledgerShape(I()._readTextAuto(file(rows)).rows));
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it('the six same-day rows pair correctly even when the file is sorted by account', () => {
    // Neighbours would pair A→C and strand both legs of the middle account.
    const rows = [tr('A', '06/12/2021', '-50,00'), tr('C', '06/12/2021', '50,00'),
      tr('B', '06/12/2021', '50,00'), tr('B', '06/12/2021', '-50,00')];
    const r = commit(file(rows));
    expect(r.ledger.transfers.paired).toBe(2);
    const legs = S().getState().transactions.filter(t => t.transferRef);
    expect(legs).toHaveLength(4);
    const partner = (name) => {
      const leg = txsOf(name)[0];
      return S().getState().accounts.find(a => a.id === legs.find(t => t.transferRef === leg.transferRef && t !== leg).accountId).name;
    };
    expect(partner('A')).toBe('B');
    expect(partner('C')).toBe('B');
  });

  it('an empty currency cell never makes a transfer of two different amounts', () => {
    const rows = [tr('Cash', '01/02/2022', '50,00', { ccy: '', ccy2: 'EUR' }), tr('Bank', '01/02/2022', '-40,00', { ccy: '', ccy2: 'EUR' })];
    const r = commit(file(rows));
    expect(r.ledger.transfers.paired).toBe(0);
    expect(r.ledger.transfers.unpaired).toBe(2);
  });

  it('a one-sided "Trasferimenti …" category stays plain; a lone transfer row stays a plain row', () => {
    commit(file());
    const mia = txsOf('Bank').filter(t => catName(t.categoryId) === 'Trasferimenti Mia');
    expect(mia).toHaveLength(2);
    mia.forEach(t => expect(t.transferRef).toBeUndefined());
    boot();
    const r = commit(file([tr('Cash', '01/02/2022', '50,00')]));
    expect(r.ledger.transfers).toMatchObject({ paired: 0, unpaired: 1 });
    expect(catName(txsOf('Cash')[0].categoryId)).toBe('Trasferimento');
  });

  it('a category that only mostly pairs up (< 90%) is not learned as transfers', () => {
    const rows = [];
    for (let d = 1; d <= 5; d++) {
      rows.push({ acc: 'Cash', date: '0' + d + '/03/2022', amt: d + '0,00', cat: 'Rimborsi' });
      rows.push({ acc: 'Bank', date: '0' + d + '/03/2022', amt: '-' + d + '0,00', cat: 'Rimborsi' });
    }
    rows.push({ acc: 'Cash', date: '10/03/2022', amt: '7,00', cat: 'Rimborsi' });
    rows.push({ acc: 'Cash', date: '11/03/2022', amt: '8,00', cat: 'Rimborsi' });
    const r = commit(file(rows));
    expect(r.ledger.transfers.paired).toBe(0);
    expect(S().getState().transactions.filter(t => t.transferRef)).toHaveLength(0);
  });

  it('a transfer next to a plain row of the same account, day and amount', () => {
    commit(file());
    const day = txsOf('Card').filter(t => t.date === '2024-02-10');
    expect(day).toHaveLength(2);
    expect(day.filter(t => t.transferRef)).toHaveLength(1);
    expect(catName(day.find(t => !t.transferRef).categoryId)).toBe('Regali');
  });

  it('categories: Categoria, else Titolo; a different Titolo goes into the note', () => {
    const r = commit(file());
    expect(catName(txsOf('Cash').find(t => t.amount === 2.5).categoryId)).toBe('Giochi');
    const crema = txsOf('Bank').find(t => t.amount === 9.36);
    expect(catName(crema.categoryId)).toBe('Bellezza');
    expect(crema.comment).toBe('Mediche — Crema');
    expect(txsOf('Bank').find(t => t.amount === 100).categoryId).toBe('');
    expect(txsOf('Bank').find(t => t.amount === 25.33).comment).toBe('Vetri; protezione');
    expect(r.newCategories).toBe(10); // Shopping is a built-in one
  });

  it('a category map renames file categories (Review\'s suggestions)', () => {
    commit(file(), { categoryMap: { 'Supermercato e alimentari': 'Groceries', 'Giochi': '' } });
    expect(catName(txsOf('Bank').find(t => t.amount === 45).categoryId)).toBe('Groceries');
    expect(txsOf('Cash').find(t => t.amount === 2.5).categoryId).toBe('');
    expect(S().getState().categories.some(c => c.name === 'Supermercato e alimentari')).toBe(false);
  });

  it('tags are folded into the app\'s own form; tags with nothing left are reported', () => {
    const r = commit(file());
    expect(txsOf('Bank').find(t => t.amount === 25.33).tags).toEqual(['elettronica-e-accessori']);
    expect(txsOf('Cash').find(t => t.amount === 4).tags).toEqual(['natale', 'regali-margarida-mia']);
    expect(txsOf('Bank').find(t => t.amount === 2363.58).tags).toEqual(['recibo-de-vencimento']);
    expect(r.ledger.tagRenames).toEqual(expect.arrayContaining([{ from: 'Elettronica e Accessori', to: 'elettronica-e-accessori' }]));
    expect(r.ledger.tagsDropped).toEqual([]);
    boot();
    const r2 = commit(file([{ acc: 'Cash', date: '01/02/2022', amt: '-1,00', cat: 'X', tags: 'Пример | 🎉 | ok | Пример' }]));
    expect(txsOf('Cash')[0].tags).toEqual(['ok']);
    expect(r2.ledger.tagsDropped).toEqual([{ from: 'Пример', rows: 1 }, { from: '🎉', rows: 1 }]);
  });

  it('a 0,00 row with no balance word is skipped as a zero amount', () => {
    const r = commit(file([{ acc: 'Cash', date: '01/02/2022', amt: '0,00', saldo: '0,00' }, { acc: 'Cash', date: '02/02/2022', amt: '-1,00', cat: 'X' }]));
    expect(r.skipped['zero amount']).toBe(1);
    expect(S().getAccountOpeningDate(acc('Cash').id)).toBeNull();
  });

  it('payment status: whole cells only; an unknown word is unpaid until Review says otherwise', () => {
    const r = commit(file());
    expect(txsOf('Bank').find(t => t.amount === 12).isPaid).toBe(false); // non pagato ⊃ pagato
    expect(txsOf('Bank').find(t => t.amount === 7).isPaid).toBe(false); // in sospeso
    expect(txsOf('Bank').find(t => t.amount === 25.33).isPaid).toBeUndefined();
    expect(r.ledger.unknownStatuses).toEqual([{ key: 'in sospeso', value: 'in sospeso', rows: 1 }]);
    boot();
    commit(file(), { statusMap: { 'in sospeso': true } });
    expect(txsOf('Bank').find(t => t.amount === 7).isPaid).toBeUndefined();
  });

  it('reads all twelve paid/unpaid words of MoneyStats exactly', () => {
    const words = { pagato: true, paid: true, bezahlt: true, pago: true, pagado: true, 'payé': true,
      'non pagato': false, 'not paid': false, 'nicht bezahlt': false, 'não pago': false, 'no pagado': false, 'impayé': false };
    const rows = Object.keys(words).map((w, i) => ({ acc: 'Cash', date: '0' + ((i % 9) + 1) + '/01/2022', amt: '-' + (i + 1) + ',00', cat: 'X', status: w }));
    const r = commit(file(rows));
    expect(r.ledger.unknownStatuses).toEqual([]);
    Object.entries(words).forEach(([w, paid], i) => {
      const t = txsOf('Cash').find(x => x.amount === i + 1);
      expect(t.isPaid !== false, w).toBe(paid);
    });
  });

  it('facts for the Review screen: the file, and what landed', () => {
    const r = commit(file());
    expect(r.ledger).toMatchObject({
      layout: 'header', decimal: 'comma', factor: 1, rowCount: BASE.length, planned: 1,
      dateOrder: { order: 'dmy', ambiguous: false }, dateRange: { from: '2021-11-01', to: '2099-02-28' }
    });
    const f = (n) => r.ledger.accounts.find(a => a.name === n);
    expect(f('Cash')).toMatchObject({ currency: 'EUR', opening: 313.6, openingDate: '2021-11-01', balance: EXPECTED.Cash });
    expect(f('Zero')).toMatchObject({ opening: 0, openingDate: '2022-03-01', balance: -3 });
    expect(f('Revolut')).toMatchObject({ currency: 'USD', opening: null, balance: -110 });
    const after = (n) => r.ledger.after.find(a => a.name === n);
    expect(after('Cash')).toMatchObject({ found: true, existed: false, opening: 313.6, openingDate: '2021-11-01', balance: EXPECTED.Cash });
    expect(after('Bank').rowsAdded).toBe(txsOf('Bank').filter(t => t.type !== 'opening_balance').length);
    expect(r.ledger.after.map(a => a.balance)).toEqual(r.ledger.after.map(a => EXPECTED[a.name]));
  });

  it('keeps the file\'s order within a day', () => {
    commit(file());
    const day = txsOf('Bank').filter(t => t.date === '2021-11-01' && t.type !== 'opening_balance');
    const ordered = [...day].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(t => t.amount);
    expect(ordered).toEqual([25.33, 100]);
  });

  it('settings: date order, amount factor, transfers off, one transfer category off', () => {
    commit(file([{ acc: 'Cash', date: '01/02/2022', amt: '-1,00', cat: 'X' }]), { dateOrder: 'mdy' });
    expect(txsOf('Cash')[0].date).toBe('2022-01-02');
    boot();
    commit(file([{ acc: 'Cash', date: '01/02/2022', amt: '-1,00', cat: 'X' }]), { factor: -1 });
    expect(txsOf('Cash')[0].type).toBe('income');
    boot();
    const r = commit(file(), { transfers: false });
    expect(S().getState().transactions.filter(t => t.transferRef)).toHaveLength(0);
    expect(r.ledger.transfers.paired).toBe(0);
    expect(catName(txsOf('Cash').find(t => t.amount === 50).categoryId)).toBe('Trasferimento');
    boot();
    const r2 = commit(file(), { transferCategories: { trasferimento: false } });
    expect(r2.ledger.transfers.paired).toBe(0);
    // switched off, but still listed for Review's switch
    expect(r2.ledger.transfers.categories).toEqual([{ key: 'trasferimento', name: 'Trasferimento', learned: false, off: true, pairs: PAIRS }]);
  });

  it('a learned transfer category, also when its legs are not next to each other; and its switch', () => {
    const rows = [];
    for (let d = 1; d <= 5; d++) {
      rows.push({ acc: 'Cash', date: '0' + d + '/03/2022', amt: d + '0,00', cat: 'Giro' });
      rows.push({ acc: 'Cash', date: '0' + d + '/03/2022', amt: '-1,00', cat: 'Spesa' });
      rows.push({ acc: 'Bank', date: '0' + d + '/03/2022', amt: '-' + d + '0,00', cat: 'Giro' });
    }
    const r = commit(file(rows, 'en'));
    expect(r.ledger.transfers.categories).toEqual([{ key: 'giro', name: 'Giro', learned: true, off: false, pairs: 5 }]);
    expect(S().getState().transactions.filter(t => t.transferRef)).toHaveLength(10);
    boot();
    const off = commit(file(rows, 'en'), { transferCategories: { giro: false } });
    expect(off.ledger.transfers.paired).toBe(0);
    expect(catName(txsOf('Bank')[0].categoryId)).toBe('Giro');
  });

  it('an English file of the same data lands the same balances', () => {
    commit(file(BASE, 'en'));
    expect(balances()).toEqual(EXPECTED);
  });
});

describe('Ledger dedup (1.1.0 IE-2)', () => {
  beforeEach(boot);

  it('importing the same file again adds nothing', () => {
    commit(file());
    const n = S().getState().transactions.length;
    const r = commit(file());
    expect(r.importedCount).toBe(0);
    expect(r.duplicateCount).toBe(ROWS);
    expect(r.newAccounts).toBe(0);
    expect(r.openingsKept).toBe(5);
    expect(r.skippedCount).toBe(0);
    expect(S().getState().transactions.length).toBe(n);
    expect(balances()).toEqual(EXPECTED);
  });

  it('a later file with one more same-day, same-amount transfer adds exactly that pair', () => {
    commit(file());
    const later = BASE.slice();
    const at = later.findIndex(r => r.date === '06/12/2021');
    later.splice(at, 0, tr('Cash', '06/12/2021', '200,00'), tr('Bank', '06/12/2021', '-200,00'));
    const r = commit(file(later));
    expect(r.importedCount).toBe(2);
    const added = S().getState().transactions.filter(t => t.date === '2021-12-06');
    expect(added).toHaveLength(8);
    expect(new Set(added.map(t => t.transferRef)).size).toBe(4);
  });

  it('one leg already here from a bank statement (same note): that leg is a duplicate, the other lands', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 500, openingDate: '2021-01-01', currency: 'EUR' });
    S().dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: [{ type: 'expense', amount: 50, accountId: acc('Bank').id,
      categoryId: '', date: '2021-11-14', comment: '', importKey: 'fp:' + acc('Bank').id + '|2021-11-14|expense|5000|' }] });
    const r = commit(file([tr('Cash', '14/11/2021', '50,00'), tr('Bank', '14/11/2021', '-50,00')]));
    expect(r.duplicateCount).toBe(1);
    expect(r.importedCount).toBe(1);
    expect(txsOf('Cash')).toHaveLength(1);
    expect(txsOf('Cash')[0]).toMatchObject({ type: 'income', amount: 50 });
    expect(txsOf('Cash')[0].transferRef).toBeUndefined();
    expect(bal('Bank')).toBe(450);
  });

  it('a bank row with the bank\'s own description: matched by its shape while uncategorised', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 500, openingDate: '2021-01-01', currency: 'EUR' });
    S().dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: [{ type: 'expense', amount: 50, accountId: acc('Bank').id,
      categoryId: '', date: '2021-11-14', comment: 'BONIFICO A CASH', importKey: 'fp:' + acc('Bank').id + '|2021-11-14|expense|5000|bonifico' }] });
    const r = commit(file([tr('Cash', '14/11/2021', '50,00'), tr('Bank', '14/11/2021', '-50,00')]));
    expect(r.duplicateCount).toBe(1);
    expect(r.importedCount).toBe(1);
    expect(bal('Bank')).toBe(450);
  });

  it('…but not once the user categorised it (IE-6 Review lists it as a possible duplicate)', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 500, openingDate: '2021-01-01', currency: 'EUR' });
    S().dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: [{ type: 'expense', amount: 50, accountId: acc('Bank').id,
      categoryId: 'cat_other', date: '2021-11-14', comment: 'BONIFICO A CASH', importKey: 'fp:' + acc('Bank').id + '|2021-11-14|expense|5000|bonifico' }] });
    const r = commit(file([tr('Cash', '14/11/2021', '50,00'), tr('Bank', '14/11/2021', '-50,00')]));
    expect(r.importedCount).toBe(2);
    expect(r.duplicateCount).toBe(0);
  });

  it('a stored transfer sharing one leg with the file\'s pair is a different transfer: both legs land', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 500, openingDate: '2021-01-01', currency: 'EUR' });
    S().dispatch('ADD_ACCOUNT', { name: 'Card', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' });
    S().dispatch('ADD_TRANSFER', { amount: 50, expenseAccountId: acc('Bank').id, incomeAccountId: acc('Card').id, date: '2021-11-14', note: '' });
    expect(S().getState().transactions.filter(t => t.transferRef)).toHaveLength(2);
    const r = commit(file([tr('Cash', '14/11/2021', '50,00'), tr('Bank', '14/11/2021', '-50,00')]));
    expect(r.importedCount).toBe(2);
    expect(bal('Bank')).toBe(400);
  });

  it('an account deleted after the import: a re-import leaves the other accounts\' balances alone', () => {
    commit(file());
    S().dispatch('DELETE_ACCOUNT', { id: acc('Card').id });
    const kept = balances();
    const chk = I().checkText(file());
    const r = commit(file());
    expect(chk.result).toEqual(r);
    ['Cash', 'Bank', 'Zero', 'Revolut', 'N26', 'Coverflex'].forEach(n => expect(bal(n), n).toBe(kept[n]));
    expect(acc('Card')).toBeTruthy(); // the file brings it back
  });

  it('a NEW transfer never loses a leg to an unrelated row of the same account, day and amount', () => {
    // An uncategorised row from an earlier ledger import, and a categorised
    // row with an empty note: neither is provably a transfer leg.
    commit(file([{ acc: 'Bank', date: '14/11/2021', amt: '-50,00', title: '', note: 'Corso di yoga' },
      { acc: 'Cash', date: '14/11/2021', amt: '50,00', cat: 'Regali' }]));
    const r = commit(file([tr('Cash', '14/11/2021', '50,00'), tr('Bank', '14/11/2021', '-50,00')]));
    expect(r.importedCount).toBe(2);
    expect(r.duplicateCount).toBe(0);
  });

  it('a new plain row with an empty note is never swallowed by a stored transfer leg', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 500, openingDate: '2021-01-01', currency: 'EUR' });
    S().dispatch('ADD_ACCOUNT', { name: 'Card', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' });
    S().dispatch('ADD_TRANSFER', { amount: 50, expenseAccountId: acc('Bank').id, incomeAccountId: acc('Card').id, date: '2021-11-14', note: '' });
    const r = commit(file([{ acc: 'Bank', date: '14/11/2021', amt: '-50,00', title: 'Casa', cat: 'Casa' }]));
    expect(r.importedCount).toBe(1);
    expect(bal('Bank')).toBe(400);
  });

  it('after a deleted account (in French), re-importing twice changes nothing more', () => {
    commit(file());
    S().dispatch('SET_LANGUAGE', 'fr');
    S().dispatch('DELETE_ACCOUNT', { id: acc('Card').id });
    const kept = balances();
    commit(file());
    const once = balances();
    const r = commit(file());
    expect(r.importedCount).toBe(0);
    expect(balances()).toEqual(once);
    ['Cash', 'Bank', 'Zero', 'Revolut', 'N26', 'Coverflex'].forEach(n => expect(once[n], n).toBe(kept[n]));
  });

  it('deleted-account leftovers are recognised by their note even once categorised', () => {
    commit(file());
    S().dispatch('DELETE_ACCOUNT', { id: acc('Card').id });
    const leftovers = S().getState().transactions.filter(t => /deleted account/.test(t.comment || ''));
    expect(leftovers.length).toBeGreaterThan(0);
    leftovers.forEach(t => S().dispatch('UPDATE_TRANSACTION', { ...t, categoryId: 'cat_other' }));
    const kept = balances();
    commit(file());
    ['Cash', 'Bank', 'Zero', 'Revolut', 'N26', 'Coverflex'].forEach(n => expect(bal(n), n).toBe(kept[n]));
  });

  it('case variants of a name: each file account reports its own rows and where they went', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' });
    const r = commit(file([{ acc: 'Cash', date: '01/02/2022', amt: '-1,00', cat: 'X' }, { acc: 'cash', date: '02/02/2022', amt: '-2,00', cat: 'X' },
      { acc: 'cash', date: '03/02/2022', amt: '-3,00', cat: 'X' }]));
    const after = r.ledger.after;
    expect(after.find(a => a.name === 'Cash')).toMatchObject({ account: 'Cash', existed: true, rowsAdded: 1 });
    expect(after.find(a => a.name === 'cash')).toMatchObject({ account: 'Cash', existed: true, rowsAdded: 2 });
    expect(after.reduce((s, a) => s + a.rowsAdded, 0)).toBe(r.importedCount);
  });

  it('an account that already exists keeps its opening balance (counted, not skipped)', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 500, openingDate: '2021-01-01', currency: 'EUR' });
    const r = commit(file());
    expect(r.openingsKept).toBe(1);
    expect(r.openingsKeptAccounts).toEqual(['Bank']);
    expect(r.skipped['opening balance rows are owned by the account']).toBeUndefined();
    expect(S().getAccountOpeningDate(acc('Bank').id)).toBe('2021-01-01');
    expect(r.newAccounts).toBe(6);
    expect(r.ledger.after.find(a => a.name === 'Bank')).toMatchObject({ existed: true, opening: 500, openingDate: '2021-01-01', balance: bal('Bank') });
  });
});

describe('Check = the real import inside Store.dryRun (1.1.0 IE-2)', () => {
  beforeEach(boot);

  const scenarios = {
    'an empty install': () => {},
    'a same-named account': () => S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' }),
    'the same name in another currency': () => S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, currency: 'USD' }),
    'case-variant names': () => S().dispatch('ADD_ACCOUNT', { name: 'bank', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' }),
    'twin rows (one already here)': () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Cash', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' });
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 1.4, accountId: acc('Cash').id, categoryId: '', date: '2021-11-20', comment: '' });
    },
    'a re-import': () => commit(file()),
    'a partial overlap': () => commit(file(BASE.slice(0, 15))),
    'a bank-imported leg': () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' });
      S().dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', { transactions: [{ type: 'expense', amount: 50, accountId: acc('Bank').id,
        categoryId: '', date: '2021-11-14', comment: 'BONIFICO', importKey: 'fp:' + acc('Bank').id + '|2021-11-14|expense|5000|bonifico' }] });
    },
    'a manual look-alike row': () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' });
      S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 50, accountId: acc('Bank').id, categoryId: '', date: '2021-11-14', comment: '' });
    },
    'a stored pair sharing one leg': () => {
      S().dispatch('ADD_ACCOUNT', { name: 'Bank', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' });
      S().dispatch('ADD_ACCOUNT', { name: 'Card', openingBalance: 0, openingDate: '2021-01-01', currency: 'EUR' });
      S().dispatch('ADD_TRANSFER', { amount: 50, expenseAccountId: acc('Bank').id, incomeAccountId: acc('Card').id, date: '2021-11-14', note: '' });
    },
    'a deleted account': () => { commit(file()); S().dispatch('DELETE_ACCOUNT', { id: acc('Card').id }); }
  };
  Object.entries(scenarios).forEach(([name, setup]) => {
    it('Check counts and figures equal Import\'s, and Check writes nothing: ' + name, () => {
      setup();
      const before = snapshot();
      const writes = setItem.mock.calls.length;
      const chk = I().checkText(file());
      expect(chk.kind).toBe('ledger');
      expect(chk.error).toBeUndefined();
      expect(snapshot()).toBe(before);
      expect(setItem.mock.calls.length).toBe(writes);
      const real = commit(file());
      expect(chk.result).toEqual(real);
      real.ledger.after.filter(a => a.found).forEach(a => {
        const live = S().getState().accounts.find(x => x.name.trim() === a.account && (!a.currency || x.currency === a.currency));
        expect(a.balance, a.name).toBe(Math.round(S().getAccountBalance(live.id) * 100) / 100 || 0);
      });
    });
  });

  it('Check passes the settings through', () => {
    const chk = I().checkText(file(), { transfers: false, factor: -1 });
    expect(chk.result.ledger.transfers.paired).toBe(0);
    expect(chk.result.ledger.factor).toBe(-1);
  });

  it('Check of a non-ledger text is analyzeText', () => {
    expect(I().checkText('Data;Descrizione;Importo\n03/01/2026;X;-1,00').kind).toBe('bank');
  });
});

describe('Store.dryRun (1.1.0 IE-2)', () => {
  beforeEach(boot);

  it('takes back every change and every write, and queues no render', async () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 10, openingDate: '2026-01-01', currency: 'EUR' });
    await Promise.resolve();
    const before = snapshot();
    const writes = setItem.mock.calls.length;
    const listener = vi.fn();
    S().subscribe(listener);
    const out = S().dryRun(() => {
      S().dispatch('ADD_ACCOUNT', { name: 'Other', openingBalance: 5, openingDate: '2026-01-01', currency: 'EUR' });
      S().dispatch('ADD_CATEGORY', { name: 'Temp', icon: 'pin', typeHint: 'both' });
      S().dispatch('SET_DEFAULT_ACCOUNT', acc('Other').id);
      return S().getState().accounts.length;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(out).toBe(2);
    expect(snapshot()).toBe(before);
    expect(setItem.mock.calls.length).toBe(writes);
    expect(listener).not.toHaveBeenCalled();
  });

  it('a categories-only run leaves memory exactly as it was (order included)', () => {
    const before = snapshot();
    S().dryRun(() => S().dispatch('ADD_CATEGORY', { name: 'Aaa', icon: 'pin', typeHint: 'both' }));
    expect(snapshot()).toBe(before);
  });

  it('a throw inside is rethrown after the restore', () => {
    const before = snapshot();
    expect(() => S().dryRun(() => {
      S().dispatch('ADD_ACCOUNT', { name: 'Other', openingBalance: 5, currency: 'EUR' });
      throw new Error('boom');
    })).toThrow('boom');
    expect(snapshot()).toBe(before);
    expect(window.StackdDB._dry).toBeNull();
    expect(window.StackdDB._journal).toBeNull();
  });

  it('refuses to run inside a change, and leaves a render already queued alone', async () => {
    expect(() => S().batch(() => S().dryRun(() => 1))).toThrow('dryRun inside a change');
    const listener = vi.fn();
    S().subscribe(listener);
    S().dispatch('ADD_CATEGORY', { name: 'Real', icon: 'pin', typeHint: 'both' }); // queues a render
    S().dryRun(() => S().dispatch('ADD_CATEGORY', { name: 'Fake', icon: 'pin', typeHint: 'both' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(S().getState().categories.some(c => c.name === 'Real')).toBe(true);
    expect(S().getState().categories.some(c => c.name === 'Fake')).toBe(false);
  });

  it('a real save failure not shown yet survives a Check: its sheet still appears', async () => {
    const show = vi.fn();
    window.Components = { NoticeSheet: { show } };
    const quota = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    setItem.mockImplementationOnce(() => { throw quota; });
    expect(S().dispatch('ADD_CATEGORY', { name: 'Big', icon: 'pin', typeHint: 'both' })).toBe(false);
    I().checkText(file());
    await new Promise(r => setTimeout(r, 0));
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0][0].id).toBe('storage-full-modal');
  });
});

describe('BATCH_IMPORT_TRANSACTIONS keepOrder (1.1.0 IE-2)', () => {
  beforeEach(boot);

  it('stamps createdAt in payload order; without it rows share one stamp', () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0, currency: 'EUR' });
    const id = acc('Main').id;
    const mk = (n) => ({ type: 'expense', amount: n, accountId: id, categoryId: '', date: '2026-01-05', comment: '' });
    S().dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: [mk(3), mk(1), mk(2)], keepOrder: true });
    const got = S().getState().transactions.filter(t => t.date === '2026-01-05')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(t => t.amount);
    expect(got).toEqual([3, 1, 2]);
    S().dispatch('BATCH_IMPORT_TRANSACTIONS', { transactions: [mk(7), mk(8)] });
    const plain = S().getState().transactions.filter(t => t.amount === 7 || t.amount === 8);
    expect(plain[0].createdAt).toBe(plain[1].createdAt);
  });
});
