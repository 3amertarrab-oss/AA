"""Print the real popup to PDF; use synthetic records, never customer data."""
import copy
import json
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import fitz
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'private-test-artifacts' / 'claim-print'
ARTIFACTS.mkdir(parents=True, exist_ok=True)
checks = []

def check(name, condition):
    assert condition, name
    checks.append(name)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT / 'dist')))
threading.Thread(target=server.serve_forever, daemon=True).start()
url = f'http://127.0.0.1:{server.server_port}/RONIX_Manager.html'
fixture = {
    'projects': [
        {'code': 'DEMO-01', 'name': 'تصميم واجهات', 'client': 'شركة المثال — نموذج تجريبي', 'contract': 10000},
        {'code': 'DEMO-02', 'name': 'مبنى إداري', 'client': 'شركة المثال — نموذج تجريبي', 'contract': 18000},
        {'code': 'DEMO-03', 'name': '', 'client': 'شركة المثال — نموذج تجريبي', 'contract': 7000},
    ],
    'assignments': [], 'payments': [],
    'claims': [{'id': 'CL-DEMO-001', 'code': 'DEMO-01', 'client': 'شركة المثال — نموذج تجريبي',
                'date': '2026-10-22', 'due': '', 'status': 'صادرة', 'total': 12000,
                'projectRows': [{'code': 'DEMO-01', 'amount': 6000}, {'code': 'DEMO-02', 'amount': 2500}, {'code': 'DEMO-03', 'amount': 3500}]}]
}

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH', '/usr/bin/chromium'), args=['--no-sandbox'])
        context = browser.new_context(viewport={'width': 1100, 'height': 1150})
        context.add_init_script('window.__printCount=0;window.print=()=>window.__printCount++')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(url)

        def export_pdf(records, name):
            page.evaluate('(v)=>{data=R14.normalize(v);go("claims")}', records)
            snapshot = page.evaluate('JSON.stringify(data)')
            with page.expect_popup() as popup_info:
                page.evaluate('printClaim(r14Encode(data.claims[0].id))')
            popup = popup_info.value
            popup.on('pageerror', lambda e: errors.append(str(e)))
            popup.wait_for_function('window.__printCount===1')
            path = ARTIFACTS / (name + '.pdf')
            popup.pdf(path=str(path), prefer_css_page_size=True, print_background=False)
            check(name + ': no changes to financial records', page.evaluate('JSON.stringify(data)') == snapshot)
            return popup, fitz.open(path)

        popup, pdf = export_pdf(fixture, 'claim-reference')
        check('reference claim fits one A4 portrait page', len(pdf) == 1 and abs(pdf[0].rect.width - 595.28) < 1 and abs(pdf[0].rect.height - 841.89) < 1)
        check('only project and receipt tables are printed', popup.locator('table').count() == 2)
        check('header uses the claim date', '2026-10-22' in popup.locator('.document-meta').inner_text())
        check('missing project name uses dash', popup.locator('.project-name').nth(2).inner_text() == '—')
        check('total and empty receipt message retained', '12,000' in popup.locator('.claim-total').inner_text() and 'لا توجد دفعات مسجلة' in popup.locator('.receipts-table').inner_text())
        check('no empty settlement tables or duplicate items', 'بنود المستند' not in popup.locator('body').inner_text() and popup.locator('.claim-summary .paid').inner_text().endswith('0 ج.م'))
        pdf[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(ARTIFACTS / 'claim-reference.png'))
        pdf.close(); popup.close()

        with_receipts = copy.deepcopy(fixture)
        image = page.evaluate("""() => {const c=document.createElement('canvas');c.width=116;c.height=88;const ctx=c.getContext('2d');ctx.fillStyle='#e9edf3';ctx.fillRect(0,0,116,88);ctx.strokeStyle='#8b6a37';ctx.lineWidth=2;ctx.strokeRect(28,20,60,52);ctx.beginPath();ctx.moveTo(28,40);ctx.lineTo(88,40);ctx.moveTo(48,20);ctx.lineTo(48,72);ctx.moveTo(68,20);ctx.lineTo(68,72);ctx.stroke();return c.toDataURL()}""")
        for p in with_receipts['projects']:
            p['photos'] = [{'id': 'COVER', 'src': image}]; p['coverId'] = 'COVER'
        with_receipts['clientReceipts'] = [
            {'id': 'R1', 'batchId': 'RC-00000000-1111-2222-3333-444444444444', 'code': 'DEMO-01', 'date': '2026-10-24', 'amount': 2000.25},
            {'id': 'R2', 'batchId': 'RC-00000000-1111-2222-3333-444444444444', 'code': 'DEMO-02', 'date': '2026-10-24', 'amount': 750},
        ]
        with_receipts['claimSettlements'] = [{'claimId': 'CL-DEMO-001', 'receiptId': 'R1', 'code': 'DEMO-01', 'amount': 1000.25}]
        popup, pdf = export_pdf(with_receipts, 'claim-with-receipts')
        check('three projects with photos and receipts fit one page', len(pdf) == 1)
        check('project images finish decoding before print', popup.evaluate('Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)'))
        check('partial settlement retained with piastres', '1,000.25' in popup.locator('.claim-summary .paid').inner_text() and '10,999.75' in popup.locator('.claim-total').inner_text())
        check('receipt references and allocated amounts retained', popup.locator('.receipts-table tbody tr').count() == 2 and '2,000.25' in popup.locator('.receipts-table').inner_text() and 'RC-00000000-1111-2222-3333-444444444444' in popup.locator('.receipts-table').inner_text())
        check('larger project photos preserve their full proportions', popup.locator('.photo img').evaluate_all("els=>els.every(e=>e.clientWidth>=140&&e.clientHeight>=96&&getComputedStyle(e).objectFit==='contain')"))
        check('actual offline RONIX logo is embedded', popup.locator('.brand-logo').evaluate("e=>e.src.startsWith('data:image/webp;base64,')&&e.naturalWidth>1000"))
        check('required total deducts only this claim settlement', popup.locator('.projects-table tbody tr').first.locator('td.due').inner_text() == '4,999.75' and '10,999.75' in popup.locator('.claim-total').inner_text())
        check('payment and required text use consistent colors', popup.locator('.paid').evaluate_all("els=>els.every(e=>getComputedStyle(e).color==='rgb(8, 127, 70)')") and popup.locator('.due').evaluate_all("els=>els.every(e=>getComputedStyle(e).color==='rgb(198, 40, 40)')"))
        colors={span['color'] for sheet in pdf for block in sheet.get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans']}
        check('green and red survive PDF printing with backgrounds disabled', 0x087f46 in colors and 0xc62828 in colors)
        check('claim table and total fit the paper width', popup.locator('table,.claim-total').evaluate_all("els=>els.every(e=>e.scrollWidth<=e.clientWidth+1)"))
        pdf[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5)).save(str(ARTIFACTS / 'claim-with-receipts.png'))
        pdf.close(); popup.close()

        # Fully settled and inactive claims must not present a positive payable balance.
        full = copy.deepcopy(fixture)
        full['clientReceipts'] = [{'id': 'FULL-'+r['code'], 'code': r['code'], 'date': '2026-10-24', 'amount': r['amount']} for r in full['claims'][0]['projectRows']]
        full['claimSettlements'] = [{'claimId': 'CL-DEMO-001', 'receiptId': r['id'], 'code': r['code'], 'amount': r['amount']} for r in full['clientReceipts']]
        popup, pdf = export_pdf(full, 'claim-settled')
        check('fully paid claim shows zero required and complete paid total', popup.locator('.claim-total bdi').inner_text() == '0' and '12,000' in popup.locator('.claim-summary .paid').inner_text())
        pdf.close(); popup.close()
        inactive=copy.deepcopy(fixture); inactive['claims'][0]['status']='ملغاة'
        popup, pdf = export_pdf(inactive, 'claim-cancelled')
        check('cancelled claim labels its balance instead of requesting payment', 'ملغاة' in popup.locator('.claim-total').inner_text() and 'إجمالي المطلوب سداده' not in popup.locator('.claim-total').inner_text())
        pdf.close(); popup.close()

        # Exercise actual application views, including the client and designer sides.
        ui=copy.deepcopy(with_receipts)
        ui['assignments']=[{'id':'A1','code':'DEMO-01','designer':'مصمم تجريبي','fee':1500,'kind':'تصميم'}]
        ui['payments']=[{'id':'PAY-01','code':'DEMO-01','designer':'مصمم تجريبي','amount':500.25,'date':'2026-10-24','method':'نقدي'}]
        page.evaluate('(v)=>{data=R14.normalize(v);go("claims")}',ui)
        snapshot=page.evaluate('JSON.stringify(data)')
        def tones(name, both=True):
            green=page.locator('#content .r14-paid')
            red=page.locator('#content .r14-due')
            check(name+' payments are green', green.count()>0 and green.evaluate_all("els=>els.every(e=>getComputedStyle(e).color==='rgb(8, 127, 70)')"))
            if both:
                check(name+' required balances are red', red.count()>0 and red.evaluate_all("els=>els.every(e=>getComputedStyle(e).color==='rgb(198, 40, 40)')"))
        tones('claims')
        page.set_viewport_size({'width':1440,'height':1000})
        page.wait_for_timeout(350)
        page.screenshot(path=str(ARTIFACTS/'app-claims.png'),full_page=True)
        for view in ['dashboard','clients','designers','payments','costcenters','reports','advanced']:
            page.evaluate('(view)=>go(view)',view)
            tones(view, both=view!='payments')
        page.evaluate("go('projects');openProject('DEMO-01')")
        tones('project')
        page.evaluate("go('clients');selectClient(r14Encode(data.projects[0].client))")
        tones('client statement')
        page.evaluate("go('designers');showDesigner(r14Encode('مصمم تجريبي'))")
        tones('designer statement')
        page.evaluate("go('claims');openClaim(null,'CL-DEMO-001')")
        check('editor has larger photos and red monetary inputs', page.locator('.r14-claim-photo').first.evaluate("e=>e.clientWidth>=126&&e.clientHeight>=94") and page.locator('#claimRows input').first.evaluate("e=>getComputedStyle(e).color==='rgb(198, 40, 40)'"))
        check('editor shows green receipt amounts', page.locator('#claimReceipts .r14-paid').count()==2)
        page.evaluate('closeModal()')
        check('viewing and editing without saving leave finance data unchanged', page.evaluate('JSON.stringify(data)')==snapshot)

        long_claim = copy.deepcopy(fixture)
        long_claim['projects'] = [{**fixture['projects'][0], 'code': f'PROJECT-{i:03}'} for i in range(1, 46)]
        long_claim['claims'][0]['code'] = 'PROJECT-001'
        long_claim['claims'][0]['projectRows'] = [{'code': p['code'], 'amount': 100} for p in long_claim['projects']]
        long_claim['claims'][0]['total'] = 4500
        popup, pdf = export_pdf(long_claim, 'claim-long')
        printed_text = '\n'.join(p.get_text() for p in pdf)
        check('long claims paginate without dropping project rows', len(pdf) > 1 and all(p['code'] in printed_text for p in long_claim['projects']))
        check('long claims keep portrait orientation', all(p.rect.height > p.rect.width for p in pdf))
        pdf.close(); popup.close()

        legacy = copy.deepcopy(fixture)
        legacy['claims'][0]['items'] = [{'desc': 'تفاصيل عمل متفق عليها', 'amount': 12000}]
        legacy['claims'][0]['note'] = '<script>window.unwantedExecution=true</script>'
        popup, pdf = export_pdf(legacy, 'claim-legacy-details')
        check('custom legacy descriptions remain printable', 'تفاصيل عمل متفق عليها' in popup.locator('.details').inner_text())
        check('notes remain escaped text', popup.locator('script').count() == 0 and popup.locator('.note').inner_text() == legacy['claims'][0]['note'])
        pdf.close(); popup.close()
        check('print workflows have no JavaScript exceptions', not errors)
        result = {'passed': len(checks), 'checks': checks, 'errors': errors}
        (ROOT / 'tests/claim-print-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
        print(json.dumps(result, ensure_ascii=False, indent=2))
        browser.close()
finally:
    server.shutdown()
