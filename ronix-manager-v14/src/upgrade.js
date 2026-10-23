/* V14 integration: original screens retained; accounting and persistence corrected. */
function r14Persist(next,action='حفظ',details={}) {
  try {
    if(r14BootIssue)throw Error('استعد نسخة سليمة أولًا. يمكنك تنزيل البيانات غير المقروءة من التنبيه أعلى الصفحة.');
    if(localStorage.getItem(KEY)!==r14Disk)throw Error('تغيّرت البيانات في نافذة أخرى. نزّل نسخة من هذه النافذة ثم أعد تحميل الصفحة قبل التسجيل.');
    const checked=R14.validate(next);
    checked.schemaVersion=14;checked.currency='EGP';
    checked.auditTrail.push({id:r14Id('AUD'),at:new Date().toISOString(),action,...details});
    const serialized=JSON.stringify(checked);
    localStorage.setItem(KEY,serialized);
    r14Disk=serialized;r14Saved=serialized;data=checked;
    return true;
  }catch(e){r14Failures++;alert('لم تُحفظ التغييرات: '+e.message+'\nالبيانات السابقة باقية.');return false}
}
save=function(){return r14Persist(data)};
function r14Change(action,fn,details={}){
  try{const next=R14.copy(data);fn(next);return r14Persist(next,action,details)}
  catch(e){alert(e.message);return false}
}
function r14Done(message){closeModal();render();notify(message)}
function r14Guard(fn){return function(...args){
  const snapshot=JSON.stringify(data),failures=r14Failures;
  const finish=result=>{if(r14Failures!==failures){data=JSON.parse(snapshot);render()}return result};
  try{const result=fn.apply(this,args);return result?.then?result.then(finish):finish(result)}catch(e){data=JSON.parse(snapshot);alert(e.message)}
}}
// Preserve all photo, advance, opening balance and attachment workflows, including rollback.
for(const name of ['setCover','removePhoto','addPhotos','saveAdvance','saveOpening','applyAdvance','saveReceiptAttachment'])window[name]=r14Guard(window[name]);
const r14OldNotify=notify;
notify=function(t){if(JSON.stringify(data)===r14Saved||!t.includes('حفظ'))r14OldNotify(t)};
paid=function(code,designer){return R14.sum(data.payments.filter(p=>(!code||p.code===code)&&(!designer||p.designer===designer)))};
fee=function(code,designer){return R14.sum(data.assignments.filter(a=>(!code||a.code===code)&&(!designer||a.designer===designer)),'fee')};
received=function(code){return R14.sum(data.clientReceipts.filter(r=>code?r.code===code:!!r.code))};
claimCodes=function(c){return R14.claimRows(c).map(r=>r.code)};
claimed=function(code){return R14.sum(data.claims.filter(c=>R14.active(c)&&(!code||claimCodes(c).includes(code))),c=>R14.claimAmount(c,code))};
customerTotals=function(n){return R14.totals(data,n)};
clientAdvances=function(n){return data.advances.filter(a=>R14.normName(a.client)===n)};
clientNames=function(){return [...new Set([...data.projects.map(p=>p.client),...data.advances.map(a=>a.client),...data.clientReceipts.map(r=>r.client),...data.openingBalances.map(o=>o.client)].map(R14.normName).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'))};
unallocated=function(n){return customerTotals(n).unallocated};
verifiedClaims=function(n){return data.claims.filter(c=>R14.claimClient(data,c)===n&&R14.active(c))};
dueClaims=function(n){return verifiedClaims(n).filter(c=>c.due&&c.due<r14Today()&&R14.remaining(data,c)>0)};
ccAmounts=function(code){const p=getP(code);if(!p)return null;const contract=R14.cents(p.contract||0)/100,receipts=received(code),committed=fee(code),designerCash=paid(code),extra=R14.sum(data.projectExpenses.filter(x=>x.code===code)),projectCosts=R14.sum([{amount:committed},{amount:extra}]);return {contract,receipts,committed,designerCash,extra,verified:claimed(code),contractRemaining:R14.delta(contract,receipts),projectedProfit:R14.delta(contract,projectCosts),operatingCash:R14.delta(R14.delta(receipts,designerCash),extra),projectCosts}};
function r14InputMoney(id,{positive=false,signed=false}={}){
  const amount=R14.amount(val(id));if((!signed&&amount<0)||(positive&&amount<=0))throw Error('راجع قيمة المبلغ');return amount;
}
function r14RequireDate(id,optional=false){const date=val(id);if((date||!optional)&&!R14.dateOK(date))throw Error('راجع التاريخ');return date}
function r14Upsert(d,key,record){const i=d[key].findIndex(x=>x.id===record.id);if(i<0)d[key].push(record);else d[key][i]=record}
saveProject=function(e,original){
  e.preventDefault();try{
    const code=val('pcode'),prior=original?decodeURIComponent(original):null,old=prior?getP(prior):null;
    if(!code||!val('pname'))throw Error('الكود واسم المشروع مطلوبان');
    if(data.projects.some(p=>p.code===code&&p!==old))throw Error('الكود مستخدم بالفعل');
    const client=val('pclient'),contract=old&&val('pcontract')===String(old.contract)?old.contract:r14InputMoney('pcontract');
    if(old&&R14.normName(old.client)!==client&&(claimsFor(prior).length||receiptFor(prior).length))throw Error('المشروع له مطالبات أو تحصيلات. حافظ على العميل حتى تُسوّى هذه الحركات.');
    if(contract<claimed(prior||code))throw Error('قيمة العقد أقل من المطالبات الصادرة والمعتمدة');
    const obj={...old,code,name:val('pname'),client,kind:val('pkind'),site:val('psite'),contract,state:val('pstate'),note:val('pnote')};
    if(!r14Change(old?'تعديل مشروع':'إضافة مشروع',d=>{
      const i=d.projects.findIndex(p=>p.code===prior);if(i<0)d.projects.push(obj);else d.projects[i]=obj;
      if(prior&&prior!==code){for(const key of ['assignments','payments','claims','clientReceipts','projectExpenses','claimSettlements'])for(const x of d[key]){if(x.code===prior)x.code=code;if(x.projectRows)for(const row of x.projectRows)if(row.code===prior)row.code=code}for(const a of d.advances)for(const row of a.allocations||[])if(row.code===prior)row.code=code}
    },{code,previousCode:prior,previousContract:old?.contract,contract}))return;
    if(projectFocus===prior)projectFocus=code;r14Done('تم حفظ المشروع وروابطه');
  }catch(e){alert(e.message)}
};
const r14EditProject=editProject;
editProject=function(enc){r14EditProject(enc);const old=enc?getP(decodeURIComponent(enc)):null;if(old&&Number(old.contract)!==R14.cents(old.contract)/100){$('pcontract').step='any';$('pcontract').insertAdjacentHTML('afterend','<small>القيمة الأصلية بدقة أكبر من القرش محفوظة. إذا غيّرت المبلغ فأدخل منزلتين عشريتين.</small>')}};
saveAssignment=function(e,c,d){
  e.preventDefault();try{
    const code=val('acode'),name=val('adesigner').replace(/\s+/g,' ').trim(),amount=r14InputMoney('afee'),old=d?getA(decodeURIComponent(c),decodeURIComponent(d)):null;
    if(!getP(code)||!name)throw Error('راجع المشروع والمصمم');
    if(data.assignments.some(a=>a!==old&&a.code===code&&a.designer.trim().replace(/\s+/g,' ')===name))throw Error('المصمم مكلف بهذا المشروع بالفعل');
    if(amount<paid(code,old?.designer||name)&&!confirm('الأتعاب أقل من المدفوع للمصمم. سيظهر رصيد دائن. متابعة؟'))return;
    const obj={...old,id:old?.id||r14Id('D'),code,designer:old?.designer||name,fee:amount,kind:val('akind')};
    if(r14Change('حفظ تكليف مصمم',next=>{const i=old?data.assignments.indexOf(old):-1;if(i<0)next.assignments.push(obj);else next.assignments[i]=obj},{code,designer:obj.designer,previousFee:old?.fee,fee:amount}))r14Done('تم حفظ التكليف');
  }catch(e){alert(e.message)}
};
savePayment=function(e,id){
  e.preventDefault();try{
    const old=id?data.payments.find(p=>p.id===decodeURIComponent(id)):null,code=old?.code||val('paycode'),designer=old?.designer||val('paydesigner'),amount=r14InputMoney('payamount',{positive:true}),date=r14RequireDate('paydate');
    if(!getA(code,designer))throw Error('كلّف المصمم بالمشروع أولًا');
    if(amount>fee(code,designer)-paid(code,designer)+(old?.amount||0)&&!confirm('الدفعة أكبر من المتبقي للمصمم وسيظهر رصيد دائن. متابعة؟'))return;
    const obj={...old,id:old?.id||r14Id('PAY'),code,designer,date,amount,method:val('paymethod'),ref:val('payref'),note:val('paynote'),history:old?[...(old.history||[]),{changed:new Date().toISOString(),previousAmount:old.amount,previousDate:old.date}]:[]};
    if(r14Change('حفظ دفعة مصمم',d=>r14Upsert(d,'payments',obj),{id:obj.id,previousAmount:old?.amount,amount}))r14Done('تم حفظ دفعة المصمم');
  }catch(e){alert(e.message)}
};
balanceHint=function(){const c=val('paycode'),d=val('paydesigner');if(!c||!d)return;const form=$('payamount')?.closest('form'),match=form?.getAttribute('onsubmit')?.match(/savePayment\(event,'([^']*)'/),old=match?.[1]?data.payments.find(p=>p.id===decodeURIComponent(match[1])):null;const paidBefore=paid(c,d)-(old?.amount||0);$('balanceHint').textContent=`الأتعاب: ${money(fee(c,d))} | المدفوع دون السند الجاري: ${money(paidBefore)} | المتبقي بعد الحفظ: ${money(fee(c,d)-paidBefore-Number(val('payamount')||0))}`};
saveProjectExpense=function(e,id){
  e.preventDefault();try{
    const old=id?data.projectExpenses.find(x=>x.id===decodeURIComponent(id)):null,code=old?.code||val('ccExpProject'),amount=r14InputMoney('ccExpAmount',{positive:true}),date=r14RequireDate('ccExpDate');
    if(!getP(code))throw Error('مشروع غير صالح');
    const obj={...old,id:old?.id||r14Id('EXP'),code,date,category:val('ccExpCategory'),amount,ref:val('ccExpRef'),notes:val('ccExpNotes'),payee:val('ccExpPayee')};
    if(r14Change('حفظ مصروف مشروع',d=>{r14Upsert(d,'projectExpenses',obj);d.costAudit.push({at:new Date().toISOString(),action:old?'edit expense':'add expense',before:old,after:obj})},{id:obj.id,amount,previousAmount:old?.amount})){r14Done('حُفظ المصروف');if(page==='costcenters')showCostCenter(r14Encode(code))}
  }catch(e){alert(e.message)}
};
const r14ExpenseForm=openProjectExpense;
openProjectExpense=function(enc='',eid=''){r14ExpenseForm(enc,eid);const old=eid?data.projectExpenses.find(x=>x.id===decodeURIComponent(eid)):null;$('ccExpNotes').closest('.formgrid').insertAdjacentHTML('beforeend',field('ccExpPayee','المستفيد / المورد / المقاول',old?.payee||''))};
saveCustomerReceipt=function(e){
  e.preventDefault();try{
    const client=val('crClient'),batchId=activeReceiptEdit||r14Id('RC'),total=r14InputMoney('crAmount',{positive:true});
    if(!clientNames().includes(client))throw Error('اختر العميل');
    const allocations=[...document.querySelectorAll('.receipt-allocation')].map(x=>({code:x.dataset.code,amount:R14.amount(x.value||'0')}));
    const old=data.clientReceipts.filter(r=>(r.batchId||r.id)===batchId);
    if(allocations.some(a=>a.amount>Number(getP(a.code).contract)-received(a.code)+R14.sum(old.filter(r=>r.code===a.code)))&&!confirm('التوزيع يتجاوز عقد مشروع وسيظهر رصيد دائن. متابعة؟'))return;
    const next=R14.receiptEdit(data,{batchId,client,date:r14RequireDate('crDate'),total,allocations,method:val('crMethod'),ref:val('crRef'),note:val('crNote'),id:()=>r14Id('R')});
    if(r14Persist(next,old.length?'تعديل سند قبض':'إضافة سند قبض',{batchId,total})){activeReceiptEdit=null;r14Done('حُفظ السند والتوزيع؛ الباقي رصيد غير موزع للعميل')}
  }catch(e){alert(e.message)}
};
checkAllocationTotal=function(){let el=$('crCheck');if(!el)return;try{const total=R14.amount(val('crAmount')||'0'),sum=R14.sum([...document.querySelectorAll('.receipt-allocation')],x=>x.value||'0'),rest=R14.delta(total,sum);el.style.color=rest<0?'#b33d4a':'#187a56';el.textContent=`السند: ${money(total)} | التوزيع: ${money(sum)} | غير موزع: ${money(rest)}${rest<0?' — التوزيع أكبر من السند':''}`}catch(e){el.textContent=e.message;el.style.color='#b33d4a'}};
saveAdvance=function(e){e.preventDefault();try{const client=val('adClient'),total=r14InputMoney('adTotal',{positive:true}),date=r14RequireDate('adDate');if(!clientNames().includes(client))throw Error('اختر العميل');const a={id:r14Id('ADV'),client,total,allocated:0,date,ref:val('adRef'),note:val('adNote'),allocations:[]};if(r14Change('قبض دفعة مقدمة',d=>d.advances.push(a),{advanceId:a.id,total}))r14Done('تم حفظ المقدمة كقبض فعلي غير موزع')}catch(e){alert(e.message)}};
saveOpening=function(e){e.preventDefault();try{const client=val('obClient'),amount=r14InputMoney('obAmount',{signed:true}),date=r14RequireDate('obDate');if(!clientNames().includes(client))throw Error('اختر العميل');const old=data.openingBalances.find(o=>o.client===client);if(r14Change('حفظ رصيد افتتاحي مرجعي',d=>{d.openingBalances=d.openingBalances.filter(o=>o.client!==client);d.openingBalances.push({client,date,amount,note:val('obNote')})},{client,amount,previousAmount:old?.amount}))r14Done('حُفظ الرصيد الافتتاحي منفصلًا عن العقود')}catch(e){alert(e.message)}};
applyAdvance=function(e,enc){e.preventDefault();try{
  const a=data.advances.find(a=>a.id===decodeURIComponent(enc));if(!a)throw Error('المقدمة غير موجودة');
  const all=[...document.querySelectorAll('.apply-advance')].map(x=>({code:x.dataset.code,amount:R14.amount(x.value||'0')}));
  if(all.some(r=>r.amount<0))throw Error('مبلغ التوزيع سالب');
  const rows=all.filter(r=>r.amount>0),sum=R14.sum(rows);
  if(!sum||R14.cents(sum)>R14.cents(R14.delta(a.total,a.allocated||0)))throw Error('التوزيع يتجاوز المتاح من المقدمة');
  if(rows.some(r=>!getP(r.code)||R14.normName(getP(r.code).client)!==R14.normName(a.client)||r.amount>R14.delta(getP(r.code).contract,received(r.code))))throw Error('راجع عميل المشروع ورصيد عقده');
  const date=r14Today(),batchId=r14Id('ALLOC');
  if(r14Change('تخصيص مقدمة دون قبض جديد',d=>{const next=d.advances.find(x=>x.id===a.id);next.allocated=R14.sum([{amount:next.allocated||0},{amount:sum}]);next.allocations=[...(next.allocations||[]),...rows.map(r=>({...r,date}))];d.clientReceipts.push(...rows.map(r=>({...r,id:r14Id('R'),batchId,client:a.client,date,method:'تسوية مقدمة سابقة',ref:a.ref||a.id,note:'توزيع مقدمة دون قبض جديد',sourceAdvanceId:a.id})))},{advanceId:a.id,amount:sum}))r14Done('تم توزيع المقدمة دون تكرار القبض');
}catch(e){alert(e.message)}};
saveClaim=function(e,id){
  e.preventDefault();try{
    const old=id?data.claims.find(c=>c.id===decodeURIComponent(id)):null,client=val('claimClient'),date=r14RequireDate('claimDate'),due=r14RequireDate('claimDue',true),status=val('claimStatus');
    if(due&&due<date)throw Error('تاريخ الاستحقاق يسبق المطالبة');
    const rows=claimDraftRows.map(r=>({...r,amount:R14.amount(r.amount)}));
    if(!rows.length||rows.some(r=>!getP(r.code)||R14.normName(getP(r.code).client)!==client||r.amount<=0))throw Error('اختر مشاريع العميل ومبلغًا موجبًا لكل مشروع');
    if(new Set(rows.map(r=>r.code)).size!==rows.length)throw Error('المشروع مكرر');
    if(R14.active({status}))for(const r of rows){const prior=R14.sum(data.claims.filter(c=>c.id!==old?.id&&R14.active(c)),c=>R14.claimAmount(c,r.code));if(R14.cents(prior)+R14.cents(r.amount)>R14.cents(getP(r.code).contract))throw Error('مطالبات المشروع '+r.code+' تتجاوز العقد')}
    if(old&&R14.active(old)&&!confirm('سيتم تعديل مستند صادر أو معتمد مع تسجيل التغيير. متابعة؟'))return;
    const sameRows=old&&JSON.stringify(R14.claimRows(old).map(r=>({code:r.code,amount:r.amount})))===JSON.stringify(rows.map(r=>({code:r.code,amount:r.amount})));
    const obj={...old,id:old?.id||r14Id('CL'),client,code:rows[0].code,projectRows:rows,date,due,status,note:val('claimNote'),total:R14.sum(rows),items:sameRows&&old.items?old.items:rows.map(r=>({desc:getP(r.code).name,amount:r.amount})),history:old?[...(old.history||[]),{at:new Date().toISOString(),previous:{...old,history:undefined}}]:[]};
    if(r14Change('حفظ مطالبة',d=>r14Upsert(d,'claims',obj),{id:obj.id,total:obj.total,previousTotal:old?.total,status}))r14Done('تم حفظ المطالبة');
  }catch(e){alert(e.message)}
};
const r14OpenClaim=openClaim;
openClaim=function(code,id){r14OpenClaim(code,id);if(id){const old=data.claims.find(c=>c.id===decodeURIComponent(id));if(old)$('claimStatus').value=R14.status(old)}};
claimClientProjects=function(){return customerProjects(val('claimClient'))};
function r14Match(enc){
  const c=data.claims.find(x=>x.id===decodeURIComponent(enc));if(!c)return;if(!R14.active(c))return alert('تجري المطابقة للمطالبات الصادرة والمعتمدة فقط');
  const rows=data.clientReceipts.filter(r=>claimCodes(c).includes(r.code)&&R14.receiptClient(data,r)===R14.claimClient(data,c));
  modal('مطابقة التحصيل مع المطالبة',`<p>مطالبة ${esc(c.id)} · ${money(c.total)}</p><p class="hint">اختر الجزء المسدد من كل سند. المطابقة لا تنشئ قبضًا جديدًا، ويمكن تصحيحها بوضع صفر.</p><form onsubmit="r14SaveMatch(event,'${enc}')"><div class="tablewrap"><table><thead><tr><th>التاريخ والسند</th><th>المشروع</th><th>متاح لهذه المطالبة</th><th>يُطابق الآن</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.date)}<br>${esc(r.ref||r.batchId||r.id)}</td><td>${esc(r.code)}</td><td>${fmt(R14.delta(r.amount,R14.usedReceipt(data,r.id,c.id)))}</td><td><input aria-label="مبلغ المطابقة" class="field r14-match" type="number" min="0" step="0.01" data-id="${esc(r.id)}" value="${R14.sum(data.claimSettlements.filter(s=>s.receiptId===r.id&&s.claimId===c.id))}"></td></tr>`).join('')||'<tr><td colspan="4">لا يوجد تحصيل مخصص لهذه المشاريع. سجّل القبض ووزعه أولًا.</td></tr>'}</tbody></table></div><div class="modalfoot"><button class="btn primary" type="submit">حفظ المطابقة</button><button type="button" class="btn" onclick="closeModal()">إغلاق</button></div></form>`);
}
function r14SaveMatch(e,enc){e.preventDefault();try{const id=decodeURIComponent(enc),rows=[...document.querySelectorAll('.r14-match')].map(x=>({receiptId:x.dataset.id,amount:R14.amount(x.value||'0')}));if(rows.some(r=>r.amount<0))throw Error('المطابقة لا تقبل مبلغًا سالبًا');if(r14Change('مطابقة مطالبة بالتحصيل',d=>{d.claimSettlements=d.claimSettlements.filter(s=>s.claimId!==id);for(const r of rows.filter(r=>r.amount>0))d.claimSettlements.push({claimId:id,receiptId:r.receiptId,code:d.clientReceipts.find(x=>x.id===r.receiptId).code,amount:r.amount,at:new Date().toISOString()})},{claimId:id}))r14Done('حُفظت المطابقة دون تكرار القبض')}catch(e){alert(e.message)}}
claimTable=function(cs){return `<div class="tablewrap"><table><thead><tr><th>المطالبة / العميل</th><th>المشاريع</th><th>التاريخ / الاستحقاق</th><th>الحالة</th><th>القيمة</th><th>مسدد بمطابقة</th><th>غير مطابق</th><th>إجراءات</th></tr></thead><tbody>${cs.map(c=>{const enc=r14Encode(c.id),paid=R14.settled(data,c.id),rest=R14.remaining(data,c),active=R14.active(c);return `<tr><td>${esc(c.id)}<br>${esc(R14.claimClient(data,c))}</td><td>${esc(claimCodes(c).join('، '))}</td><td>${esc(c.date)}<br>${esc(c.due||'غير محدد')}</td><td>${esc(R14.status(c))}${active?'<br>'+(!rest?'مسددة':paid?'مسددة جزئيًا':'غير مسددة'):''}</td><td>${fmt(c.total)}</td><td>${fmt(paid)}</td><td>${active?fmt(rest):'—'}</td><td><button class="link" onclick="printClaim('${enc}')">طباعة</button><button class="link" onclick="openClaim(null,'${enc}')">تعديل</button>${active?`<button class="link" onclick="r14Match('${enc}')">مطابقة</button>`:''}</td></tr>`}).join('')||'<tr><td colspan="8">لا توجد مطالبات</td></tr>'}</tbody></table></div>`};
claimList=function(){const active=data.claims.filter(R14.active),matched=R14.sum(data.claimSettlements),outstanding=R14.delta(R14.sum(active,'total'),matched);return `<div class="v5-metrics">${v5Metric('المطالبات الصادرة والمعتمدة',R14.sum(active,'total'),'المسودات والملغاة مستبعدة')}${v5Metric('مسدد بمطابقة السندات',matched,'لا يزيد القبض مرة ثانية','good')}${v5Metric('متبقي دون مطابقة',outstanding,'قد يكون هناك قبض لم يُطابق بعد','warn')}${v5Metric('رصيد تجاوز الاستحقاق',R14.sum(active.filter(c=>c.due&&c.due<r14Today()),c=>R14.remaining(data,c)),'بحسب المطابقة المسجلة','bad')}</div><div class="panel"><div class="panel-title"><h2>مطالبات العملاء</h2><div class="actions"><button class="btn primary" onclick="openClaim()">+ مطالبة جديدة</button><button class="btn" onclick="openReceipt()">+ تسجيل تحصيل</button><button class="btn" onclick="exportAllExcel()">Excel شامل</button></div></div><p class="hint">طابق السندات مع المطالبات قبل اعتماد المتأخرات. المطابقة تخص مبلغ كل مشروع على حدة.</p>${claimTable(data.claims)}</div><div class="panel"><h2>التحصيل وتوزيع السندات</h2>${receiptTable(data.clientReceipts)}</div>`};

function r14ClientCashPanel(n){const t=customerTotals(n);return `<div class="panel"><h3>مطابقة قبض العميل</h3><div class="v5-metrics">${v5Metric('قبض فعلي',t.cash,'السندات والمقدمات دون تكرار تخصيصها','good')}${v5Metric('مخصص للمشاريع',t.receipts,'يخفض رصيد عقد المشروع')}${v5Metric('رصيد غير موزع',t.unallocated,'يشمل باقي السندات والمقدمات','warn')}${v5Metric('متبقي بعد كامل قبض العميل',R14.delta(t.contracts,t.cash),'للمراجعة على مستوى العميل؛ الافتتاحي منفصل')}</div><p class="hint">القبض الفعلي = المخصص للمشاريع + غير الموزع. لتوزيع باقي سند قبض، افتح «تعديل» السند وغيّر التوزيع مع إبقاء إجماليه. المقدمات تُوزع من المالية المتقدمة.</p></div>`}
const r14DisplayClient=displayClientLedger;
displayClientLedger=function(){r14DisplayClient();const n=val('clientSelect');if(n)$('customerLedgerArea').insertAdjacentHTML('afterbegin',r14ClientCashPanel(n))};
const r14Advanced=advancedFinance;
advancedFinance=function(){return r14Advanced().replaceAll('مطالبات تجاوزت تاريخ الاستحقاق','متبقي تجاوز الاستحقاق بحسب المطابقة').replaceAll('مقدم غير موزع','رصيد غير موزع')};
const r14Dashboard=ccDashboard;
ccDashboard=function(){const totals=clientNames().map(customerTotals),cash=R14.sum(totals,'cash'),loose=R14.sum(totals,'unallocated');return `<div class="panel"><div class="v5-header"><h2>RONIX V14 · متابعة القبض</h2><button class="btn primary" onclick="openCustomerReceipt()">+ قبض من عميل</button></div><div class="v5-metrics">${v5Metric('إجمالي القبض الفعلي',cash,'المقدمات مرة واحدة','good')}${v5Metric('قبض مخصص للمشاريع',received(),'يشمل تخصيص المقدمات')}${v5Metric('رصيد العملاء غير الموزع',loose,'يُراجع ثم يوزع على المشاريع','warn')}${v5Metric('صافي النقد المسجل',R14.delta(cash,R14.sum([{amount:paid()},{amount:R14.sum(data.projectExpenses)}])),'قبض فعلي ناقص دفعات المصممين والمصروفات')}</div></div>`+r14Dashboard()};
function r14ReceiptRows(n){return data.clientReceipts.filter(r=>R14.receiptClient(data,r)===n).sort((a,b)=>a.date.localeCompare(b.date))}
clientStatementTabs=function(n){const ps=customerProjects(n),t=customerTotals(n);return [
  ['ملخص العميل',[['العميل','العقود','القبض الفعلي','المخصص للمشاريع','غير موزع','متبقي العقود بعد التخصيص'],[n,t.contracts,t.cash,t.receipts,t.unallocated,R14.delta(t.contracts,t.receipts)]]],
  ['المشاريع',[['الكود','المشروع','العقد','المخصص','المتبقي'],...ps.map(p=>[p.code,p.name,Number(p.contract),received(p.code),R14.delta(p.contract,received(p.code))])]],
  ['القبض والتوزيع',[['السند','التاريخ','المشروع','المبلغ','النوع','الطريقة','المرجع'],...r14ReceiptRows(n).map(r=>[r.batchId||r.id,r.date,r.code||'غير موزع',Number(r.amount),r.sourceAdvanceId?'تخصيص مقدمة — ليس قبضًا جديدًا':r.code?'قبض مخصص':'قبض غير موزع',r.method,r.ref])]],
  ['مطالبات العميل',[['المطالبة','المشروع','التاريخ','الحالة','حصة المشروع','إجمالي المستند','مسدد للمشروع'],...data.claims.filter(c=>R14.claimClient(data,c)===n).flatMap(c=>R14.claimRows(c).map(r=>[c.id,r.code,c.date,R14.status(c),Number(r.amount),Number(c.total),R14.settled(data,c.id,r.code)]))]],
  ['المقدمات',[['السند','التاريخ','المبلغ الأصلي','الموزع','غير موزع'],...clientAdvances(n).map(a=>[a.ref||a.id,a.date,a.total,a.allocated,R14.delta(a.total,a.allocated||0)])]],
  ['افتتاحي مرجعي',[['التاريخ','الرصيد','ملاحظة'],...data.openingBalances.filter(o=>o.client===n).map(o=>[o.date,o.amount,o.note])]],
]};
function r14Print(title,tabs,extra=''){
  const w=window.open('','_blank');if(!w)return alert('اسمح بالنوافذ المنبثقة للطباعة');
  w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>${esc(title)}</title><style>@page{size:A4 landscape;margin:12mm}body{font:12px Tahoma,Arial;color:#17263c}h1{color:#a78147}table{width:100%;border-collapse:collapse;margin-bottom:25px}th,td{border:1px solid #d7dfe8;padding:7px;text-align:right;overflow-wrap:anywhere}th{background:#edf1f6}tr{break-inside:avoid}img{width:75px;height:60px;object-fit:cover}.hint{color:#536276}</style><h1>RONIX · ${esc(title)}</h1><p>${esc(r14Today())}</p>${extra}${tabs.map(([name,rows])=>`<h2>${esc(name)}</h2><table>${rows.map((row,i)=>`<tr>${row.map(v=>`<${i===0?'th':'td'}>${esc(typeof v==='number'?fmt(v):v)}</${i===0?'th':'td'}>`).join('')}</tr>`).join('')}</table>`).join('')}<p>إعداد الحسابات: _____________ &nbsp; اعتماد: _____________</p></html>`);
  w.document.close();w.focus();let printed=false;const printOnce=()=>{if(!printed){printed=true;w.print()}};w.onload=printOnce;setTimeout(()=>{if(w.document.readyState==='complete')printOnce()},500);
}
printCustomerStatement=function(enc){const n=decodeURIComponent(enc);r14Print('كشف حساب '+n,clientStatementTabs(n),'<p class="hint">القبض الفعلي يشمل المقدمات مرة واحدة. توزيع المقدمة حركة تخصيص. الأرصدة الافتتاحية مرجعية منفصلة.</p>')};
printClaim=function(enc){const c=data.claims.find(x=>x.id===decodeURIComponent(enc));if(!c)return;const matched=data.claimSettlements.filter(s=>s.claimId===c.id);r14Print('مطالبة '+c.id,[
  ['بيانات المطالبة',[['العميل','تاريخ المطالبة','الاستحقاق','الحالة'],[R14.claimClient(data,c),c.date,c.due||'غير محدد',R14.status(c)]]],
  ['مشاريع المطالبة',[['الكود','المشروع','العقد','قيمة هذه المطالبة للمشروع','مسدد بمطابقة','متبقٍ'],...R14.claimRows(c).map(r=>[r.code,getP(r.code)?.name,Number(getP(r.code)?.contract||0),r.amount,R14.settled(data,c.id,r.code),R14.delta(r.amount,R14.settled(data,c.id,r.code))])]],
  ['بنود المستند',[['الوصف','المبلغ'],...(c.items||[]).map(i=>[i.desc,i.amount])]],
  ['إجماليات',[['المطالبة','مسدد بمطابقة','متبقٍ غير مطابق'],[c.total,R14.settled(data,c.id),R14.remaining(data,c)]]],
  ['سندات مطابقة لهذه المطالبة',[['التاريخ','السند','المشروع','المبلغ المطابق'],...matched.map(s=>{const r=data.clientReceipts.find(x=>x.id===s.receiptId);return [r.date,r.ref||r.batchId||r.id,s.code,s.amount]})]],
  ['قبض المشاريع للمعلومة',[['التاريخ','المشروع','السند','المبلغ المخصص'],...data.clientReceipts.filter(r=>claimCodes(c).includes(r.code)).map(r=>[r.date,r.code,r.ref||r.batchId||r.id,r.amount])]],
],`<p>${esc(c.note||'')}</p><p class="hint">السداد المبين مبني على المطابقة المسجلة. قبض المشاريع العام لا يُطرح تلقائيًا من هذه المطالبة.</p><div>${R14.claimRows(c).map(r=>{const img=cover(getP(r.code));return img?`<span><img src="${esc(new URL(img.src,location.href).href)}" alt="${esc(r.code)}"> ${esc(r.code)} </span>`:''}).join('')}</div>`)};
const r14OriginalProjectExcel=projectExcel;
projectExcel=function(enc){const code=decodeURIComponent(enc),original=exportTabs;try{exportTabs=(tabs,name)=>{tabs[1]=['المطالبات',[['المطالبة','التاريخ','الحالة','حصة المشروع','مسدد بمطابقة','المتبقي'],...claimsFor(code).map(c=>[c.id,c.date,R14.status(c),R14.claimAmount(c,code),R14.settled(data,c.id,code),R14.delta(R14.claimAmount(c,code),R14.settled(data,c.id,code))])]];tabs.push(['مصروفات المشروع',[['التاريخ','النوع','المستفيد','المبلغ','المرجع'],...data.projectExpenses.filter(x=>x.code===code).map(x=>[x.date,x.category,x.payee||'',x.amount,x.ref])]]);original(tabs,name)};r14OriginalProjectExcel(enc)}finally{exportTabs=original}};
const r14OriginalAllExcel=exportAllExcel;
exportAllExcel=function(){const original=exportTabs;try{exportTabs=(tabs,name)=>{tabs[1]=['المطالبات',[['الرقم','المشروع','العميل','التاريخ','الحالة','قيمة المشروع','مسدد بمطابقة'],...data.claims.flatMap(c=>R14.claimRows(c).map(r=>[c.id,r.code,R14.claimClient(data,c),c.date,R14.status(c),r.amount,R14.settled(data,c.id,r.code)]))]];tabs.push(
  ['أرصدة العملاء',[['العميل','العقود','القبض الفعلي','المخصص','غير موزع'],...clientNames().map(n=>{const t=customerTotals(n);return[n,t.contracts,t.cash,t.receipts,t.unallocated]})]],
  ['المقدمات',[['المعرف','العميل','التاريخ','القيمة','المخصص','غير موزع'],...data.advances.map(a=>[a.id,a.client,a.date,a.total,a.allocated,R14.delta(a.total,a.allocated||0)])]],
  ['الأرصدة الافتتاحية',[['العميل','التاريخ','الرصيد','ملاحظة'],...data.openingBalances.map(o=>[o.client,o.date,o.amount,o.note])]],
  ['المصروفات',[['المشروع','التاريخ','المستفيد','الفئة','المبلغ','مرجع'],...data.projectExpenses.map(x=>[x.code,x.date,x.payee||'',x.category,x.amount,x.ref])]],
  ['مطابقة التحصيل',[['المطالبة','التحصيل','المشروع','المبلغ','وقت المطابقة'],...data.claimSettlements.map(s=>[s.claimId,s.receiptId,s.code,s.amount,s.at])]],
  ['سجل التغييرات',[['الوقت','الإجراء','المرجع'],...data.auditTrail.map(a=>[a.at,a.action,a.batchId||a.claimId||a.code||a.id])]]
);original(tabs,name)};r14OriginalAllExcel()}finally{exportTabs=original}};
exportCSV=function(){const rows=[['المشروع','المصمم','الأتعاب','المدفوع','المتبقي'],...reportRows().map(a=>[a.code,a.designer,a.fee,paid(a.code,a.designer),R14.delta(a.fee,paid(a.code,a.designer))])];download('RONIX_Designer_Statement.csv','\ufeff'+rows.map(row=>row.map(v=>'"'+String(typeof v==='string'&&/^[\s]*[=+@-]/.test(v)?"'"+v:v).replaceAll('"','""')+'"').join(',')).join('\r\n'),'text/csv;charset=utf-8')};
v8Audit=function(){try{return R14.audit(R14.normalize(data))}catch(e){return[e.message]}};
v8Review=function(){const issues=v8Audit();modal('فحص سلامة الحسابات والبيانات',`<div class="notice">${issues.length?'توجد ملاحظات: '+issues.length:'نجحت فحوص الربط والمبالغ والمقدمات ومطابقة المطالبات'}</div>${issues.map(t=>`<p>${esc(t)}</p>`).join('')}<p class="hint">الفحص يراجع اتساق السجلات داخل البرنامج؛ راجع الأرصدة مع مستنداتك الفعلية.</p><div class="modalfoot"><button class="btn primary" onclick="backup()">نسخة احتياطية</button><button class="btn" onclick="closeModal()">إغلاق</button></div>`)};
v8Btn.onclick=v8Review;
