const test=require('node:test');
const assert=require('node:assert/strict');
const F=require('../src/r24-financial-core.js');
const R=require('../src/finance-core.js');

function base(overrides={}){
  return {
    accountingSettings:{baseCurrency:'EGP',defaultCashAccountId:'1100',openingComplete:true},
    projects:[{code:'P1',name:'مشروع',client:'عميل',contract:2600,contractCurrency:'SAR',contractRate:13,originalContract:200}],
    assignments:[],payments:[],claims:[],clientReceipts:[],advances:[],claimSettlements:[],projectExpenses:[],
    manualJournals:[],laborEntries:[],generalExpenses:[],...overrides
  };
}

test('foreign claim receipt and settlement create balanced statements and realized FX gain',()=>{
  const data=base({
    claims:[{id:'CL1',client:'عميل',date:'2026-01-10',status:'معتمدة',total:1300,projectRows:[{code:'P1',amount:1300,originalAmount:100,currency:'SAR',claimRate:13,accountingAmount:1300}],items:[{amount:1300}]}],
    clientReceipts:[{id:'R1',batchId:'B1',client:'عميل',code:'P1',date:'2026-02-01',amount:1300,cashAmount:1350,projectAmount:100,projectCurrency:'SAR',bookRate:13,projectSettlementRate:13.5,incomingCurrency:'SAR',receiptOriginal:100,receiptRate:13.5,receiptTotal:100}],
    claimSettlements:[{claimId:'CL1',receiptId:'R1',code:'P1',amount:1300}]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.ready,true);
  assert.equal(report.trialBalance.balanced,true);
  assert.equal(report.balanceSheet.balanced,true);
  assert.equal(report.cashFlow.reconciled,true);
  assert.equal(report.incomeStatement.projectRevenue,1300);
  assert.equal(report.incomeStatement.fxGain,50);
  assert.equal(report.incomeStatement.netProfit,1350);
  assert.equal(report.balanceSheet.totalAssets,1350);
  assert.equal(report.balanceSheet.totalLiabilities,0);
  assert.equal(report.balanceSheet.currentEarnings,1350);
  assert.equal(report.cashFlow.operating,1350);
});

test('weighted project rate uses actual EGP cash over native contract settlement',()=>{
  const data=base({clientReceipts:[
    {id:'R1',code:'P1',date:'2026-02-01',amount:1300,cashAmount:1350,projectAmount:100,bookRate:13},
    {id:'R2',code:'P1',date:'2026-03-01',amount:1300,cashAmount:1400,projectAmount:100,bookRate:13}
  ]});
  assert.deepEqual(F.weightedProjectRate(data,'P1'),{native:200,cash:2750,rate:13.75});
});

test('dated designer fees expenses and labor distinguish accrual from cash',()=>{
  const data=base({
    accountingSettings:{baseCurrency:'EGP',defaultCashAccountId:'1100'},
    manualJournals:[{id:'OPEN',kind:'opening',date:'2025-12-31',description:'افتتاحي',lines:[{account:'1100',debit:1000},{account:'3100',credit:1000}]}],
    assignments:[{id:'A1',code:'P1',designer:'مصمم',fee:500,recognizedDate:'2026-01-05'}],
    payments:[{id:'PAY1',code:'P1',designer:'مصمم',date:'2026-02-01',amount:600}],
    projectExpenses:[{id:'E1',code:'P1',date:'2026-02-02',category:'نقل',amount:200,accountId:'5200',paymentStatus:'paid',accountingReviewed:true}],
    laborEntries:[{id:'H1',code:'P1',employee:'مهندس',date:'2026-02-03',hours:10,hourlyRate:10,paymentStatus:'accrued'}]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.ready,true);
  assert.equal(report.incomeStatement.projectCosts,800);
  assert.equal(report.incomeStatement.netProfit,-800);
  assert.equal(report.cashFlow.openingCash,1000);
  assert.equal(report.cashFlow.operating,-800);
  assert.equal(report.cashFlow.closingCash,200);
  const position=report.balanceSheet;
  assert.equal(position.totalAssets,300); // 200 cash + 100 advance to designer
  assert.equal(position.totalLiabilities,100); // unpaid labor
  assert.equal(position.totalEquity,200); // 1,000 capital - 800 current loss
  assert.equal(position.balanced,true);
});

test('unallocated customer cash remains a liability and is not revenue',()=>{
  const data=base({clientReceipts:[{id:'R1',batchId:'B1',client:'عميل',code:'',date:'2026-02-01',amount:500,cashAmount:500}]});
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.incomeStatement.projectRevenue,0);
  assert.equal(report.balanceSheet.totalAssets,500);
  assert.equal(report.balanceSheet.totalLiabilities,500);
  assert.equal(report.balanceSheet.balanced,true);
});

test('project write-off records bad debt without inventing cash or a payable',()=>{
  const data=base({
    projects:[{code:'P1',name:'مشروع',client:'عميل',contract:1000,contractCurrency:'EGP',contractRate:1,originalContract:1000}],
    claims:[{id:'CL1',client:'عميل',date:'2026-01-10',status:'معتمدة',total:1000,projectRows:[{code:'P1',amount:1000,originalAmount:1000,currency:'EGP',claimRate:1,accountingAmount:1000}]}],
    clientReceipts:[{id:'R1',batchId:'B1',client:'عميل',code:'P1',date:'2026-02-01',amount:600,cashAmount:600}],
    claimSettlements:[{claimId:'CL1',receiptId:'R1',code:'P1',amount:600}],
    projectWriteOffs:[{id:'WO1',code:'P1',client:'عميل',date:'2026-03-01',amount:400,commercialDiscount:0,totalAdjustment:400,reason:'تعذر التحصيل',claimAllocations:[{claimId:'CL1',code:'P1',amount:400}]}]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'}),badDebt=report.incomeStatement.expenseRows.find(x=>x.id==='6250');
  assert.equal(badDebt.amount,400);assert.equal(report.incomeStatement.netProfit,600);assert.equal(report.balanceSheet.assets.find(x=>x.id==='1200').amount,0);assert.equal(report.cashFlow.closingCash,600);assert.equal(report.balanceSheet.totalLiabilities,0);assert.equal(report.trialBalance.balanced,true)
});

test('legacy customer credit validates when no project close adjustment exists',()=>{
 const d=base();d.projects=[{code:'CREDIT',name:'Credit project',client:'Client',contract:100}];d.clientReceipts=[{id:'R-CREDIT',code:'CREDIT',client:'Client',date:'2026-10-10',amount:125}];
 assert.doesNotThrow(()=>R.validate(R.normalize(d)));
});

test('internal work-hour allocation creates project cost and liability without cash outflow',()=>{
  const data=base({
    projectExpenses:[{id:'H1',code:'P1',date:'2026-02-03',category:'ساعات عمل',expenseType:'work-hours',workHours:10,hourlyRate:20,amount:200,cashEffect:false,paymentStatus:'accrued',accountingReviewed:true,accountId:'5300',payableAccountId:'2250'}]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.incomeStatement.projectCosts,200);
  assert.equal(report.cashFlow.operating,0);
  assert.equal(report.balanceSheet.totalLiabilities,200);
});

test('legacy records produce a draft with explicit readiness blockers',()=>{
  const data=base({
    accountingSettings:undefined,
    assignments:[{id:'A1',code:'P1',designer:'مصمم',fee:500}],
    projectExpenses:[{id:'E1',code:'P1',date:'2026-02-02',category:'قديم',amount:50}]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'}),codes=new Set(report.issues.map(x=>x.code));
  assert.equal(report.ready,false);
  assert.equal(codes.has('settings-missing'),true);
  assert.equal(codes.has('opening-missing'),true);
  assert.equal(codes.has('cash-account-missing'),true);
  assert.equal(codes.has('assignment-unreviewed'),true);
  assert.equal(codes.has('expense-unreviewed'),true);
  assert.equal(report.trialBalance.balanced,true);
  assert.equal(report.balanceSheet.balanced,true);
});

test('historical foreign receipts and claims block final readiness until their rates are confirmed',()=>{
  const data=base({
    claims:[{id:'OLD-CL',client:'عميل',date:'2026-01-10',status:'معتمدة',total:1300,projectRows:[{code:'P1',amount:1300,currency:'EGP',claimRate:1,originalAmount:1300,rateSource:'legacy',legacyCurrencyUnconfirmed:true}],items:[{amount:1300}]}],
    clientReceipts:[{id:'OLD-R',client:'عميل',code:'P1',date:'2026-02-01',amount:1300}]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'}),codes=new Set(report.issues.map(x=>x.code));
  assert.equal(report.ready,false);
  assert.equal(codes.has('foreign-receipt-unconfirmed'),true);
  assert.equal(codes.has('foreign-claim-unconfirmed'),true);
  assert.equal(report.trialBalance.balanced,true);
  assert.equal(report.balanceSheet.balanced,true);
});

test('unbalanced manual journal is rejected from readiness without corrupting trial balance',()=>{
  const data=base({manualJournals:[{id:'BAD',kind:'opening',date:'2026-01-01',lines:[{account:'1100',debit:100},{account:'3100',credit:90}]}]});
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.ready,false);
  assert.equal(report.issues.some(x=>x.code==='manual-unbalanced'),true);
  assert.equal(report.trialBalance.balanced,true);
});

test('closing state certifies only a ready matching period',()=>{
  const data=base(),draft=F.report(data,{from:'2026-01-01',to:'2026-12-31'});data.fiscalClosings=[{from:'2026-01-01',to:'2026-12-31',status:'closed',signature:draft.signature}];
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.ready,true);
  assert.equal(report.certified,true);
  assert.equal(F.report(data,{from:'2026-01-01',to:'2026-06-30'}).certified,false);
});

test('row-level claim currency uses frozen issue rate and closing revaluation',()=>{
  const data=base({
    closingRates:[{currency:'SAR',date:'2026-12-31',rate:15}],
    claims:[{id:'CL1',client:'عميل',date:'2026-01-10',status:'معتمدة',total:1300,projectRows:[{code:'P1',amount:1300,originalAmount:100,currency:'SAR',claimRate:14,accountingAmount:1400}],items:[{amount:1300}]}]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.ready,true);
  assert.equal(report.incomeStatement.projectRevenue,1400);
  assert.equal(report.incomeStatement.fxGain,100);
  assert.equal(report.balanceSheet.assets.find(x=>x.id==='1200').amount,1500);
  assert.equal(report.balanceSheet.balanced,true);
});

test('work-hour project expense is accrued once as labor and has no cash effect',()=>{
  const data=base({projectExpenses:[{id:'H1',code:'P1',date:'2026-02-03',category:'ساعات عمل',expenseType:'work-hours',workHours:2,hourlyRate:100,amount:200,cashEffect:false}]});
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.ready,true);
  assert.equal(report.incomeStatement.projectCosts,200);
  assert.equal(report.cashFlow.operating,0);
  assert.equal(report.balanceSheet.liabilities.find(x=>x.id==='2250').amount,200);
  assert.equal(report.entries.filter(x=>x.source.id==='H1').length,1);
  assert.equal(report.issues.some(x=>x.code==='expense-unreviewed'),false);
});

test('source ledgers are never mutated while generating reports',()=>{
  const data=base({claims:[{id:'CL1',client:'عميل',date:'2026-01-10',status:'صادرة',total:100,projectRows:[{code:'P1',amount:100}],items:[{amount:100}]}]}),before=JSON.stringify(data);
  F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(JSON.stringify(data),before);
});

test('every non-project expense account is included in period profit',()=>{
  const data=base({
    accounts:[{id:'6200',code:'6200',name:'تكلفة تمويل',type:'expense',group:'finance-cost'}],
    manualJournals:[
      {id:'OPEN',kind:'opening',date:'2025-12-31',description:'افتتاحي',lines:[{account:'1100',debit:100},{account:'3100',credit:100}]},
      {id:'FIN',kind:'adjustment',date:'2026-02-01',description:'تكلفة تمويل',lines:[{account:'6200',debit:100},{account:'1100',credit:100}]}
    ]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.incomeStatement.operatingExpenses,100);
  assert.equal(report.incomeStatement.operatingRows.find(x=>x.id==='6200').amount,100);
  assert.equal(report.incomeStatement.netProfit,-100);
  assert.equal(report.balanceSheet.currentEarnings,-100);
  assert.equal(report.balanceSheet.balanced,true);
});

test('archived recognized designer assignment remains in accounting history',()=>{
  const data=base({
    assignments:[{id:'A-OLD',code:'P1',designer:'مصمم قديم',fee:500,recognizedDate:'2026-01-05',archivedAt:'2026-05-01T00:00:00Z'}],
    payments:[{id:'P-OLD',code:'P1',designer:'مصمم قديم',amount:200,date:'2026-02-01'}]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.incomeStatement.projectCosts,500);
  assert.equal(report.balanceSheet.liabilities.find(x=>x.id==='2200').amount,300);
  assert.equal(report.entries.some(x=>x.id==='FEE:A-OLD'),true);
});

test('later period reports only revaluation movement since prior closing rate',()=>{
  const data=base({
    projects:[{code:'P1',name:'مشروع',client:'عميل',contract:1000,contractCurrency:'SAR',contractRate:10,originalContract:100}],
    claims:[{id:'CL-RV',client:'عميل',date:'2026-01-10',status:'معتمدة',total:1000,projectRows:[{code:'P1',amount:1000,originalAmount:100,currency:'SAR',claimRate:10,accountingAmount:1000}],items:[{amount:1000}]}],
    closingRates:[{currency:'SAR',date:'2026-09-30',rate:12},{currency:'SAR',date:'2026-10-31',rate:13}]
  });
  const report=F.report(data,{from:'2026-10-01',to:'2026-10-31'});
  assert.equal(report.incomeStatement.fxGain,100);
  assert.equal(report.trialBalance.periodDebit,100);
  assert.equal(report.balanceSheet.assets.find(x=>x.id==='1200').amount,1300);
  assert.equal(report.balanceSheet.balanced,true);
});

test('later settlement releases the matching share of opening revaluation',()=>{
  const data=base({
    projects:[{code:'P1',name:'مشروع',client:'عميل',contract:1000,contractCurrency:'SAR',contractRate:10,originalContract:100}],
    claims:[{id:'CL-RVS',client:'عميل',date:'2026-01-10',status:'معتمدة',total:1000,projectRows:[{code:'P1',amount:1000,originalAmount:100,currency:'SAR',claimRate:10,accountingAmount:1000}],items:[{amount:1000}]}],
    clientReceipts:[{id:'R-RVS',batchId:'B-RVS',client:'عميل',code:'P1',date:'2026-10-15',amount:500,cashAmount:650,projectAmount:50,projectCurrency:'SAR',bookRate:10,projectSettlementRate:13,incomingCurrency:'SAR',receiptOriginal:50,receiptRate:13,receiptTotal:50}],
    claimSettlements:[{claimId:'CL-RVS',receiptId:'R-RVS',code:'P1',amount:500}],
    closingRates:[{currency:'SAR',date:'2026-09-30',rate:12},{currency:'SAR',date:'2026-10-31',rate:13}]
  });
  const report=F.report(data,{from:'2026-10-01',to:'2026-10-31'});
  assert.equal(report.incomeStatement.fxGain,150);
  assert.equal(report.incomeStatement.fxLoss,50);
  assert.equal(report.incomeStatement.netProfit,100);
  assert.equal(report.balanceSheet.assets.find(x=>x.id==='1200').amount,650);
  assert.equal(report.balanceSheet.totalAssets,1300);
  assert.equal(report.balanceSheet.balanced,true);
});

test('closing signature includes account definitions that affect presentation',()=>{
  const data=base({
    accounts:[{id:'6200',code:'6200',name:'تكلفة تمويل',type:'expense',group:'finance-cost'}],
    manualJournals:[{id:'FIN',kind:'adjustment',date:'2026-02-01',description:'تكلفة تمويل',lines:[{account:'6200',debit:100},{account:'1100',credit:100}]}]
  });
  const first=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  data.fiscalClosings=[{from:first.from,to:first.to,status:'closed',signature:first.signature}];
  assert.equal(F.report(data,{from:first.from,to:first.to}).certified,true);
  data.accounts[0].group='operating-expense';
  const changed=F.report(data,{from:first.from,to:first.to});
  assert.notEqual(changed.signature,first.signature);
  assert.equal(changed.certified,false);
});

test('future dated review blockers do not stop an earlier closing, but undated ones do',()=>{
  const data=base({
    claims:[{id:'FUTURE-CL',client:'عميل',date:'2027-01-10',status:'معتمدة',total:1300,projectRows:[{code:'P1',amount:1300,rateSource:'legacy',legacyCurrencyUnconfirmed:true}],items:[{amount:1300}]}],
    clientReceipts:[{id:'FUTURE-R',client:'عميل',code:'P1',date:'2027-02-01',amount:1300}],
    projectExpenses:[{id:'FUTURE-E',code:'P1',date:'2027-03-01',category:'مستقبلي',amount:50}]
  });
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(report.ready,true);
  assert.equal(report.issues.some(x=>['foreign-claim-unconfirmed','foreign-receipt-unconfirmed','expense-unreviewed'].includes(x.code)),false);
  data.assignments.push({id:'NO-DATE',code:'P1',designer:'غير مؤرخ',fee:100});
  const blocked=F.report(data,{from:'2026-01-01',to:'2026-12-31'});
  assert.equal(blocked.ready,false);
  assert.equal(blocked.issues.some(x=>x.code==='assignment-unreviewed'),true);
});

test('default report window is a valid ISO range',()=>{
  const report=F.report(base());
  assert.equal(report.from,'1900-01-01');
  assert.equal(report.to,'9999-12-31');
  assert.equal(report.ready,true);
});
