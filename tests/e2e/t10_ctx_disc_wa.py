"""Right-click menu on the references, monthly quantity discount, WhatsApp messages."""
import asyncio, os
from playwright.async_api import async_playwright
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')); URL = 'file://' + BASE + '/dist/SIYADA.html'; SH = BASE + '/tests/e2e/shots'
os.makedirs(SH, exist_ok=True)
fails = []
def check(name, got, exp, tol=0.005):
    ok = abs(got - exp) <= tol if isinstance(exp, (int, float)) and not isinstance(exp, bool) else got == exp
    print(('PASS ' if ok else 'FAIL ') + name + ' got=' + str(got) + ' exp=' + str(exp))
    if not ok: fails.append(name)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1366, 'height': 850}, locale='ar-EG'); page = await ctx.new_page(); errs = []
        page.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e))); page.on('console', lambda m: errs.append('CONSOLE ' + m.text) if m.type == 'error' else None)
        await page.goto(URL); await page.wait_for_selector('#suCo'); await page.fill('#suCo', 'شركة الاختبار'); await page.fill('#suDt', '2025-01-01')
        await page.click('text=ابدأ بدفاتر جديدة'); await page.wait_for_selector('#app')
        await page.evaluate("""() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; window.__printed = 0; window.print = () => { window.__printed++; }; }""")
        async def go(h):
            changed = await page.evaluate("h => { const m = document.querySelector('#main'); if (location.hash === h) return false; if (m) Array.from(m.children).forEach(e => e.setAttribute('data-old', '1')); location.hash = h; return true; }", '#/' + h)
            if changed: await page.wait_for_function("() => !document.querySelector('#main [data-old]')", timeout=10000)
        # ---- seed: 2 customers, 1 supplier, 1 item, October sales/returns
        await page.evaluate("""() => { const S = APP.S, T = SiyadaEngine.T;
          S.parties.push({code:'C-01',name:'أحمد العميل',type:T.cust,phone:'01012345678',address:'',opening:0,limit:0,priceList:''},
                         {code:'C-02',name:'محمود العميل',type:T.cust,phone:'',address:'',opening:0,limit:0,priceList:''},
                         {code:'R-01',name:'شركة المورد',type:T.supp,phone:'01155555555',address:'',opening:0,limit:0,priceList:''});
          S.items.push({code:'I-01',name:'أرز',unit:'كجم',weight:0,openQty:0,openCost:0,vat:'',eta:'',etaType:'',reorder:0});
          const tx = (date, doc, type, side, amt, code, name, qty, price, src) => S.transactions.push(APP.newTx({date, source: src || T.sales, doc, type, side, amount: amt, partyType: src === T.purch ? T.supp : T.cust, partyCode: code, partyName: name, itemCode: qty ? 'I-01' : '', itemName: qty ? 'أرز' : '', qty: qty || 0, price: price || 0}));
          tx('2026-10-05','FB-1',T.sale,'dr',20000,'C-01','أحمد العميل',2000,10);
          tx('2026-10-20','FB-2',T.sale,'dr',15000,'C-01','أحمد العميل',1500,10);
          tx('2026-10-25','MR-1',T.ret,'cr',5000,'C-01','أحمد العميل',500,10);
          tx('2026-10-12','FB-3',T.sale,'dr',10000,'C-02','محمود العميل',1000,10);
          tx('2026-09-12','FB-0',T.sale,'dr',99999,'C-01','أحمد العميل',9000,11);
          tx('2026-10-02','PB-1',T.buy,'cr',8000,'R-01','شركة المورد',800,10,T.purch);
          APP.commit(); }""")
        # ---- calc is correct before any UI
        await page.evaluate("() => { APP.S.settings.qtyDisc = [{code:'C-01',rate:100,min:2,off:false,note:''},{code:'C-02',rate:50,min:2,off:false,note:''},{code:'ZZ',rate:5,min:0,off:false,note:''}]; }")
        c = await page.evaluate("() => APP.qdCalc('2026-10')")
        r0, r1, r2_ = c['rows']
        check('C-01 net tons (2000+1500-500 kg)', r0['tons'], 3.0); check('C-01 due', r0['due'], 300.0); check('C-01 status', r0['st'], 'due'); check('C-01 net value', r0['value'], 30000.0)
        check('C-02 below minimum', r1['st'], 'min'); check('C-02 due 0', r1['due'], 0); check('missing customer', r2_['st'], 'nocust')
        check('other month is separate', (await page.evaluate("() => APP.qdCalc('2026-09').rows[0].tons")), 9.0)
        await page.evaluate("() => { APP.S.settings.qtyDisc.pop(); APP.S.settings.qtyDisc.length = 0; }")
        # ---- the screen: add an agreement through the form
        await go('qtydisc'); await page.wait_for_selector('#qdM'); await page.fill('#qdM', '2026-10'); await page.wait_for_timeout(300)
        await page.click('[data-act="qdAdd"]'); await page.fill('#qaP', 'C-01 - أحمد العميل'); await page.fill('#qaR', '100'); await page.fill('#qaM', '2'); await page.click('#qaOk')
        await page.wait_for_selector('#results table.grid'); await page.wait_for_timeout(200)
        check('agreement saved in settings', await page.evaluate("() => APP.S.settings.qtyDisc.length"), 1)
        check('duplicate agreement refused', await page.evaluate("""async () => { document.querySelector('[data-act="qdAdd"]').click(); document.querySelector('#qaP').value = 'C-01 - أحمد العميل'; document.querySelector('#qaR').value = '5'; document.querySelector('#qaOk').click(); const t = document.querySelector('#qaErr').textContent; document.querySelector('[data-act="mclose"]').click(); return t.length > 0; }"""), True)
        check('still one agreement', await page.evaluate("() => APP.S.settings.qtyDisc.length"), 1)
        await page.screenshot(path=SH + '/10_qtydisc.png')
        txt = await page.inner_text('#results')
        check('screen shows status', 'مستحق للترحيل' in txt, True)
        # ---- post
        bal0 = await page.evaluate("() => APP.bal('C-01') ? 0 : 0")
        before = await page.evaluate("() => APP.pBy.get('C-01').balance")
        await page.click('[data-act="qdPost"]'); await page.wait_for_selector('#cfOk'); await page.click('#cfOk'); await page.wait_for_timeout(300)
        d = await page.evaluate("() => APP.S.transactions.filter(t => t.type === 'خصم').map(t => [t.doc, t.credit, t.date, t.source, t.desc])")
        check('one discount tx posted', len(d), 1); check('doc number', d[0][0], 'DSC-2026-10-C-01'); check('amount credited', d[0][1], 300.0); check('dated month end', d[0][2], '2026-10-31'); check('marker text', d[0][4], 'خصم كمية شهري 2026-10')
        after = await page.evaluate("() => APP.pBy.get('C-01').balance")
        check('customer balance reduced by 300', before - after, 300.0)
        check('journal still balanced', await page.evaluate("() => APP.R.checks.filter(c => c.level === 'bad' || c.bad).length"), 0)
        # posting again does nothing
        await page.click('[data-act="qdPost"]'); await page.wait_for_selector('#alOk'); await page.click('#alOk')
        check('no second discount', await page.evaluate("() => APP.S.transactions.filter(t => t.type === 'خصم').length"), 1)
        check('status done', await page.evaluate("() => APP.qdCalc('2026-10').rows[0].st"), 'done')
        # raise the rate: partial
        await page.fill('.qd-in[data-qd="rate"][data-i="0"]', '120'); await page.dispatch_event('.qd-in[data-qd="rate"][data-i="0"]', 'change'); await page.wait_for_timeout(400)
        c = await page.evaluate("() => APP.qdCalc('2026-10').rows[0]"); check('partial status', c['st'], 'part'); check('remaining 60', c['rem'], 60.0); check('due 360', c['due'], 360.0)
        await page.click('[data-act="qdPost"]'); await page.wait_for_selector('#cfOk'); await page.click('#cfOk'); await page.wait_for_timeout(300)
        d = await page.evaluate("() => APP.S.transactions.filter(t => t.type === 'خصم').map(t => [t.doc, t.credit])")
        check('second doc number', d[1][0], 'DSC-2026-10-C-01-2'); check('only the difference', d[1][1], 60.0)
        check('now done', await page.evaluate("() => APP.qdCalc('2026-10').rows[0].st"), 'done')
        await page.screenshot(path=SH + '/10_qtydisc_done.png')
        # stop / invalid
        await page.evaluate("() => { APP.S.settings.qtyDisc[0].off = true; }"); check('stopped agreement', await page.evaluate("() => APP.qdCalc('2026-10').rows[0].st"), 'off')
        await page.evaluate("() => { APP.S.settings.qtyDisc[0].off = false; }")
        # ---- right-click menu on the sales reference
        await go('refsale'); await page.wait_for_selector('tr.rf[data-doc]')
        check('hint line shown', await page.locator('.hint-ctx').count(), 1)
        first = page.locator('tr.rf[data-doc]').first; doc1 = await first.get_attribute('data-doc')
        await first.click(button='right'); await page.wait_for_selector('.ctxm')
        labels = await page.locator('.ctxm .ci span').all_inner_texts()
        for want in ['عرض الفاتورة', 'تعديل', 'طباعة A4', 'طباعة A5', 'كشف حساب العميل', 'رسالة واتساب', 'نسخ رقم المستند', 'حذف']:
            check('menu has ' + want, want in labels, True)
        check('row is highlighted', await page.locator('tr.ctxsel').count(), 1)
        await page.screenshot(path=SH + '/10_ctxmenu.png')
        await page.keyboard.press('Escape'); check('Esc closes the menu', await page.locator('.ctxm').count(), 0)
        await first.click(button='right'); await page.click('.ctxm .ci:has-text("عرض الفاتورة")'); await page.wait_for_selector('.sheet.doc table.grid')
        check('view opens the document', (await page.evaluate("() => location.hash")).startswith('#/doc/'), True)
        await go('refsale'); await page.wait_for_selector('tr.rf[data-doc]')
        await page.locator('tr.rf[data-doc]').first.click(button='right'); await page.click('.ctxm .ci:has-text("طباعة A4")'); await page.wait_for_function("() => window.__printed >= 1", timeout=5000)
        check('print A4 triggered', await page.evaluate("() => window.__printed"), 1)
        await go('refsale'); await page.wait_for_selector('tr.rf[data-doc]')
        await page.locator('tr.rf[data-doc]').first.click(button='right'); await page.click('.ctxm .ci:has-text("طباعة A5")'); await page.wait_for_function("() => window.__printed >= 2", timeout=5000)
        check('print A5 triggered', await page.evaluate("() => window.__printed"), 2)
        # edit from the menu, then save: no WhatsApp prompt for an edit
        await go('refsale'); await page.wait_for_selector('tr.rf[data-doc]')
        await page.locator('tr.rf[data-doc]').first.click(button='right'); await page.click('.ctxm .ci:has-text("تعديل")'); await page.wait_for_selector('#frm[data-edit]:not([data-edit=""])')
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sheet.doc table.grid'); await page.wait_for_timeout(700)
        check('edit does not ask for a WhatsApp message', await page.locator('#waTx').count(), 0)
        # delete from the menu
        await go('refsale'); await page.wait_for_selector('tr.rf[data-doc]')
        n0 = await page.evaluate("() => new Set(APP.S.transactions.map(t => t.doc)).size")
        row = page.locator('tr.rf[data-doc="FB-3"]'); await row.click(button='right'); await page.click('.ctxm .ci.danger'); await page.wait_for_selector('#cfOk'); await page.click('#cfOk'); await page.wait_for_timeout(400)
        check('delete removed the document', await page.evaluate("() => APP.S.transactions.some(t => t.doc === 'FB-3')"), False)
        check('only that document', await page.evaluate("() => new Set(APP.S.transactions.map(t => t.doc)).size"), n0 - 1)
        # purchases reference
        await go('refpur'); await page.wait_for_selector('tr.rf[data-doc]')
        await page.locator('tr.rf[data-doc]').first.click(button='right'); await page.wait_for_selector('.ctxm')
        check('supplier statement item', 'كشف حساب المورد' in await page.locator('.ctxm .ci span').all_inner_texts(), True)
        await page.keyboard.press('Escape')
        # ---- WhatsApp after a new receipt
        await go('receipt'); await page.wait_for_selector('#frm'); await page.fill('#fP', 'C-01 - أحمد العميل'); await page.dispatch_event('#fP', 'input'); await page.fill('#fAmt', '1000')
        balBefore = await page.evaluate("() => APP.pBy.get('C-01').balance")
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('#waTx', timeout=6000)
        msg = await page.input_value('#waTx')
        check('message names the customer', 'أحمد العميل' in msg, True); check('message has company', 'شركة الاختبار' in msg, True)
        check('message has before balance', ('{:,.2f}'.format(balBefore)) in msg, True)
        check('message has after balance', ('{:,.2f}'.format(balBefore - 1000)) in msg, True)
        check('phone prefilled', await page.input_value('#waPh'), '01012345678')
        await page.screenshot(path=SH + '/10_wa.png')
        await page.click('#waGo'); await page.wait_for_timeout(200)
        u = await page.evaluate("() => window.__opened[window.__opened.length - 1]")
        check('wa.me link with country code', u.startswith('https://wa.me/201012345678?text='), True)
        check('log entry saved', await page.evaluate("() => APP.S.settings.waLog.length"), 1)
        # customer without a phone: asks for it and remembers it
        await go('sale'); await page.wait_for_selector('#frm'); await page.fill('#fP', 'C-02 - محمود العميل'); await page.dispatch_event('#fP', 'input')
        r = page.locator('#lnBody tr').nth(0); await r.locator('.li').fill('I-01 - أرز'); await r.locator('.lq').fill('100'); await r.locator('.lp').fill('10')
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('#waTx', timeout=6000)
        await page.click('#waGo'); check('missing phone is refused', len(await page.inner_text('#waErr')) > 0, True)
        await page.fill('#waPh', '٠١٢٣٤٥٦٧٨٩٠'); await page.click('#waGo'); await page.wait_for_timeout(200)
        check('phone remembered', await page.evaluate("() => APP.S.parties.find(p => p.code === 'C-02').phone"), '٠١٢٣٤٥٦٧٨٩٠')
        check('arabic digits normalised', (await page.evaluate("() => window.__opened[window.__opened.length - 1]")).startswith('https://wa.me/201234567890?text='), True)
        # "don't ask again" for a customer
        await go('sale'); await page.wait_for_selector('#frm'); await page.fill('#fP', 'C-02 - محمود العميل'); await page.dispatch_event('#fP', 'input')
        r = page.locator('#lnBody tr').nth(0); await r.locator('.li').fill('I-01 - أرز'); await r.locator('.lq').fill('10'); await r.locator('.lp').fill('10')
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('#waTx', timeout=6000); await page.check('#waNo'); await page.click('#modal .mfoot [data-act="mclose"]'); await page.wait_for_timeout(200)
        check('flag stored', await page.evaluate("() => !!APP.S.parties.find(p => p.code === 'C-02').noWa"), True)
        await go('sale'); await page.wait_for_selector('#frm'); await page.fill('#fP', 'C-02 - محمود العميل'); await page.dispatch_event('#fP', 'input')
        r = page.locator('#lnBody tr').nth(0); await r.locator('.li').fill('I-01 - أرز'); await r.locator('.lq').fill('10'); await r.locator('.lp').fill('10')
        await page.click('[data-act="saveDoc"]'); await page.wait_for_selector('.sheet.doc table.grid'); await page.wait_for_timeout(700)
        check('no prompt after the flag', await page.locator('#waTx').count(), 0)
        # log screen + settings
        await go('walog'); await page.wait_for_selector('#rpt')
        check('log shows 2 rows', await page.locator('#rpt tbody tr').count(), 2)
        await page.click('[data-act="waSettings"]'); await page.wait_for_selector('#wsOk'); await page.fill('[data-wk="receipt"]', 'تم استلام {القيمة} من {الاسم}'); await page.uncheck('#wsOn'); await page.click('#wsOk'); await page.wait_for_timeout(300)
        check('template saved', await page.evaluate("() => APP.S.settings.wa.tpl.receipt"), 'تم استلام {القيمة} من {الاسم}'); check('prompt disabled', await page.evaluate("() => APP.S.settings.wa.on"), False)
        # ---- everything survives a reload
        await page.wait_for_timeout(1500); await page.reload(); await page.wait_for_selector('#app'); await page.wait_for_timeout(600)
        check('agreements persisted', await page.evaluate("() => APP.S.settings.qtyDisc.length"), 1); check('log persisted', await page.evaluate("() => APP.S.settings.waLog.length"), 2); check('discount docs persisted', await page.evaluate("() => APP.S.transactions.filter(t => t.type === 'خصم').length"), 2)
        # ---- theme
        check('default theme is navy & gold', await page.evaluate("() => document.documentElement.dataset.theme"), 'navy_gold')
        await go('dashboard'); await page.wait_for_timeout(300); await page.screenshot(path=SH + '/10_theme.png')
        check('no page errors', errs, [])
        if errs: print('\n'.join(errs))
        await b.close()
    print('FAILS:', fails if fails else 0)
asyncio.run(main())
