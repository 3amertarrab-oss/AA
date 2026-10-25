/* Reversible deletion for unused records; financial history is archived intact. */
const R17Life=((R)=>{
 function payments(d,code,name){return [...d.payments,...d.deletedPayments.map(x=>x.payment)].filter(p=>(!code||p.code===code)&&(!name||p.designer===name))}
 function projectLocked(d,code){return payments(d,code).length>0||d.clientReceipts.some(r=>r.code===code)||d.claims.some(c=>R.claimRows(c).some(r=>r.code===code))||d.projectExpenses.some(x=>x.code===code)||d.advances.some(a=>(a.allocations||[]).some(x=>x.code===code))}
 function remove(value,{kind,code,name,reason,id,at}){
  const d=R.normalize(value);if(!String(reason||'').trim())throw Error('اكتب سبب الحذف');
  const entry={id,kind,reason,at,projects:[],assignments:[]};
  if(kind==='project'){
   const p=d.projects.find(p=>p.code===code);if(!p)throw Error('المشروع غير موجود');
   if(projectLocked(d,code)){p.archivedAt=at;p.archiveReason=reason;return {data:R.validate(d),archived:true}}
   entry.projects=[p];entry.assignments=d.assignments.filter(a=>a.code===code);
   d.projects=d.projects.filter(p=>p.code!==code);d.assignments=d.assignments.filter(a=>a.code!==code);
  }else if(kind==='assignment'){
   const a=d.assignments.find(a=>a.code===code&&a.designer===name);if(!a)throw Error('التكليف غير موجود');
   if(payments(d,code,name).length){a.archivedAt=at;a.archiveReason=reason;return {data:R.validate(d),archived:true}}
   entry.assignments=[a];d.assignments=d.assignments.filter(x=>x!==a);
  }else if(kind==='designer'){
   const as=d.assignments.filter(a=>a.designer===name);if(!as.length)throw Error('المصمم غير موجود');
   if(payments(d,'',name).length){d.archivedDesigners=d.archivedDesigners.filter(x=>x.name!==name);d.archivedDesigners.push({name,at,reason});return {data:R.validate(d),archived:true}}
   entry.assignments=as;d.assignments=d.assignments.filter(a=>a.designer!==name);
  }else throw Error('نوع حذف غير معروف');
  d.trashRecords.push(entry);return {data:R.validate(d),archived:false};
 }
 function restore(value,id){
  const d=R.normalize(value),x=d.trashRecords.find(x=>x.id===id);if(!x)throw Error('السجل غير موجود في المحذوفات');
  if(x.projects.some(p=>d.projects.some(a=>a.code===p.code)))throw Error('كود المشروع مستخدم؛ غيّر الكود الحالي قبل الاستعادة');
  const codes=new Set([...d.projects,...x.projects].map(p=>p.code));
  for(const a of x.assignments){if(!codes.has(a.code))throw Error('استعد المشروع المرتبط أولًا');if(d.assignments.some(b=>b.code===a.code&&R.normName(b.designer)===R.normName(a.designer)))throw Error('التكليف موجود؛ لا يمكن تكراره')}
  d.projects.push(...x.projects);d.assignments.push(...x.assignments);d.trashRecords=d.trashRecords.filter(a=>a.id!==id);return R.validate(d);
 }
 return {payments,projectLocked,remove,restore};
})(typeof module!=='undefined'?require('./finance-core.js'):R14);
if(typeof module!=='undefined')module.exports=R17Life;
