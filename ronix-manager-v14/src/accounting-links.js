/* One source for linked balances. No storage, DOM, network, or floating-point sums. */
const R16 = ((R) => {
  const balance = (a, b) => R.delta(a, b);
  const positive = v => Math.max(0, v);
  function designer(d, code='', name='') {
    const assignments=d.assignments.filter(a=>(!code||a.code===code)&&(!name||a.designer===name));
    const rows=assignments.map(a=>{
      const paid=R.sum(d.payments.filter(p=>p.code===a.code&&p.designer===a.designer));
      const net=balance(a.fee,paid);
      return {code:a.code,designer:a.designer,fee:R.cents(a.fee)/100,paid,net,due:positive(net),credit:positive(-net)};
    });
    return {rows,fees:R.sum(rows,'fee'),paid:R.sum(rows,'paid'),due:R.sum(rows,'due'),credit:R.sum(rows,'credit'),net:R.sum(rows,'net')};
  }
  function project(d, code) {
    const p=d.projects.find(p=>p.code===code);if(!p)throw Error('المشروع غير موجود');
    const receipts=d.clientReceipts.filter(r=>r.code===code),ds=designer(d,code);
    const contract=R.cents(p.contract||0)/100,received=R.sum(receipts),cash=R.sum(receipts,R.cashReceipt);
    const claims=R.sum(d.claims.filter(R.active),c=>R.claimAmount(c,code));
    const matched=R.sum(d.claimSettlements.filter(s=>s.code===code));
    const expenses=R.sum(d.projectExpenses.filter(x=>x.code===code));
    return {code,contract,received,cash,fx:balance(cash,received),contractBalance:balance(contract,received),
      claims,matched,claimDue:balance(claims,matched),unmatched:balance(received,matched),
      designers:ds,expenses,cost:R.sum([{amount:ds.fees},{amount:expenses}]),
      profit:balance(contract,R.sum([{amount:ds.fees},{amount:expenses}])),
      operatingCash:balance(balance(cash,ds.paid),expenses)};
  }
  function client(d,name) {
    const t=R.totals(d,name),cs=d.claims.filter(c=>R.active(c)&&R.claimClient(d,c)===name);
    const matched=R.sum(cs,c=>R.settled(d,c.id)),fx=R.fxDifference(d,'',name);
    return {...t,matched,claimDue:balance(t.claims,matched),unmatched:balance(t.receipts,matched),fx,
      contractBalance:balance(t.contracts,t.receipts),netBalance:balance(balance(t.contracts,t.receipts),t.unallocated),
      cashDifference:balance(t.cash,R.sum([{amount:t.receipts},{amount:t.unallocated},{amount:fx}]))};
  }
  function reconcile(value,at=new Date().toISOString()) {
    const d=R.normalize(value),previous=d.claimSettlements;
    // Manual choices are authoritative; invalid manual links must be corrected explicitly.
    for(const c of d.claims)if(c.matchMode==null&&previous.some(s=>s.claimId===c.id&&s.mode!=='auto'))c.matchMode='manual';
    d.claimSettlements=previous.filter(s=>s.mode!=='auto');R.validate(d);
    const changes=[];
    const valid=(c,r,code)=>c&&r&&R.active(c)&&c.matchMode!=='manual'&&r.code===code&&
      R.claimRows(c).some(x=>x.code===code)&&R.claimClient(d,c)===R.receiptClient(d,r);
    const available=(c,r)=>Math.max(0,Math.min(R.cents(R.delta(r.amount,R.usedReceipt(d,r.id))),R.cents(R.delta(R.claimAmount(c,r.code),R.settled(d,c.id,r.code)))));
    function add(c,r,n,old){
      if(!n)return;
      d.claimSettlements.push({...old,claimId:c.id,receiptId:r.id,code:r.code,amount:n/100,mode:'auto',at:old?.at||at});
    }
    // Keep established links first, clipping only automatic links after a corrected amount.
    for(const s of previous.filter(s=>s.mode==='auto')){
      const c=d.claims.find(c=>c.id===s.claimId),r=d.clientReceipts.find(r=>r.id===s.receiptId);
      if(valid(c,r,s.code))add(c,r,Math.min(R.cents(s.amount),available(c,r)),s);
    }
    for(const r of [...d.clientReceipts].sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.id).localeCompare(String(b.id)))){
      if(!r.code||R.cents(r.amount)<=R.cents(R.usedReceipt(d,r.id)))continue;
      const candidates=d.claims.filter(c=>valid(c,r,r.code)&&R.cents(R.claimAmount(c,r.code))>R.cents(R.settled(d,c.id,r.code)));
      if(candidates.length!==1)continue;
      const c=candidates[0],n=available(c,r),existing=d.claimSettlements.find(s=>s.mode==='auto'&&s.claimId===c.id&&s.receiptId===r.id);
      if(existing)existing.amount=R.sum([{amount:existing.amount},{amount:n/100}]);else add(c,r,n);
    }
    const key=s=>JSON.stringify([s.claimId,s.receiptId,s.code,s.amount,s.mode||'manual']);
    const before=previous.map(key).sort(),after=d.claimSettlements.map(key).sort();
    if(JSON.stringify(before)!==JSON.stringify(after))changes.push({action:'تحديث ربط التحصيل بالمطالبات',at,before:previous,after:R.copy(d.claimSettlements)});
    return {data:R.validate(d),changes};
  }
  function review(d) {
    const notes=[];
    for(const p of d.projects){
      if(!R.normName(p.name))notes.push({type:'project-name',code:p.code,text:'اسم المشروع غير مسجل'});
      if(!R.normName(p.client))notes.push({type:'project-client',code:p.code,text:'عميل المشروع غير مسجل'});
      for(const photo of p.photos||[])if(!photo.src.startsWith('data:image/'))notes.push({type:'photo',code:p.code,text:'صورة مرتبطة بملف خارجي وتحتاج تضمينًا في النسخة الاحتياطية'});
      const a=project(d,p.code);
      if(a.unmatched>0)notes.push({type:'unmatched',code:p.code,amount:a.unmatched,text:'قبض مخصص للمشروع لم يُربط بمطالبة؛ قد يكون مقدمة أو يحتاج اختيار المطالبة'});
    }
    for(const a of designer(d).rows)if(a.credit>0)notes.push({type:'designer-credit',code:a.code,designer:a.designer,amount:a.credit,text:'مدفوع للمصمم يزيد على الأتعاب المسجلة؛ رصيد منفصل للمراجعة'});
    return notes;
  }
  return {project,client,designer,reconcile,review};
})(typeof module!=='undefined'?require('./finance-core.js'):R14);
if(typeof module!=='undefined')module.exports=R16;
