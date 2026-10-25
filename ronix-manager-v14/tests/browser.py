import argparse,json, re, sys, os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description='Regression tests with the original private V13 archive supplied locally.')
parser.add_argument('--zip',type=Path,required=True)
parser.add_argument('--original-dir',type=Path,required=True)
args=parser.parse_args()
ORIGINAL=args.original_dir
ZIP=args.zip
ARTIFACTS=ROOT/'private-test-artifacts'
ARTIFACTS.mkdir(exist_ok=True)
checks=[]
def check(name,ok):
    assert ok,name
    checks.append(name)

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context(viewport={'width':1440,'height':1000},accept_downloads=True)
    page=context.new_page(); errors=[];dialogs=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
    page.goto(os.environ.get('RONIX_TEST_URL','http://127.0.0.1:8004/RONIX_Manager.html'))
    check('empty startup',page.locator('.r14-welcome').count()==1)
    check('startup script errors',not errors)
    page.locator('#restore').set_input_files(str(ZIP))
    page.wait_for_function('r14PendingImport!==null')
    check('original backup preview',page.evaluate('r14PendingImport.assignments.length===13 && r14PendingImport.claims.length===1'))
    page.get_by_role('button',name='استيراد هذه النسخة',exact=True).click()
    page.wait_for_function('data.projects.length===30')
    before=json.loads((ORIGINAL/'RONIX_Backup_2026-10-22.json').read_text())
    imported=page.evaluate('data')
    for key in ['assignments','payments','claims','clientReceipts','advances','openingBalances','receiptAttachments','projectExpenses','costAudit']:
        check('preserve '+key,imported[key]==before[key])
    check('preserve exact original project fields',all({k:v for k,v in p.items() if k!='photos'}=={k:v for k,v in q.items() if k!='photos'} for p,q in zip(before['projects'],imported['projects'])))
    check('embed all original project photos',all(ph['src'].startswith('data:image/') for p in imported['projects'] for ph in p.get('photos',[])))
    for key in ['dashboard','projects','costcenters','designers','payments','clients','claims','advanced','reports']:
        page.evaluate('(k)=>go(k)',key)
        check('navigation '+key,bool(page.locator('#content').inner_text()))
    check('original backup audit',page.evaluate('v8Audit().length===0'))
    page.reload();check('reload retains all data',page.evaluate('data.projects.length===30 && data.assignments.length===13'))
    page.evaluate("go('projects');openProject(r14Encode(data.projects[0].code))")
    page.wait_for_timeout(400)
    check('photos decode',page.evaluate("Array.from(document.querySelectorAll('#content img')).every(i=>i.complete&&i.naturalWidth>0)"))
    page.screenshot(path=str(ARTIFACTS/'updated-original-project.png'),full_page=True)
    # Use synthetic data for all mutations, so original records remain a verified fixture.
    fixture={'projects':[{'code':'A','name':'مشروع اختبار أول','client':'عميل اختبار','contract':1000,'photos':[]},{'code':'B','name':'مشروع اختبار ثان','client':'عميل اختبار','contract':2000,'photos':[]}], 'assignments':[{'id':'D','code':'A','designer':'مصمم اختبار','fee':300,'kind':'تصميم'}], 'payments':[], 'claims':[], 'receiptAttachments':{'ATT':{'name':'test.png','mime':'image/png','data':'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='}}}
    page.evaluate('(v)=>{data=R14.normalize(v);r14Persist(data);go("dashboard")}',fixture)
    page.evaluate("openCustomerReceipt(r14Encode('عميل اختبار'))")
    page.locator('#crAmount').fill('100.25');page.locator('.receipt-allocation[data-code="A"]').fill('40.10')
    page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('partial receipt with exact cents',page.evaluate("customerTotals('عميل اختبار').receipts===40.1 && customerTotals('عميل اختبار').cash===100.25 && unallocated('عميل اختبار')===60.15"))
    batch=page.evaluate('data.clientReceipts[0].batchId')
    page.evaluate('(id)=>editCustomerReceipt(r14Encode(id))',batch)
    page.locator('.receipt-allocation[data-code="A"]').fill('60.10');page.locator('.receipt-allocation[data-code="B"]').fill('20.15')
    page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('reallocate existing receipt without new cash',page.evaluate("customerTotals('عميل اختبار').cash===100.25 && received('A')===60.1 && received('B')===20.15 && unallocated('عميل اختبار')===20"))
    page.evaluate("openClaim(r14Encode('A'))")
    page.locator('#claimStatus').select_option(label='صادرة')
    page.evaluate("claimDraftRows=[{code:'A',amount:100.25},{code:'B',amount:200.50}];claimRenderRows()")
    page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('multi project claim cents',page.evaluate("data.claims.length===1 && claimed('A')===100.25 && claimed('B')===200.5 && customerTotals('عميل اختبار').claims===300.75 && ccAmounts('A').verified===100.25"))
    claim=page.evaluate('data.claims[0].id')
    page.evaluate('(id)=>r14Match(r14Encode(id))',claim)
    page.locator('.r14-match').nth(0).fill('50.10');page.locator('.r14-match').nth(1).fill('20.15')
    page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('partial claim settlement no double cash',page.evaluate("R14.settled(data,data.claims[0].id)===70.25 && R14.remaining(data,data.claims[0])===230.5 && customerTotals('عميل اختبار').cash===100.25"))
    snapshot=page.evaluate('JSON.stringify(data)')
    page.evaluate('(id)=>editCustomerReceipt(r14Encode(id))',batch)
    page.locator('.receipt-allocation[data-code="A"]').fill('10')
    page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('reject reduction below matched receipt',page.evaluate('JSON.stringify(data)')==snapshot)
    page.evaluate("closeModal();openAdvance()")
    page.locator('#adClient').select_option(label='عميل اختبار');page.locator('#adTotal').fill('200.50')
    page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('advance increases cash once',page.evaluate("customerTotals('عميل اختبار').cash===300.75"))
    page.evaluate("openApplyAdvance(r14Encode(data.advances[0].id))")
    page.locator('.apply-advance[data-code="B"]').fill('80.25')
    page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('advance allocation reconciles',page.evaluate("customerTotals('عميل اختبار').cash===300.75 && received('B')===100.4 && unallocated('عميل اختبار')===140.25 && v8Audit().length===0"))
    # Rename a code only after it is referenced in all relevant financial ledgers.
    page.evaluate("editProject(r14Encode('B'))")
    page.locator('#pcode').fill('B-NEW');page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('atomic project rename includes claims advances settlements',page.evaluate("getP('B-NEW') && !getP('B') && claimed('B-NEW')===200.5 && received('B-NEW')===100.4 && data.advances[0].allocations[0].code==='B-NEW' && v8Audit().length===0"))
    page.evaluate("openPayment(r14Encode('A'),r14Encode('مصمم اختبار'))")
    page.locator('#payamount').fill('100.25');page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('designer payment supports cents',page.evaluate("paid('A')===100.25"))
    page.evaluate("openProjectExpense(r14Encode('A'))")
    page.locator('#ccExpAmount').fill('20.50');page.locator('#ccExpPayee').fill('مورد اختبار');page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('project cost no designer double count',page.evaluate("ccAmounts('A').projectCosts===320.5 && ccAmounts('A').projectedProfit===679.5 && data.projectExpenses[0].payee==='مورد اختبار'"))
    snapshot=page.evaluate('JSON.stringify(data)');disk=page.evaluate('localStorage.getItem(KEY)')
    page.evaluate("window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('اختبار امتلاء التخزين','QuotaExceededError')};editProject(r14Encode('A'))")
    page.locator('#pname').fill('SHOULD NOT SAVE');page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('storage failure preserves memory and disk',page.evaluate('JSON.stringify(data)')==snapshot and page.evaluate('localStorage.getItem(KEY)')==disk)
    page.evaluate('Storage.prototype.setItem=window.originalSet;closeModal()')
    # Backup round trip including attachments and settlements, using actual download.
    with page.expect_download() as download:
        page.evaluate('backup()')
    backup_path=ARTIFACTS/'test-roundtrip-private.json';download.value.save_as(backup_path)
    saved=json.loads(backup_path.read_text())
    check('backup includes attachments and claim settlements',saved['receiptAttachments']==fixture['receiptAttachments'] and len(saved['claimSettlements'])==2)
    page.locator('#restore').set_input_files(str(backup_path));page.wait_for_function('r14PendingImport!==null')
    page.get_by_role('button',name='استيراد هذه النسخة',exact=True).click()
    check('restore retains attachments and matches',page.evaluate('data.receiptAttachments.ATT.name==="test.png" && data.claimSettlements.length===2'))
    exports=page.evaluate("() => {const saveExport=exportTabs;const out={};exportTabs=(tabs,name)=>{out[name||'untitled']=tabs};exportAllExcel();projectExcel('B-NEW');exportTabs=saveExport;return out}")
    check('comprehensive Excel includes all financial tables',len(exports['RONIX_Finance_Export'])>=11)
    # Popup is inspected; print is stubbed to avoid opening an OS print dialog.
    context.add_init_script('window.print=()=>{}')
    with page.expect_popup() as popup:
        page.evaluate('(id)=>printClaim(r14Encode(id))',claim)
    check('claim print rounds display and keeps exact settlement in accounts', '231' in popup.value.locator('.claim-total').inner_text() and page.evaluate('R14.remaining(data,data.claims[0])')==230.5)
    popup.value.close()
    check('all page scripts remain error-free',not errors)
    result={'passed':len(checks),'checks':checks,'errors':errors,'expected_dialogs':len(dialogs)}
    (ROOT/'tests/browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps(result,ensure_ascii=False,indent=2))
    browser.close()
