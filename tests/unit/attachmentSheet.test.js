import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// 1.2.0 (UX-10): the attachment UI. Components.AttachmentSheet (Camera /
// Photo library / PDF file / Cancel), Components.AttachmentViewer (an image
// full screen with Share and Delete; a PDF straight to the system; a missing
// file says so), the History badge, and the transaction form's Attachments
// card: picked files are stored at once, ride on the save, and the ones a
// visit stored but never saved are deleted when the form goes away.
const executeFile = (path) => {
  const content = readFileSync(resolve(__dirname, '../../src', path), 'utf8');
  const fn = new Function('window', 'localStorage', 'crypto', content);
  fn(global.window, global.window.localStorage, global.window.crypto);
};

let params = {};
let container;
let uid = 0;
const S = () => global.window.Store;
const C = () => global.window.Components;
const A = () => global.window.Attachments;
const $ = (id) => document.getElementById(id);
const flush = () => new Promise((r) => setTimeout(r, 0));
const meta = (id, kind = 'image', name) => ({ id, kind, name: name || (id + (kind === 'pdf' ? '.pdf' : '.jpg')), ext: kind === 'pdf' ? 'pdf' : 'jpg', mime: kind === 'pdf' ? 'application/pdf' : 'image/jpeg', size: 3, addedAt: '2026-11-05T10:00:00.000Z' });

const boot = () => {
  document.body.innerHTML = '<div id="router-view"></div><div id="modal-container"></div>';
  container = $('router-view');
  global.window = {
    crypto: { randomUUID: () => 'uuid-' + (++uid) },
    localStorage: { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() },
    requestAnimationFrame: (cb) => cb(),
    getComputedStyle: (el) => global.getComputedStyle(el),
    StackdHydrateIcons: vi.fn(),
    Components: {},
    Views: {},
    Router: { getParams: () => params, navigate: vi.fn(), leave: vi.fn() }
  };
  global.localStorage = global.window.localStorage;
  global.requestAnimationFrame = (cb) => cb();
  ['db.js', 'i18n.js', 'i18n/en.js', 'attachments.js', 'loan-engine.js', 'store.js', 'components.js', 'views.js'].forEach(executeFile);
  // The storage backend is attachments.test.js' business: stub it here.
  Object.assign(A(), {
    prepare: vi.fn(async (file) => ({ blob: file, name: file.name, mime: file.type, kind: file.type === 'application/pdf' ? 'pdf' : 'image', ext: file.type === 'application/pdf' ? 'pdf' : 'jpg' })),
    add: vi.fn(async (txId, p) => meta('new-' + (++uid), p.kind, p.name)),
    remove: vi.fn(async () => true),
    removeAll: vi.fn(async () => 0),
    sweep: vi.fn(async () => 0),
    displayUrl: vi.fn(async (m) => 'blob:' + m.id),
    revoke: vi.fn(),
    read: vi.fn(async () => new Uint8Array([1])),
    share: vi.fn(async () => true)
  });
  S().init();
  S().dispatch('ADD_ACCOUNT', { name: 'Main', openingBalance: 100, openingDate: '2026-01-01' });
};

const renderForm = () => {
  const view = global.window.Views.AddTransactionView;
  container.innerHTML = view.render(S().getState());
  view.attachEvents(container, S().getState());
};
const pick = async (inputId, files) => {
  const input = $(inputId);
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush(); await flush();
};
const file = (name, type) => { const f = new Blob([new Uint8Array([1, 2, 3])], { type }); f.name = name; return f; };

beforeEach(() => { params = {}; boot(); });
// Components.Modal.hide clears #modal-container 300 ms later. A test that
// closed a Modal waits that teardown out here, so the stale timer can never
// fire inside the next test (whose boot can take longer than 300 ms on a
// loaded single-worker run) and wipe the sheet it just opened.
afterEach(async () => {
  if (document.getElementById('active-modal')) await new Promise((r) => setTimeout(r, 350));
  vi.restoreAllMocks();
});

