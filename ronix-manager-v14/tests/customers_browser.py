"""Customer picker, directory, and ledger-preserving edits in a real browser."""
import argparse,json,threading
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from openpyxl import load_workbook
parser=argparse.ArgumentParser();parser.add_argument('--backup',type=Path);args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'private-test-artifacts/customers-v18';OUT.mkdir(parents=True,exist_ok=True);checks=[]
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS:',name,flush=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':1440,'height':1080},accept_downloads=True,timezone_id='Africa/Cairo');p=ctx.new_page();errors=[];dialogs=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('dialog',lambda d:(dialogs.append(d.message),d.accept()));url=f'http://127.0.0.1:{server.server_port}/RONIX_Manager.html';p.goto(url)
  def submit():p.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
  if args.backup:
   source=json.loads(args.backup.read_text());p.locator('#restore').set_input_files(str(args.backup));p.get_by_role('button',name='استيراد هذه النسخة',exact=True).click()
   check('older backup gains directory without altering source money or records',p.evaluate('(before)=>["projects","assignments","payments","claims","clientReceipts","receiptAttachments","paymentAttachments"].every(k=>JSON.stringify(data[k])===JSON.stringify(before[k]))',source))
   check('every existing client appears exactly once in migrated directory',p.evaluate('()=>{const names=R18Clients.sourceNames(data);return names.length===data.customers.length&&names.every(n=>data.customers.filter(c=>c.name===n).length===1)}'))
   p.evaluate('data=r14Empty();r14Persist(data);render()')
  p.locator('.nav[data-page="customerDirectory"]').click();check('independent customer directory opens from sidebar',p.locator('#r18CustomerRows').count()==1)
  p.get_by_role('button',name='+ عميل جديد',exact=True).click();p.locator('#r18CustomerName').fill('العميل الأول');p.locator('#r18CustomerPhone').fill('01001234567');p.locator('#r18CustomerEmail').fill('first@example.com');p.locator('#r18CustomerNote').fill('بيانات تجريبية');submit()
  check('customer and contact details save before any project exists',p.evaluate('data.projects.length===0&&data.customers.length===1&&data.customers[0].phone==="01001234567"'))
  p.locator('#r18CustomerSearch').fill('first@example.com');check('directory searches contact email',p.locator('#r18CustomerRows tbody tr').count()==1 and 'العميل الأول' in p.locator('#r18CustomerRows').inner_text());p.locator('#r18CustomerSearch').fill('')
  p.get_by_role('button',name='+ تحصيل',exact=True).click();check('standalone customer is selectable for unallocated receipt',p.locator('#crClient').input_value()=='العميل الأول' and p.locator('.receipt-allocation').count()==0);p.locator('#crAmount').fill('25.50');submit();check('standalone customer receipt updates its account without requiring a project',p.evaluate('customerTotals("العميل الأول").cash===25.5&&customerTotals("العميل الأول").unallocated===25.5'))
  p.get_by_role('button',name='+ مشروع',exact=True).click();check('create project from directory preselects customer',p.locator('#pclient').input_value()=='العميل الأول');p.evaluate('closeModal()')
  p.evaluate('go("projects");editProject()');p.locator('#pcode').fill('P1');p.locator('#pname').fill('مشروع تجريبي');p.locator('#pcontract').fill('1000');p.get_by_role('button',name='عرض قائمة العملاء',exact=True).click();check('customer dropdown opens with existing customers',p.locator('#pclient').get_attribute('aria-expanded')=='true' and p.get_by_role('option',name='العميل الأول',exact=True).count()==1);p.get_by_role('option',name='العميل الأول',exact=True).click();check('choosing customer fills editable field and closes list',p.locator('#pclient').input_value()=='العميل الأول' and p.locator('#pclient').get_attribute('aria-expanded')=='false');submit()
  check('selected customer links project without duplicate customer',p.evaluate('data.projects[0].client==="العميل الأول"&&data.customers.length===1&&customerTotals("العميل الأول").contracts===1000'))
  p.evaluate('editProject()');p.locator('#pclient').fill('عميل لم يحفظ');p.evaluate('closeModal()');check('cancelling typed customer does not create phantom record',p.evaluate('data.customers.length===1'))
  p.evaluate('editProject()');p.locator('#pcode').fill('P2');p.locator('#pname').fill('مشروع ثان');p.locator('#pcontract').fill('200');p.locator('#pclient').fill('العميل الثاني');check('new typed name is offered as a new customer',p.locator('.r18-new-customer').count()==1 and 'عند حفظ المشروع' in p.locator('#r18ClientHint').inner_text());p.locator('.r18-new-customer').click();submit()
  check('new customer and project are committed together',p.evaluate('data.customers.length===2&&data.projects.find(p=>p.code==="P2").client==="العميل الثاني"'))
  p.evaluate('editProject()');p.locator('#pcode').fill('P3');p.locator('#pname').fill('مشروع ثالث');p.locator('#pclient').fill('  العميل    الأول  ');submit();check('extra whitespace reuses existing account',p.evaluate('data.customers.length===2&&data.projects.find(p=>p.code==="P3").client==="العميل الأول"'))
  p.evaluate('editProject()');p.locator('#pclient').fill('الثاني');check('typing filters dropdown options',p.get_by_role('option',name='العميل الثاني',exact=True).count()==1 and p.get_by_role('option',name='العميل الأول',exact=True).count()==0);p.locator('#pclient').press('ArrowDown');p.locator('#pclient').press('Enter');check('keyboard selection fills customer without submitting form',p.locator('#pclient').input_value()=='العميل الثاني' and p.locator('#overlay').evaluate('e=>e.classList.contains("open")'));p.get_by_role('button',name='عرض قائمة العملاء',exact=True).click();p.locator('#pclient').press('Escape');check('Escape closes dropdown while preserving project form',p.locator('#r18ClientOptions').is_hidden() and p.locator('#overlay').evaluate('e=>e.classList.contains("open")'));p.evaluate('closeModal()')
  p.evaluate('openCustomerReceipt()');check('new customers appear in receipt dropdown',set(p.locator('#crClient option').all_text_contents())>=set(['العميل الأول','العميل الثاني']));p.evaluate('closeModal();openClaim()');check('new customers appear in claim dropdown',set(p.locator('#claimClient option').all_text_contents())>=set(['العميل الأول','العميل الثاني']));p.evaluate('closeModal();openAdvance()');check('new customers appear in advance dropdown',p.locator('#adClient option').filter(has_text='العميل الثاني').count()==1);p.evaluate('closeModal();openOpening()');check('new customers appear in opening balance dropdown',p.locator('#obClient option').filter(has_text='العميل الثاني').count()==1);p.evaluate('closeModal()')
  # A failed project write must leave both the catalog and project ledger untouched.
  before=p.evaluate('JSON.stringify(data)');disk=p.evaluate('localStorage.getItem(KEY)');p.evaluate('editProject();window.savedSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error("quota test")};void 0');p.locator('#pcode').fill('FAIL');p.locator('#pname').fill('لن يحفظ');p.locator('#pclient').fill('عميل لن يحفظ');submit();check('failed save rolls back both new project and customer',p.evaluate('JSON.stringify(data)')==before and p.evaluate('localStorage.getItem(KEY)')==disk);p.evaluate('Storage.prototype.setItem=window.savedSet;closeModal()')
  p.evaluate('go("customerDirectory")');p.get_by_role('button',name='+ عميل جديد',exact=True).click();p.locator('#r18CustomerName').fill('العميل   الأول');submit();check('directory rejects duplicate customer spelling with extra spaces',p.evaluate('data.customers.length===2') and 'مكرر' in dialogs[-1]);p.evaluate('closeModal()')
  # Rename a customer that has live receipts, a project, and matched claims.
  p.evaluate('r14Change("fixture",d=>{d.claims.push({id:"CL",code:"P1",client:"العميل الأول",date:"2026-10-20",status:"معتمدة",total:100,items:[{desc:"P1",amount:100}]});d.clientReceipts.push({id:"R",code:"P1",client:"العميل الأول",date:"2026-10-25",amount:50})});go("customerDirectory")')
  old_id=p.evaluate('data.customers.find(c=>c.name==="العميل الأول").id');before=p.evaluate('customerTotals("العميل الأول")');p.evaluate('(id)=>r18EditCustomer(r14Encode(id))',old_id);p.locator('#r18CustomerName').fill('العميل الأول المحدّث');p.locator('#r18CustomerPhone').fill('01007654321');submit()
  check('rename keeps customer identity and financial totals',p.evaluate('(id)=>data.customers.find(c=>c.id===id).name',old_id)=='العميل الأول المحدّث' and p.evaluate('customerTotals("العميل الأول المحدّث")')==before)
  check('rename updates linked claims receipts and projects without breaking settlement',p.evaluate('data.projects.filter(p=>["P1","P3"].includes(p.code)).every(p=>p.client==="العميل الأول المحدّث")&&data.claims[0].client==="العميل الأول المحدّث"&&data.clientReceipts.every(r=>r.client==="العميل الأول المحدّث")&&R14.settled(data,"CL")===50&&v8Audit().length===0'))
  p.locator('#r18CustomerRows tbody tr').filter(has_text='العميل الأول المحدّث').get_by_role('button',name='كشف الحساب',exact=True).click();check('directory opens matching client ledger',p.locator('#clientSelect').input_value()=='العميل الأول المحدّث' and '1,000.00' in p.locator('#customerLedgerArea').inner_text())
  p.evaluate('go("customerDirectory")');p.screenshot(path=str(OUT/'customer-directory.png'),full_page=True)
  with p.expect_download() as dl:p.get_by_role('button',name='Excel العملاء',exact=True).click()
  path=OUT/'customers.xlsx';dl.value.save_as(path);book=load_workbook(path);rows=list(book['دليل العملاء'].values)[1:];check('customer Excel includes contacts projects and numeric balances',any(r[0]=='العميل الأول المحدّث' and r[1]=='01007654321' and r[5]==1000 and r[6]==75.5 for r in rows));book.close()
  snapshot=p.evaluate('data')
  with p.expect_download() as dl:p.evaluate('backup()')
  backup=Path(dl.value.path()).read_bytes();check('JSON includes customer directory metadata and stable IDs',json.loads(backup)['customers']==snapshot['customers'])
  fresh=browser.new_context();q=fresh.new_page();q.on('dialog',lambda d:d.accept());q.on('pageerror',lambda e:errors.append(str(e)));q.goto(url)
  q.evaluate('r14Persist(R18Clients.save(data,{name:"عميل قبل الاستعادة",phone:"0123"}))')
  q.locator('#restore').set_input_files({'name':'latest.json','mimeType':'application/json','buffer':backup})
  with q.expect_download() as safety:q.get_by_role('button',name='استيراد هذه النسخة',exact=True).click()
  saved=json.loads(Path(safety.value.path()).read_bytes());check('restore backs up a standalone customer directory before replacing it',len(saved['projects'])==0 and saved['customers'][0]['name']=='عميل قبل الاستعادة' and saved['customers'][0]['phone']=='0123')
  q.reload();after=q.evaluate('data')
  check('fresh restore retains catalog and all financial relationships',all(after[k]==snapshot[k] for k in ['customers','projects','clientReceipts','claims','claimSettlements']))
  check('customer workflows have no JavaScript exceptions',not errors)
  result={'passed':len(checks),'checks':checks,'errors':errors};(ROOT/'tests/customers-browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2));browser.close()
finally:server.shutdown()
