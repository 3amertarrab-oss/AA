const test=require('node:test'),assert=require('node:assert/strict'),R=require('../src/finance-core.js'),L=require('../src/lifecycle-core.js');
function fixture(){return R.normalize({projects:[{code:'P',name:'Project',client:'C',contract:1000}],assignments:[{id:'A',code:'P',designer:'D',fee:200}],payments:[]})}
const opts={kind:'project',code:'P',name:'D',reason:'Correction',id:'T',at:'2026-10-25T00:00:00Z'};
test('unused project and its assignments are deleted together and restored exactly',()=>{const d=fixture(),n=L.remove(d,opts);assert.equal(n.archived,false);assert.equal(n.data.projects.length,0);assert.equal(n.data.assignments.length,0);assert.equal(d.projects.length,1);const restored=L.restore(n.data,'T');assert.deepEqual(restored,d)});
test('project with receipts is archived without changing any amount or link',()=>{const d=fixture();d.clientReceipts=[{id:'R',code:'P',client:'C',date:'2026-10-25',amount:300}];const n=L.remove(d,opts);assert.equal(n.archived,true);assert.equal(n.data.projects.length,1);assert.deepEqual(n.data.clientReceipts,d.clientReceipts);assert.equal(n.data.projects[0].contract,1000)});
test('project referenced by draft claim is protected',()=>{const d=fixture();d.claims=[{id:'C',code:'P',date:'2026-10-25',status:'مسودة',total:100,items:[{desc:'x',amount:100}]}];assert.equal(L.remove(d,opts).archived,true)});
test('designer payment and its evidence survive designer archive',()=>{const d=fixture();d.payments=[{id:'X',code:'P',designer:'D',date:'2026-10-25',amount:50}];d.paymentAttachments={X:{data:'data:image/png;base64,AAAA',name:'proof.png'}};const n=L.remove(d,{...opts,kind:'designer'});assert.equal(n.archived,true);assert.equal(n.data.archivedDesigners[0].name,'D');assert.deepEqual(n.data.payments,d.payments);assert.deepEqual(n.data.paymentAttachments,d.paymentAttachments)});
test('deleted payment also protects project and assignment for future restoration',()=>{const d=fixture();d.deletedPayments=[{payment:{id:'X',code:'P',designer:'D',date:'2026-10-25',amount:50},deletedAt:opts.at,reason:'test'}];assert.equal(L.remove(d,opts).archived,true);assert.equal(L.remove(d,{...opts,kind:'assignment'}).archived,true)});
test('unpaid assignment can be removed and restored without touching project',()=>{const d=fixture(),n=L.remove(d,{...opts,kind:'assignment'});assert.equal(n.data.assignments.length,0);assert.deepEqual(n.data.projects,d.projects);assert.deepEqual(L.restore(n.data,'T'),d)});
test('unpaid designer removes all its assignments and supports restoration',()=>{const d=fixture();d.projects.push({code:'Q',name:'Q',client:'C',contract:200});d.assignments.push({id:'B',code:'Q',designer:'D',fee:30});const n=L.remove(d,{...opts,kind:'designer'});assert.equal(n.data.assignments.length,0);assert.deepEqual(L.restore(n.data,'T'),d)});
test('restoration refuses reused project codes and duplicate assignment',()=>{let n=L.remove(fixture(),opts).data;n.projects.push({code:'P',name:'New',client:'C',contract:0});assert.throws(()=>L.restore(n,'T'),/مستخدم/);n=L.remove(fixture(),{...opts,kind:'assignment'}).data;n.assignments.push({id:'B',code:'P',designer:'D',fee:20});assert.throws(()=>L.restore(n,'T'),/تكراره/)});
test('restoring an assignment requires restoring its project first',()=>{let n=L.remove(fixture(),{...opts,kind:'assignment'}).data;n=L.remove(n,{...opts,id:'T2'}).data;assert.throws(()=>L.restore(n,'T'),/المشروع المرتبط/);n=L.restore(n,'T2');assert.equal(L.restore(n,'T').assignments.length,1)});
test('restore is once only and delete requires a reason',()=>{const n=L.restore(L.remove(fixture(),opts).data,'T');assert.throws(()=>L.restore(n,'T'));assert.throws(()=>L.remove(fixture(),{...opts,reason:''}))});

