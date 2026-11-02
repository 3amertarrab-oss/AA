const test=require('node:test');
const assert=require('node:assert/strict');
const P=require('../src/project-report-core.js');

function fixture(){return {
 projects:[{code:'P1',name:'واجهة',client:'عميل',contract:13000,contractCurrency:'SAR',originalContract:1000,contractRate:13,contractItems:[{description:'بند',unit:'م²',quantity:10,unitPrice:100,amount:1000}],state:'نشط'}],
 claims:[{id:'CL1',client:'عميل',date:'2026-02-01',status:'معتمدة',total:5200,projectRows:[{code:'P1',amount:5200,accountingAmount:5200}]}],
 clientReceipts:[{id:'R1',batchId:'B1',client:'عميل',code:'P1',date:'2026-02-05',amount:2600,cashAmount:2700,method:'تحويل'}],
 claimSettlements:[{claimId:'CL1',receiptId:'R1',code:'P1',amount:2600}],
 assignments:[{id:'A1',code:'P1',designer:'مصمم',kind:'تصميم',fee:1000,recognizedDate:'2026-01-10'}],
 payments:[{id:'D1',code:'P1',designer:'مصمم',date:'2026-02-06',amount:400}],
 projectExpenses:[{id:'E1',code:'P1',date:'2026-02-07',category:'نقل',amount:300},{id:'H1',code:'P1',date:'2026-02-08',category:'ساعات عمل',expenseType:'work-hours',workHours:2,hourlyRate:100,amount:200,cashEffect:false}],
 advances:[],customers:[],deletedPayments:[],trashRecords:[]
}}

test('project dossier separates contract claims cash costs and profit',()=>{
 const m=P.model(fixture(),'P1');
 assert.equal(m.contractValue,13000);
 assert.equal(m.claimValue,5200);
 assert.equal(m.claimPaid,2600);
 assert.equal(m.actualCashIn,2700);
 assert.equal(m.totalCost,1500);
 assert.equal(m.expectedMargin,11500);
 assert.equal(m.actualProfit,1800);
 assert.equal(m.currentResult,3700);
 assert.equal(m.cashNet,2000);
});

test('project timeline includes each source once and labels noncash work correctly',()=>{
 const rows=P.timeline(fixture(),'P1');
 assert.equal(rows.filter(x=>x.category==='receipt').length,1);
 assert.equal(rows.filter(x=>x.category==='claim').length,1);
 assert.equal(rows.filter(x=>x.category==='designer-payment').length,1);
 const work=rows.find(x=>x.category==='work');
 assert.equal(work.amount,200);
 assert.equal(work.flow,'neutral');
 assert.equal(rows.find(x=>x.category==='receipt').amount,2700);
});

test('project dossier rejects unknown projects without mutating data',()=>{
 const source=fixture(),before=JSON.stringify(source);
 assert.throws(()=>P.model(source,'MISSING'),/المشروع غير موجود/);
 assert.equal(JSON.stringify(source),before);
});