describe('Components.AttachmentSheet (1.2.0, UX-10)', () => {
  it('Camera / Photo library / PDF file / Cancel, each closing the sheet and running its callback in the tap', () => {
    const onCamera = vi.fn();
    const onLibrary = vi.fn();
    const onPdf = vi.fn();
    const sheet = C().AttachmentSheet.show({ onCamera, onLibrary, onPdf });
    expect(sheet.id).toBe('attachment-sheet');
    expect(sheet.getAttribute('aria-labelledby')).toBe('attachment-sheet-title');
    expect($('attachment-sheet-title').textContent).toBe('Add an attachment');
    expect($('att-sheet-camera').textContent.trim()).toBe('Take a photo');
    expect($('att-sheet-library').textContent.trim()).toBe('Photo library');
    expect($('att-sheet-pdf').textContent.trim()).toBe('PDF file');
    expect($('att-sheet-cancel').hasAttribute('data-back-dismiss')).toBe(true);
    const close = vi.spyOn(sheet, '_close');
    $('att-sheet-library').click();
    expect(onLibrary).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onCamera).not.toHaveBeenCalled();
  });

  it('Cancel, a backdrop tap and Android Back close it without a choice', () => {
    const onCamera = vi.fn();
    let sheet = C().AttachmentSheet.show({ onCamera });
    let close = vi.spyOn(sheet, '_close');
    $('att-sheet-cancel').click();
    expect(close).toHaveBeenCalled();
    sheet.remove();
    sheet = C().AttachmentSheet.show({ onCamera });
    close = vi.spyOn(sheet, '_close');
    sheet.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(close).toHaveBeenCalled();
    sheet.remove();
    sheet = C().AttachmentSheet.show({ onCamera });
    sheet.classList.add('open');
    expect(C().dismissTopSheet()).toBe(true);
    expect(sheet.classList.contains('open')).toBe(false);
    expect(onCamera).not.toHaveBeenCalled();
  });
});

describe('Components.AttachmentViewer (1.2.0, UX-10)', () => {
  it('shows an image full screen from displayUrl, with a close control, Share and Delete', async () => {
    const onDelete = vi.fn();
    const m = meta('v1', 'image', 'Lunch.jpg');
    const viewer = C().AttachmentViewer.show({ meta: m, onDelete });
    expect(viewer.id).toBe('attachment-viewer');
    expect(viewer.querySelector('.modal-btn-close')).not.toBeNull();
    expect($('attachment-viewer-title').textContent).toBe('Lunch.jpg');
    await flush();
    expect($('att-viewer-img').getAttribute('src')).toBe('blob:v1');
    expect($('att-viewer-img').hidden).toBe(false);
    $('att-viewer-share').click();
    expect(A().share).toHaveBeenCalledWith(m);
    $('att-viewer-delete').click();
    // a confirmation, then onDelete
    expect($('active-modal')).not.toBeNull();
    expect(document.querySelector('#active-modal .modal-body').textContent).toContain('Remove this attachment');
    $('modal-delete-btn').click();
    expect(onDelete).toHaveBeenCalledWith(m);
  });

  it('a file this device does not hold says so (no broken image, Share disabled)', async () => {
    A().displayUrl.mockResolvedValueOnce(null);
    C().AttachmentViewer.show({ meta: meta('gone') });
    await flush();
    expect($('att-viewer-missing').hidden).toBe(false);
    expect($('att-viewer-missing').textContent).toBe('This file is not on this device.');
    expect($('att-viewer-share').disabled).toBe(true);
    expect($('att-viewer-delete')).toBeNull(); // no onDelete given
  });

  it('an image that is here but will not render says it cannot be shown, and Share stays available', async () => {
    const m = meta('heic1');
    C().AttachmentViewer.show({ meta: m });
    await flush();
    $('att-viewer-img').dispatchEvent(new Event('error'));
    await flush();
    expect(A().read).toHaveBeenCalledWith(m);
    expect($('att-viewer-img').hidden).toBe(true);
    expect($('att-viewer-missing').hidden).toBe(false);
    expect($('att-viewer-missing').textContent).toBe("This file can't be shown here.");
    expect($('att-viewer-share').disabled).toBe(false);
    // and one whose bytes are gone reads "not on this device"
    $('att-viewer-close').click();
    document.getElementById('attachment-viewer').remove();
    A().read.mockResolvedValueOnce(null);
    C().AttachmentViewer.show({ meta: meta('gone2') });
    await flush();
    $('att-viewer-img').dispatchEvent(new Event('error'));
    await flush();
    expect($('att-viewer-missing').textContent).toBe('This file is not on this device.');
    expect($('att-viewer-share').disabled).toBe(true);
  });

  it('a PDF goes straight to the system; a missing one gets a notice', async () => {
    const notice = vi.spyOn(C().NoticeSheet, 'show');
    expect(C().AttachmentViewer.show({ meta: meta('p1', 'pdf') })).toBeNull();
    await flush();
    expect(A().share).toHaveBeenCalledTimes(1);
    expect($('attachment-viewer')).toBeNull();
    A().read.mockResolvedValueOnce(null);
    C().AttachmentViewer.show({ meta: meta('p2', 'pdf') });
    await flush();
    expect(A().share).toHaveBeenCalledTimes(1);
    expect(notice).toHaveBeenCalledWith(expect.objectContaining({ body: 'This file is not on this device.' }));
  });
});

