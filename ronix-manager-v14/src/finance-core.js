/* RONIX V14. Monetary arithmetic in integer piastres; no network or storage. */
const R14 = (() => {
  const arrays = ['projects','assignments','payments','claims','clientReceipts','advances','openingBalances','projectExpenses','costAudit','claimSettlements','auditTrail','deletedPayments','trashRecords','archivedDesigners','customers','documentNumbers'];
  const copy = v => JSON.parse(JSON.stringify(v));
  const normName = v => String(v || '').trim();
  function cents(v) {
    if (typeof v !== 'number' && typeof v !== 'string') throw Error('قيمة مالية غير صالحة');
    const raw = String(v).trim();
    if (!/^-?\d+(?:\.\d{1,6})?$/.test(raw)) throw Error('قيمة مالية غير صالحة');
    const neg = raw.startsWith('-'), [whole, fraction = ''] = raw.replace(/^-/, '').split('.');
    // Legacy V13 contracts can have three decimals. Preserve their raw value in
    // the record, and round each amount to a piastre for settlement calculations.
    const n = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0,2)) + (Number(fraction[2]||0)>=5?1:0);
    if (!Number.isSafeInteger(n) || n > 1e13) throw Error('المبلغ يتجاوز الحد المدعوم');
    return neg ? -n : n;
  }
  function amount(v){if(!/^-?\d+(?:\.\d{1,2})?$/.test(String(v).trim()))throw Error('أدخل مبلغًا بحد أقصى منزلتين عشريتين');return cents(v)/100}
  function sum(rows, key = 'amount') {
    const n = rows.reduce((total, row) => total + cents(typeof key === 'function' ? key(row) : row[key] ?? 0), 0);
    if (!Number.isSafeInteger(n)) throw Error('إجمالي المبالغ يتجاوز الحد الآمن');
    return n / 100;
  }
  const delta = (a,b) => (cents(a)-cents(b))/100;
  const status = c => ({'صادر':'صادرة','معتمد':'معتمدة','issued':'صادرة','approved':'معتمدة','draft':'مسودة','cancelled':'ملغاة','canceled':'ملغاة'}[String(c.status).toLowerCase()] || c.status);
  const active = c => ['صادرة','معتمدة'].includes(status(c));
  const claimRows = c => Array.isArray(c.projectRows) && c.projectRows.length ? c.projectRows : [{code:c.code,amount:c.total}];
  const claimAmount = (c,code) => sum(claimRows(c).filter(r=>!code||r.code===code));
  const claimClient = (d,c) => normName(c.client || d.projects.find(p=>p.code===c.code)?.client);
  const receiptClient = (d,r) => normName(r.client || d.projects.find(p=>p.code===r.code)?.client);
  const assignedReceipts = (d,name) => d.clientReceipts.filter(r=>r.code && receiptClient(d,r)===name);
  const looseReceipts = (d,name) => d.clientReceipts.filter(r=>!r.code && receiptClient(d,r)===name);
  function totals(d,name) {
    const projects = d.projects.filter(p=>normName(p.client)===name);
    const rs = d.clientReceipts.filter(r=>receiptClient(d,r)===name);
    const adv = d.advances.filter(a=>normName(a.client)===name);
    const receipts = sum(rs.filter(r=>r.code));
    const unallocated = sum([...looseReceipts(d,name),...adv.map(a=>({amount:delta(a.total,a.allocated||0)}))]);
    const cash = sum([...rs.filter(r=>!r.sourceAdvanceId).map(r=>({amount:cashReceipt(r)})),...adv.map(a=>({amount:a.total}))]);
    return {contracts:sum(projects,'contract'),receipts,unallocated,cash,claims:sum(d.claims.filter(c=>claimClient(d,c)===name&&active(c)),'total')};
  }
  const settled = (d,id,code) => sum(d.claimSettlements.filter(s=>s.claimId===id&&(!code||s.code===code)));
  const usedReceipt = (d,id,exceptClaim) => sum(d.claimSettlements.filter(s=>s.receiptId===id&&s.claimId!==exceptClaim));
  const remaining = (d,c) => delta(c.total,settled(d,c.id));
  // Rates are six-decimal fixed point; ledger values remain EGP piastres.
  function rate(v){const s=String(v).trim();if(!/^\d+(?:\.\d{1,6})?$/.test(s)||Number(s)<=0||Number(s)>1000000)throw Error('سعر الصرف موجب وحتى 6 منازل عشرية');return Number(s)}
  function rateUnits(v){const [a,b='']=String(rate(v)).split('.');return BigInt(a)*1000000n+BigInt(b.padEnd(6,'0'))}
  function fx(v,r=1){const n=BigInt(cents(v))*rateUnits(r),q=n<0n?-((-n+500000n)/1000000n):(n+500000n)/1000000n;const out=Number(q)/100;cents(out);return out}
  function unfx(v,r=1){const n=BigInt(cents(v))*1000000n,d=rateUnits(r),q=n<0n?-((-n+d/2n)/d):(n+d/2n)/d;return Number(q)/100}
  const projectCurrency=p=>p?.contractCurrency??'EGP';
  const projectRate=p=>p?.contractRate??1;
  const originalContract=p=>p?.originalContract??p?.contract??0;
  const projectSubtotal=p=>sum([{amount:originalContract(p)},...(p.contractExtras||[])]);
  function projectTaxAmount(p,t){
    if(!t||!['add','deduct'].includes(t.type)||!['percent','fixed'].includes(t.mode))throw Error('بند ضريبة غير صالح');
    const value=amount(t.value);if(value<0)throw Error('قيمة الضريبة لا تكون سالبة');
    const n=t.mode==='percent'?amount((projectSubtotal(p)*value/100).toFixed(2)):value;
    return t.type==='deduct'?-n:n;
  }
  const projectTaxTotal=p=>sum((p?.taxItems||[]).map(t=>({amount:projectTaxAmount(p,t)})));
  const projectOriginalTotal=p=>sum([{amount:projectSubtotal(p)},{amount:projectTaxTotal(p)}]);
  const projectBookTotal=p=>fx(projectOriginalTotal(p),projectRate(p));
  const assignmentTotal=a=>sum([{amount:a.baseFee??a.fee},...(a.extraWorks||[]),...(a.feeAdjustments||[]).map(r=>({amount:r.type==='discount'?-r.amount:r.amount}))]);
  const cashReceipt=r=>r.cashAmount??r.amount;
  const fxDifference=(d,code,client)=>sum(d.clientReceipts.filter(r=>!r.sourceAdvanceId&&(!code||r.code===code)&&(!client||receiptClient(d,r)===client)),r=>delta(cashReceipt(r),r.amount));
  const receivedOriginal=(d,p)=>sum(d.clientReceipts.filter(r=>r.code===p.code),r=>r.projectAmount??unfx(r.amount,projectRate(p)));
  function foreignReceiptEdit(d,{batchId,client,date,total,currency='EGP',exchangeRate=1,allocations,method,ref,note,id}){
    amount(total);rate(exchangeRate);if(!/^[A-Z]{3}$/.test(currency)||(currency==='EGP'&&Number(exchangeRate)!==1))throw Error('راجع عملة القبض وسعر الصرف');
    if(!dateOK(date)||total<=0)throw Error('راجع مبلغ السند وتاريخه');
    if(new Set(allocations.map(a=>a.code)).size!==allocations.length)throw Error('المشروع مكرر');
    const old=d.clientReceipts.filter(r=>(r.batchId||r.id)===batchId);if(old.some(r=>r.sourceAdvanceId))throw Error('تخصيص المقدمة يعدل من مصدره');
    const history=old.length?[...(old[0].history||[]),{at:new Date().toISOString(),previous:old.map(({history,...r})=>r)}]:[];
    const base={batchId,client,date,method,ref:ref||batchId,note,history,incomingCurrency:currency,receiptRate:Number(exchangeRate),receiptTotal:total};
    const entries=[];
    for(const a of allocations){
      const p=d.projects.find(p=>p.code===a.code);if(!p||normName(p.client)!==client)throw Error('مشروع غير مرتبط بالعميل');
      const native=amount(a.projectAmount),cash=amount(a.receiptOriginal);if(native<0||cash<0||(native===0)!==(cash===0))throw Error('راجع تخصيص العقد والمبلغ المخصص من السند');
      if(!native)continue;
      if(projectCurrency(p)===currency&&cents(native)!==cents(cash))throw Error('عند تطابق العملتين يجب أن يتساوى مبلغ العقد والجزء المخصص من السند');
      entries.push({...base,id:old.find(r=>r.code===a.code)?.id||id(),code:a.code,projectAmount:native,projectCurrency:projectCurrency(p),bookRate:projectRate(p),receiptOriginal:cash,amount:fx(native,projectRate(p)),cashAmount:fx(cash,exchangeRate)});
    }
    const rest=delta(total,sum(entries,'receiptOriginal'));if(rest<0)throw Error('التوزيع أكبر من إجمالي السند');
    if(rest)entries.push({...base,id:old.find(r=>!r.code)?.id||id(),code:'',unallocated:true,receiptOriginal:rest,amount:fx(rest,exchangeRate),cashAmount:fx(rest,exchangeRate)});
    if(!entries.length)throw Error('السند فارغ');
    const last=entries.at(-1),rounding=delta(fx(total,exchangeRate),sum(entries,'cashAmount'));last.cashAmount=sum([{amount:last.cashAmount},{amount:rounding}]);if(!last.code)last.amount=last.cashAmount;
    const next=copy(d);next.clientReceipts=next.clientReceipts.filter(r=>(r.batchId||r.id)!==batchId).concat(entries);
    // Keep established automatic links where possible after an edit. Manual links
    // are never clipped silently; validation rejects a change that would break them.
    const automatic=next.claimSettlements.filter(s=>s.mode==='auto'&&old.some(r=>r.id===s.receiptId));
    next.claimSettlements=next.claimSettlements.filter(s=>!automatic.includes(s));
    for(const s of automatic){const r=next.clientReceipts.find(r=>r.id===s.receiptId),c=next.claims.find(c=>c.id===s.claimId);
      if(!r||!c||r.code!==s.code||receiptClient(next,r)!==claimClient(next,c))continue;
      const n=Math.min(cents(s.amount),cents(delta(r.amount,usedReceipt(next,r.id))));
      if(n>0)next.claimSettlements.push({...s,amount:n/100});
    }
    return validate(next);
  }
  function normalize(v) {
    if (!v || typeof v!=='object' || Array.isArray(v)) throw Error('الملف لا يحتوي على قاعدة بيانات RONIX');
    if (v.schemaVersion > 19) throw Error('هذه النسخة أحدث من البرنامج؛ استخدم إصدارًا مناسبًا');
    const d = copy(v);
    for (const k of arrays) {
      if (d[k] == null && !['projects','assignments','payments'].includes(k)) d[k]=[];
      if (!Array.isArray(d[k])) throw Error('جدول غير صالح: '+k);
    }
    for(const key of ['receiptAttachments','paymentAttachments']){
      if(d[key]==null||(Array.isArray(d[key])&&d[key].length===0))d[key]={};
      if(!d[key]||typeof d[key]!=='object'||Array.isArray(d[key]))throw Error('مرفقات الإيصالات غير صالحة: '+key);
    }
    if (d.currency && d.currency!=='EGP') throw Error('هذه النسخة تعمل بالجنيه المصري');
    for(const c of d.claims)if(c.items==null)c.items=claimRows(c).map(r=>({desc:String(r.code||''),amount:r.amount}));
    return d;
  }
  const dateOK = s => typeof s==='string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10)===s;
  function audit(d) {
    const issues=[];
    const add = t => issues.push(t);
    const monetary=(v,label,min=0)=>{try{if(cents(v)<min)add(label+': قيمة أقل من الحد المسموح')}catch(e){add(label+': '+e.message)}};
    const dated=(s,label,optional=false)=>{if((!optional||s)&&!dateOK(s))add(label+': تاريخ غير صالح')};
    const unique=(rows,key,label,optional=false)=>{const seen=new Set();for(const r of rows){const k=key(r);if((!k&&!optional)||(k&&seen.has(k)))add(label+': معرّف فارغ أو مكرر');if(k)seen.add(k)}};
    unique(d.projects,p=>p.code,'المشاريع');
    const docKinds=['claim','receipt','payment','advance','expense'];
    unique(d.documentNumbers,x=>x?x.kind+':'+x.id:'','أرقام المستندات');
    unique(d.documentNumbers,x=>x?x.kind+':'+x.number:'','تسلسل المستندات');
    for(const x of d.documentNumbers)if(!x||!docKinds.includes(x.kind)||typeof x.id!=='string'||!x.id||!Number.isSafeInteger(x.number)||x.number<1||x.number>999999999)add('رقم مستند غير صالح');
    unique(d.customers,c=>c?.id,'معرّفات العملاء');
    unique(d.customers,c=>normName(c?.name),'أسماء العملاء');
    for(const c of d.customers)if(!c||typeof c.id!=='string'||typeof c.name!=='string'||!c.name.trim()||c.name!==c.name.trim()||['phone','email','note'].some(k=>c[k]!=null&&typeof c[k]!=='string'))add('بيانات عميل غير صالحة');
    for(const key of ['assignments','payments','claims','clientReceipts','advances','projectExpenses'])unique(d[key],x=>x.id,key,key==='assignments');
    const projects=new Map(d.projects.map(p=>[p.code,p]));
    unique(d.trashRecords,x=>x.id,'سلة المحذوفات');
    unique(d.archivedDesigners,x=>x.name,'المصممون المؤرشفون');
    for(const x of d.trashRecords)if(!['project','assignment','designer'].includes(x.kind)||!x.reason||!x.at||!Array.isArray(x.projects)||!Array.isArray(x.assignments))add('سجل محذوفات غير صالح');
    for(const x of d.archivedDesigners)if(!x.name||!x.reason||!x.at)add('أرشيف مصمم غير صالح');
    const linked=(code,label)=>{if(!projects.has(code))add(label+': مشروع غير موجود '+code)};
    for(const p of d.projects){if(typeof p.code!=='string'||!p.code.trim()||typeof p.name!=='string')add('بيانات مشروع غير صالحة');monetary(p.contract||0,'عقد '+p.code)}
    unique(d.assignments,a=>a.code+'::'+normName(a.designer).replace(/\s+/g,' '),'تكليف المصمم');
    for(const a of d.assignments){linked(a.code,'تكليف');if(!normName(a.designer))add('اسم مصمم فارغ');monetary(a.fee,'أتعاب')}
    for(const p of d.payments){linked(p.code,'دفعة مصمم');monetary(p.amount,'دفعة مصمم',1);dated(p.date,'دفعة مصمم');if(!d.assignments.some(a=>a.code===p.code&&a.designer===p.designer))add('دفعة بلا تكليف مصمم: '+p.id)}
    for(const c of d.claims){
      if(c.matchMode!=null&&!['auto','manual'].includes(c.matchMode))add('طريقة ربط المطالبة غير صالحة');
      dated(c.date,'مطالبة');dated(c.due,'استحقاق',true);if(c.due&&c.due<c.date)add('استحقاق قبل تاريخ المطالبة: '+c.id);
      if(!['مسودة','صادرة','معتمدة','ملغاة'].includes(status(c)))add('حالة مطالبة غير معروفة: '+c.id);
      monetary(c.total,'إجمالي مطالبة',1);
      if(!Array.isArray(c.items))add('بنود مطالبة غير صالحة: '+c.id);
      else {for(const item of c.items)monetary(item.amount,'بند مطالبة',1);try{if(cents(sum(c.items))!==cents(c.total))add('بنود المطالبة لا تساوي إجماليها: '+c.id)}catch{}}
      unique(claimRows(c),r=>r.code,'مشاريع المطالبة');
      for(const r of claimRows(c)){linked(r.code,'مطالبة');monetary(r.amount,'بند مطالبة',1);if(projects.has(r.code)&&normName(projects.get(r.code).client)!==claimClient(d,c))add('مطالبة تجمع عملاء مختلفين: '+c.id)}
      try{if(cents(claimAmount(c))!==cents(c.total))add('إجمالي المطالبة لا يطابق توزيعها: '+c.id)}catch{}
    }
    const batchClients=new Map();
    for(const r of d.clientReceipts){
      monetary(r.amount,'تحصيل',1);dated(r.date,'تحصيل');
      if(r.code){linked(r.code,'تحصيل');if(projects.has(r.code)&&receiptClient(d,r)!==normName(projects.get(r.code).client))add('تحصيل من عميل مختلف عن المشروع: '+r.id)}
      else if(!normName(r.client))add('رصيد غير موزع بلا عميل');
      const id=r.batchId||r.id,client=receiptClient(d,r);if(batchClients.has(id)&&batchClients.get(id)!==client)add('سند واحد لعملاء مختلفين');batchClients.set(id,client);
      if(r.sourceAdvanceId&&!d.advances.some(a=>a.id===r.sourceAdvanceId&&normName(a.client)===client))add('تخصيص مقدمة بلا مصدر صحيح: '+r.id);
    }
    for(const a of d.advances){
      monetary(a.total,'مقدمة',1);monetary(a.allocated||0,'توزيع مقدمة');dated(a.date,'مقدمة');
      try{const actual=sum(d.clientReceipts.filter(r=>r.sourceAdvanceId===a.id));if(cents(actual)!==cents(a.allocated||0)||cents(actual)>cents(a.total))add('توزيع المقدمة لا يطابق سنداتها: '+a.id)}catch{}
    }
    unique(d.openingBalances,x=>x.client,'الرصيد الافتتاحي');
    for(const o of d.openingBalances){monetary(o.amount,'رصيد افتتاحي',-1e13);dated(o.date,'رصيد افتتاحي')}
    for(const x of d.projectExpenses){linked(x.code,'مصروف');monetary(x.amount,'مصروف',1);dated(x.date,'مصروف')}
    for(const s of d.claimSettlements){
      if(s.mode!=null&&!['auto','manual'].includes(s.mode))add('طريقة التسوية غير صالحة');
      const c=d.claims.find(c=>c.id===s.claimId),r=d.clientReceipts.find(r=>r.id===s.receiptId);
      monetary(s.amount,'تسوية مطالبة',1);
      if(!c||!r||!active(c)||s.code!==r.code||!claimRows(c).some(x=>x.code===s.code)||claimClient(d,c)!==receiptClient(d,r))add('ربط غير صحيح بين مطالبة وتحصيل');
    }
    try{
      for(const c of d.claims)for(const r of claimRows(c))if(cents(settled(d,c.id,r.code))>cents(r.amount))add('تسوية تتجاوز مبلغ المشروع في المطالبة: '+c.id);
      for(const r of d.clientReceipts)if(cents(usedReceipt(d,r.id))>cents(r.amount))add('تحصيل مستخدم أكثر من مرة: '+r.id);
    }catch{}
    const detailRows=(rows,label,adjustments=false)=>{if(!Array.isArray(rows))throw Error(label+': جدول غير صالح');unique(rows,r=>r.id,label);for(const r of rows){if(!String(r.name||'').trim())add(label+': الاسم مطلوب');dated(r.date,label);monetary(r.amount,label,1);if(adjustments&&!['increase','discount'].includes(r.type))add(label+': نوع غير صالح')}};
    try{
      for(const p of d.projects){
        if(p.projectDate)dated(p.projectDate,'تاريخ المشروع');
        if(!Array.isArray(p.statementItems||[]))add('بنود المستخلص: جدول غير صالح');
        else {unique(p.statementItems||[],x=>x.id,'بنود المستخلص');for(const x of p.statementItems||[]){dated(x.date,'تاريخ بند المستخلص');if(!String(x.description||'').trim())add('بيان المستخلص مطلوب');if(!Number.isFinite(Number(x.quantity))||Number(x.quantity)<0)add('كمية المستخلص غير صالحة');monetary(x.unitPrice,'سعر بند المستخلص');monetary(x.amount,'قيمة بند المستخلص');if(cents(x.amount)!==cents(amount((Number(x.quantity)*Number(x.unitPrice)).toFixed(2))))add('قيمة بند المستخلص لا تطابق الكمية والسعر')}}
        if(p.originalContract!=null){
          if(!/^[A-Z]{3}$/.test(projectCurrency(p)))add('عملة مشروع غير صالحة');rate(projectRate(p));if(projectCurrency(p)==='EGP'&&projectRate(p)!==1)add('سعر صرف الجنيه يجب أن يساوي 1');
          monetary(p.originalContract,'العقد الأصلي');detailRows(p.contractExtras||[],'تعاقد إضافي');
          if(!Array.isArray(p.taxItems||[]))add('ضرائب المشروع: جدول غير صالح');
          else {unique(p.taxItems||[],t=>t.id,'ضرائب المشروع');for(const t of p.taxItems||[]){if(!String(t.name||'').trim())add('اسم الضريبة مطلوب');if(!['add','deduct'].includes(t.type)||!['percent','fixed'].includes(t.mode))add('نوع الضريبة غير صالح');monetary(t.value,'قيمة الضريبة');if(t.mode==='percent'&&Number(t.value)>100)add('نسبة الضريبة تتجاوز 100%');projectTaxAmount(p,t)}}
          if(cents(p.contract)!==cents(projectBookTotal(p)))add('إجمالي العقد لا يطابق الأصل والإضافات وسعر الصرف');
        }
      }
      for(const a of d.assignments)if(a.baseFee!=null){monetary(a.baseFee,'أتعاب أصلية');detailRows(a.extraWorks||[],'عمل إضافي');detailRows(a.feeAdjustments||[],'تعديل أتعاب',true);if(cents(a.fee)!==cents(assignmentTotal(a)))add('الأتعاب لا تطابق الأصل والإضافات والخصومات')}
      unique(d.deletedPayments,r=>r.payment?.id,'دفعات محذوفة');
      for(const x of d.deletedPayments){const p=x.payment;if(!p||d.payments.some(a=>a.id===p.id))add('دفعة محذوفة مكررة أو غير صالحة');else {linked(p.code,'دفعة محذوفة');monetary(p.amount,'دفعة محذوفة',1);dated(p.date,'دفعة محذوفة');if(!x.deletedAt||!x.reason)add('سجل حذف غير مكتمل')}}
      const batches=new Map();
      for(const r of d.clientReceipts)if(r.incomingCurrency){
        if(!/^[A-Z]{3}$/.test(r.incomingCurrency)||(r.incomingCurrency==='EGP'&&r.receiptRate!==1))add('عملة سند غير صالحة');rate(r.receiptRate);monetary(r.receiptOriginal,'قبض بعملة السند',1);monetary(r.cashAmount,'نقد فعلي',1);monetary(r.receiptTotal,'إجمالي السند',1);
        if(r.code){const p=projects.get(r.code);if(!p||r.projectCurrency!==projectCurrency(p)||r.bookRate!==projectRate(p))add('عملة أو سعر العقد لا يطابق تخصيصه');monetary(r.projectAmount,'سداد بعملة العقد',1);if(cents(r.amount)!==cents(fx(r.projectAmount,r.bookRate)))add('قيمة تسوية العقد غير مطابقة');if(r.projectCurrency===r.incomingCurrency&&cents(r.projectAmount)!==cents(r.receiptOriginal))add('تخصيص بنفس العملة غير متساو')}
        else if(cents(r.amount)!==cents(r.cashAmount))add('الرصيد غير الموزع لا يساوي نقده');
        const key=r.batchId||r.id;if(!batches.has(key))batches.set(key,[]);batches.get(key).push(r);
      }
      for(const [id,rows] of batches){const first=rows[0];if(d.clientReceipts.filter(r=>(r.batchId||r.id)===id).length!==rows.length||rows.some(r=>r.incomingCurrency!==first.incomingCurrency||r.receiptRate!==first.receiptRate||r.receiptTotal!==first.receiptTotal))add('بيانات عملة السند غير متجانسة');if(cents(sum(rows,'receiptOriginal'))!==cents(first.receiptTotal)||cents(sum(rows,'cashAmount'))!==cents(fx(first.receiptTotal,first.receiptRate)))add('توزيع القبض بعملته أو مقابل الجنيه غير متطابق');for(const r of rows)if(Math.abs(cents(r.cashAmount)-cents(fx(r.receiptOriginal,r.receiptRate)))>rows.length)add('مقابل نقدي غير مطابق لسعر الصرف')}
    }catch(e){add(e.message)}
    // Do not execute active content from a restored photo or attachment.
    const safeImage=s=>typeof s==='string'&&(/^(?:data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+)$/.test(s)||/^project_media\/[\w .()\-]+\.(?:png|jpe?g|webp|gif)$/i.test(s));
    for(const p of d.projects)for(const photo of p.photos||[])if(!photo||!safeImage(photo.src))add('مصدر صورة غير مدعوم: '+p.code);
    for(const f of [...Object.values(d.receiptAttachments),...Object.values(d.paymentAttachments)])if(!f||typeof f.data!=='string'||!/^data:(?:image\/(?:png|jpeg|webp|gif)|application\/pdf);base64,[a-zA-Z0-9+/=\s]+$/.test(f.data))add('صيغة مرفق غير مدعومة');
    return [...new Set(issues)];
  }
  function validate(v){const d=normalize(v),errors=audit(d);if(errors.length)throw Error(errors.slice(0,8).join('\n'));return d}
  function receiptEdit(d, {batchId,client,date,total,allocations,method,ref,note,id}) {
    if(!dateOK(date))throw Error('تاريخ سند القبض غير صالح');
    const totalC=cents(total);if(totalC<=0)throw Error('مبلغ السند يجب أن يكون موجبًا');
    const old=d.clientReceipts.filter(r=>(r.batchId||r.id)===batchId);
    if(old.some(r=>r.sourceAdvanceId))throw Error('يُعدّل تخصيص المقدمة من مصدره');
    const rows=allocations.map(r=>({code:r.code,amount:amount(r.amount)}));
    if(rows.some(r=>r.amount<0))throw Error('التوزيع لا يقبل مبالغ سالبة');
    if(new Set(rows.map(r=>r.code)).size!==rows.length)throw Error('المشروع مكرر');
    for(const r of rows)if(!d.projects.some(p=>p.code===r.code&&normName(p.client)===client))throw Error('مشروع غير مرتبط بالعميل');
    const distributed=cents(sum(rows));if(distributed>totalC)throw Error('التوزيع أكبر من إجمالي السند');
    const history=old.length?[...(old[0].history||[]),{at:new Date().toISOString(),previous:old.map(({history,...r})=>r)}]:[];
    const base={batchId,client,date,method,ref:ref||batchId,note,history};
    const entries=rows.filter(r=>r.amount>0).map(r=>({...base,...r,id:old.find(o=>o.code===r.code)?.id||id()}));
    if(totalC>distributed)entries.push({...base,id:old.find(r=>!r.code)?.id||id(),code:'',unallocated:true,amount:(totalC-distributed)/100});
    const next=copy(d);next.clientReceipts=next.clientReceipts.filter(r=>(r.batchId||r.id)!==batchId).concat(entries);
    validate(next);return next;
  }
  return {rate,fx,unfx,projectCurrency,projectRate,originalContract,projectSubtotal,projectTaxAmount,projectTaxTotal,projectOriginalTotal,projectBookTotal,assignmentTotal,cashReceipt,fxDifference,receivedOriginal,foreignReceiptEdit,arrays,copy,cents,amount,sum,delta,status,active,claimRows,claimAmount,claimClient,receiptClient,totals,settled,usedReceipt,remaining,normalize,dateOK,audit,validate,receiptEdit,normName};
})();
if(typeof module!=='undefined')module.exports=R14;
