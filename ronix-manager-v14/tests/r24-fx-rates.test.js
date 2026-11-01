const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const R=require('../src/finance-core.js');

function fixture(){
 return R.normalize({projects:[{code:'SA1',name:'مشروع ريال',client:'عميل',originalContract:1000,contractCurrency:'SAR',contractRate:12,contract:12000}],assignments:[],payments:[]});
}
function receive(d,batch,date,cash,native,settlementRate){
 return R.foreignReceiptEdit(d,{batchId:batch,client:'عميل',date,total:cash,currency:'EGP',exchangeRate:1,allocations:[{code:'SA1',receiptOriginal:cash,projectAmount:native,settlementRate,settlementRateSource:'manual'}],id:()=>batch+'-ROW'});
}

test('each allocation keeps its own project rate while the historical contract rate stays fixed',()=>{
 let d=receive(fixture(),'B1','2026-01-10',1300,100,13);
 d=receive(d,'B2','2026-02-10',3000,200,15);
 assert.equal(d.projects[0].contractRate,12);
 assert.deepEqual(d.clientReceipts.map(r=>r.projectSettlementRate),[13,15]);
 assert.deepEqual(d.clientReceipts.map(r=>r.amount),[1200,2400]);
 assert.deepEqual(d.clientReceipts.map(r=>R.cashReceipt(r)),[1300,3000]);
 assert.equal(R.fxDifference(d,'SA1'),700);
 const summary=R.projectRateSummary(d,d.projects[0]);
 assert.equal(summary.originalPaid,300);
 assert.equal(summary.cashPaid,4300);
 assert.equal(summary.weightedRate,14.333333);
 assert.equal(summary.latestRate,15);
 assert.equal(summary.latestDate,'2026-02-10');
});

test('weighted rate is derived again after a receipt is removed',()=>{
 let d=receive(fixture(),'B1','2026-01-10',1300,100,13);
 d=receive(d,'B2','2026-02-10',3000,200,15);
 d.clientReceipts=d.clientReceipts.filter(r=>r.batchId!=='B2');
 assert.equal(R.projectRateSummary(R.validate(d),d.projects[0]).weightedRate,13);
});

test('receipt UI sends the independent project settlement rate to the core',()=>{
 const source=fs.readFileSync(require.resolve('../src/r15-payments.js'),'utf8');
 assert.match(source,/class="field r24-project-rate"/);
 assert.match(source,/settlementRate:raw\?rateInput\.value:R14\.rate\(rateInput\.value\)/);
 assert.match(source,/R14\.unfx\(actualCash,settlement\)/);
 assert.match(source,/فرق الصرف المحقق/);
});
