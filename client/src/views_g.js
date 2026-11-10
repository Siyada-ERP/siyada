/* =====================================================================
   SIYADA - right-click menu on the sales / purchase references,
   monthly quantity discount (from the Excel system), WhatsApp messages
   ===================================================================== */
(function (root) {
'use strict';
const APP = root.APP, E = root.SiyadaEngine, T = E.T, r2 = E.r2, num = E.num;
const { $, $$, esc, fmt, nc } = APP;
const R_ = APP.routes;
const S = () => APP.S;

/* ---------------------------------------------------------------
   قائمة كليك يمين (عرض / تعديل / طباعة / حذف / واتساب)
   --------------------------------------------------------------- */
let ctxEl = null, ctxRow = null;
function ctxClose() {
  if (ctxEl) { ctxEl.remove(); ctxEl = null; }
  if (ctxRow) { ctxRow.classList.remove('ctxsel'); ctxRow = null; }
}
APP.ctxClose = ctxClose;
APP.ctxMenu = function (x, y, items, head) {
  ctxClose();
  const el = document.createElement('div'); el.className = 'ctxm'; el.setAttribute('role', 'menu');
  el.innerHTML = (head ? '<div class="ch">' + esc(head) + '</div>' : '') + items.map((it, i) => it === '-' ? '<hr>' :
    '<button type="button" class="ci' + (it.danger ? ' danger' : '') + '" role="menuitem" data-i="' + i + '"' + (it.off ? ' disabled' : '') + '><b aria-hidden="true">' + (it.icon || '') + '</b><span>' + esc(it.label) + '</span></button>').join('');
  document.body.appendChild(el);
  const w = el.offsetWidth, h = el.offsetHeight;
  let left = x, top = y;
  if (left + w > root.innerWidth - 6) left = Math.max(6, x - w);
  if (top + h > root.innerHeight - 6) top = Math.max(6, root.innerHeight - h - 6);
  el.style.left = left + 'px'; el.style.top = top + 'px';
  el.addEventListener('click', e => {
    const b = e.target.closest('.ci'); if (!b || b.disabled) return;
    const it = items[+b.dataset.i]; ctxClose(); if (it && it.run) it.run();
  });
  el.addEventListener('keydown', e => {
    const bs = $$('.ci:not([disabled])', el); if (!bs.length) return;
    const i = bs.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    else if (e.key === 'Tab') { e.preventDefault(); ctxClose(); }
  });
  ctxEl = el;
  const f = $('.ci:not([disabled])', el); if (f) f.focus({ preventScroll: true });
};
document.addEventListener('mousedown', e => { if (ctxEl && !ctxEl.contains(e.target)) ctxClose(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') ctxClose(); });
root.addEventListener('blur', ctxClose);
root.addEventListener('resize', ctxClose);
document.addEventListener('scroll', ctxClose, true);

function copyText(t) {
  const done = () => APP.toast('اتنسخ.');
  try { navigator.clipboard.writeText(t).then(done, () => fallback()); } catch (e) { fallback(); }
  function fallback() {
    const a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select();
    try { document.execCommand('copy'); done(); } catch (e) { APP.toast('تعذر النسخ.', 'bad'); } a.remove();
  }
}
APP.copyText = copyText;

// print a document from anywhere: open it, then print once its view has been drawn
APP._printOnOpen = null;
APP.printDoc = function (doc, size) { APP._printOnOpen = { doc, size: size === 'a5' ? 'a5' : 'a4' }; APP.go('doc', doc); };
(function hookDocAfter() {
  const prev = R_.doc.after;
  R_.doc.after = function (arg) {
    if (prev) prev.call(this, arg);
    const p = APP._printOnOpen;
    if (p && p.doc === arg) { APP._printOnOpen = null; setTimeout(() => APP.acts.printSize({ dataset: { size: p.size } }), 250); }
  };
})();

function docMenu(doc, x, y, row) {
  const txs = S().transactions.filter(t => t.doc === doc); if (!txs.length) return;
  const kind = APP.kindOfDoc(txs), t0 = txs[0], sales = t0.source === T.sales, code = t0.partyCode;
  const canWa = !!(kind && WA_KINDS[kind] && code);
  const items = [
    { icon: '👁', label: 'عرض الفاتورة', run: () => APP.go('doc', doc) },
    { icon: '✎', label: 'تعديل', off: !kind, run: () => APP.acts.docEdit({ dataset: { d: doc } }) },
    { icon: '🖨', label: 'طباعة A4', run: () => APP.printDoc(doc, 'a4') },
    { icon: '🖨', label: 'طباعة A5', run: () => APP.printDoc(doc, 'a5') },
    '-',
    { icon: '📑', label: 'كشف حساب ' + (sales ? 'العميل' : 'المورد'), off: !code, run: () => APP.go('statement', code) },
    { icon: '💬', label: 'رسالة واتساب', off: !canWa, run: () => APP.waOpen(doc, true) },
    { icon: '⧉', label: 'نسخ رقم المستند', run: () => copyText(doc) },
    '-',
    { icon: '🗑', label: 'حذف', danger: true, run: () => APP.acts.docDel({ dataset: { d: doc } }) }
  ];
  APP.ctxMenu(x, y, items, doc);
  if (row) { row.classList.add('ctxsel'); ctxRow = row; }
}
document.addEventListener('contextmenu', e => {
  const tr = e.target.closest && e.target.closest('tr[data-doc]');
  if (!tr || e.target.closest('input,textarea,select')) return;
  e.preventDefault(); docMenu(tr.dataset.doc, e.clientX, e.clientY, tr);
});
['refsale', 'refpur'].forEach(route => {
  const r = R_[route]; if (!r) return; const orig = r.html;
  r.html = function () { return orig.apply(this, arguments).replace('<div id="results">', '<p class="hint-ctx noprint">اضغط كليك يمين على أي مستند: عرض · تعديل · طباعة · كشف حساب · واتساب · حذف.</p><div id="results">'); };
});

/* ---------------------------------------------------------------
   رسائل واتساب
   --------------------------------------------------------------- */
const WA_KINDS = { sale: 1, salret: 1, receipt: 1, purchase: 1, purret: 1, payment: 1 };
const WA_LABEL = { sale: 'فاتورة بيع', salret: 'مرتجع مبيعات', receipt: 'تحصيل (سند قبض)', purchase: 'فاتورة شراء', purret: 'مرتجع مشتريات', payment: 'سداد (سند دفع)' };
const WA_TPL = {
  sale: 'السادة / {الاسم}\nتم تسجيل فاتورة بيع رقم {المستند} بتاريخ {التاريخ} بقيمة {القيمة} جنيه.\nرصيدكم السابق: {الرصيد_قبل} جنيه\nرصيدكم الحالي: {الرصيد_بعد} جنيه\nشكرًا لتعاملكم معنا.\n{الشركة}',
  salret: 'السادة / {الاسم}\nتم تسجيل مرتجع مبيعات رقم {المستند} بتاريخ {التاريخ} بقيمة {القيمة} جنيه.\nرصيدكم السابق: {الرصيد_قبل} جنيه\nرصيدكم الحالي: {الرصيد_بعد} جنيه\n{الشركة}',
  receipt: 'السادة / {الاسم}\nتم استلام مبلغ {القيمة} جنيه بموجب سند رقم {المستند} بتاريخ {التاريخ}.\nرصيدكم السابق: {الرصيد_قبل} جنيه\nرصيدكم الحالي: {الرصيد_بعد} جنيه\nشكرًا لكم.\n{الشركة}',
  purchase: 'السادة / {الاسم}\nتم تسجيل فاتورة شراء رقم {المستند} بتاريخ {التاريخ} بقيمة {القيمة} جنيه.\nالمستحق لكم قبل الفاتورة: {الرصيد_قبل} جنيه\nالمستحق لكم الآن: {الرصيد_بعد} جنيه\n{الشركة}',
  purret: 'السادة / {الاسم}\nتم تسجيل مرتجع مشتريات رقم {المستند} بتاريخ {التاريخ} بقيمة {القيمة} جنيه.\nالمستحق لكم قبل المرتجع: {الرصيد_قبل} جنيه\nالمستحق لكم الآن: {الرصيد_بعد} جنيه\n{الشركة}',
  payment: 'السادة / {الاسم}\nتم سداد مبلغ {القيمة} جنيه بموجب سند رقم {المستند} بتاريخ {التاريخ}.\nالمستحق لكم قبل السداد: {الرصيد_قبل} جنيه\nالمستحق لكم الآن: {الرصيد_بعد} جنيه\n{الشركة}'
};
const waCfg = () => {
  const s = S().settings; if (!s.wa || typeof s.wa !== 'object') s.wa = {};
  if (s.wa.on === undefined) s.wa.on = true; if (!s.wa.cc) s.wa.cc = '20'; if (!s.wa.tpl || typeof s.wa.tpl !== 'object') s.wa.tpl = {};
  return s.wa;
};
const waTpl = k => waCfg().tpl[k] || WA_TPL[k];
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
function waPhone(raw, cc) {
  let d = String(raw || '').replace(/[٠-٩]/g, c => AR_DIGITS.indexOf(c)).replace(/[^\d+]/g, '');
  if (d.charAt(0) === '+') d = d.slice(1); else if (d.slice(0, 2) === '00') d = d.slice(2); else if (d.charAt(0) === '0') d = String(cc || '20') + d.slice(1);
  d = d.replace(/\D/g, ''); return d.length >= 8 ? d : '';
}
APP.waPhone = waPhone;
const fillTpl = (tpl, m) => tpl.replace(/\{([^}]+)\}/g, (a, k) => (m[k] !== undefined ? m[k] : a));
const fmtBal = v => fmt(Math.abs(r2(v)) < 0.005 ? 0 : v);

// everything needed to build the message of one document
APP.waInfo = function (doc) {
  const txs = S().transactions.filter(t => t.doc === doc); if (!txs.length) return null;
  const kind = APP.kindOfDoc(txs); if (!kind || !WA_KINDS[kind]) return null;
  const t0 = txs[0]; if (!t0.partyCode) return null;
  const party = S().parties.find(p => p.code === t0.partyCode); if (!party) return null;
  const sup = t0.source === T.purch, pr = APP.pBy.get(party.code);
  const eff = r2(txs.filter(t => t.partyCode === party.code).reduce((s, t) => s + t.debit - t.credit, 0));
  const afterRaw = pr ? pr.balance : 0, sign = sup ? -1 : 1;
  const d = APP.docBy.get(doc);
  const val = (kind === 'receipt' || kind === 'payment') ? r2(txs.reduce((s, t) => s + t.debit + t.credit, 0)) : (d ? d.net : r2(txs.reduce((s, t) => s + t.debit + t.credit, 0)));
  const vars = { 'الاسم': party.name, 'الشركة': APP.company(), 'المستند': doc, 'التاريخ': String(t0.date || '').split('-').reverse().join('/') + '\u200F', 'القيمة': fmt(val), 'الرصيد_قبل': fmtBal(sign * (afterRaw - eff)), 'الرصيد_بعد': fmtBal(sign * afterRaw) };
  return { doc, kind, party, phone: party.phone || '', text: fillTpl(waTpl(kind), vars), vars };
};
function waLogAdd(info, phone) {
  const s = S().settings; if (!Array.isArray(s.waLog)) s.waLog = [];
  s.waLog.unshift({ at: new Date().toISOString().slice(0, 16).replace('T', ' '), doc: info.doc, kind: info.kind, code: info.party.code, name: info.party.name, phone });
  if (s.waLog.length > 300) s.waLog.length = 300;
}
APP.waOpen = function (doc, manual) {
  const info = APP.waInfo(doc); if (!info) { if (manual) APP.alert('المستند ده ملوش رسالة واتساب (لازم يكون فاتورة أو مرتجع أو سند لعميل/مورد).'); return; }
  const p = info.party, cc = waCfg().cc;
  APP.modal('<h3>رسالة واتساب — ' + esc(p.name) + '</h3><div class="mbody">' +
    '<div class="wa-meta"><span>' + esc(WA_LABEL[info.kind]) + ' <b class="n">' + esc(doc) + '</b></span><label class="f" style="margin:0">رقم الواتساب <input class="in n" id="waPh" value="' + esc(info.phone) + '" placeholder="01xxxxxxxxx" style="width:170px"></label></div>' +
    '<textarea class="in wa-box" id="waTx" aria-label="نص الرسالة">' + esc(info.text) + '</textarea>' +
    '<div id="waErr" class="err"></div>' +
    '<label class="chk sm"><input type="checkbox" id="waNo"' + (p.noWa ? ' checked' : '') + '> ما تسألنيش عن رسائل لـ ' + esc(p.name) + ' بعد كده</label></div>' +
    '<div class="mfoot"><button class="btn wa" id="waGo">فتح واتساب</button><button class="btn" id="waCp">نسخ النص</button><button class="btn" data-act="mclose">تخطي</button></div>', { wide: 1, nofocus: true });
  const saveNo = () => { const v = $('#waNo').checked; if (!!p.noWa !== v) { p.noWa = v; APP.commit(null, { norender: true }); } };
  $('#waCp').onclick = () => copyText($('#waTx').value);
  $('#waGo').onclick = () => {
    const raw = $('#waPh').value.trim(), num_ = waPhone(raw, cc);
    if (!num_) { $('#waErr').textContent = 'اكتب رقم الواتساب بشكل صحيح (مثال 01012345678).'; return; }
    if (raw !== (p.phone || '')) p.phone = raw;
    p.noWa = $('#waNo').checked || undefined; if (!p.noWa) delete p.noWa;
    waLogAdd(info, num_); APP.commit(null, { norender: true });
    const url = 'https://wa.me/' + num_ + '?text=' + encodeURIComponent($('#waTx').value);
    APP.mclose(); root.open(url, '_blank', 'noopener');
  };
  $('#waNo').addEventListener('change', saveNo);   // يتحفظ فورًا مهما قفلت النافذة بأي طريقة (تخطي / Esc / الخلفية)
  setTimeout(() => { const f = $('#waGo'); if (f) f.focus(); }, 30);
};
// after a NEW document is saved (never for an edit)
APP.waAfterSave = function (doc) {
  if (!waCfg().on) return;
  const info = APP.waInfo(doc); if (!info || info.party.noWa) return;
  setTimeout(() => APP.waOpen(doc, false), 300);
};

R_.walog = {
  title: 'رسائل واتساب',
  html() {
    const log = S().settings.waLog || [];
    let h = '<div class="sheet">' + APP.sheetHead('رسائل واتساب', 'سجل الرسائل المرسلة للعملاء والموردين') +
      '<div class="toolbar"><button class="btn primary" data-act="waSettings">إعدادات وقوالب الرسائل</button><button class="btn" data-act="csv" data-t="rpt" data-n="رسائل_واتساب">تصدير CSV</button></div>' +
      '<p class="muted sm">بعد حفظ أي فاتورة بيع أو مرتجع أو تحصيل (وكذلك للمشتريات والسداد) بتظهر نافذة برسالة جاهزة فيها الرصيد قبل وبعد. تقدر تضغط كليك يمين على أي مستند في المراجع وتختار «رسالة واتساب».</p>';
    h += APP.table([{ h: 'التاريخ', f: r => '<span class="n">' + esc(r.at) + '</span>' }, { h: 'النوع', f: r => esc(WA_LABEL[r.kind] || r.kind) }, { h: 'المستند', f: r => '<a href="#/doc/' + encodeURIComponent(r.doc) + '">' + esc(r.doc) + '</a>' }, { h: 'الاسم', f: r => '<a href="#/statement/' + encodeURIComponent(r.code) + '">' + esc(r.name) + '</a>' }, { h: 'الهاتف', f: r => '<span class="n">' + esc(r.phone) + '</span>' },
      { h: '', cls: 'act nocsv', f: r => '<button class="btn s" data-act="waAgain" data-d="' + esc(r.doc) + '">إعادة فتح</button>' }], log, { id: 'rpt', empty: 'لسه ما اتبعتش أي رسالة.' });
    return h + '</div>';
  }
};
APP.acts.waAgain = b => APP.waOpen(b.dataset.d, true);
APP.acts.waSettings = () => {
  const c = waCfg(), vars = '{الاسم} {الشركة} {المستند} {التاريخ} {القيمة} {الرصيد_قبل} {الرصيد_بعد}';
  APP.modal('<h3>إعدادات رسائل واتساب</h3><div class="mbody"><div class="frow"><label class="f chk"><input type="checkbox" id="wsOn"' + (c.on ? ' checked' : '') + '> اعرض نافذة الرسالة بعد حفظ كل مستند جديد</label><label class="f">كود الدولة (بدون +)<input class="in n" id="wsCc" value="' + esc(c.cc) + '"></label></div>' +
    '<p class="muted sm">المتغيرات المتاحة: <span class="n">' + esc(vars) + '</span></p>' +
    Object.keys(WA_LABEL).map(k => '<label class="f">' + esc(WA_LABEL[k]) + '<textarea class="in" rows="5" data-wk="' + k + '">' + esc(waTpl(k)) + '</textarea></label>').join('') +
    '</div><div class="mfoot"><button class="btn primary" id="wsOk">حفظ</button><button class="btn" id="wsDef">استعادة النصوص الأصلية</button><button class="btn" data-act="mclose">إلغاء</button></div>', { wide: 1 });
  $('#wsDef').onclick = () => { $$('#modal [data-wk]').forEach(t => { t.value = WA_TPL[t.dataset.wk]; }); };
  $('#wsOk').onclick = () => {
    c.on = $('#wsOn').checked; c.cc = ($('#wsCc').value || '20').replace(/\D/g, '') || '20'; c.tpl = {};
    $$('#modal [data-wk]').forEach(t => { const v = t.value.trim(); if (v && v !== WA_TPL[t.dataset.wk]) c.tpl[t.dataset.wk] = v; });
    APP.mclose(); APP.commit('تم حفظ إعدادات الرسائل.');
  };
};

/* ---------------------------------------------------------------
   خصم الكمية الشهري (من نظام الإكسل)
   --------------------------------------------------------------- */
const QD_MARK = 'خصم كمية شهري ';
const qdList = () => { const s = S().settings; if (!Array.isArray(s.qtyDisc)) s.qtyDisc = []; return s.qtyDisc; };
const qdKg = () => { const v = num(S().settings.qtyDiscKg); return v > 0 ? v : 1000; };
const curYM = () => APP.today().slice(0, 7);
const ymOk = ym => /^\d{4}-(0[1-9]|1[0-2])$/.test(ym || '');
function ymLast(ym) { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return ym + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); }
const QD_ST = { due: ['due', 'مستحق للترحيل'], part: ['part', 'مرحّل جزئياً'], done: ['done', 'تم الترحيل'], off: ['off', 'موقوف'], norate: ['bad', 'اكتب سعر الخصم'], noqty: ['none', 'لا توجد كمية صافية'], min: ['none', 'لم يبلغ الحد الأدنى'], nocust: ['bad', 'العميل غير موجود'], dup: ['bad', 'مكرر'] };

// pure calculation for one month: one row per agreement
APP.qdCalc = function (ym) {
  const agg = new Map(), posted = new Map(), from = ym + '-01', to = ym + '-31', kg = qdKg(), mark = QD_MARK + ym;
  S().transactions.forEach(t => {
    if (t.source !== T.sales) return;
    if ((t.type === T.sale || t.type === T.ret) && t.date >= from && t.date <= to) {
      let a = agg.get(t.partyCode); if (!a) agg.set(t.partyCode, a = { q: 0, v: 0 });
      const sg = t.type === T.ret ? -1 : 1; a.q += sg * num(t.qty); a.v += sg * (t.debit + t.credit);
    } else if (t.type === T.disc && String(t.desc || '').indexOf(mark) >= 0) posted.set(t.partyCode, r2((posted.get(t.partyCode) || 0) + t.credit - t.debit));
  });
  const seen = new Set();
  const rows = qdList().map((a, i) => {
    const code = a.code, party = S().parties.find(p => p.code === code && p.type === T.cust);
    const r = { i, a, code, name: party ? party.name : (a.name || code), tons: 0, value: 0, due: 0, posted: 0, rem: 0, st: 'nocust' };
    if (!party) return r;
    if (seen.has(code)) { r.st = 'dup'; return r; } seen.add(code);
    const g = agg.get(code) || { q: 0, v: 0 }; r.tons = Math.round(g.q / kg * 1000) / 1000; r.value = r2(g.v); r.posted = posted.get(code) || 0;
    const rate = num(a.rate), min = num(a.min);
    if (a.off) r.st = 'off';
    else if (!(rate > 0)) r.st = 'norate';
    else if (!(r.tons > 0)) r.st = 'noqty';
    else if (r.tons < min) r.st = 'min';
    else {
      r.due = r2(r.tons * rate); r.rem = r2(r.due - r.posted);
      r.st = r.posted <= 0.004 ? 'due' : (r.rem > 0.004 ? 'part' : 'done');
      if (r.rem < 0) r.rem = 0;
    }
    return r;
  });
  const sum = k => r2(rows.reduce((s, r) => s + r[k], 0));
  return { ym, rows, totals: { n: rows.length, tons: Math.round(rows.reduce((s, r) => s + r.tons, 0) * 1000) / 1000, value: sum('value'), due: sum('due'), posted: sum('posted'), rem: sum('rem'), todo: rows.filter(r => r.st === 'due' || r.st === 'part').length } };
};
// the one-line summary shown under a customer (used by the net-quantity screen)
APP.qdPanel = function (code, ym) {
  const a = qdList().find(x => x.code === code); if (!a) return '';
  const r = APP.qdCalc(ym).rows.find(x => x.code === code); if (!r) return '';
  return QD_ST[r.st][1] + (r.due ? ' — ' + fmt(r.due) + ' جنيه' : '');
};

function qdResults() {
  const ym = ymOk(APP.fv('qm', '')) ? APP.fv('qm', '') : curYM();
  const C = APP.qdCalc(ym), t = C.totals, f = APP.UI.f;
  const kp = (l, v, c) => '<div class="kpi"><small>' + l + '</small><b' + (c ? ' class="' + c + '"' : '') + '>' + v + '</b></div>';
  let h = '<div class="kpis" style="margin:0 0 14px">' + kp('عدد الاتفاقيات', t.n) + kp('صافي الكمية (طن)', APP.fmtq(t.tons)) + kp('صافي القيمة', fmt(t.value)) + kp('الخصم المستحق', fmt(t.due), 'accent') + kp('المرحّل', fmt(t.posted)) + kp('المتبقي للترحيل', fmt(t.rem), t.rem > 0.004 ? 'neg' : '') + '</div>';
  if (!C.rows.length) return h + '<p class="qd-msg">اضغط «+ اتفاقية جديدة» واختار العميل وسعر الخصم لكل طن.</p>';
  h += '<p class="qd-msg">' + (t.todo ? 'مستحق ترحيله: <b>' + t.todo + '</b> عميل بإجمالي <b class="n">' + fmt(t.rem) + '</b> جنيه — اضغط «ترحيل المستحق».' : 'مفيش خصم مستحق للترحيل في هذا الشهر.') + '</p>';
  h += '<div class="scroll"><table class="grid" id="rpt"><thead><tr><th class="n">م</th><th>العميل</th><th>الكود</th><th class="n">سعر الخصم / طن</th><th class="n">حد أدنى (طن)</th><th>الفعالية</th><th class="n">صافي الكمية (طن)</th><th class="n">صافي القيمة</th><th class="n">الخصم المستحق</th><th class="n">المرحّل</th><th class="n">المتبقي</th><th>حالة الشهر</th><th>ملاحظات</th><th class="act nocsv"></th></tr></thead><tbody>';
  C.rows.forEach((r, n) => {
    const a = r.a, st = QD_ST[r.st];
    h += '<tr><td class="n">' + (n + 1) + '</td><td><a href="#/statement/' + encodeURIComponent(r.code) + '">' + esc(r.name) + '</a></td><td class="n">' + esc(r.code) + '</td>' +
      '<td><input class="in n qd-in" data-qd="rate" data-i="' + r.i + '" inputmode="decimal" value="' + esc(a.rate || '') + '" aria-label="سعر الخصم لكل طن"></td>' +
      '<td><input class="in n qd-in" data-qd="min" data-i="' + r.i + '" inputmode="decimal" value="' + esc(a.min || '') + '" aria-label="حد أدنى بالطن"></td>' +
      '<td><select class="in qd-in" data-qd="off" data-i="' + r.i + '"><option value="0"' + (a.off ? '' : ' selected') + '>فعال</option><option value="1"' + (a.off ? ' selected' : '') + '>موقوف</option></select></td>' +
      '<td class="n">' + APP.fmtq(r.tons) + '</td><td class="n">' + nc(r.value, true) + '</td><td class="n"><b>' + nc(r.due, true) + '</b></td><td class="n">' + nc(r.posted, true) + '</td><td class="n">' + nc(r.rem, true) + '</td>' +
      '<td><span class="qd-st ' + st[0] + '">' + st[1] + '</span></td>' +
      '<td class="qd-c"><input class="in qd-in" data-qd="note" data-i="' + r.i + '" value="' + esc(a.note || '') + '" aria-label="ملاحظات"></td>' +
      '<td class="act nocsv"><button class="btn s danger" data-act="qdDel" data-i="' + r.i + '">حذف</button></td></tr>';
  });
  h += '</tbody><tfoot><tr class="tot"><td colspan="6">الإجمالي</td><td class="n">' + APP.fmtq(t.tons) + '</td><td class="n">' + nc(t.value, true) + '</td><td class="n">' + nc(t.due, true) + '</td><td class="n">' + nc(t.posted, true) + '</td><td class="n">' + nc(t.rem, true) + '</td><td colspan="3"></td></tr></tfoot></table></div>';
  return h;
}
R_.qtydisc = {
  title: 'خصم الكمية الشهري',
  html() {
    const ym = ymOk(APP.fv('qm', '')) ? APP.fv('qm', '') : curYM();
    return '<div class="sheet">' + APP.sheetHead('خصم الكمية الشهري', 'خصم على الكمية المسحوبة شهريًا لعملاء محددين — الكمية = البيع − المرتجع') +
      '<div class="toolbar"><label class="f">الشهر<input class="in" type="month" data-f="qm" id="qdM" value="' + esc(ym) + '"></label>' +
      '<label class="f">كجم في الطن<input class="in n" id="qdKg" inputmode="numeric" value="' + qdKg() + '" style="width:90px"></label>' +
      '<button class="btn primary" data-act="qdAdd">+ اتفاقية جديدة</button><button class="btn" data-act="qdPost">ترحيل المستحق</button><button class="btn" data-act="print">طباعة</button><button class="btn" data-act="csv" data-t="rpt" data-n="خصم_الكمية_الشهري">تصدير CSV</button></div>' +
      '<div id="results">' + qdResults() + '</div>' +
      '<p class="muted sm">الترحيل بيسجّل «خصم» على حساب العميل برقم DSC-السنة-الشهر-كود العميل، وبيحسب الفرق بس لو الشهر اتحسب وترحّل قبل كده. لو عدّلت الكمية أو السعر بعد الترحيل هيظهر «مرحّل جزئياً» والمتبقي.</p></div>';
  },
  results() { return qdResults(); }
};
document.addEventListener('change', e => {
  const t = e.target; if (!t || !t.dataset) return;
  if (t.id === 'qdKg') { const v = parseFloat(t.value); if (v > 0) { S().settings.qtyDiscKg = v; APP.commit(null, { norender: true }); APP.debouncedResults(); } else t.value = qdKg(); return; }
  if (!t.classList || !t.classList.contains('qd-in') || !t.dataset.qd) return;
  const a = qdList()[+t.dataset.i]; if (!a) return; const k = t.dataset.qd;
  if (k === 'rate' || k === 'min') { const v = t.value.trim() === '' ? 0 : parseFloat(t.value); if (isNaN(v) || v < 0) { APP.toast('اكتب رقم صحيح أكبر من أو يساوي صفر.', 'bad'); t.value = a[k] || ''; return; } a[k] = v; }
  else if (k === 'off') a.off = t.value === '1'; else a.note = t.value.trim();
  APP.commit(null, { norender: true }); APP.debouncedResults();
});
APP.acts.qdAdd = () => {
  const custs = S().parties.filter(p => p.type === T.cust);
  APP.modal('<h3>اتفاقية خصم كمية جديدة</h3><div class="mbody"><div class="frow c2"><label class="f">العميل (كود - اسم)<input class="in" id="qaP" list="qaDl" autocomplete="off"><datalist id="qaDl">' + custs.map(p => '<option value="' + esc(p.code + ' - ' + p.name) + '">').join('') + '</datalist></label>' +
    '<label class="f">سعر الخصم لكل طن (جنيه)<input class="in n" id="qaR" inputmode="decimal"></label></div>' +
    '<div class="frow c2"><label class="f">حد أدنى للكمية (طن) — اختياري<input class="in n" id="qaM" inputmode="decimal"></label><label class="f">ملاحظات<input class="in" id="qaN"></label></div><div id="qaErr" class="err"></div></div>' +
    '<div class="mfoot"><button class="btn primary" id="qaOk">إضافة</button><button class="btn" data-act="mclose">إلغاء</button></div>', { wide: 1 });
  $('#qaOk').onclick = () => {
    const txt = $('#qaP').value.trim(), code = txt.split(' - ')[0].trim(), p = custs.find(x => x.code === code) || custs.find(x => x.name === txt), er = $('#qaErr');
    if (!p) { er.textContent = 'اختار العميل من القايمة.'; return; }
    if (qdList().some(a => a.code === p.code)) { er.textContent = 'العميل ده عنده اتفاقية بالفعل — عدّلها من الجدول.'; return; }
    const rate = parseFloat($('#qaR').value || '0'), min = parseFloat($('#qaM').value || '0');
    if (isNaN(rate) || rate <= 0) { er.textContent = 'اكتب سعر الخصم لكل طن (أكبر من صفر).'; return; } if (isNaN(min) || min < 0) { er.textContent = 'الحد الأدنى لازم يكون رقم موجب أو فاضي.'; return; }
    qdList().push({ code: p.code, name: p.name, rate, min, off: false, note: $('#qaN').value.trim() }); APP.mclose(); APP.commit('تمت إضافة الاتفاقية.');
  };
};
APP.acts.qdDel = async b => {
  const a = qdList()[+b.dataset.i]; if (!a) return;
  if (!await APP.confirm('حذف اتفاقية خصم الكمية للعميل ' + a.name + '؟\nالخصومات اللي اترحّلت قبل كده مش هتتأثر.', 'حذف', true)) return;
  qdList().splice(+b.dataset.i, 1); APP.commit('تم حذف الاتفاقية.');
};
APP.acts.qdPost = async () => {
  const ym = ymOk(APP.fv('qm', '')) ? APP.fv('qm', '') : curYM(), C = APP.qdCalc(ym), todo = C.rows.filter(r => (r.st === 'due' || r.st === 'part') && r.rem > 0.004);
  if (!todo.length) { APP.alert('مفيش خصم مستحق للترحيل في هذا الشهر.'); return; }
  let date = ymLast(ym); const today = APP.today(); if (date > today) date = today;
  if (!APP.guard(date)) return;
  const total = r2(todo.reduce((s, r) => s + r.rem, 0));
  if (!await APP.confirm('ترحيل خصم الكمية عن شهر ' + ym + ' بتاريخ ' + date + '\nعدد العملاء: ' + todo.length + ' — الإجمالي: ' + fmt(total) + ' جنيه\n\n' + todo.map(r => '• ' + r.name + ': ' + fmt(r.rem)).join('\n'), 'ترحيل', false)) return;
  let k = 0;
  todo.forEach(r => {
    let doc = 'DSC-' + ym + '-' + r.code, n = 1; while (S().transactions.some(t => t.doc === doc)) { n++; doc = 'DSC-' + ym + '-' + r.code + '-' + n; }
    S().transactions.push(APP.newTx({ date, source: T.sales, doc, type: T.disc, side: 'cr', amount: r.rem, partyType: T.cust, partyCode: r.code, partyName: r.name, desc: QD_MARK + ym })); k++;
  });
  APP.commit('تم ترحيل ' + k + ' خصم بإجمالي ' + fmt(total) + ' جنيه.');
};
})(window);
