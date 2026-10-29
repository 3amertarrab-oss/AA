"""Exercise contract and claim quantity/price UI with synthetic data."""
import json, os, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]; checks=[]
def check(name,value): assert value,name; checks.append(name); print('PASS:',name)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox']);p=b.new_page(viewport={'width':390,'height':844});p.on('dialog',lambda d:d.accept())
  p.goto(f'http://127.0.0.1:{server.server_port}/RONIX_Manager.html')
  pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
  fixture={'projects':[{'code':'Q1','name':'واجهة','client':'عميل الكميات','contract':2500,'originalContract':2500,'contractCurrency':'EGP','contractRate':1,'coverId':'PHOTO','photos':[{'id':'PHOTO','src':pixel}],'contractItems':[{'id':'I1','description':'ألواح واجهة','unit':'م²','quantity':10,'unitPrice':250,'amount':2500}]}],'assignments':[],'payments':[]}
  p.evaluate('(v)=>{data=R14.normalize(v);go("claims");openClaim()}',fixture)
  p.evaluate("claimChangeRow(0,'code','Q1')")
  check('claim inherits unit quantity price and total from contract item',p.locator('[aria-label="وحدة بند المطالبة"]').input_value()=='م²' and p.locator('[aria-label="كمية المطالبة"]').input_value()=='10' and p.locator('[aria-label="سعر وحدة المطالبة"]').input_value()=='250' and '2,500' in p.locator('[aria-label="قيمة المطالبة للمشروع"]').inner_text())
  check('contract-origin badge is visible and project total is calculated output',p.get_by_text('من أصل العقد',exact=True).count()==1 and p.locator('[aria-label="قيمة المطالبة للمشروع"]').evaluate('e=>e.tagName')=='OUTPUT')
  check('claim quantity editor fits iPhone width',p.locator('#overlay .modal').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
  p.locator('[aria-label="وحدة بند المطالبة"]').fill('م ط')
  p.locator('[aria-label="كمية المطالبة"]').fill('2')
  p.locator('[aria-label="سعر وحدة المطالبة"]').fill('300')
  check('free unit quantity and price update totals live without losing focus',p.locator('[aria-label="سعر وحدة المطالبة"]').evaluate('e=>document.activeElement===e') and p.locator('.r22-claim-line-total').inner_text()=='600' and '600' in p.locator('[aria-label="قيمة المطالبة للمشروع"]').inner_text() and '600' in p.locator('#claimSummary').inner_text())
  p.get_by_role('button',name='حفظ المطالبة',exact=True).click()
  check('saved claim retains free unit and exact line calculation',p.evaluate("(()=>{const x=data.claims[0].projectRows[0].items[0];return x.unit==='م ط'&&x.quantity===2&&x.unitPrice===300&&x.amount===600&&data.claims[0].total===600})()"))
  p.evaluate("editProject(r14Encode('Q1'))")
  check('project editor shows freely editable contract unit quantity price and calculated total',p.locator('[aria-label="الوحدة"]').input_value()=='م²' and p.locator('[aria-label="كمية العقد"]').input_value()=='10' and p.locator('[aria-label="سعر وحدة العقد"]').input_value()=='250' and p.locator('#pcontract').get_attribute('readonly') is not None)
  p.locator('[aria-label="الوحدة"]').fill('B1')
  check('contract unit accepts arbitrary text',p.evaluate("r22ContractItemsRead()[0].unit==='B1'"))
  check('project quantity editor fits iPhone width',p.locator('#overlay .modal').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
  p.evaluate('closeModal();go("claims")')
  with p.expect_popup() as pop: p.evaluate('printClaim(r14Encode(data.claims[0].id))')
  q=pop.value;q.wait_for_load_state()
  check('printed claim merges quantity unit price and total into one project table',q.locator('.projects-table th').all_inner_texts()==['صورة المشروع','المشروع','البند','الوحدة','الكمية','سعر الوحدة','الإجمالي'] and q.locator('.projects-table tbody tr').count()==1 and q.locator('.claim-items-table').count()==0)
  cells=q.locator('.projects-table tbody tr').first.locator('td')
  check('printed claim retains edited unit quantity price total and project image',cells.nth(3).inner_text()=='م ط' and cells.nth(4).inner_text()=='2' and cells.nth(5).inner_text()=='300' and cells.nth(6).inner_text()=='600' and q.locator('.photo img').evaluate('i=>i.complete&&i.naturalWidth>0&&getComputedStyle(i).objectFit==="contain"'))
  result={'passed':len(checks),'checks':checks};(ROOT/'tests/quantities-browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));b.close()
finally: server.shutdown()
