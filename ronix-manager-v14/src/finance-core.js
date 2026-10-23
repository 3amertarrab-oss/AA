/* RONIX V14. Monetary arithmetic in integer piastres; no network or storage. */
const R14 = (() => {
  const arrays = ['projects','assignments','payments','claims','clientReceipts','advances','openingBalances','projectExpenses','costAudit','claimSettlements','auditTrail'];
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
    const cash = sum([...rs.filter(r=>!r.sourceAdvanceId),...adv.map(a=>({amount:a.total}))]);
    return {contracts:sum(projects,'contract'),receipts,unallocated,cash,claims:sum(d.claims.filter(c=>claimClient(d,c)===name&&active(c)),'total')};
  }
  const settled = (d,id,code) => sum(d.claimSettlements.filter(s=>s.claimId===id&&(!code||s.code===code)));
  const usedReceipt = (d,id,exceptClaim) => sum(d.claimSettlements.filter(s=>s.receiptId===id&&s.claimId!==exceptClaim));
  const remaining = (d,c) => delta(c.total,settled(d,c.id));
  function normalize(v) {
    if (!v || typeof v!=='object' || Array.isArray(v)) throw Error('الملف لا يحتوي على قاعدة بيانات RONIX');
    if (v.schemaVersion > 14) throw Error('هذه النسخة أحدث من البرنامج؛ استخدم إصدارًا مناسبًا');
    const d = copy(v);
    for (const k of arrays) {
      if (d[k] == null && !['projects','assignments','payments'].includes(k)) d[k]=[];
      if (!Array.isArray(d[k])) throw Error('جدول غير صالح: '+k);
    }
    if (d.receiptAttachments == null || (Array.isArray(d.receiptAttachments)&&d.receiptAttachments.length===0)) d.receiptAttachments={};
    if (!d.receiptAttachments || typeof d.receiptAttachments!=='object' || Array.isArray(d.receiptAttachments)) throw Error('مرفقات الإيصالات غير صالحة');
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
    for(const key of ['assignments','payments','claims','clientReceipts','advances','projectExpenses'])unique(d[key],x=>x.id,key,key==='assignments');
    const projects=new Map(d.projects.map(p=>[p.code,p]));
    const linked=(code,label)=>{if(!projects.has(code))add(label+': مشروع غير موجود '+code)};
    for(const p of d.projects){if(typeof p.code!=='string'||!p.code.trim()||typeof p.name!=='string')add('بيانات مشروع غير صالحة');monetary(p.contract||0,'عقد '+p.code)}
    unique(d.assignments,a=>a.code+'::'+normName(a.designer).replace(/\s+/g,' '),'تكليف المصمم');
    for(const a of d.assignments){linked(a.code,'تكليف');if(!normName(a.designer))add('اسم مصمم فارغ');monetary(a.fee,'أتعاب')}
    for(const p of d.payments){linked(p.code,'دفعة مصمم');monetary(p.amount,'دفعة مصمم',1);dated(p.date,'دفعة مصمم');if(!d.assignments.some(a=>a.code===p.code&&a.designer===p.designer))add('دفعة بلا تكليف مصمم: '+p.id)}
    for(const c of d.claims){
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
      const c=d.claims.find(c=>c.id===s.claimId),r=d.clientReceipts.find(r=>r.id===s.receiptId);
      monetary(s.amount,'تسوية مطالبة',1);
      if(!c||!r||!active(c)||s.code!==r.code||!claimRows(c).some(x=>x.code===s.code)||claimClient(d,c)!==receiptClient(d,r))add('ربط غير صحيح بين مطالبة وتحصيل');
    }
    try{
      for(const c of d.claims)for(const r of claimRows(c))if(cents(settled(d,c.id,r.code))>cents(r.amount))add('تسوية تتجاوز مبلغ المشروع في المطالبة: '+c.id);
      for(const r of d.clientReceipts)if(cents(usedReceipt(d,r.id))>cents(r.amount))add('تحصيل مستخدم أكثر من مرة: '+r.id);
    }catch{}
    // Do not execute active content from a restored photo or attachment.
    const safeImage=s=>typeof s==='string'&&(/^(?:data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=\s]+)$/.test(s)||/^project_media\/[\w .()\-]+\.(?:png|jpe?g|webp|gif)$/i.test(s));
    for(const p of d.projects)for(const photo of p.photos||[])if(!photo||!safeImage(photo.src))add('مصدر صورة غير مدعوم: '+p.code);
    for(const f of Object.values(d.receiptAttachments))if(!f||typeof f.data!=='string'||!/^data:(?:image\/(?:png|jpeg|webp|gif)|application\/pdf);base64,[a-zA-Z0-9+/=\s]+$/.test(f.data))add('صيغة مرفق غير مدعومة');
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
  return {arrays,copy,cents,amount,sum,delta,status,active,claimRows,claimAmount,claimClient,receiptClient,totals,settled,usedReceipt,remaining,normalize,dateOK,audit,validate,receiptEdit,normName};
})();
if(typeof module!=='undefined')module.exports=R14;
