/* Received-payment routes and currency-aware receipt allocation. */
const r15ReceiptForm=openCustomerReceipt;
openCustomerReceipt=function(client='',batch=''){
 r15ReceiptForm(client,batch);const id=batch?decodeURIComponent(batch):null,rows=id?data.clientReceipts.filter(r=>(r.batchId||r.id)===id):[],first=rows[0];
 const currency=first?.incomingCurrency||'EGP',rate=first?.receiptRate||1;$('crAmount').value=first?.receiptTotal??R14.sum(rows);
 $('crAmount').parentNode.firstChild.textContent='إجمالي المقبوض بعملة السند';
 $('crClient').closest('.formgrid').insertAdjacentHTML('beforeend',`<label>عملة القبض<select id="crCurrency" class="field" onchange="r15ReceiptCurrencyChanged()">${r15CurrencyOptions(currency)}</select></label>${field('crRate','سعر صرف القبض إلى الجنيه',rate,'number','min="0.000001" step="0.000001" required oninput="r15RepriceReceipt()"')}`);
 $('crClient').onchange=()=>refreshReceiptAllocations();refreshReceiptAllocations(rows);
};
openReceipt=function(codeEnc,idEnc){
 if(idEnc){const row=data.clientReceipts.find(r=>r.id===decodeURIComponent(idEnc));if(!row)return alert('السند غير موجود');return editCustomerReceipt(r14Encode(row.batchId||row.id))}
 const p=codeEnc?getP(decodeURIComponent(codeEnc)):null;openCustomerReceipt(p?r14Encode(p.client||''):'');
 if(p){const input=[...document.querySelectorAll('.receipt-allocation')].find(i=>i.dataset.code===p.code);if(input){input.closest('tr').classList.add('r15-selected-project');input.focus()}const note=document.createElement('p');note.className='notice';note.textContent='تسجيل تحصيل للمشروع '+p.code+' — '+p.name;$('crAllocations').before(note)}
};
function r15RepriceReceipt(){document.querySelectorAll('.r15-receipt-cash').forEach(r17ReceiptCashChanged);checkAllocationTotal()}
function r15ReceiptCurrencyChanged(){if(val('crCurrency')==='EGP')$('crRate').value=1;refreshReceiptAllocations([])}
refreshReceiptAllocations=function(existing=[]){
 const name=val('crClient'),currency=$('crCurrency')?val('crCurrency'):'EGP',rate=$('crRate')?Number(val('crRate')):1,ps=customerProjects(name);
 $('crAllocations').innerHTML=`<p class="notice">اكتب فقط الجزء المخصص من السند بعملة القبض. يحسب البرنامج تلقائيًا ما يقابله بعملة عقد المشروع، ويعرض فرق الصرف منفصلًا.</p><div class="tablewrap"><table><tr><th>المشروع</th><th>متبقي العقد</th><th>المبلغ من السند (${esc(currency)}) — اكتب هنا</th><th>المسدد من العقد — محسوب تلقائيًا</th></tr>${ps.map(p=>{const old=existing.find(r=>r.code===p.code),native=old?.projectAmount??(old?R14.unfx(old.amount,R14.projectRate(p)):0),same=R14.projectCurrency(p)===currency,cash=old?.incomingCurrency===currency?old.receiptOriginal:(same?native:R14.unfx(R14.fx(native,R14.projectRate(p)),rate||1)),remaining=R14.sum([{amount:R14.projectOriginalTotal(p)},{amount:-R14.receivedOriginal(data,p)},{amount:native}]);return `<tr><td>${esc(p.code)} — ${esc(p.name)}</td><td>${r14Due(remaining)} ${esc(R14.projectCurrency(p))}</td><td><div class="r20-cash-allocation"><input aria-label="المبلغ المخصص من السند" class="field r15-receipt-cash" data-code="${esc(p.code)}" type="number" min="0" step="0.01" value="${cash||''}" data-manual="true" oninput="r17ReceiptCashChanged(this)"><button type="button" class="btn" onclick="r17AllocateReceiptRemainder(this)">استخدام باقي السند</button></div></td><td><label>${esc(R14.projectCurrency(p))}<input aria-label="المسدد من العقد" class="field receipt-allocation" data-code="${esc(p.code)}" type="number" min="0" step="0.01" value="${native||''}" readonly></label></td></tr>`}).join('')}</table></div>`;checkAllocationTotal();
};
function r15AllocationChanged(input){
 const p=getP(input.dataset.code),row=input.closest('tr'),cash=row.querySelector('.r15-receipt-cash'),currency=$('crCurrency')?val('crCurrency'):'EGP',rate=$('crRate')?Number(val('crRate')):1;
 try{
  if(R14.projectCurrency(p)===currency)cash.value=input.value;
  else if(cash.dataset.manual!=='true'){
   let suggested=R14.unfx(R14.fx(input.value||0,R14.projectRate(p)),rate||1);
   const other=R14.sum([...document.querySelectorAll('.r15-receipt-cash')].filter(x=>x!==cash),x=>x.value||0),available=R14.delta(val('crAmount')||0,other);
   // Native currency is rounded to a cent. Never increase actual cash for a rounding-only excess.
   const tolerance=Math.max(1,Math.ceil(R14.projectRate(p)/(rate||1)/2));
   if(available>0&&suggested>available&&R14.cents(suggested)-R14.cents(available)<=tolerance)suggested=available;
   cash.value=suggested;
  }
 }catch{}checkAllocationTotal()
}
function r17ReceiptCashChanged(input){
 try{const p=getP(input.dataset.code),native=input.closest('tr').querySelector('.receipt-allocation'),currency=val('crCurrency'),rate=R14.rate(val('crRate'));
  input.dataset.manual='true';native.value=R14.projectCurrency(p)===currency?input.value:R14.unfx(R14.fx(input.value||0,rate),R14.projectRate(p));
 }catch{}checkAllocationTotal()
}
function r17AllocateReceiptRemainder(button){
 try{const input=button.closest('tr').querySelector('.r15-receipt-cash'),other=R14.sum([...document.querySelectorAll('.r15-receipt-cash')].filter(x=>x!==input),x=>x.value||0),rest=R14.delta(val('crAmount')||0,other);if(rest<=0)throw Error('أدخل إجمالي السند وتأكد أن لديه مبلغًا متاحًا للتوزيع');input.value=rest;r17ReceiptCashChanged(input)}catch(e){alert(e.message)}
}
function r15AllocationRead(raw=false){return [...document.querySelectorAll('.receipt-allocation')].map(x=>({code:x.dataset.code,projectAmount:raw?x.value:R14.amount(x.value||'0'),receiptOriginal:raw?x.closest('tr').querySelector('.r15-receipt-cash').value:R14.amount(x.closest('tr').querySelector('.r15-receipt-cash').value||'0')}))}
checkAllocationTotal=function(){const el=$('crCheck');if(!el)return;try{if($('crCurrency')){$('crRate').disabled=val('crCurrency')==='EGP';if($('crRate').disabled)$('crRate').value=1}const currency=$('crCurrency')?val('crCurrency'):'EGP',rate=$('crRate')?R14.rate(val('crRate')):1,rows=r15AllocationRead(),total=R14.amount(val('crAmount')||'0'),allocated=R14.sum(rows,'receiptOriginal'),book=R14.sum(rows,r=>R14.fx(r.projectAmount,R14.projectRate(getP(r.code)))),cash=R14.fx(allocated,rate);el.textContent=`السند: ${fmt(total)} ${currency} | المخصص: ${fmt(allocated)} | غير موزع: ${fmt(R14.delta(total,allocated))} ${currency} | المقابل الفعلي: ${money(R14.fx(total,rate))} | فرق صرف / تقريب المخصص: ${money(R14.delta(cash,book))}`;el.style.color=allocated>total?'#c62828':'#087f46'}catch(e){el.textContent=e.message;el.style.color='#c62828'}};
saveCustomerReceipt=function(e){e.preventDefault();try{
 r14ProofReady(e.target);const client=val('crClient'),batchId=activeReceiptEdit||r14Id('RC'),total=r14InputMoney('crAmount',{positive:true}),currency=val('crCurrency'),exchangeRate=R14.rate(val('crRate')),allocations=r15AllocationRead(),old=data.clientReceipts.filter(r=>(r.batchId||r.id)===batchId);
 if(!clientNames().includes(client))throw Error('اختر العميل');
 if(allocations.some(a=>{const p=getP(a.code);return a.projectAmount>R14.sum([{amount:R14.projectOriginalTotal(p)},{amount:-R14.receivedOriginal(data,p)},...old.filter(r=>r.code===p.code).map(r=>({amount:r.projectAmount??R14.unfx(r.amount,R14.projectRate(p))}))])})&&!confirm('السداد يتجاوز رصيد عقد وسيظهر رصيد دائن. متابعة؟'))return;
 const next=R14.foreignReceiptEdit(data,{batchId,client,date:r14RequireDate('crDate'),total,currency,exchangeRate,allocations,method:val('crMethod'),ref:val('crRef'),note:val('crNote'),id:()=>r14Id('R')});for(const row of next.clientReceipts.filter(r=>(r.batchId||r.id)===batchId))row.rateQuote=r19ReadRateMeta('crRate',currency,exchangeRate);r14AttachTo(next,e.target,'receipt',batchId);
 if(r14Persist(next,old.length?'تعديل سند قبض':'إضافة سند قبض',{batchId,total,currency,exchangeRate})){activeReceiptEdit=null;r14Done('حُفظ القبض وسداد العقود وفرق الصرف')}
 }catch(e){alert(e.message)}};
