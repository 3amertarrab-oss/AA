const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

function money(v){return Math.round(Number(v)*100)/100}
function load(){
 const project={code:'SAR1',name:'مشروع ريال',client:'عميل',contractCurrency:'SAR',contractRate:12,originalContract:1000,contract:12000,contractItems:[]};
 const R14={
  amount:money,cents:v=>Math.round(Number(v)*100),sum:(rows,key='amount')=>money(rows.reduce((n,r)=>n+Number(typeof key==='function'?key(r):(r[key]??0)),0)),delta:(a,b)=>money(Number(a)-Number(b)),
  fx:(v,r=1)=>money(Number(v)*Number(r)),unfx:(v,r=1)=>money(Number(v)/Number(r)),rate:v=>{const n=Number(v);if(!(n>0))throw Error('rate');return n},
  projectCurrency:p=>p?.contractCurrency||'EGP',projectRate:p=>p?.contractRate||1,projectRateSummary:()=>({effectiveRate:15}),projectOriginalTotal:p=>p.originalContract,receivedOriginal:()=>0,
  active:c=>['صادرة','معتمدة'].includes(c.status),claimRows:c=>c.projectRows||[{code:c.code,amount:c.total}],copy:v=>JSON.parse(JSON.stringify(v)),dateOK:()=>true,
  settled:()=>0,remaining:(_,c)=>c.total,claimClient:(_,c)=>c.client,cashReceipt:r=>r.cashAmount??r.amount,status:c=>c.status,normName:v=>String(v||'').trim()
 };
 const context={R14,data:{projects:[project],claims:[],clientReceipts:[],claimSettlements:[]},window:{claimEditingId:null},claimDraftRows:[],r14Today:()=> '2026-11-01',getP:code=>code===project.code?project:null,r14Id:()=> 'X',fmt:String,esc:String,$:()=>null,received:()=>0,r14Paid:String,claimClientProjects:()=>[project],cover:()=>null,clientNames:()=>['عميل'],field:()=>'',modal:()=>{},val:()=>'',r14RequireDate:()=> '2026-11-01',r14Encode:encodeURIComponent,r14Upsert:()=>{},r14Change:()=>true,r14Done:()=>{},alert:()=>{},confirm:()=>true,R19:{formatAmount:String},r19Doc:()=> 'CL-1',claimCodes:c=>c.projectRows.map(r=>r.code),R14_LOGO:'logo',location:{href:'https://example.test/'},console};
 vm.createContext(context);
 const source=fs.readFileSync(path.join(__dirname,'../src/r24-claims.js'),'utf8')+'\nthis.__R24Claims=R24Claims;';
 vm.runInContext(source,context,{filename:'r24-claims.js'});return{context,project,R24:context.__R24Claims};
}

test('effective payment-weighted rate is the default issue rate',()=>{
 const {R24,project}=load();assert.equal(R24.weightedRate({clientReceipts:[]},project),15);assert.deepEqual({...R24.rateInfo({},project)},{rate:15,source:'weighted',weighted:15,contract:12});
});

test('legacy foreign claim keeps its EGP ledger amount and derives original currency at contract rate',()=>{
 const {R24,project}=load(),claim={id:'OLD',date:'2026-10-01',status:'صادرة'},row={code:project.code,amount:1200,items:[]};
 const hydrated=R24.hydrateRow({projects:[project],clientReceipts:[]},claim,row);assert.equal(hydrated.currency,'SAR');assert.equal(hydrated.originalAmount,100);assert.equal(hydrated.amount,1200);assert.equal(hydrated.accountingAmount,1200);assert.equal(hydrated.rateSource,'legacy');assert.equal(hydrated.rateConfirmed,false);
});

test('claim recalculation separates contract-book value from issue-rate value',()=>{
 const {context}=load(),row={code:'SAR1',currency:'SAR',claimRate:15,rateDate:'2026-11-01',rateSource:'weighted',items:[{description:'بند',unit:'م²',quantity:2,originalUnitPrice:100}]};
 context.r24RecalculateRow(row);assert.equal(row.originalAmount,200);assert.equal(row.amount,2400);assert.equal(row.accountingAmount,3000);assert.equal(row.items[0].unitPrice,1200);assert.equal(row.items[0].accountingUnitPrice,1500);
});

test('original totals stay separated by currency',()=>{
 const {R24}=load();assert.deepEqual({...R24.groupedOriginal([{currency:'SAR',originalAmount:100},{currency:'SAR',originalAmount:50},{currency:'EGP',originalAmount:20}])},{SAR:150,EGP:20});
});

test('settled amount is presented using the frozen claim issue rate',()=>{
 const {context,project}=load(),claim={id:'CL1',client:'عميل',date:'2026-11-01',status:'صادرة',displayCurrency:'both',accountingTotal:1500,total:1200,projectRows:[{code:project.code,currency:'SAR',originalAmount:100,claimRate:15,rateDate:'2026-11-01',rateSource:'weighted',rateConfirmed:true,amount:1200,accountingAmount:1500,items:[]}]};
 context.data.claims=[claim];context.data.clientReceipts=[{id:'R1',code:project.code,projectAmount:50,amount:600}];context.data.claimSettlements=[{claimId:claim.id,receiptId:'R1',code:project.code,amount:600}];assert.equal(context.r24ClaimIssuedPaid(claim),750);
});
