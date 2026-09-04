import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Same executeFile pattern as store.test.js — src/*.js are globals, not modules.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

// camt.053 sample: OPBD 1000.00 → −45.90 + 850.00 → CLBD 1804.10 (consistent,
// so the reconciliation integration test can assert an exact match).
const CAMT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt>
  <Stmt>
   <Acct><Id><IBAN>IT60X0542811101000000123456</IBAN></Id></Acct>
   <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-01-01</Dt></Dt></Bal>
   <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">1804.10</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-01-31</Dt></Dt></Bal>
   <Ntry>
    <Amt Ccy="EUR">45.90</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-01-03</Dt></BookgDt><ValDt><Dt>2026-01-03</Dt></ValDt>
    <AcctSvcrRef>REF-001</AcctSvcrRef>
    <NtryDtls><TxDtls>
      <Refs><EndToEndId>E2E-XYZ</EndToEndId></Refs>
      <RltdPties><Cdtr><Nm>SUPERMERCATO ROSSI</Nm></Cdtr></RltdPties>
      <RmtInf><Ustrd>Spesa settimanale</Ustrd></RmtInf>
    </TxDtls></NtryDtls>
   </Ntry>
   <Ntry>
    <Amt Ccy="EUR">850.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
    <BookgDt><Dt>2026-01-05</Dt></BookgDt>
    <NtryDtls><TxDtls>
      <Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs>
    </TxDtls></NtryDtls>
    <AddtlNtryInf>BONIFICO STIPENDIO</AddtlNtryInf>
   </Ntry>
  </Stmt>
 </BkToCstmrStmt>
</Document>`;

// The same statement as MT940, SWIFT-enveloped, with structured and plain :86:.
const MT940_TEXT = [
  '{1:F01BANKDEFF0000000000}{2:O940BANKDEFF}{4:',
  ':20:STMT-2026-01',
  ':25:DE89370400440532013000',
  ':28C:1/1',
  ':60F:C260101EUR1000,00',
  ':61:2601030103D45,90NTRFRECEIPT-77//BK-REF-1',
  ':86:?32SUPERMERCATO ROSSI?20Spesa settimanale?21 gennaio',
  ':61:260105C850,00NTRFNONREF//BANK-XYZ',
  ':86:BONIFICO STIPENDIO',
  'GENNAIO 2026',
  ':62F:C260131EUR1804,10',
  '-}'
].join('\n');

describe('Statement import: camt.053 + MT940 (v1.00)', () => {
  let seedAccount;

  beforeEach(() => {
    let uid = 0;
    global.window = {
      crypto: { randomUUID: () => 'uuid-' + (++uid) },
      localStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }
    };
    global.localStorage = global.window.localStorage;
    // jsdom provides DOMParser on globalThis; the executed sources reference it
    // as a bare global, same as in the browser.
    global.window.DOMParser = global.DOMParser;

    executeFile('db.js');
    executeFile('i18n.js');
    executeFile('i18n/en.js');
    executeFile('store.js');
    executeFile('import.js');

    global.window.Store.init();

    seedAccount = () => {
      window.Store.dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 0 });
      return window.Store.getState().accounts[0].id;
    };
  });

  // ── sniffFormat ────────────────────────────────────────────────────────────

  describe('sniffFormat', () => {
    it('routes by content, not extension', () => {
      const S = window.StackdImport;
      expect(S.sniffFormat(CAMT_XML)).toBe('camt');
      expect(S.sniffFormat('﻿' + CAMT_XML)).toBe('camt');
      expect(S.sniffFormat(MT940_TEXT)).toBe('mt940');
      expect(S.sniffFormat(':20:X\n:60F:C260101EUR1,00\n:62F:C260101EUR1,00')).toBe('mt940');
      expect(S.sniffFormat('Data;Descrizione;Importo\n03/01/2026;X;-1,00')).toBe('csv');
      expect(S.sniffFormat('Date,Amount\n2026-01-01,5')).toBe('csv');
    });
  });

  // ── parseCamt ──────────────────────────────────────────────────────────────

  describe('parseCamt', () => {
    it('extracts entries, balances and currency from a camt.053 file', () => {
      const st = window.StackdImport.parseCamt(CAMT_XML);

      expect(st.format).toBe('camt');
      expect(st.currency).toBe('EUR');
      expect(st.openingBalance).toEqual({ amount: 1000, date: '2026-01-01' });
      expect(st.closingBalance).toEqual({ amount: 1804.10, date: '2026-01-31' });

      expect(st.entries).toHaveLength(2);
      expect(st.entries[0]).toEqual({
        date: '2026-01-03',
        description: 'SUPERMERCATO ROSSI — Spesa settimanale',
        type: 'expense',
        amount: 45.90,
        bankRef: 'REF-001' // AcctSvcrRef wins over EndToEndId
      });
      // NOTPROVIDED EndToEndId means "no reference"; description falls back
      // to the bank's AddtlNtryInf when no party/remittance exists.
      expect(st.entries[1]).toEqual({
        date: '2026-01-05',
        description: 'BONIFICO STIPENDIO',
        type: 'income',
        amount: 850,
        bankRef: ''
      });
    });

    it('accepts camt.052 (Rpt) and DBIT-signed balances', () => {
      const rpt = CAMT_XML
        .replace(/BkToCstmrStmt/g, 'BkToCstmrAcctRpt')
        .replace(/<Stmt>/, '<Rpt>').replace(/<\/Stmt>/, '</Rpt>')
        .replace('<Amt Ccy="EUR">1000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Dt><Dt>2026-01-01</Dt></Dt>',
          '<Amt Ccy="EUR">1000.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Dt><Dt>2026-01-01</Dt></Dt>');
      const st = window.StackdImport.parseCamt(rpt);
      expect(st.entries).toHaveLength(2);
      expect(st.openingBalance).toEqual({ amount: -1000, date: '2026-01-01' }); // overdrawn
    });

    it('throws on non-camt XML', () => {
      expect(() => window.StackdImport.parseCamt('<Document><Other/></Document>')).toThrow();
    });
  });

  // ── parseMT940 ─────────────────────────────────────────────────────────────

  describe('parseMT940', () => {
    it('parses the SWIFT-enveloped statement', () => {
      const st = window.StackdImport.parseMT940(MT940_TEXT);

      expect(st.format).toBe('mt940');
      expect(st.currency).toBe('EUR');
      expect(st.openingBalance).toEqual({ amount: 1000, date: '2026-01-01' });
      expect(st.closingBalance).toEqual({ amount: 1804.10, date: '2026-01-31' });

      expect(st.entries).toHaveLength(2);
      // Structured :86:: ?32 name + ?20/?21 remittance; customer ref kept.
      expect(st.entries[0]).toEqual({
        date: '2026-01-03',
        description: 'SUPERMERCATO ROSSI — Spesa settimanale gennaio',
        type: 'expense',
        amount: 45.90,
        bankRef: 'RECEIPT-77'
      });
      // NONREF collapses to the //bank-side reference; multiline :86: folds.
      expect(st.entries[1]).toEqual({
        date: '2026-01-05',
        description: 'BONIFICO STIPENDIO GENNAIO 2026',
        type: 'income',
        amount: 850,
        bankRef: 'BANK-XYZ'
      });
    });

    it('treats RC (reversal of credit) as money out', () => {
      const st = window.StackdImport.parseMT940([
        ':20:X',
        ':60F:C260101EUR100,00',
        ':61:260110RC12,00NTRFNONREF',
        ':62F:C260131EUR88,00'
      ].join('\n'));
      expect(st.entries).toHaveLength(1);
      expect(st.entries[0].type).toBe('expense');
      expect(st.entries[0].amount).toBe(12);
      expect(st.entries[0].bankRef).toBe('');
    });

    it('throws on non-MT940 text', () => {
      expect(() => window.StackdImport.parseMT940('just some prose')).toThrow();
    });
  });

  // ── buildStatementTransactions ─────────────────────────────────────────────

  describe('buildStatementTransactions', () => {
    it('produces the same item/key shapes as the CSV builder', () => {
      const accId = seedAccount();
      const st = window.StackdImport.parseCamt(CAMT_XML);
      const { items, stats } = window.StackdImport.buildStatementTransactions(st, accId);

      expect(stats).toEqual({ total: 2, ok: 2, duplicates: 0, errors: 0 });
      expect(items[0].tx.importKey).toBe('ref:' + accId + '|REF-001');
      expect(items[0].tx.bankRef).toBe('REF-001');
      expect(items[1].tx.importKey)
        .toBe('fp:' + accId + '|2026-01-05|income|85000|bonifico stipendio');
      items.forEach(it => {
        expect(it.tx.categoryId).toBe('');
        expect(it.tx).not.toHaveProperty('recurrence');
        expect(it.tx).not.toHaveProperty('time');
        expect(it.tx).not.toHaveProperty('id');
      });
    });

    it('turns bad dates and zero amounts into error rows', () => {
      const accId = seedAccount();
      const st = {
        entries: [
          { date: '2026-13-01', description: 'X', type: 'expense', amount: 5, bankRef: '' },
          { date: '2026-01-05', description: 'Y', type: 'income', amount: 0, bankRef: '' }
        ]
      };
      const { items, stats } = window.StackdImport.buildStatementTransactions(st, accId);
      expect(stats).toEqual({ total: 2, ok: 0, duplicates: 0, errors: 2 });
      expect(items[0].error).toBe('unrecognised date format');
      expect(items[1].error).toBe('invalid amount');
    });

    it('flags every row duplicate on a re-import of the same statement', () => {
      const accId = seedAccount();
      const st = window.StackdImport.parseMT940(MT940_TEXT);
      const first = window.StackdImport.buildStatementTransactions(st, accId);
      window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', {
        transactions: first.items.map(it => it.tx)
      });
      const second = window.StackdImport.buildStatementTransactions(st, accId);
      expect(second.items.every(it => it.duplicate)).toBe(true);
      expect(second.stats.duplicates).toBe(2);
    });
  });

  // ── opening balance + reconciliation (plan §4) ─────────────────────────────

  it('OPBD via UPDATE_ACCOUNT + import makes the computed balance meet CLBD', () => {
    const accId = seedAccount();
    const st = window.StackdImport.parseCamt(CAMT_XML);

    window.Store.dispatch('UPDATE_ACCOUNT', {
      id: accId,
      openingBalance: st.openingBalance.amount,
      openingDate: st.openingBalance.date
    });
    const { items } = window.StackdImport.buildStatementTransactions(st, accId);
    window.Store.dispatch('BATCH_IMPORT_BANK_TRANSACTIONS', {
      transactions: items.map(it => it.tx)
    });

    // 1000 − 45.90 + 850.00 = 1804.10 — exactly the statement's CLBD.
    expect(window.Store.getBalanceAtDate(st.closingBalance.date, [accId]))
      .toBeCloseTo(st.closingBalance.amount, 2);
  });
});
