const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function load(){
  const context={
    editProject(){},saveProject(){},editAssignment(){},saveAssignment(){},renderProject(){},renderDesigner(){},showCostCenter(){},
    R14:{claimRows:c=>c.projectRows||[{code:c.code}],projectCurrency:p=>p.contractCurrency||'EGP'},
    console
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/r15-projects.js'),'utf8'),context);
  return context;
}

test('any accounting movement locks the historical contract currency and rate',()=>{
  const ui=load(),empty={claims:[],clientReceipts:[],advances:[],assignments:[],payments:[],projectExpenses:[],deletedPayments:[]};
  assert.equal(ui.r24ProjectHasFinancialMovement(empty,'P1'),false);
  for(const changed of [
    {claims:[{projectRows:[{code:'P1'}]}]},
    {clientReceipts:[{code:'P1'}]},
    {advances:[{allocations:[{code:'P1'}]}]},
    {assignments:[{code:'P1'}]},
    {payments:[{code:'P1'}]},
    {projectExpenses:[{code:'P1'}]},
    {deletedPayments:[{payment:{code:'P1'}}]}
  ])assert.equal(ui.r24ProjectHasFinancialMovement({...empty,...changed},'P1'),true);
});

test('foreign project rate overview labels historical weighted latest and uncertain legacy rates',()=>{
  const ui=load();
  ui.data={};ui.esc=v=>String(v);
  ui.R14.projectCurrency=()=> 'SAR';
  ui.R14.projectRateSummary=()=>({contractRate:13.25,weightedRate:14.333333,latestRate:15,latestDate:'2026-10-31',unconfirmedCount:2});
  const html=ui.r24ProjectRateOverview({contractCurrency:'SAR'});
  for(const label of ['سعر التعاقد التاريخي','المتوسط الفعلي المرجّح','آخر سعر تنفيذ','2026-10-31','حركة قديمة بسعر غير موثّق'])assert.match(html,new RegExp(label));
  assert.match(html,/14\.333333/);
});
