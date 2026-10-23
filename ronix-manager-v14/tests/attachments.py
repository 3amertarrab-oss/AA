"""Exercise transfer evidence through the real forms, storage, download and restore."""
import base64
import json
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import fitz
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'private-test-artifacts'/'attachments'
OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name)
class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')))
threading.Thread(target=server.serve_forever,daemon=True).start()
url=f'http://127.0.0.1:{server.server_port}/RONIX_Manager.html'
fixture={'projects':[{'code':'A','name':'مشروع تجريبي','client':'عميل تجريبي','contract':2000},{'code':'B','name':'مشروع ثان','client':'عميل تجريبي','contract':3000}], 'assignments':[{'id':'D1','code':'A','designer':'مصمم تجريبي','fee':1000}], 'payments':[]}
try:
    with sync_playwright() as pw:
        browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True,timezone_id='Africa/Cairo')
        page=context.new_page();errors=[];dialogs=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
        page.goto(url)
        page.evaluate('(v)=>{data=R14.normalize(v);r14Persist(data);go("payments")}',fixture)
        def submit():
            page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
        def upload(buffer,name='transfer-example.png',mime='image/png'):
            page.locator('.r14-proof-input').set_input_files({'name':name,'mimeType':mime,'buffer':buffer})
            page.wait_for_function("!document.querySelector('#modalBody form')._r14Proof.loading")
        png=base64.b64decode(page.evaluate("""()=>{const c=document.createElement('canvas');c.width=640;c.height=280;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#087f46';x.font='bold 28px Arial';x.fillText('TRANSFER RECEIPT - DEMO',35,60);x.fillStyle='#172b45';x.font='22px Arial';x.fillText('Synthetic test document',35,120);x.fillText('Amount: EGP 100.25',35,180);x.fillText('No real banking details',35,230);return c.toDataURL().split(',')[1]}"""))
        page.evaluate("openPayment('A',r14Encode('مصمم تجريبي'))")
        page.locator('#payamount').fill('100.25');upload(png)
        check('designer form previews transfer image before saving',page.locator('.r14-proof-image').is_visible())
        submit()
        check('new designer payment and image saved together',page.evaluate("data.payments.length===1&&Object.keys(data.paymentAttachments).length===1&&data.payments[0].amount===100.25"))
        payment=page.evaluate('data.payments[0].id')
        payment_file=page.evaluate('(id)=>data.paymentAttachments[id]',payment)
        page.reload()
        page.evaluate("go('payments')")
        page.get_by_role('button',name='عرض المستند',exact=True).click()
        check('saved payment document opens after reload',page.locator('.r14-proof-image').is_visible() and page.evaluate('data.paymentAttachments[data.payments[0].id]')==payment_file)
        with page.expect_download() as download:
            page.get_by_role('button',name='تنزيل المستند',exact=True).click()
        check('download preserves original image bytes',Path(download.value.path()).read_bytes()==png)
        with page.expect_popup() as pop:
            page.get_by_role('button',name='فتح بالحجم الكامل',exact=True).click()
        popup=pop.value;popup.wait_for_load_state()
        check('full-size preview opens as a local blob',popup.url.startswith('blob:'))
        popup.close()
        page.wait_for_timeout(250);page.screenshot(path=str(OUT/'designer-proof.png'),full_page=True)
        page.evaluate("closeModal();openPayment(null,null,r14Encode(data.payments[0].id))")
        page.locator('#payamount').fill('110.25');submit()
        check('editing payment amount retains original transfer image',page.evaluate('data.payments[0].amount===110.25') and page.evaluate('(id)=>data.paymentAttachments[id]',payment)==payment_file)

        page.evaluate("openCustomerReceipt(r14Encode('عميل تجريبي'))")
        page.locator('#crAmount').fill('400.25')
        page.locator('.receipt-allocation[data-code="A"]').fill('100')
        page.locator('.receipt-allocation[data-code="B"]').fill('200')
        upload(png,'client-transfer.png');submit()
        batch=page.evaluate('data.clientReceipts[0].batchId')
        receipt_file=page.evaluate('(id)=>data.receiptAttachments[id]',batch)
        check('one client document covers allocated and unallocated receipt rows',page.evaluate("data.clientReceipts.length===3&&Object.keys(data.receiptAttachments).length===1&&customerTotals('عميل تجريبي').cash===400.25"))
        page.evaluate('(id)=>editCustomerReceipt(r14Encode(id))',batch)
        page.locator('.receipt-allocation[data-code="A"]').fill('125');submit()
        check('reallocation preserves receipt image and cash',page.evaluate('(id)=>data.receiptAttachments[id]',batch)==receipt_file and page.evaluate("customerTotals('عميل تجريبي').cash===400.25"))
        page.evaluate("go('clients');selectClient(r14Encode('عميل تجريبي'))")
        page.get_by_role('button',name='عرض المستند',exact=True).click()
        check('client statement exposes its transfer document',page.locator('.r14-proof-image').is_visible())
        page.evaluate('closeModal()')

        # Cancel and failed saving must never partially alter money or attachments.
        before=page.evaluate('JSON.stringify(data)');disk=page.evaluate('localStorage.getItem(KEY)')
        page.evaluate("openPayment(null,null,r14Encode(data.payments[0].id))")
        upload(png,'cancelled.png');page.evaluate('closeModal()')
        check('cancelling a selected replacement leaves data unchanged',page.evaluate('JSON.stringify(data)')==before and page.evaluate('localStorage.getItem(KEY)')==disk)
        page.evaluate("openPayment(null,null,r14Encode(data.payments[0].id))")
        page.locator('#payamount').fill('120.25');upload(png,'replacement.png')
        page.evaluate("()=>{window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota test')}}")
        submit()
        check('failed payment save rolls back both amount and evidence',page.evaluate('JSON.stringify(data)')==before and page.evaluate('localStorage.getItem(KEY)')==disk and page.locator('#overlay').evaluate("e=>e.classList.contains('open')"))
        page.evaluate('Storage.prototype.setItem=originalSet;closeModal()')
        page.evaluate('(id)=>editCustomerReceipt(r14Encode(id))',batch)
        page.locator('#crAmount').fill('410.25');upload(png,'receipt-replacement.png')
        page.evaluate("()=>{Storage.prototype.setItem=()=>{throw Error('quota test')}}")
        submit()
        check('failed client receipt save rolls back money and evidence',page.evaluate('JSON.stringify(data)')==before and page.evaluate('localStorage.getItem(KEY)')==disk)
        page.evaluate('Storage.prototype.setItem=originalSet;closeModal()')

        page.evaluate('(id)=>r14ManageProof("payment",r14Encode(id))',payment)
        for name,mime,content in [('bad.html','text/html',b'<script>alert(1)</script>'),('fake.png','image/png',b'not an image'),('too-big.png','image/png',b'x'*(2*1024*1024+1))]:
            upload(content,name,mime);submit()
            check(name+' is rejected without changing stored evidence',page.evaluate('JSON.stringify(data)')==before and page.locator('.r14-proof-preview [role=alert]').count()==1)
        page.evaluate('closeModal()')
        page.evaluate('(id)=>r14ManageProof("payment",r14Encode(id))',payment)
        page.evaluate("()=>{window.originalRead=r14ReadProof;window.waitingReads=[];r14ReadProof=file=>new Promise(resolve=>waitingReads.push(()=>originalRead(file).then(resolve)))}")
        file_input=page.locator('.r14-proof-input')
        file_input.set_input_files({'name':'slow-first.png','mimeType':'image/png','buffer':png})
        submit()
        check('save while reading is blocked without losing existing data',page.evaluate('JSON.stringify(data)')==before)
        file_input.set_input_files({'name':'latest.png','mimeType':'image/png','buffer':png})
        page.evaluate('waitingReads[1]()');page.wait_for_function("document.querySelector('#modalBody form')._r14Proof.file.name==='latest.png'")
        page.evaluate('waitingReads[0]()');page.wait_for_timeout(100)
        check('latest selected file wins when reads finish out of order',page.locator('.r14-proof-name').inner_text()=='latest.png')
        page.evaluate('r14ReadProof=originalRead;closeModal()')

        # PDF replacement, deletion, and re-attachment only change the evidence.
        pdf=fitz.open();pdf.new_page().insert_text((50,50),'SYNTHETIC TRANSFER PROOF');pdf_bytes=pdf.tobytes();pdf.close()
        page.evaluate('(id)=>r14ManageProof("payment",r14Encode(id))',payment)
        upload(pdf_bytes,'transfer.pdf','application/pdf');submit()
        check('PDF transfer evidence is accepted',page.evaluate('(id)=>data.paymentAttachments[id].mime',payment)=='application/pdf')
        page.evaluate('(id)=>r14ManageProof("payment",r14Encode(id))',payment)
        page.get_by_role('button',name='إزالة المستند',exact=True).click();submit()
        check('removing evidence retains the payment record and amount',page.evaluate('(id)=>!Object.hasOwn(data.paymentAttachments,id)&&data.payments[0].amount===110.25',payment))
        page.evaluate('(id)=>r14ManageProof("payment",r14Encode(id))',payment)
        upload(png);submit()

        page.evaluate('openAdvance()')
        page.locator('#adClient').select_option(label='عميل تجريبي');page.locator('#adTotal').fill('50.25');upload(png,'advance.png');submit()
        advance=page.evaluate('data.advances[0].id')
        page.evaluate('(id)=>openApplyAdvance(r14Encode(id))',advance)
        page.locator('.apply-advance[data-code="A"]').fill('25');submit()
        check('advance allocation points to original transfer proof without new cash',page.evaluate("r14ReceiptProofKey(data.clientReceipts.find(r=>r.sourceAdvanceId))===data.advances[0].id && customerTotals('عميل تجريبي').cash===450.5 && Object.keys(data.receiptAttachments).length===2"))
        page.evaluate("go('advanced');openAdvancedClient(r14Encode('عميل تجريبي'))")
        check('advance table exposes transfer evidence',page.locator('#advancedDetail').get_by_role('button',name='عرض المستند',exact=True).count()==1)
        evidence=page.evaluate('({payments:data.paymentAttachments,receipts:data.receiptAttachments})')
        with page.expect_download() as download:
            page.evaluate('backup()')
        backup=Path(download.value.path()).read_bytes()
        restored=json.loads(backup)
        check('backup includes both payment and client documents',restored['paymentAttachments']==evidence['payments'] and restored['receiptAttachments']==evidence['receipts'])
        page.evaluate('data=r14Empty();r14Persist(data);render()')
        page.locator('#restore').set_input_files({'name':'latest.json','mimeType':'application/json','buffer':backup})
        page.get_by_role('button',name='استيراد هذه النسخة',exact=True).click()
        page.reload()
        check('backup restore preserves all evidence and balances',page.evaluate('({payments:data.paymentAttachments,receipts:data.receiptAttachments})')==evidence and page.evaluate("data.payments[0].amount===110.25 && customerTotals('عميل تجريبي').cash===450.5"))
        check('all restored evidence passes data audit',page.evaluate('v8Audit().length===0'))
        check('attachment workflows have no JavaScript exceptions',not errors)
        result={'passed':len(checks),'checks':checks,'errors':errors}
        (ROOT/'tests/attachment-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
        print(json.dumps(result,ensure_ascii=False,indent=2))
        browser.close()
finally:
    server.shutdown()
