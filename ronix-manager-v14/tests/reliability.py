import base64,json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
URL=os.environ.get('RONIX_TEST_URL','http://127.0.0.1:8004/RONIX_Manager.html')
checks=[]
def check(name,value):
    assert value,name
    checks.append(name)
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    context=browser.new_context();page=context.new_page();errors=[];external=[]
    def setup(p):
        p.on('dialog',lambda d:d.accept())
        p.on('pageerror',lambda e:errors.append(str(e)))
    setup(page)
    page.on('request',lambda r:external.append(r.url) if not r.url.startswith(URL.rsplit('/',1)[0]+'/') and not r.url.startswith('data:') else None)
    page.goto(URL)
    page.evaluate("data=R14.normalize({projects:[{code:'A',name:'test',client:'Client',contract:1234.567,photos:[]}],assignments:[{id:'D',code:'A',designer:'Designer',fee:100}],payments:[],projectExpenses:[{id:'E',code:'A',date:'2026-01-01',category:'مواد',amount:10}]});r14Persist(data);go('dashboard')")
    page.evaluate("editProject('A')");page.locator('#pname').fill('renamed');page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('editing other fields preserves legacy precision',page.evaluate('data.projects[0].contract===1234.567 && data.projects[0].name==="renamed"'))
    check('cost center rounds legacy contract to piastres',page.evaluate("ccAmounts('A').contract===1234.57 && ccAmounts('A').projectedProfit===1124.57"))
    # Quota failure when editing an existing expense must retain its old value.
    snapshot=page.evaluate('JSON.stringify(data)');disk=page.evaluate('localStorage.getItem(KEY)')
    page.evaluate("window.savedSet=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota test')};editProjectExpense('E')")
    page.locator('#ccExpAmount').fill('99.50');page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('expense edit rollback after save failure',page.evaluate('JSON.stringify(data)')==snapshot and page.evaluate('localStorage.getItem(KEY)')==disk)
    page.evaluate("Storage.prototype.setItem=window.savedSet;closeModal();openOpening()")
    page.locator('#obClient').select_option(label='Client');page.locator('#obAmount').fill('-25.50');page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('signed opening remains separate from contracts',page.evaluate("data.openingBalances[0].amount===-25.5 && customerTotals('Client').contracts===1234.57"))
    page.evaluate("go('advanced');openAdvancedClient(r14Encode('Client'))")
    page.locator('#finFrom').fill('2026-12-01');page.locator('#finTo').fill('2026-01-01')
    check('invalid statement period rejected',page.evaluate("()=>{try{periodRows('Client');return false}catch{return true}}"))
    # Generate a real image for the preserved gallery and attachment workflows.
    pixel=page.evaluate("()=>{const c=document.createElement('canvas');c.width=2;c.height=2;c.getContext('2d').fillRect(0,0,2,2);return c.toDataURL('image/png').split(',')[1]}")
    page.evaluate("go('projects');openProject('A')")
    page.locator('#content input[type=file]').set_input_files({'name':'sample.png','mimeType':'image/png','buffer':base64.b64decode(pixel)})
    page.wait_for_function('data.projects[0].photos.length===1')
    check('project photo upload and persistence',page.evaluate('data.projects[0].photos[0].src.startsWith("data:image/")'))
    photo_id=page.evaluate('data.projects[0].photos[0].id')
    page.evaluate('(id)=>setCover("A",r14Encode(id))',photo_id)
    check('project photo cover preserved',page.evaluate('(id)=>data.projects[0].coverId===id',photo_id))
    page.evaluate("openCustomerReceipt(r14Encode('Client'))")
    page.locator('#crAmount').fill('50.25');page.locator('#modalBody form').evaluate('(f)=>f.requestSubmit()')
    check('fully unallocated receipt accepted',page.evaluate("received('A')===0 && unallocated('Client')===50.25"))
    page.evaluate("go('advanced')")
    page.locator('#content input[type=file]').set_input_files({'name':'receipt.png','mimeType':'image/png','buffer':base64.b64decode(pixel)})
    page.wait_for_function('Object.keys(data.receiptAttachments).length===1')
    check('receipt attachment is saved',page.evaluate('Object.values(data.receiptAttachments)[0].name==="receipt.png"'))
    # Bad import cannot replace live data.
    snapshot=page.evaluate('JSON.stringify(data)');disk=page.evaluate('localStorage.getItem(KEY)')
    page.locator('#restore').set_input_files({'name':'bad.json','mimeType':'application/json','buffer':b'{"projects":[],"assignments":[],"payments":[],"clientReceipts":{}}'})
    page.wait_for_timeout(100)
    check('malformed restore preserves all existing data',page.evaluate('JSON.stringify(data)')==snapshot and page.evaluate('localStorage.getItem(KEY)')==disk)
    # A second tab with an old snapshot must not overwrite the new snapshot.
    other=context.new_page();setup(other);other.goto(URL)
    page.evaluate("r14Change('test write',d=>d.projects[0].note='newer snapshot')")
    newer=page.evaluate('localStorage.getItem(KEY)')
    result=other.evaluate("r14Change('stale write',d=>d.projects[0].note='stale snapshot')")
    check('stale tab write blocked',result is False and page.evaluate('localStorage.getItem(KEY)')==newer)
    other.close()
    # Corrupt local data is preserved for recovery, never replaced by a seed.
    page.evaluate("localStorage.setItem(KEY,'{broken-json')");page.reload()
    check('corrupt stored data is retained',page.evaluate('localStorage.getItem(KEY)==="{broken-json" && !!r14BootIssue'))
    check('saving blocked until explicit restore',page.evaluate("r14Persist(r14Empty())") is False)
    check('no external resources requested',not external)
    check('reliability workflows have no script exceptions',not errors)
    result={'passed':len(checks),'checks':checks,'errors':errors}
    (ROOT/'tests/reliability-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
    print(json.dumps(result,ensure_ascii=False,indent=2));browser.close()
