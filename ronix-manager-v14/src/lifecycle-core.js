/* Reversible deletion for operational records; document numbers and audit history stay reserved. */
const R17Life=((R)=>{
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 function payments(d,code,name){return [...d.payments,...d.deletedPayments.map(x=>x.payment)].filter(p=>(!code||p.code===code)&&(!name||p.designer===name))}
 function projectLocked(d,code){return payments(d,code).length>0||d.clientReceipts.some(r=>r.code===code)||d.claims.some(c=>R.claimRows(c).some(r=>r.code===code))||d.projectExpenses.some(x=>x.code===code)||d.advances.some(a=>(a.allocations||[]).some(x=>x.code===code))}
 function entry({id,kind,reason,at}){return{id,kind,reason:String(reason||'').trim(),at,projects:[],assignments:[]}}
 function target(o){return o.targetId||o.code||o.name}
 function attachmentTake(d,key){const present=own(d.receiptAttachments,key),attachment=present?R.copy(d.receiptAttachments[key]):null;if(present)delete d.receiptAttachments[key];return{attachmentPresent:present,attachment}}
 function attachmentRestore(d,key,p){if(!p.attachmentPresent)return;if(own(d.receiptAttachments,key))throw Error('يوجد مستند آخر بالمفتاح نفسه؛ لا يمكن الاستعادة');d.receiptAttachments[key]=R.copy(p.attachment)}
 function rebuildAdvance(d,id){
  const a=d.advances.find(a=>a.id===id);if(!a)throw Error('المقدمة المرتبطة غير موجودة');
  const rows=d.clientReceipts.filter(r=>r.sourceAdvanceId===id);
  a.allocated=R.sum(rows);a.allocations=rows.map(r=>({code:r.code,amount:r.amount,date:r.date,batchId:r.batchId||r.id}));return a;
 }
 function ensureProjects(d,codes){for(const code of new Set(codes.filter(Boolean)))if(!d.projects.some(p=>p.code===code))throw Error('استعد المشروع المرتبط أولًا: '+code)}
 function customerLinked(d,name){name=R.normName(name);return d.projects.some(x=>R.normName(x.client)===name)||d.claims.some(x=>R.claimClient(d,x)===name)||d.clientReceipts.some(x=>R.receiptClient(d,x)===name)||d.advances.some(x=>R.normName(x.client)===name)||d.openingBalances.some(x=>R.normName(x.client)===name)}
 function remove(value,options){
  const d=R.normalize(value),{kind,code,name,reason,id,at}=options,targetId=target(options);if(!String(reason||'').trim())throw Error('اكتب سبب الحذف');
  const x=entry({id,kind,reason,at});
  if(kind==='project'){
   const p=d.projects.find(p=>p.code===code);if(!p)throw Error('المشروع غير موجود');
   if(projectLocked(d,code)){p.archivedAt=at;p.archiveReason=x.reason;return {data:R.validate(d),archived:true}}
   x.projects=[p];x.assignments=d.assignments.filter(a=>a.code===code);
   d.projects=d.projects.filter(p=>p.code!==code);d.assignments=d.assignments.filter(a=>a.code!==code);
  }else if(kind==='assignment'){
   const a=d.assignments.find(a=>a.code===code&&a.designer===name);if(!a)throw Error('التكليف غير موجود');
   if(payments(d,code,name).length){a.archivedAt=at;a.archiveReason=x.reason;return {data:R.validate(d),archived:true}}
   x.assignments=[a];d.assignments=d.assignments.filter(b=>b!==a);
  }else if(kind==='designer'){
   const as=d.assignments.filter(a=>a.designer===name);if(!as.length)throw Error('المصمم غير موجود');
   if(payments(d,'',name).length){d.archivedDesigners=d.archivedDesigners.filter(y=>y.name!==name);d.archivedDesigners.push({name,at,reason:x.reason});return {data:R.validate(d),archived:true}}
   x.assignments=as;d.assignments=d.assignments.filter(a=>a.designer!==name);
  }else if(kind==='claim'){
   const record=d.claims.find(c=>c.id===targetId);if(!record)throw Error('المطالبة غير موجودة');
   const settlements=d.claimSettlements.filter(s=>s.claimId===record.id);x.payload={record,settlements};
   d.claims=d.claims.filter(c=>c!==record);d.claimSettlements=d.claimSettlements.filter(s=>s.claimId!==record.id);
  }else if(kind==='receipt'){
   const records=d.clientReceipts.filter(r=>(r.batchId||r.id)===targetId);if(!records.length)throw Error('سند القبض غير موجود');
   const rowIds=new Set(records.map(r=>r.id)),settlements=d.claimSettlements.filter(s=>rowIds.has(s.receiptId));
   const sourceIds=[...new Set(records.map(r=>r.sourceAdvanceId).filter(Boolean))],sourceAdvances=[];
   const proof=attachmentTake(d,targetId);x.payload={batchId:targetId,records,settlements,sourceAdvances,...proof};
   d.clientReceipts=d.clientReceipts.filter(r=>!rowIds.has(r.id));d.claimSettlements=d.claimSettlements.filter(s=>!rowIds.has(s.receiptId));
   for(const advanceId of sourceIds){const found=d.advances.find(a=>a.id===advanceId);if(!found)throw Error('المقدمة المرتبطة غير موجودة');const before=R.copy(found),after=R.copy(rebuildAdvance(d,advanceId));sourceAdvances.push({before,after})}
  }else if(kind==='advance'){
   const record=d.advances.find(a=>a.id===targetId);if(!record)throw Error('المقدمة غير موجودة');
   const receipts=d.clientReceipts.filter(r=>r.sourceAdvanceId===record.id),rowIds=new Set(receipts.map(r=>r.id)),settlements=d.claimSettlements.filter(s=>rowIds.has(s.receiptId));
   const proof=attachmentTake(d,record.id);x.payload={record,receipts,settlements,...proof};
   d.advances=d.advances.filter(a=>a!==record);d.clientReceipts=d.clientReceipts.filter(r=>!rowIds.has(r.id));d.claimSettlements=d.claimSettlements.filter(s=>!rowIds.has(s.receiptId));
  }else if(kind==='expense'){
   const record=d.projectExpenses.find(e=>e.id===targetId);if(!record)throw Error('المصروف غير موجود');x.payload={record};
   d.projectExpenses=d.projectExpenses.filter(e=>e!==record);d.costAudit.push({at,action:'delete expense',before:record,reason:x.reason});
  }else if(kind==='opening'){
   const record=d.openingBalances.find(o=>R.normName(o.client)===R.normName(targetId||name));if(!record)throw Error('الرصيد الافتتاحي غير موجود');x.payload={record};d.openingBalances=d.openingBalances.filter(o=>o!==record);
  }else if(kind==='customer'){
   const record=d.customers.find(c=>c.id===targetId);if(!record)throw Error('العميل غير موجود');
   if(customerLinked(d,record.name)){record.archivedAt=at;record.archiveReason=x.reason;return {data:R.validate(d),archived:true}}
   x.payload={record};d.customers=d.customers.filter(c=>c!==record);
  }else if(kind==='photo'){
   const p=d.projects.find(p=>p.code===code),photos=p?.photos||[],index=photos.findIndex(photo=>photo.id===targetId);if(!p||index<0)throw Error('صورة المشروع غير موجودة');
   const record=photos[index];x.payload={record,index,projectCode:p.code,wasCover:p.coverId===record.id};photos.splice(index,1);if(p.coverId===record.id)p.coverId=photos[0]?.id||'';
  }else throw Error('نوع حذف غير معروف');
  d.trashRecords.push(x);return {data:R.validate(d),archived:false,trashId:x.id};
 }
 function restore(value,id){
  const d=R.normalize(value),x=d.trashRecords.find(x=>x.id===id);if(!x)throw Error('السجل غير موجود في المحذوفات');
  if(x.projects.some(p=>d.projects.some(a=>a.code===p.code)))throw Error('كود المشروع مستخدم؛ غيّر الكود الحالي قبل الاستعادة');
  const codes=new Set([...d.projects,...x.projects].map(p=>p.code));
  for(const a of x.assignments){if(!codes.has(a.code))throw Error('استعد المشروع المرتبط أولًا');if(d.assignments.some(b=>b.code===a.code&&R.normName(b.designer)===R.normName(a.designer)))throw Error('التكليف موجود؛ لا يمكن تكراره')}
  d.projects.push(...x.projects);d.assignments.push(...x.assignments);
  const p=x.payload||{};
  if(x.kind==='claim'){
   if(d.claims.some(c=>c.id===p.record.id))throw Error('المطالبة موجودة بالفعل');ensureProjects(d,R.claimRows(p.record).map(r=>r.code));d.claims.push(p.record);d.claimSettlements.push(...p.settlements);
  }else if(x.kind==='receipt'){
   const ids=new Set(p.records.map(r=>r.id));if(d.clientReceipts.some(r=>ids.has(r.id)||(r.batchId||r.id)===p.batchId))throw Error('سند القبض موجود بالفعل');ensureProjects(d,p.records.map(r=>r.code));
   for(const pair of p.sourceAdvances||[]){const current=d.advances.find(a=>a.id===pair.before.id);if(!current)throw Error('استعد المقدمة المرتبطة أولًا');if(JSON.stringify(current)!==JSON.stringify(pair.after))throw Error('تغيرت المقدمة المرتبطة؛ راجع توزيعاتها قبل الاستعادة')}
   d.clientReceipts.push(...p.records);d.claimSettlements.push(...p.settlements);for(const pair of p.sourceAdvances||[])d.advances[d.advances.findIndex(a=>a.id===pair.before.id)]=pair.before;attachmentRestore(d,p.batchId,p);
  }else if(x.kind==='advance'){
   if(d.advances.some(a=>a.id===p.record.id))throw Error('المقدمة موجودة بالفعل');const ids=new Set(p.receipts.map(r=>r.id)),batches=new Set(p.receipts.map(r=>r.batchId||r.id));if(d.clientReceipts.some(r=>ids.has(r.id)||batches.has(r.batchId||r.id)))throw Error('أحد توزيعات المقدمة موجود بالفعل');ensureProjects(d,p.receipts.map(r=>r.code));
   d.advances.push(p.record);d.clientReceipts.push(...p.receipts);d.claimSettlements.push(...p.settlements);attachmentRestore(d,p.record.id,p);
  }else if(x.kind==='expense'){
   if(d.projectExpenses.some(e=>e.id===p.record.id))throw Error('المصروف موجود بالفعل');ensureProjects(d,[p.record.code]);d.projectExpenses.push(p.record);d.costAudit.push({at:new Date().toISOString(),action:'restore expense',after:p.record,reason:x.reason});
  }else if(x.kind==='opening'){
   if(d.openingBalances.some(o=>R.normName(o.client)===R.normName(p.record.client)))throw Error('يوجد رصيد افتتاحي حالي للعميل');d.openingBalances.push(p.record);
  }else if(x.kind==='customer'){
   if(d.customers.some(c=>c.id===p.record.id||R.normName(c.name)===R.normName(p.record.name)))throw Error('العميل موجود بالفعل');d.customers.push(p.record);
  }else if(x.kind==='photo'){
   const project=d.projects.find(project=>project.code===p.projectCode);if(!project)throw Error('استعد المشروع المرتبط أولًا');project.photos=project.photos||[];if(project.photos.some(photo=>photo.id===p.record.id))throw Error('الصورة موجودة بالفعل');project.photos.splice(Math.min(p.index,project.photos.length),0,p.record);if(p.wasCover)project.coverId=p.record.id;
  }
  d.trashRecords=d.trashRecords.filter(a=>a.id!==id);return R.validate(d);
 }
 return {payments,projectLocked,customerLinked,rebuildAdvance,remove,restore};
})(typeof module!=='undefined'?require('./finance-core.js'):R14);
if(typeof module!=='undefined')module.exports=R17Life;