function claimReceiptFixture(){
 const d=fixture();d.customers=[{id:'CU',name:'C',phone:'',email:'',note:''}];
 d.claims=[{id:'CL1',client:'C',code:'P',projectRows:[{code:'P',amount:300}],date:'2026-10-20',status:'معتمدة',total:300,items:[{desc:'Project',amount:300}]}];
 d.clientReceipts=[
  {id:'R1',batchId:'B1',code:'P',client:'C',date:'2026-10-21',amount:200,method:'تحويل',ref:'BANK'},
  {id:'R2',batchId:'B1',code:'',client:'C',date:'2026-10-21',amount:50,method:'تحويل',ref:'BANK'}
 ];
 d.claimSettlements=[{claimId:'CL1',receiptId:'R1',code:'P',amount:200,mode:'manual',at:opts.at}];
 d.receiptAttachments.B1={name:'proof.png',data:'data:image/png;base64,AAAA'};
 d.documentNumbers=[{kind:'claim',id:'CL1',number:1},{kind:'receipt',id:'B1',number:1}];
 return R.validate(d)
}
test('claim deletion releases matching but keeps cash and restores exact links',()=>{
 const d=claimReceiptFixture(),docs=R.copy(d.documentNumbers),out=L.remove(d,{...opts,kind:'claim',targetId:'CL1'});
 assert.equal(out.data.claims.length,0);assert.equal(out.data.claimSettlements.length,0);assert.equal(out.data.clientReceipts.length,2);assert.deepEqual(out.data.documentNumbers,docs);
 const restored=L.restore(out.data,'T');assert.deepEqual(restored.claims,d.claims);assert.deepEqual(restored.claimSettlements,d.claimSettlements);assert.deepEqual(restored.documentNumbers,docs)
});
test('receipt batch deletion removes every distribution match and proof then restores them',()=>{
 const d=claimReceiptFixture(),out=L.remove(d,{...opts,kind:'receipt',targetId:'B1'});
 assert.equal(out.data.clientReceipts.length,0);assert.equal(out.data.claimSettlements.length,0);assert.equal(out.data.receiptAttachments.B1,undefined);assert.equal(out.data.claims.length,1);
 const restored=L.restore(out.data,'T');assert.deepEqual(restored.clientReceipts,d.clientReceipts);assert.deepEqual(restored.claimSettlements,d.claimSettlements);assert.deepEqual(restored.receiptAttachments,d.receiptAttachments);assert.deepEqual(restored.documentNumbers,d.documentNumbers)
});
function advanceFixture(){
 const d=fixture();d.customers=[{id:'CU',name:'C',phone:'',email:'',note:''}];
 d.claims=[{id:'CL1',client:'C',code:'P',projectRows:[{code:'P',amount:200}],date:'2026-10-20',status:'معتمدة',total:200,items:[{desc:'Project',amount:200}]}];
 d.advances=[{id:'ADV1',client:'C',date:'2026-10-18',total:500,allocated:200,ref:'ADV',allocations:[{code:'P',amount:200,date:'2026-10-21'}]}];
 d.clientReceipts=[{id:'AR1',batchId:'AB1',code:'P',client:'C',date:'2026-10-21',amount:200,method:'تسوية مقدمة سابقة',ref:'ADV',sourceAdvanceId:'ADV1'}];
 d.claimSettlements=[{claimId:'CL1',receiptId:'AR1',code:'P',amount:200,mode:'manual',at:opts.at}];
 d.receiptAttachments.ADV1={name:'advance.pdf',data:'data:application/pdf;base64,AAAA'};
 d.documentNumbers=[{kind:'advance',id:'ADV1',number:1}];return R.validate(d)
}
test('advance bundle deletion and restoration are atomic with allocations proof and matching',()=>{
 const d=advanceFixture(),out=L.remove(d,{...opts,kind:'advance',targetId:'ADV1'});
 assert.equal(out.data.advances.length,0);assert.equal(out.data.clientReceipts.length,0);assert.equal(out.data.claimSettlements.length,0);assert.equal(out.data.receiptAttachments.ADV1,undefined);
 const restored=L.restore(out.data,'T');assert.deepEqual(restored.advances,d.advances);assert.deepEqual(restored.clientReceipts,d.clientReceipts);assert.deepEqual(restored.claimSettlements,d.claimSettlements);assert.deepEqual(restored.receiptAttachments,d.receiptAttachments);assert.deepEqual(restored.documentNumbers,d.documentNumbers)
});
test('deleting an advance distribution batch refunds available balance and restores exact advance',()=>{
 const d=advanceFixture(),out=L.remove(d,{...opts,kind:'receipt',targetId:'AB1'});
 assert.equal(out.data.advances[0].allocated,0);assert.deepEqual(out.data.advances[0].allocations,[]);
 const restored=L.restore(out.data,'T');assert.deepEqual(restored.advances,d.advances);assert.deepEqual(restored.clientReceipts,d.clientReceipts);assert.deepEqual(restored.claimSettlements,d.claimSettlements)
});
test('expense deletion updates active costs records an audit event and restores the record',()=>{
 const d=fixture();d.projectExpenses=[{id:'E1',code:'P',date:'2026-10-20',category:'نقل',amount:75,ref:'X'}];
 const out=L.remove(d,{...opts,kind:'expense',targetId:'E1'});assert.equal(out.data.projectExpenses.length,0);assert.equal(out.data.costAudit.at(-1).action,'delete expense');
 const restored=L.restore(out.data,'T');assert.deepEqual(restored.projectExpenses,d.projectExpenses);assert.equal(restored.costAudit.at(-1).action,'restore expense')
});
test('opening balance deletion is reversible and refuses collision on restore',()=>{
 const d=fixture();d.openingBalances=[{client:'C',date:'2026-10-01',amount:125,note:'old'}];const out=L.remove(d,{...opts,kind:'opening',targetId:'C'});
 assert.equal(out.data.openingBalances.length,0);const collision=R.copy(out.data);collision.openingBalances.push({client:'C',date:'2026-10-02',amount:1});assert.throws(()=>L.restore(collision,'T'),/حالي/);
 assert.deepEqual(L.restore(out.data,'T').openingBalances,d.openingBalances)
});
test('standalone customer moves to trash while referenced customer is archived',()=>{
 const d=fixture();d.customers=[{id:'CU1',name:'C',phone:'',email:'',note:''},{id:'CU2',name:'Loose',phone:'1',email:'',note:''}];
 const removed=L.remove(d,{...opts,kind:'customer',targetId:'CU2'});assert.equal(removed.archived,false);assert.equal(removed.data.customers.some(c=>c.id==='CU2'),false);assert.equal(L.restore(removed.data,'T').customers.some(c=>c.id==='CU2'),true);
 const archived=L.remove(d,{...opts,kind:'customer',targetId:'CU1'});assert.equal(archived.archived,true);assert.equal(archived.data.customers.find(c=>c.id==='CU1').archiveReason,opts.reason);assert.deepEqual(archived.data.projects,d.projects)
});
test('project photo deletion preserves bytes order and cover state for restore',()=>{
 const d=fixture();d.projects[0].photos=[{id:'PH1',src:'data:image/png;base64,AAAA',name:'one.png'},{id:'PH2',src:'data:image/png;base64,BBBB',name:'two.png'}];d.projects[0].coverId='PH1';
 const out=L.remove(d,{...opts,kind:'photo',code:'P',targetId:'PH1'});assert.deepEqual(out.data.projects[0].photos.map(x=>x.id),['PH2']);assert.equal(out.data.projects[0].coverId,'PH2');
 const restored=L.restore(out.data,'T');assert.deepEqual(restored.projects[0].photos,d.projects[0].photos);assert.equal(restored.projects[0].coverId,'PH1')
});
test('restore keeps original ordering for claims receipts projects and assignments',()=>{
 const d=claimReceiptFixture();d.claims.unshift({id:'CL0',client:'C',code:'P',projectRows:[{code:'P',amount:10}],date:'2026-10-19',status:'مسودة',total:10,items:[{desc:'Old',amount:10}]});
 d.claims.push({id:'CL2',client:'C',code:'P',projectRows:[{code:'P',amount:20}],date:'2026-10-22',status:'مسودة',total:20,items:[{desc:'New',amount:20}]});
 d.clientReceipts.unshift({id:'R0',batchId:'B0',code:'P',client:'C',date:'2026-10-18',amount:5,method:'نقدي'});d.clientReceipts.push({id:'R3',batchId:'B2',code:'P',client:'C',date:'2026-10-23',amount:6,method:'نقدي'});R.validate(d);
 let out=L.remove(d,{...opts,kind:'claim',targetId:'CL1'});let restored=L.restore(out.data,'T');assert.deepEqual(restored.claims,d.claims);assert.deepEqual(restored.claimSettlements,d.claimSettlements);
 out=L.remove(d,{...opts,kind:'receipt',targetId:'B1'});restored=L.restore(out.data,'T');assert.deepEqual(restored.clientReceipts,d.clientReceipts);assert.deepEqual(restored.claimSettlements,d.claimSettlements);
 const clean=R.normalize({projects:[{code:'A',name:'A',client:'C',contract:1},{code:'P',name:'Project',client:'C',contract:1000},{code:'Z',name:'Z',client:'C',contract:1}],assignments:[{id:'A0',code:'A',designer:'D0',fee:1},{id:'A1',code:'P',designer:'D1',fee:2},{id:'A2',code:'P',designer:'D2',fee:3},{id:'A3',code:'Z',designer:'D3',fee:1}],payments:[]});
 out=L.remove(clean,opts);restored=L.restore(out.data,'T');assert.deepEqual(restored.projects,clean.projects);assert.deepEqual(restored.assignments,clean.assignments)
});
test('archived project with only an already deleted payment moves to trash and restores exactly',()=>{
 let d=fixture();d.projects[0].archivedAt=opts.at;d.projects[0].archiveReason='duplicate';d.assignments[0].archivedAt=opts.at;d.assignments[0].archiveReason='duplicate';
 d.deletedPayments=[{payment:{id:'DP',code:'P',designer:'D',date:'2026-10-20',amount:50},deletedAt:opts.at,reason:'wrong payment'}];d.paymentAttachments.DP={name:'proof.png',data:'data:image/png;base64,AAAA'};d=R.validate(d);const before=R.copy(d);
 const out=L.remove(d,{...opts,fromArchive:true});assert.equal(out.archived,false);assert.equal(out.data.projects.length,0);assert.equal(out.data.assignments.length,0);assert.equal(out.data.deletedPayments.length,0);assert.equal(out.data.paymentAttachments.DP,undefined);
 const restored=L.restore(out.data,'T');assert.deepEqual(restored,before)
});
test('archived project with live accounting links refuses deletion without changing data',()=>{
 let d=fixture();d.projects[0].archivedAt=opts.at;d.projects[0].archiveReason='old';d.clientReceipts=[{id:'R',batchId:'B',code:'P',client:'C',date:'2026-10-20',amount:10}];d=R.validate(d);const before=R.copy(d);
 assert.throws(()=>L.remove(d,{...opts,fromArchive:true}),/سندات قبض عميل/);assert.deepEqual(d,before);assert.deepEqual(L.archiveBlockers(d,{kind:'project',code:'P'}),[{label:'سندات قبض عميل',count:1}])
});
test('archived assignment bundles its deleted payment while a paid assignment stays protected',()=>{
 let d=fixture();d.assignments[0].archivedAt=opts.at;d.assignments[0].archiveReason='duplicate';d.deletedPayments=[{payment:{id:'DP',code:'P',designer:'D',date:'2026-10-20',amount:50},deletedAt:opts.at,reason:'wrong'}];d=R.validate(d);const before=R.copy(d);
 let out=L.remove(d,{...opts,kind:'assignment',fromArchive:true});assert.equal(out.data.projects.length,1);assert.equal(out.data.assignments.length,0);assert.equal(out.data.deletedPayments.length,0);assert.deepEqual(L.restore(out.data,'T'),before);
 d=R.copy(before);d.payments=[{id:'LIVE',code:'P',designer:'D',date:'2026-10-21',amount:25}];d=R.validate(d);assert.throws(()=>L.remove(d,{...opts,kind:'assignment',fromArchive:true}),/دفعات مصمم نشطة/)
});
test('archived designer marker is included in delete and restore',()=>{
 let d=fixture();d.archivedDesigners=[{name:'D',at:opts.at,reason:'inactive'}];d=R.validate(d);const before=R.copy(d),out=L.remove(d,{...opts,kind:'designer',fromArchive:true});
 assert.equal(out.data.assignments.length,0);assert.equal(out.data.archivedDesigners.length,0);assert.deepEqual(L.restore(out.data,'T'),before)
});
