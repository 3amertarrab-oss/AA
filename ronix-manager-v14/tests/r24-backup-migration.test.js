const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=require('../src/finance-core.js');
const F=require('../src/r24-financial-core.js');

const BACKUP_FILE='1-RONIX_V20_Backup_2026-10-29.json';

// The real customer backup intentionally stays outside the repository. CI and
// local runs can opt in with RONIX_TEST_BACKUP. In the managed review
// workspace, discover the already-uploaded file by name without committing its
// private attachment path. RONIX_V24_BACKUP remains a backwards-compatible
// alias for older local commands.
function findUploadedBackup(root,name){
  if(!root||!fs.existsSync(root))return '';
  const pending=[root];
  while(pending.length){
    const current=pending.shift();
    let entries=[];
    try{entries=fs.readdirSync(current,{withFileTypes:true});}catch{return '';}
    for(const entry of entries){
      const item=path.join(current,entry.name);
      if(entry.isFile()&&entry.name===name)return item;
      if(entry.isDirectory())pending.push(item);
    }
  }
  return '';
}

const configuredBackup=process.env.RONIX_TEST_BACKUP||process.env.RONIX_V24_BACKUP||'';
const BACKUP=configuredBackup?path.resolve(configuredBackup):findUploadedBackup('/tmp/codex-remote-attachments',BACKUP_FILE);
const REAL_BACKUP_TEST={skip:BACKUP&&fs.existsSync(BACKUP)?false:'Set RONIX_TEST_BACKUP to run tests against the private customer backup'};

// Compare only financial values, identities, and accounting links. Normalizing
// an older backup may safely add empty arrays/default units, but it must never
// rewrite a recorded amount or reconnect a document to another project.
function financialDigest(d){
  const rows=(name,fields)=>(d[name]||[]).map(row=>fields.map(key=>row?.[key]??null));
  return {
    schemaVersion:d.schemaVersion,
    projects:rows('projects',['code','client','contract','originalContract','contractCurrency','contractRate']),
    assignments:rows('assignments',['id','code','designer','fee','baseFee']),
    payments:rows('payments',['id','code','designer','date','amount']),
    claims:(d.claims||[]).map(c=>[c.id,c.client,c.code,c.date,c.status,c.total,(c.projectRows||[]).map(r=>[r.code,r.amount,r.originalAmount??null,r.currency??null,r.claimRate??null])]),
    receipts:rows('clientReceipts',['id','batchId','client','code','date','amount','cashAmount','projectAmount','receiptOriginal','incomingCurrency','receiptRate','projectSettlementRate','sourceAdvanceId']),
    settlements:rows('claimSettlements',['claimId','receiptId','code','amount','originalAmount','cashAmount','mode']),
    advances:rows('advances',['id','client','date','total','allocated']),
    expenses:rows('projectExpenses',['id','code','date','amount','expenseType','cashEffect']),
    deletedPayments:(d.deletedPayments||[]).map(x=>[x.payment?.id,x.payment?.code,x.payment?.designer,x.payment?.date,x.payment?.amount])
  };
}

test('latest real V20 backup migrates without changing amounts or links',REAL_BACKUP_TEST,()=>{
  const source=JSON.parse(fs.readFileSync(BACKUP,'utf8')),
    beforeText=JSON.stringify(source),before=financialDigest(source),
    normalized=R.normalize(source),validated=R.validate(source);

  assert.equal(source.schemaVersion,19);
  assert.equal(source.projects.length,37);
  assert.equal(source.claims.length,5);
  assert.equal(source.clientReceipts.length,16);
  assert.deepEqual(financialDigest(normalized),before);
  assert.deepEqual(financialDigest(validated),before);
  assert.equal(JSON.stringify(source),beforeText,'migration/report helpers must not mutate the uploaded backup');
  assert.deepEqual(R.audit(validated),[]);
});
test('latest real backup produces balanced draft statements with explicit readiness blockers',REAL_BACKUP_TEST,()=>{
  const source=JSON.parse(fs.readFileSync(BACKUP,'utf8')),before=JSON.stringify(source),data=R.validate(source);
  const report=F.report(data,{from:'2026-01-01',to:'2026-12-31'}),codes=report.issues.map(x=>x.code);

  assert.equal(report.ready,false);
  assert.equal(report.certified,false);
  assert.equal(report.trialBalance.balanced,true);
  assert.equal(report.balanceSheet.balanced,true);
  assert.equal(report.cashFlow.reconciled,true);
  assert.ok(report.entries.length>0);
  for(const code of ['settings-missing','opening-missing','cash-account-missing','assignment-unreviewed','foreign-receipt-unconfirmed','foreign-claim-unconfirmed'])assert.ok(codes.includes(code),`missing readiness blocker: ${code}`);
  assert.equal(codes.filter(x=>x==='foreign-receipt-unconfirmed').length,2);
  assert.equal(codes.filter(x=>x==='foreign-claim-unconfirmed').length,1);
  assert.equal(JSON.stringify(source),before);
});
