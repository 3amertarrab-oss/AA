"""Linked balances and media recovery; private fixtures are supplied by CLI only."""
import argparse,base64,json,threading,zipfile
from pathlib import Path
from functools import partial
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from playwright.sync_api import sync_playwright
from openpyxl import load_workbook
parser=argparse.ArgumentParser();parser.add_argument('--backup',type=Path,required=True);parser.add_argument('--media-zip',type=Path,required=True);args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'private-test-artifacts/linking-v16';OUT.mkdir(parents=True,exist_ok=True)
checks=[]
def check(name,value):
 assert value,name
 checks.append(name);print('PASS:',name,flush=True)
class Quiet(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT/'dist')));threading.Thread(target=server.serve_forever,daemon=True).start()
source=json.loads(args.backup.read_text());url=f'http://127.0.0.1:{server.server_port}/RONIX_Manager.html'
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);ctx=browser.new_context(viewport={'width':1440,'height':1080},accept_downloads=True,timezone_id='Africa/Cairo');p=ctx.new_page();errors=[];dialogs=[];p.on('pageerror',lambda e:errors.append(str(e)));p.on('dialog',lambda d:(dialogs.append(d.message),d.accept()));p.goto(url)
  p.locator('#restore').set_input_files(str(args.backup));check('latest JSON import previews linked repayments and missing photos','صورة تحتاج' in p.locator('#modalBody').inner_text());p.get_by_role('button',name='استيراد هذه النسخة',exact=True).click()
  check('import preserves every financial source record',p.evaluate('(before)=>["projects","assignments","payments","claims","clientReceipts","advances","openingBalances","projectExpenses","receiptAttachments","paymentAttachments"].every(k=>JSON.stringify(data[k])===JSON.stringify(before[k]))',source))
  check('import upgrades schema and records automatic linkage',p.evaluate('data.schemaVersion===18&&data.claimSettlements.some(s=>s.mode==="auto")&&data.auditTrail.some(x=>x.action==="تحديث ربط التحصيل بالمطالبات")'))
  check('client and project and claim totals agree exactly',p.evaluate('()=>data.projects.every(p=>{const a=R16.project(data,p.code),b=ccAmounts(p.code);return a.claimDue===b.claimDue&&a.matched===b.matched&&a.received===received(p.code)})&&clientNames().every(n=>R16.client(data,n).cashDifference===0)&&R14.sum(data.claims.filter(R14.active),c=>R14.remaining(data,c))===R14.delta(R14.sum(data.claims.filter(R14.active),"total"),R14.sum(data.claimSettlements))'))
  before=p.evaluate('data');p.get_by_role('button',name='▧ استعادة صور المشاريع',exact=True).click();p.locator('#modalBody input[type=file]').set_input_files(str(args.media_zip));p.wait_for_function('data.projects.every(p=>(p.photos||[]).every(ph=>ph.src.startsWith("data:image/")))')
  hydrated=p.evaluate('data');photo_count=sum(len(x.get('photos',[])) for x in source['projects'])
  check('all original project photo links were recovered',sum(len(x.get('photos',[])) for x in hydrated['projects'])==photo_count and photo_count>0)
  check('media recovery preserves financial records and existing matches',all(before[k]==hydrated[k] for k in ['assignments','payments','claims','clientReceipts','advances','openingBalances','projectExpenses','claimSettlements','paymentAttachments','receiptAttachments']))
  with zipfile.ZipFile(args.media_zip) as z:
   entries={n:z.read(n) for n in z.namelist() if '/project_media/' in n and not n.endswith('/')}
  exact=True
  for old,new in zip(source['projects'],hydrated['projects']):
   exact=exact and {k:v for k,v in old.items() if k not in ('photos','coverId')}=={k:v for k,v in new.items() if k not in ('photos','coverId')}
   for ph,nh in zip(old.get('photos',[]),new.get('photos',[])):
    matches=[b for n,b in entries.items() if n.endswith('/'+ph['src'])]
    exact=exact and bool(matches) and base64.b64decode(nh['src'].split(',',1)[1])==matches[0] and ph['id']==nh['id']
  check('each photo matches the original bytes for its recorded project path',exact)
  check('all embedded images decode successfully',p.evaluate('async()=>{const all=data.projects.flatMap(p=>p.photos||[]);await Promise.all(all.map(async ph=>{const i=new Image();i.src=ph.src;await i.decode();if(!i.naturalWidth)throw Error("photo")}));return true}'))
  p.evaluate('closeModal();go("costcenters");showCostCenter(r14Encode(data.projects.find(p=>p.photos?.length).code))');check('cost center displays recovered image',p.locator('.r15-cost-photo img').evaluate('async i=>{await i.decode();return i.naturalWidth>0}'))
  check('cost center shows matched and outstanding claim balances',p.locator('#ccDetail .r16-links').count()==1)
  p.evaluate('go("designers");showDesigner(r14Encode(data.assignments[0].designer))');check('designer screen separates due and overpayment',p.locator('.r16-designer-balance').count()==1 and 'دفعات تزيد' in p.locator('.r16-designer-balance').inner_text())
  check('designer balances reconcile without cross-project netting',p.evaluate('()=>{const a=R16.designer(data);return a.credit>0&&a.due>a.net&&R14.delta(a.due,a.credit)===a.net}'))
  with p.expect_download() as dl:p.evaluate('exportCostCenters()')
  path=OUT/'linked-costs.xlsx';dl.value.save_as(path);book=load_workbook(path);rows=list(book['الربط المحاسبي'].values)[1:];expected=p.evaluate('data.projects.map(p=>{const a=R16.project(data,p.code);return[a.code,a.matched,a.claimDue,a.designers.due,a.designers.credit]})');check('Excel linked balances match on-screen account source',[[r[0],r[5],r[6],r[8],r[9]] for r in rows]==expected);book.close()
  before=p.evaluate('data')
  with p.expect_download() as dl:p.evaluate('backup()')
  backup=Path(dl.value.path()).read_bytes();(OUT/'RONIX_V16_Your_Data_With_Photos.json').write_bytes(backup)
  check('new backup embeds every photo and linked settlement',all(ph['src'].startswith('data:image/') for pr in json.loads(backup)['projects'] for ph in pr.get('photos',[])) and json.loads(backup)['claimSettlements']==before['claimSettlements'])
  fresh=browser.new_context();q=fresh.new_page();q.on('dialog',lambda d:d.accept());q.on('pageerror',lambda e:errors.append(str(e)));q.goto(url);q.locator('#restore').set_input_files({'name':'restored.json','mimeType':'application/json','buffer':backup});q.get_by_role('button',name='استيراد هذه النسخة',exact=True).click();q.reload();after=q.evaluate('data')
  check('fresh browser restore retains all images financial records and links',all(before[k]==after[k] for k in ['projects','assignments','payments','claims','clientReceipts','claimSettlements','receiptAttachments','paymentAttachments']))
  check('fresh restore passes core accounting validation',q.evaluate('v8Audit().length===0'))
  snapshot=q.evaluate('JSON.stringify(data)');q.evaluate('v8Review()');check('review exposes missing metadata and excess payments without changing records','مدفوع للمصمم يزيد' in q.locator('#modalBody').inner_text() and q.evaluate('JSON.stringify(data)')==snapshot)
  # A synthetic ledger exercises receipt edits and manual choices through real forms.
  p.evaluate('closeModal();data=R14.normalize({projects:[{code:"T",name:"Test",client:"Test Client",contract:1000,photos:[]}],assignments:[],payments:[],claims:[{id:"CL",code:"T",date:"2026-10-20",status:"معتمدة",total:700,items:[{desc:"T",amount:700}]}]});r14Persist(data);go("projects");openProject("T");openReceipt("T")')
  def submit():p.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
  p.locator('#crAmount').fill('400');p.locator('.receipt-allocation').fill('400');submit();check('new receipt automatically updates the matching claim',p.evaluate('R14.remaining(data,data.claims[0])===300&&customerTotals("Test Client").matched===400'))
  p.evaluate('editCustomerReceipt(r14Encode(data.clientReceipts[0].batchId))');p.locator('#crAmount').fill('250');p.locator('.receipt-allocation').fill('250');submit();check('editing receipt lowers linked repayment without duplicating cash',p.evaluate('R14.remaining(data,data.claims[0])===450&&data.clientReceipts.length===1&&customerTotals("Test Client").cash===250'))
  check('receipt correction audit retains previous and new match amounts',p.evaluate('data.auditTrail.some(x=>x.action==="تحديث ربط التحصيل بالمطالبات"&&x.before?.some(s=>s.amount===400)&&x.after?.some(s=>s.amount===250))'))
  p.evaluate('r14Match("CL")');p.locator('.r14-match').fill('100');submit();p.evaluate('r14Change("unrelated",d=>d.projects[0].note="updated")');check('manual partial allocation is not overridden by later save',p.evaluate('R14.settled(data,"CL")===100&&data.claims[0].matchMode==="manual"'))
  p.evaluate('r14Match("CL")');p.get_by_role('button',name='تفعيل الربط التلقائي',exact=True).click();check('explicit re-enable restores automatic matching',p.evaluate('R14.settled(data,"CL")===250&&data.claims[0].matchMode==="auto"'))
  p.evaluate('openClaim(null,"CL")');p.locator('#claimStatus').select_option('ملغاة');submit();check('cancelling automatically matched claim releases links but keeps cash',p.evaluate('data.claimSettlements.length===0&&customerTotals("Test Client").cash===250'))
  check('all linking and recovery workflows have no script exceptions',not errors)
  result={'passed':len(checks),'checks':checks,'errors':errors};(ROOT/'tests/linking-browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False,indent=2));browser.close()
finally:server.shutdown()
