"""Unified reversible deletion UI and mobile reachability."""
import json, os, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]; checks=[]
def check(name,value): assert value,name; checks.append(name); print('PASS:',name,flush=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
fixture={
 'projects':[
  {'code':'P1','name':'واجهة','client':'عميل','contract':1000,'photos':[{'id':'PH1','src':'data:image/png;base64,AAAA','name':'واجهة.png'}],'coverId':'PH1'},
  {'code':'P2','name':'مبنى','client':'عميل','contract':500,'photos':[]},
  {'code':'MH00','name':'مشروع مكرر','client':'قديم','contract':3500,'photos':[],'archivedAt':'2026-10-24T00:00:00Z','archiveReason':'متكرر'}
 ],'assignments':[{'id':'AS-MH','code':'MH00','designer':'احمد مؤنس','fee':3500,'archivedAt':'2026-10-24T00:00:00Z','archiveReason':'تكرر'}],'payments':[],
 'claims':[{'id':'CL1','client':'عميل','code':'P1','projectRows':[{'code':'P1','amount':300}],'date':'2026-10-20','status':'معتمدة','total':300,'items':[{'desc':'واجهة','amount':300}]}],
 'clientReceipts':[
  {'id':'R1','batchId':'B1','code':'P1','client':'عميل','date':'2026-10-21','amount':200,'cashAmount':200,'method':'تحويل','ref':'BANK'},
  {'id':'R2','batchId':'B1','code':'','client':'عميل','date':'2026-10-21','amount':50,'cashAmount':50,'method':'تحويل','ref':'BANK'},
  {'id':'AR1','batchId':'AB1','code':'P2','client':'عميل','date':'2026-10-22','amount':100,'method':'تسوية مقدمة سابقة','ref':'ADV','sourceAdvanceId':'ADV1'}
 ],
 'advances':[{'id':'ADV1','client':'عميل','date':'2026-10-18','total':150,'allocated':100,'ref':'ADV','allocations':[{'code':'P2','amount':100,'date':'2026-10-22'}]}],
 'openingBalances':[{'client':'عميل','date':'2026-10-01','amount':25,'note':'مرجعي'}],
 'projectExpenses':[{'id':'E1','code':'P1','date':'2026-10-23','category':'نقل','amount':75,'ref':'EXP'}],
 'claimSettlements':[{'claimId':'CL1','receiptId':'R1','code':'P1','amount':200,'mode':'manual','at':'2026-10-21T00:00:00Z'}],
 'deletedPayments':[{'payment':{'id':'PAY-OLD','code':'MH00','designer':'احمد مؤنس','date':'2026-10-20','amount':3500},'deletedAt':'2026-10-24T00:00:00Z','reason':'دفعة مكررة'}],
 'receiptAttachments':{'B1':{'name':'bank.png','data':'data:image/png;base64,AAAA'},'ADV1':{'name':'advance.pdf','data':'data:application/pdf;base64,AAAA'}},
 'paymentAttachments':{'PAY-OLD':{'name':'old.png','data':'data:image/png;base64,AAAA'}}
}
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':390,'height':844});p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(f'http://127.0.0.1:{server.server_port}/RONIX_Manager.html')
  p.evaluate('(v)=>{data=R19.sync(R18Clients.sync(R14.validate(R14.normalize(v))));const s=JSON.stringify(data);localStorage.setItem(KEY,s);r14Disk=s;r14Saved=s;render()}',fixture)
  def submit(reason):
   p.locator('#r23DeleteReason').fill(reason);p.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
  # Claim: only its matching is removed; cash stays.
  p.evaluate('go("claims")');claim_row=p.locator('.r14-claims-table tbody tr').first;claim_row.get_by_role('button',name='حذف',exact=True).click();check('claim delete preview explains cash is retained','لن يُحذف أي قبض فعلي' in p.locator('.r23-impact').inner_text());submit('مطالبة مكررة')
  check('claim deletion releases matching and preserves receipt cash',p.evaluate('data.claims.length===0&&data.claimSettlements.length===0&&data.clientReceipts.length===3&&data.trashRecords[0].kind==="claim"'))
  p.evaluate('go("trash")');p.get_by_role('button',name='استعادة السجل',exact=True).click();check('claim restore returns exact matching',p.evaluate('data.claims.length===1&&data.claimSettlements.length===1&&R14.settled(data,"CL1")===200'))
  # Receipt batch: every allocation row, proof and matching move together.
  p.evaluate('go("claims")');bank=p.locator('tbody tr').filter(has_text='BANK').first;bank.get_by_role('button',name='حذف',exact=True).click();check('receipt preview is batch level','السند كاملًا بكل صفوف توزيعه' in p.locator('.r23-impact').inner_text());submit('سند مكرر')
  check('receipt batch deletion is atomic',p.evaluate('data.clientReceipts.filter(r=>(r.batchId||r.id)==="B1").length===0&&!data.receiptAttachments.B1&&data.claimSettlements.length===0'))
  p.evaluate('go("trash")');p.locator('.r23-trash-card').filter(has_text='BANK').get_by_role('button',name='استعادة السجل',exact=True).click();check('receipt restore returns rows proof and matching',p.evaluate('data.clientReceipts.filter(r=>(r.batchId||r.id)==="B1").length===2&&data.receiptAttachments.B1.name==="bank.png"&&data.claimSettlements.length===1'))
  # Advance and all generated allocation rows are one reversible bundle.
  p.evaluate('go("advanced");openAdvancedClient(r14Encode("عميل"))');p.get_by_role('button',name='حذف المقدمة',exact=True).click();submit('تصحيح مقدمة')
  check('advance deletion removes its generated allocations once',p.evaluate('data.advances.length===0&&!data.clientReceipts.some(r=>r.sourceAdvanceId==="ADV1")&&!data.receiptAttachments.ADV1'))
  p.evaluate('go("trash")');p.locator('.r23-trash-card').filter(has_text='ADV').get_by_role('button',name='استعادة السجل',exact=True).click();check('advance bundle restore is exact',p.evaluate('data.advances[0].allocated===100&&data.clientReceipts.filter(r=>r.sourceAdvanceId==="ADV1").length===1&&data.receiptAttachments.ADV1.name==="advance.pdf"'))
  # Expense and opening balance affect only their own ledgers.
  p.evaluate('go("costcenters");showCostCenter("P1")');p.get_by_role('button',name='حذف',exact=True).click();submit('مصروف مكرر');check('expense deletion recalculates cost center',p.evaluate('data.projectExpenses.length===0&&ccAmounts("P1").extra===0&&data.costAudit.at(-1).action==="delete expense"'))
  p.evaluate('go("trash")');p.locator('.r23-trash-card').filter(has_text='نقل').get_by_role('button',name='استعادة السجل',exact=True).click();check('expense restore returns amount and audit event',p.evaluate('data.projectExpenses[0].amount===75&&data.costAudit.at(-1).action==="restore expense"'))
  p.evaluate('go("advanced");openAdvancedClient(r14Encode("عميل"))');p.get_by_role('button',name='حذف الافتتاحي',exact=True).click();submit('تصحيح افتتاحي');check('opening balance deletes without changing cash',p.evaluate('data.openingBalances.length===0&&R14.totals(data,"عميل").cash===400'))
  # Linked customers archive; project image is recyclable.
  p.evaluate('go("customerDirectory")');p.locator('#r18CustomerRows tbody tr').filter(has_text='عميل').get_by_role('button',name='حذف / أرشفة',exact=True).click();submit('عميل غير نشط');check('linked customer is archived and hidden without changing projects',p.evaluate('data.customers.find(c=>c.name==="عميل").archivedAt&&data.projects.length===3') and p.locator('#r18CustomerRows tbody tr').count()==1)
  p.evaluate('go("projects");openProject("P1")');p.locator('.photo-tile').get_by_role('button',name='حذف',exact=True).click();submit('صورة قديمة');check('project photo moves to recycle bin with cover update',p.evaluate('getP("P1").photos.length===0&&data.trashRecords.some(x=>x.kind==="photo")'))
  p.evaluate('go("trash")');photo=p.locator('.r23-trash-card').filter(has_text='صورة مشروع P1');photo.get_by_role('button',name='استعادة السجل',exact=True).click();check('photo restore preserves bytes and cover',p.evaluate('getP("P1").photos[0].src==="data:image/png;base64,AAAA"&&getP("P1").coverId==="PH1"'))
  # Archived records expose a real, reversible delete. Already-deleted payments travel with their proof.
  p.evaluate('go("trash")');archived=p.locator('.r23-trash-card').filter(has_text='MH00 — مشروع مكرر');check('archived project exposes unarchive and delete actions',archived.get_by_role('button',name='إلغاء الأرشفة',exact=True).count()==1 and archived.get_by_role('button',name='حذف',exact=True).count()==1)
  archived.get_by_role('button',name='حذف',exact=True).click();submit('إزالة التكرار');check('archive delete bundles assignment old payment and proof',p.evaluate('!getP("MH00")&&!data.assignments.some(a=>a.code==="MH00")&&!data.deletedPayments.some(x=>x.payment.code==="MH00")&&!data.paymentAttachments["PAY-OLD"]&&data.trashRecords.some(x=>x.projects.some(p=>p.code==="MH00")&&x.deletedPayments.length===1)'))
  p.locator('.r23-trash-card').filter(has_text='MH00 — مشروع مكرر').get_by_role('button',name='استعادة السجل',exact=True).click();check('restoring archive delete returns its exact archived links',p.evaluate('getP("MH00").archivedAt&&getA("MH00","احمد مؤنس").archivedAt&&data.deletedPayments.some(x=>x.payment.id==="PAY-OLD")&&data.paymentAttachments["PAY-OLD"].name==="old.png"'))
  p.evaluate('r14Change("fixture block",d=>{d.projects.find(x=>x.code==="P1").archivedAt="2026-10-25T00:00:00Z";d.projects.find(x=>x.code==="P1").archiveReason="test"});go("trash")');p.locator('.r23-trash-card').filter(has_text='P1 — واجهة').get_by_role('button',name='حذف',exact=True).click();check('linked archive delete explains blockers without changing balances','سندات قبض عميل' in p.locator('.r23-impact').inner_text() and p.evaluate('getP("P1")&&data.clientReceipts.length===3'));p.get_by_role('button',name='إغلاق',exact=True).click()
  p.evaluate('go("trash")');check('recycle center fits iPhone and archive buttons do not overlap',p.locator('#r23TrashSearch').is_visible() and p.locator('#r23TrashKind').is_visible() and p.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'))
  check('unified deletion workflows have no script exceptions',not errors)
  result={'passed':len(checks),'checks':checks,'errors':errors};(ROOT/'tests/lifecycle-browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));browser.close()
finally:server.shutdown()