// Deleting a designer payment preserves its proof and reversal record.
function r15PaymentActions(){for(const b of document.querySelectorAll('#content button[onclick^="openPayment(null,null,"]')){if(b.parentNode.querySelector('.r15-delete-payment'))continue;const m=b.getAttribute('onclick').match(/openPayment\(null,null,'([^']*)'\)/);if(m)b.insertAdjacentHTML('afterend',`<button class="link r15-delete-payment" style="color:#c62828" onclick="r15DeletePayment('${m[1]}')">حذف الدفعة</button>`)}}
function r15DeletePayment(enc){const p=data.payments.find(p=>p.id===decodeURIComponent(enc));if(!p)return;modal('حذف دفعة مصمم',`<form onsubmit="r15ConfirmDelete(event,'${enc}')"><p>المصمم: <b>${esc(p.designer)}</b> · المشروع: ${esc(p.code)}</p><p>${esc(p.date)} · مبلغ الدفعة: ${r14Paid(p.amount,true)}</p><p>ستُستبعد هذه الدفعة من المدفوع، ويزيد المتبقي بمقدار ${money(p.amount)}. يمكن استعادتها من سجل المحذوفات.</p>${field('r15DeleteReason','سبب الحذف','','text','required')}<div class="modalfoot"><button type="submit" class="btn danger">تأكيد حذف الدفعة</button><button type="button" class="btn" onclick="closeModal()">إلغاء</button></div></form>`)}
function r15ConfirmDelete(e,enc){e.preventDefault();const id=decodeURIComponent(enc),reason=val('r15DeleteReason');if(!reason)return alert('اكتب سبب الحذف');if(r14Change('حذف دفعة مصمم',d=>{const p=d.payments.find(x=>x.id===id);if(!p)throw Error('الدفعة غير موجودة');d.deletedPayments.push({payment:p,reason,deletedAt:new Date().toISOString()});d.payments=d.payments.filter(p=>p.id!==id)},{id,reason}))r14Done('تم حذف الدفعة وتحديث الأرصدة؛ يمكن استعادتها')}
function r15DeletedPayments(){modal('دفعات المصممين المحذوفة',`<div class="tablewrap"><table><tr><th>المصمم / المشروع</th><th>التاريخ</th><th>القيمة</th><th>سبب الحذف</th><th>إجراء</th></tr>${data.deletedPayments.map(x=>`<tr><td>${esc(x.payment.designer)} / ${esc(x.payment.code)}</td><td>${esc(x.payment.date)}</td><td>${fmt(x.payment.amount)}</td><td>${esc(x.reason)}</td><td><button class="link" onclick="r15RestorePayment('${r14Encode(x.payment.id)}')">استعادة الدفعة</button>${r14ProofFile('payment',x.payment.id)?r14ProofAction('payment',x.payment.id):''}</td></tr>`).join('')||'<tr><td colspan="5">لا توجد دفعات محذوفة</td></tr>'}</table></div>`)}
function r15RestorePayment(enc){const id=decodeURIComponent(enc);if(r14Change('استعادة دفعة مصمم',d=>{const x=d.deletedPayments.find(x=>x.payment.id===id);if(!x||d.payments.some(p=>p.id===id))throw Error('الدفعة موجودة أو غير قابلة للاستعادة');d.payments.push(x.payment);d.deletedPayments=d.deletedPayments.filter(x=>x.payment.id!==id)},{id}))r14Done('تمت استعادة الدفعة والمستند المرتبط بها')}
const r15ProofTarget=r14ProofTarget;
r14ProofTarget=function(kind,id){return r15ProofTarget(kind,id)||(kind==='payment'?data.deletedPayments.find(x=>x.payment.id===id)?.payment:null)};
const r15BaseRender=render;
render=function(){r15BaseRender();r15PaymentActions();if(page==='payments')$('content').insertAdjacentHTML('afterbegin',`<div class="actions" style="margin-bottom:16px"><button class="btn" onclick="r15DeletedPayments()">دفعات محذوفة (${data.deletedPayments.length})</button></div>`)};
