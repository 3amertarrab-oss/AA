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
  fixture={'projects':[{'code':'Q1','name':'واجهة','client':'عميل الكميات','contract':2500,'originalContract':2500,'contractCurrency':'EGP','contractRate':1,'contractItems':[{'id':'I1','description':'ألواح واجهة','unit':'م²','quantity':10,'unitPrice':250,'amount':2500}]}],'assignments':[],'payments':[]}
  p.evaluate('(v)=>{data=R14.normalize(v);go("claims");openClaim()}',fixture)
  p.evaluate("claimChangeRow(0,'code','Q1')")
  check('claim creates quantity price and total from contract item',p.locator('[aria-label="كمية المطالبة"]').input_value()=='10' and p.locator('[aria-label="سعر وحدة المطالبة"]').input_value()=='250' and p.locator('[aria-label="قيمة المطالبة للمشروع"]').input_value()=='2500')
  p.evaluate("r22ClaimItemChange(0,0,'quantity','2')")
  check('editing quantity recalculates claim project total',p.locator('[aria-label="قيمة المطالبة للمشروع"]').input_value()=='500')
  p.get_by_role('button',name='حفظ المطالبة',exact=True).click()
  check('saved claim retains exact line calculation',p.evaluate('data.claims[0].projectRows[0].items[0].amount===500&&data.claims[0].total===500'))
  p.evaluate("editProject(r14Encode('Q1'))")
  check('project editor shows contract quantity price and calculated total',p.locator('[aria-label="كمية العقد"]').input_value()=='10' and p.locator('[aria-label="سعر وحدة العقد"]').input_value()=='250' and p.locator('#pcontract').get_attribute('readonly') is not None)
  check('project quantity editor fits iPhone width',p.locator('#overlay .modal').evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
  p.evaluate('closeModal();go("claims")')
  with p.expect_popup() as pop: p.evaluate('printClaim(r14Encode(data.claims[0].id))')
  q=pop.value;q.wait_for_load_state()
  check('printed claim includes quantity unit price and total table','تفاصيل الكميات والأسعار' in q.locator('body').inner_text() and q.locator('.claim-items-table tbody tr').count()==1)
  result={'passed':len(checks),'checks':checks};(ROOT/'tests/quantities-browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));b.close()
finally: server.shutdown()