describe('History badge (1.2.0, UX-10)', () => {
  it('a paperclip and the count next to the date, only when the row has attachments', () => {
    const acc = S().getState().accounts[0];
    const html = C().TransactionItem.render({ id: 't1', type: 'expense', amount: 5, accountId: acc.id, date: '2026-09-01', attachments: [meta('a'), meta('b', 'pdf')] }, null, acc, {});
    const host = document.createElement('div');
    host.innerHTML = html;
    const badge = host.querySelector('.tx-attach-badge');
    expect(badge).not.toBeNull();
    expect(badge.getAttribute('aria-label')).toBe('2 attachments');
    expect(badge.querySelector('[data-lucide="paperclip"]')).not.toBeNull();
    expect(badge.textContent.trim()).toBe('2');
    host.innerHTML = C().TransactionItem.render({ id: 't2', type: 'expense', amount: 5, accountId: acc.id, date: '2026-09-01' }, null, acc, {});
    expect(host.querySelector('.tx-attach-badge')).toBeNull();
  });
});

describe('The transaction form’s Attachments card (1.2.0, UX-10)', () => {
  it('sits after the Recurrent card: a row that opens the sheet, three hidden file inputs', () => {
    renderForm();
    const card = $('group-attachments');
    expect(card).not.toBeNull();
    expect(card.previousElementSibling.id).toBe('group-recurring');
    const row = $('tx-attachments-row');
    expect(row.getAttribute('role')).toBe('button');
    expect(row.getAttribute('tabindex')).toBe('0');
    expect(row.classList.contains('touch-target')).toBe(true);
    expect($('tx-attachments-text').textContent).toBe('Add a receipt photo or a PDF');
    expect($('tx-att-camera').getAttribute('accept')).toBe('image/*');
    expect($('tx-att-camera').getAttribute('capture')).toBe('environment');
    expect($('tx-att-library').getAttribute('accept')).toBe('image/*');
    expect($('tx-att-library').hasAttribute('capture')).toBe(false);
    expect($('tx-att-pdf').getAttribute('accept')).toBe('application/pdf,.pdf');
    const click = vi.spyOn($('tx-att-camera'), 'click').mockImplementation(() => {});
    row.click();
    expect($('attachment-sheet')).not.toBeNull();
    $('att-sheet-camera').click();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('a picked file is stored at once, shows as a tile and rides on the save', async () => {
    renderForm();
    await pick('tx-att-library', [file('Lunch.jpg', 'image/jpeg')]);
    expect(A().prepare).toHaveBeenCalledTimes(1);
    expect(A().add).toHaveBeenCalledTimes(1);
    expect($('tx-att-library').value).toBe('');
    const tiles = container.querySelectorAll('.tx-attachment');
    expect(tiles).toHaveLength(1);
    expect(tiles[0].querySelector('.tx-attachment-name').textContent).toBe('Lunch.jpg');
    expect(tiles[0].querySelector('.tx-attachment-remove').getAttribute('aria-label')).toBe('Remove Lunch.jpg');
    expect($('tx-attachments-text').textContent).toBe('1 attachment');
    expect(JSON.parse($('tx-attachments-data').value)).toHaveLength(1);
    await flush();
    expect(tiles[0].querySelector('img').getAttribute('src')).toMatch(/^blob:new-/);

    $('tx-amount').value = '9.50';
    $('tx-category').value = 'cat_groceries';
    $('btn-save-tx').click();
    const row = S().getState().transactions.find(t => t.amount === 9.5);
    expect(row.attachments).toHaveLength(1);
    expect(row.attachments[0].name).toBe('Lunch.jpg');
    // the saved visit keeps its file when the form goes away
    global.window.Views.AddTransactionView.destroy();
    expect(A().removeAll).not.toHaveBeenCalled();
  });

  it('a file added and removed again is deleted at once; leaving without saving deletes the rest', async () => {
    renderForm();
    await pick('tx-att-pdf', [file('a.pdf', 'application/pdf')]);
    await pick('tx-att-library', [file('b.jpg', 'image/jpeg')]);
    const [first] = JSON.parse($('tx-attachments-data').value);
    container.querySelector(`[data-attachment-remove="${first.id}"]`).click();
    expect(A().remove).toHaveBeenCalledWith(expect.objectContaining({ id: first.id }));
    expect(container.querySelectorAll('.tx-attachment')).toHaveLength(1);
    global.window.Views.AddTransactionView.destroy();
    expect(A().removeAll).toHaveBeenCalledTimes(1);
    expect(A().removeAll.mock.calls[0][0].map(m => m.name)).toEqual(['b.jpg']);
  });

  it('at most 8 per transaction; a refused file gets a notice', async () => {
    const notice = vi.spyOn(C().NoticeSheet, 'show');
    renderForm();
    await pick('tx-att-library', Array.from({ length: 9 }, (_, i) => file(i + '.jpg', 'image/jpeg')));
    expect(container.querySelectorAll('.tx-attachment')).toHaveLength(8);
    expect(notice).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'A transaction can hold up to 8 attachments.' }));
    A().prepare.mockResolvedValueOnce({ error: 'tooLarge' });
    container.querySelector('.tx-attachment-remove').click();
    await pick('tx-att-pdf', [file('big.pdf', 'application/pdf')]);
    expect(notice).toHaveBeenLastCalledWith(expect.objectContaining({ body: 'This file is larger than 10 MB.' }));
    A().prepare.mockResolvedValueOnce({ error: 'unreadable' });
    container.querySelector('.tx-attachment-remove').click();
    await pick('tx-att-library', [file('IMG_1.HEIC', 'image/heic')]);
    expect(notice).toHaveBeenLastCalledWith(expect.objectContaining({ body: "This photo can't be read on this device. Try a JPEG or PNG copy." }));
    expect(container.querySelectorAll('.tx-attachment')).toHaveLength(6);
  });

  it('editing: a stored receipt removed in the form stays on disk until the save lands', async () => {
    const acc = S().getState().accounts[0];
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 4, accountId: acc.id, categoryId: 'cat_groceries', date: '2026-09-01', comment: 'kept', attachments: [meta('old1'), meta('old2', 'pdf')] });
    const tx = S().getState().transactions.find(t => t.comment === 'kept');
    params = { id: tx.id };
    renderForm();
    expect(container.querySelectorAll('.tx-attachment')).toHaveLength(2);
    expect($('tx-attachments-text').textContent).toBe('2 attachments');
    container.querySelector('[data-attachment-remove="old1"]').click();
    expect(A().remove).not.toHaveBeenCalled();
    $('btn-save-tx').click();
    expect(S().getState().transactions.find(t => t.id === tx.id).attachments.map(m => m.id)).toEqual(['old2']);
    expect(A().removeAll).toHaveBeenCalledWith([expect.objectContaining({ id: 'old1' })]);
  });

  it('a tapped tile opens the viewer; Delete there removes it from the form', async () => {
    const acc = S().getState().accounts[0];
    S().dispatch('ADD_TRANSACTION', { type: 'expense', amount: 4, accountId: acc.id, categoryId: 'cat_groceries', date: '2026-09-01', comment: 'v', attachments: [meta('img1')] });
    params = { id: S().getState().transactions.find(t => t.comment === 'v').id };
    renderForm();
    container.querySelector('[data-attachment-open="img1"]').click();
    expect($('attachment-viewer')).not.toBeNull();
    $('att-viewer-delete').click();
    $('modal-delete-btn').click();
    expect(container.querySelectorAll('.tx-attachment')).toHaveLength(0);
    expect(JSON.parse($('tx-attachments-data').value)).toEqual([]);
  });

  it('a transfer shows (and saves) the expense leg’s attachments, whichever leg was opened', async () => {
    S().dispatch('ADD_ACCOUNT', { name: 'Savings', openingBalance: 0, openingDate: '2026-01-01' });
    const st = S().getState();
    S().dispatch('ADD_TRANSFER', { amount: 5, expenseAccountId: st.accounts.find(a => a.name === 'Main').id, incomeAccountId: st.accounts.find(a => a.name === 'Savings').id, date: '2026-09-01', note: 'mv', attachments: [meta('tr1')] });
    const leg = (type) => S().getState().transactions.find(t => t.comment === 'mv' && t.type === type);
    params = { id: leg('income').id };
    renderForm();
    expect(container.querySelector('[data-attachment="tr1"]')).not.toBeNull();
    // add one from the income leg's form and save: both land on the expense leg
    await pick('tx-att-library', [file('second.jpg', 'image/jpeg')]);
    expect(container.querySelectorAll('.tx-attachment')).toHaveLength(2);
    $('btn-save-tx').click();
    expect(A().add).toHaveBeenCalledTimes(1);
    expect(leg('expense').attachments.map(m => m.id)).toEqual(['tr1', expect.stringMatching(/^new-/)]);
    expect(leg('income').attachments).toBeUndefined();
    expect(A().removeAll).not.toHaveBeenCalled();
  });

  it('the draft (category round trip) keeps the attachments', async () => {
    renderForm();
    await pick('tx-att-library', [file('d.jpg', 'image/jpeg')]);
    const metas = JSON.parse($('tx-attachments-data').value);
    // captureDraftTxFormState is views.js-private: the add-category button runs it
    const C2 = C();
    C2.ProLockModal = { show: vi.fn() };
    global.window.Pro = { canAddCategory: () => false };
    $('btn-add-category').click();
    expect(global.window._draftTxFormState.attachments).toEqual(metas);
    // the in-place re-render restores the strip, and the visit still owns the file
    renderForm();
    expect(container.querySelectorAll('.tx-attachment')).toHaveLength(1);
    global.window.Views.AddTransactionView.destroy();
    expect(A().removeAll.mock.calls[0][0].map(m => m.id)).toEqual([metas[0].id]);
  });
});
