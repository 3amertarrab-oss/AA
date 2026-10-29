"""Professional customer statement: grouped receipts, allocation, mobile and print."""
import json, os, threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1];checks=[]
def check(name,value): assert value,name;checks.append(name);print('PASS:',name)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
fixture={'projects':[{'code':'A','name':'واجهة','client':'عميل','contract':100,'coverId':'PH-A','photos':[{'id':'PH-A','name':'واجهة.png','src':pixel}]},{'code':'B','name':'مبنى','client':'عميل','contract':100,'photos':[]},{'code':'C','name':'مشروع بلا تحصيل','client':'عميل','contract':100,'photos':[]}], 'assignments':[],'payments':[],
 'clientReceipts':[{'id':'R1','batchId':'RC1','code':'A','client':'عميل','date':'2026-10-01','amount':60,'cashAmount':60,'method':'تحويل بنكي'},{'id':'R2','batchId':'RC1','code':'B','client':'عميل','date':'2026-10-01','amount':30,'cashAmount':30,'method':'تحويل بنكي'},{'id':'R3','batchId':'RC1','code':'','client':'عميل','date':'2026-10-01','amount':10,'cashAmount':10,'method':'تحويل بنكي'}, {'id':'AR','batchId':'ALLOC','code':'B','client':'عميل','date':'2026-10-02','amount':20,'sourceAdvanceId':'ADV'}],
 'advances':[{'id':'ADV','client':'عميل','date':'2026-09-25','total':50,'allocated':20,'allocations':[{'code':'B','amount':20,'date':'2026-10-02'}]}]}
try:
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox']);ctx=b.new_context(viewport={'width':390,'height':844});ctx.add_init_script('window.print=()=>{}');p=ctx.new_page();errors=[];p.on('pageerror',lambda e:errors.append(str(e)));p.goto(f'http://127.0.0.1:{server.server_port}/RONIX_Manager.html')
  p.evaluate('(v)=>{data=R18Clients.sync(R14.normalize(v));go("clients");window.scrollTo(0,0)}',fixture)
  p.locator('button[onclick^="selectClient"]').first.click();p.wait_for_timeout(900)
  check('opening a customer moves focus and viewport to the statement',p.evaluate('document.activeElement.matches(".r22-client-statement")&&(()=>{const r=document.querySelector(".r22-client-statement").getBoundingClientRect();return r.top>=-2&&r.top<innerHeight})()'))
  check('one bank receipt plus one advance appear once each',p.locator('.r22-payment-table tbody tr').count()==2)
  check('single receipt shows both projects and unallocated balance',p.locator('.r22-payment-table tbody tr').nth(1).locator('.r22-allocation').count()==3)
  check('cash and allocation totals do not double count advance',p.evaluate('r22ClientModel("عميل").totals.cash===150&&r22ClientModel("عميل").totals.receipts===110&&r22ClientModel("عميل").totals.unallocated===40'))
  check('project circles show exact collection percentages including zero',p.locator('.r22-project-card').count()==3 and p.locator('.r22-project-card [role="progressbar"]').evaluate_all('els=>els.map(e=>e.getAttribute("aria-valuenow"))')==['60.0','50.0','0.0'])
  check('zero and nonzero progress circles stay inside their cards',p.locator('.r22-project-card').evaluate_all('cards=>cards.every(card=>{const c=card.getBoundingClientRect(),r=card.querySelector(".r22-ring").getBoundingClientRect();return r.left>=c.left&&r.right<=c.right})'))
  check('project cards show the stored image and clear missing-image placeholders',p.locator('.r22-project-photo > img').count()==1 and p.locator('.r22-project-photo > small').count()==2)
  p.locator('.r22-project-card').nth(1).click();p.wait_for_timeout(900)
  check('project circle filters payments dynamically',p.locator('.r22-payment-table tbody tr').count()==2 and p.locator('.r22-current-filter').inner_text().find('B')>=0 and p.locator('.r22-project-card').nth(1).get_attribute('aria-pressed')=='true')
  check('project filtering reveals the matching payments section',p.evaluate('(()=>{const r=document.querySelector("#r22Payments").getBoundingClientRect();return r.top>=-2&&r.top<innerHeight})()'))
  p.evaluate("r14Done('اختبار بقاء كشف العميل')");p.wait_for_timeout(900)
  check('customer statement and project filter survive save-style rerender',p.locator('#clientSelect').input_value()=='عميل' and p.locator('.r22-client-statement').count()==1 and 'B' in p.locator('.r22-current-filter').inner_text() and p.evaluate('document.activeElement.matches(".r22-client-statement")'))
  check('customer view removes internal matching designer and profit panels',all(x not in p.locator('.r22-client-statement').inner_text() for x in ['مطابقة التحصيل بالمطالبات','أتعاب المصممين','هامش تقديري']))
  check('statement fits iPhone without page overflow',p.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'))
  with p.expect_popup() as info:p.evaluate('printCustomerStatement(r14Encode("عميل"))')
  q=info.value;q.wait_for_load_state();q.wait_for_timeout(250);body=q.locator('body').inner_text()
  check('PDF view contains project balances and grouped distributions','أرصدة المشاريع' in body and 'الدفعات وتوزيعها' in body and q.locator('tbody tr').count()==5)
  check('PDF customer statement includes the stored project image',q.locator('td.project-photo img').count()==1 and q.locator('td.project-photo img').evaluate('i=>i.complete&&i.naturalWidth>0'))
  check('PDF back control works both as popup close and mobile history fallback','history.back()' in q.locator('.actions button').first.get_attribute('onclick'))
  check('PDF excludes internal accounting sections',all(x not in body for x in ['أتعاب المصممين','فرق صرف القبض','مطابقة التحصيل']))
  q.close();p.evaluate('window.scrollTo(0,document.body.scrollHeight);openProject(r14Encode("A"))');p.wait_for_timeout(900)
  check('opening a project updates navigation and reveals its header',p.evaluate("page==='projects'&&document.querySelector('.nav[data-page=\"projects\"]').classList.contains('active')&&document.activeElement.matches('.projecthead')&&(()=>{const r=document.querySelector('.projecthead').getBoundingClientRect();return r.top>=-8&&r.top<innerHeight})()"))
  check('print and customer views have no script exceptions',not errors)
  result={'passed':len(checks),'checks':checks,'errors':errors};(ROOT/'tests/client-statement-browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));b.close()
finally:server.shutdown()
