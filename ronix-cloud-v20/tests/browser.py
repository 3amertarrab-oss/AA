"""Real bundled Supabase SDK against a deterministic local Auth/REST/Storage test service."""
import base64,json,time,threading,urllib.parse,uuid,socket,copy
from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from functools import partial
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'private-test-artifacts';OUT.mkdir(exist_ok=True)
users={'owner@example.com':'10000000-0000-4000-8000-000000000001','other@example.com':'10000000-0000-4000-8000-000000000002'}
ledgers={};mutations={};files={};mutex=threading.RLock();flags={'drop_commit':False,'deny_storage':False};checks=[];errors=[]
def check(name,ok):
 assert ok,name
 checks.append(name);print('PASS',name,flush=True)
def token(email):
 def b64(d):return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
 return b64({'alg':'HS256','typ':'JWT'})+'.'+b64({'sub':users[email],'email':email,'exp':int(time.time())+3600,'iat':int(time.time()),'role':'authenticated','aud':'authenticated'})+'.dGVzdA'
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
 def respond(self,obj,status=200,ctype='application/json'):
  raw=json.dumps(obj).encode() if ctype=='application/json' else obj
  self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
 def user(self):
  try:return json.loads(base64.urlsafe_b64decode(self.headers['Authorization'].split('.')[1]+'==='))
  except:return None
 def do_GET(self):
  if self.path=='/config.js':return self.respond(f"window.RONIX_CLOUD_CONFIG={{url:'http://127.0.0.1:{self.server.server_port}/supabase',key:'test-publishable-key'}};".encode(),ctype='application/javascript')
  if self.path.startswith('/supabase/auth/v1/user'):
   u=self.user();return self.respond({'id':u['sub'],'email':u['email'],'aud':'authenticated','role':'authenticated'})
  if self.path.startswith('/supabase/storage/v1/object/'):
   path=urllib.parse.unquote(self.path.split('/ronix-files/',1)[1]);u=self.user()
   if not u or not path.startswith(u['sub']+'/') or path not in files:return self.respond({'message':'forbidden'},403)
   return self.respond(files[path]['bytes'],ctype=files[path]['mime'])
  return super().do_GET()
 def do_POST(self):
  raw=self.rfile.read(int(self.headers.get('Content-Length','0')));path=self.path
  if '/auth/v1/token' in path:
   d=json.loads(raw);email=d.get('email') or 'owner@example.com'
   if email not in users or ('password' in d and d['password']!='test-password'):return self.respond({'msg':'Invalid login credentials','error_code':'invalid_credentials'},400)
   return self.respond({'access_token':token(email),'refresh_token':'test-refresh','token_type':'bearer','expires_in':3600,'expires_at':int(time.time())+3600,'user':{'id':users[email],'email':email,'aud':'authenticated','role':'authenticated','app_metadata':{'provider':'email'},'user_metadata':{}}})
  if '/auth/v1/logout' in path:return self.respond({})
  u=self.user()
  if not u:return self.respond({'message':'Unauthorized'},401)
  uid=u['sub']
  if '/storage/v1/object/ronix-files/' in path:
   name=urllib.parse.unquote(path.split('/ronix-files/',1)[1])
   if flags['deny_storage'] or not name.startswith(uid+'/'):return self.respond({'message':'forbidden','statusCode':'403'},403)
   if name in files:return self.respond({'message':'The resource already exists','statusCode':'409'},409)
   files[name]={'bytes':raw,'mime':self.headers['Content-Type']};return self.respond({'Key':'ronix-files/'+name})
  d=json.loads(raw or '{}');op=path.rsplit('/',1)[-1]
  with mutex:
   ledger=ledgers.get(uid,{'revision':0,'payload':None})
   if op=='ronix_load':return self.respond(ledger)
   if op=='ronix_head':return self.respond(ledger['revision'])
   if op=='ronix_commit':
    mid=(uid,d['mutation_id'])
    if mid in mutations:return self.respond({'status':'saved','revision':mutations[mid],'replayed':True})
    if d['expected_revision']!=ledger['revision']:return self.respond({'status':'conflict','revision':ledger['revision']})
    rev=ledger['revision']+1;ledgers[uid]={'revision':rev,'payload':d['next_payload']};mutations[mid]=rev
    if flags['drop_commit']:
     flags['drop_commit']=False;self.connection.shutdown(socket.SHUT_RDWR);self.connection.close();return
    return self.respond({'status':'saved','revision':rev,'replayed':False})
  return self.respond({'message':'Unknown route'},404)
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWOQAAAAASUVORK5CYII='
fixture={'projects':[{'code':'P','name':'مشروع تجريبي','client':'عميل تجريبي','contract':1000.97,'photos':[{'id':'PHOTO','src':PNG}],'coverId':'PHOTO'}],'assignments':[{'id':'D','code':'P','designer':'مصمم تجريبي','fee':100}],'payments':[{'id':'PAY1','code':'P','designer':'مصمم تجريبي','date':'2026-10-25','amount':10.25}],'claims':[{'id':'CL1','code':'P','client':'عميل تجريبي','date':'2026-10-25','status':'معتمدة','total':300.75,'matchMode':'manual'}],'clientReceipts':[{'id':'R1','code':'P','client':'عميل تجريبي','date':'2026-10-25','amount':25.25}],'claimSettlements':[{'claimId':'CL1','receiptId':'R1','code':'P','amount':20.25}],'receiptAttachments':{'R1':{'name':'proof.png','mime':'image/png','data':PNG}}}
try:
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);a=b.new_context(accept_downloads=True);z=b.new_context(accept_downloads=True,viewport={'width':390,'height':844},is_mobile=True,has_touch=True);p=a.new_page();q=z.new_page();url=f'http://127.0.0.1:{server.server_port}/'
  for page in [p,q]:
   page.on('pageerror',lambda e:errors.append(str(e)));page.on('dialog',lambda d:d.accept());page.goto(url)
  def login(page,email='owner@example.com'):
   page.locator('#r20Email').fill(email);page.locator('#r20Password').fill('test-password');page.locator('#r20LoginForm button').click();page.wait_for_function('R20Cloud.state.ready',timeout=15000)
  def synced(page):page.wait_for_function('R20Cloud.state.ready&&!R20Cloud.state.busy&&!R20Cloud.state.env.dirty',timeout=15000)
  check('logged-out page hides all accounting screens',p.locator('#r20Gate').is_visible() and p.locator('.layout').count()==1 and not p.locator('.layout').is_visible())
  login(p);check('email login opens empty isolated cloud ledger',p.evaluate('data.projects.length===0&&R20Cloud.state.env.revision===0'))
  p.locator('#restore').set_input_files({'name':'latest.json','mimeType':'application/json','buffer':json.dumps(fixture).encode()});p.get_by_role('button',name='استيراد هذه النسخة',exact=True).click();synced(p)
  check('import saves exact accounting amounts and relationships',p.evaluate('data.projects[0].contract===1000.97&&R14.remaining(data,data.claims[0])===280.5&&data.payments[0].amount===10.25'))
  cloud=ledgers[users['owner@example.com']];check('cloud stores private file references instead of embedded base64',isinstance(cloud['payload']['projects'][0]['photos'][0]['src'],dict) and 'data:image' not in json.dumps(cloud['payload']) and len(files)==1)
  login(q);check('second device receives all records and matching photos and proofs',q.evaluate('data.projects[0].photos[0].src')==PNG and q.evaluate('data.receiptAttachments.R1.data')==PNG and q.evaluate('data.documentNumbers')==p.evaluate('data.documentNumbers'))
  check('mobile layout fits iPhone width',q.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
  q.locator('#r20Menu').click();q.locator('.nav[data-page=customerDirectory]').click();check('iPhone menu opens customer directory and closes after selection',q.locator('#r18CustomerRows').count()==1 and q.locator('#r20Menu').get_attribute('aria-expanded')=='false')
  q.evaluate('go("projects");openProject("P")');q.locator('#r20Back').click();check('visible mobile back button returns from project detail',q.evaluate('projectFocus')=='' and q.locator('#projectRows').count()==1)
  q.evaluate('r14Change("receipt test",d=>d.clientReceipts.push({id:"R2",code:"P",client:"عميل تجريبي",date:"2026-10-26",amount:10.25}))');synced(q);p.locator('#r20Refresh').click();synced(p)
  check('mobile payment reaches laptop without duplicated cash',p.evaluate('customerTotals("عميل تجريبي").cash===35.5&&data.clientReceipts.length===2'))
  # Keep both editors open, so neither device silently loads the other's work.
  p.evaluate('editProject(r14Encode("P"))');q.evaluate('editProject(r14Encode("P"))')
  p.locator('#pname').fill('تعديل اللابتوب');p.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()');synced(p)
  q.evaluate('R20Cloud.refresh()');check('refresh preserves open form and allows conflict-safe save',q.locator('#pname').input_value()=='مشروع تجريبي' and q.evaluate('R20Cloud.state.notice')!='' and not q.evaluate('R20Cloud.state.error'))
  q.locator('#pname').fill('تعديل الآيفون');q.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()');q.wait_for_function('R20Cloud.state.conflict')
  check('stale save preserves mobile edit and never overwrites laptop',q.evaluate('data.projects[0].name')=='تعديل الآيفون' and ledgers[users['owner@example.com']]['payload']['projects'][0]['name']=='تعديل اللابتوب')
  with q.expect_download() as dl:q.locator('#r20KeepLocal').click()
  backup=json.loads(Path(dl.value.path()).read_bytes());check('conflicting edit can be downloaded with all evidence',backup['projects'][0]['name']=='تعديل الآيفون' and backup['receiptAttachments']['R1']['data']==PNG)
  q.locator('#r20UseServer').click();q.wait_for_function('!R20Cloud.state.conflict&&!R20Cloud.state.busy');check('resolving conflict loads newest server revision',q.evaluate('data.projects[0].name')=='تعديل اللابتوب')
  q.locator('#r20Recovery').click();q.locator('#r20RecoveryRows button').wait_for();check('local conflicting snapshot remains available after resolution',q.locator('#r20RecoveryRows button').count()==1);q.evaluate('closeModal()')
  # Ambiguous network failure after the server commits must replay the same mutation.
  flags['drop_commit']=True;p.evaluate('r14Change("retry test",d=>d.projects[0].note="حفظ مرة واحدة")');p.wait_for_function('!R20Cloud.state.busy&&R20Cloud.state.env.dirty');rev=ledgers[users['owner@example.com']]['revision'];p.locator('#r20Refresh').click();synced(p)
  check('lost response is retried without a second transaction',ledgers[users['owner@example.com']]['revision']==rev and p.evaluate('R20Cloud.state.env.revision')==rev)
  a.set_offline(True);p.wait_for_function('!navigator.onLine');p.evaluate('r14Change("offline",d=>d.projects[0].site="تعديل محفوظ دون اتصال")')
  check('offline edit is durable and labelled pending',p.evaluate('R20Cloud.state.env.dirty') and 'دون اتصال' in p.locator('#r20SyncState').inner_text())
  before=p.evaluate('JSON.stringify(data)');accepted=p.evaluate('r14Change("blocked second edit",d=>d.projects[0].site="should not save")');check('second transaction waits for pending synchronization',not accepted and p.evaluate('JSON.stringify(data)')==before)
  a.set_offline(False);synced(p);check('reconnection uploads queued edit once',ledgers[users['owner@example.com']]['payload']['projects'][0]['site']=='تعديل محفوظ دون اتصال')
  # Storage failure before commit cannot mark the account synchronized.
  flags['deny_storage']=True;different='data:image/png;base64,iVBORw0KGgo='
  p.evaluate('(uri)=>r14Change("proof upload",d=>d.projects[0].photos.push({id:"NEW",src:uri}))',different);p.wait_for_function('!R20Cloud.state.busy&&R20Cloud.state.env.dirty');check('failed evidence upload leaves remote ledger unchanged',len(ledgers[users['owner@example.com']]['payload']['projects'][0]['photos'])==1)
  flags['deny_storage']=False;p.locator('#r20Refresh').click();synced(p);check('retry completes photos before publishing their ledger references',len(ledgers[users['owner@example.com']]['payload']['projects'][0]['photos'])==2)
  # Quota failure and a second tab must preserve the already durable state.
  snapshot=p.evaluate('JSON.stringify(data)');p.evaluate('window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error("quota")};void 0');ok=p.evaluate('r14Change("quota",d=>d.projects[0].name="FAIL")');p.evaluate('Storage.prototype.setItem=window.originalSet;void 0');check('local quota failure rejects new transaction atomically',not ok and p.evaluate('JSON.stringify(data)')==snapshot)
  tab=a.new_page();tab.on('dialog',lambda d:d.accept());tab.on('pageerror',lambda e:errors.append(str(e)));tab.goto(url);tab.wait_for_function('R20Cloud.state.ready');p.evaluate('editProject(r14Encode("P"))');tab.evaluate('r14Change("other tab",d=>d.projects[0].kind="آخر نافذة")');synced(tab);p.wait_for_function('R20Cloud.state.disk!==localStorage.getItem(R20Cloud.state.key)');ok=p.evaluate('r14Change("stale tab",d=>d.projects[0].kind="old")');check('stale tab cannot overwrite newer local envelope',not ok);p.evaluate('closeModal()');p.locator('#r20Refresh').click();synced(p)
  check('refresh adopts the current same-account tab version',p.evaluate('data.projects[0].kind')=='آخر نافذة')
  tab.close();q.locator('#r20Refresh').click();synced(q)
  with q.expect_download() as dl:q.locator('#r20Backup').click()
  saved=json.loads(Path(dl.value.path()).read_bytes());check('portable backup contains exact data and hydrated private documents',saved['schemaVersion']==19 and saved['projects'][0]['contract']==1000.97 and saved['receiptAttachments']['R1']['data']==PNG)
  p.locator('#r20Logout').click();p.wait_for_function('!R20Cloud.state.user');check('logout hides records and clears current user cache',p.locator('#r20Gate').is_visible() and p.evaluate('data.projects.length')==0 and p.evaluate('(uid)=>localStorage.getItem("ronix-v20-ledger:"+uid)',users['owner@example.com']) is None)
  login(p,'other@example.com');check('different user cannot inherit previous account data',p.evaluate('data.projects.length===0&&R20Cloud.state.env.revision===0'))
  # Offline app shell + existing signed-in account cache, with no cached API responses.
  q.wait_for_function('navigator.serviceWorker.controller!==null',timeout=15000) if q.evaluate('navigator.serviceWorker.controller!==null') else q.reload()
  q.wait_for_function('R20Cloud.state.ready');z.set_offline(True);q.reload();q.wait_for_function('R20Cloud.state.ready');check('installed shell opens cached account offline',q.evaluate('data.projects[0].contract')==1000.97)
  cached=q.evaluate('async()=>{const keys=await caches.keys();const out=[];for(const k of keys){const c=await caches.open(k);out.push(...(await c.keys()).map(r=>r.url))}return out}');check('service worker never caches auth or accounting API responses',not any('/supabase/' in u for u in cached))
  z.set_offline(False);q.locator('#r20Refresh').click();synced(q)
  # Audit every main screen at iPhone width. Wide tables may scroll inside their
  # own container, but the document, panels, cards and controls must never collide.
  mobile_pages=['dashboard','projects','costcenters','designers','payments','customerDirectory','clients','claims','advanced','reports']
  mobile_columns=[]
  for mobile_page in mobile_pages:
   q.evaluate('(name)=>go(name)',mobile_page);q.wait_for_timeout(80)
   assert q.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),mobile_page+' expands the page horizontally'
   mobile_columns.extend(q.evaluate("()=>[...document.querySelectorAll('.grid,.claim-kpis,.v5-metrics,.cc-grid')].filter(x=>x.offsetParent).map(x=>({name:x.className,columns:getComputedStyle(x).gridTemplateColumns.trim().split(/\\s+/).length}))"))
   q.screenshot(path=str(OUT/f'iphone-{mobile_page}.png'),full_page=True)
  check('every main screen stays inside the iPhone viewport',True)
  check('financial cards use one non-overlapping column on iPhone',bool(mobile_columns) and all(x['columns']==1 for x in mobile_columns))
  q.evaluate('editProject()');q.wait_for_timeout(80)
  q.get_by_role('button',name='+ إضافة ضريبة',exact=True).click();q.wait_for_timeout(80)
  check('project tax form fits the iPhone viewport',q.evaluate("()=>{const r=document.querySelector('.modal').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth+1&&document.querySelectorAll('.r20-tax-row').length===1}"));q.screenshot(path=str(OUT/'iphone-project-tax.png'),full_page=True);q.evaluate('closeModal()')
  q.evaluate('openCustomerReceipt()');q.wait_for_timeout(80)
  check('receipt and evidence form fits the iPhone viewport',q.evaluate("()=>{const r=document.querySelector('.modal').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.documentElement.scrollWidth<=innerWidth+1}"));q.screenshot(path=str(OUT/'iphone-receipt-form.png'),full_page=True);q.evaluate('closeModal()')
  for width,height in [(320,568),(430,932)]:
   q.set_viewport_size({'width':width,'height':height})
   for mobile_page in mobile_pages:
    q.evaluate('(name)=>go(name)',mobile_page);q.wait_for_timeout(40)
    assert q.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),f'{mobile_page} expands {width}px viewport'
  check('all screens fit compact and large iPhone widths',True)
  q.set_viewport_size({'width':390,'height':844})
  q.evaluate('go("customerDirectory")');q.wait_for_timeout(80);q.screenshot(path=str(OUT/'iphone-account.png'),full_page=True)
  check('cloud workflows have no script exceptions',not errors)
  result={'passed':len(checks),'checks':checks,'errors':errors,'backend':'Local deterministic Auth/REST/Storage; real bundled Supabase browser SDK'};(ROOT/'tests/browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));b.close()
finally:server.shutdown()
