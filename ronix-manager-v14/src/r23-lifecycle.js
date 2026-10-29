/* Unified, reversible lifecycle actions for financial and directory records. */
const R23_KIND_LABELS={
 project:'مشروع',assignment:'تكليف مصمم',designer:'مصمم',payment:'دفعة مصمم',
 claim:'مطالبة عميل',receipt:'سند قبض عميل',advance:'دفعة مقدمة',expense:'مصروف مشروع',
 opening:'رصيد افتتاحي',customer:'عميل',photo:'صورة مشروع'
};
function r23Decode(value){try{return decodeURIComponent(value||'')}catch{return String(value||'')}}
function r23Target(kind,targetId='',code='',name=''){
 const id=r23Decode(targetId),projectCode=r23Decode(code),person=r23Decode(name);
 if(kind==='claim')return data.claims.find(x=>x.id===id);
 if(kind==='receipt')return data.clientReceipts.filter(x=>(x.batchId||x.id)===id);
 if(kind==='advance')return data.advances.find(x=>x.id===id);
 if(kind==='expense')return data.projectExpenses.find(x=>x.id===id);
 if(kind==='opening')return data.openingBalances.find(x=>R14.normName(x.client)===R14.normName(id||person));
 if(kind==='customer')return data.customers.find(x=>x.id===id);
 if(kind==='photo')return getP(projectCode)?.photos?.find(x=>x.id===id);
 return null;
}
function r23Impact(kind,targetId='',code='',name=''){
 const target=r23Target(kind,targetId,code,name),id=r23Decode(targetId),projectCode=r23Decode(code);
 if(kind==='claim'&&target){const paid=R14.settled(data,target.id);return {title:`${r19Doc('claim',target.id)} — ${R14.claimClient(data,target)}`,lines:[`قيمة المطالبة: ${money(target.total)}`,`مطابق مع سندات: ${money(paid)}`,`سيُفك الربط فقط، ولن يُحذف أي قبض فعلي.`]}}
 if(kind==='receipt'&&target?.length){const first=target[0],cash=first.sourceAdvanceId?0:R14.sum(target,x=>R14.cashReceipt(x)),allocated=R14.sum(target),matched=R14.sum(data.claimSettlements.filter(s=>target.some(r=>r.id===s.receiptId)));return {title:`${r19Ref('receipt',id,first.ref)} — ${R14.receiptClient(data,first)}`,lines:[first.sourceAdvanceId?`توزيع مقدمة سيُعكس: ${money(allocated)}`:`القبض الفعلي الذي سيُستبعد: ${money(cash)}`,`الموزع على المشاريع: ${money(allocated)}`,`مطابق مع مطالبات: ${money(matched)}`,`سيُحذف السند كاملًا بكل صفوف توزيعه، ويُحفظ مستنده في السلة.`]}}
 if(kind==='advance'&&target){return {title:`${r19Ref('advance',target.id,target.ref)} — ${target.client}`,lines:[`قيمة المقدمة: ${money(target.total)}`,`الموزع منها: ${money(target.allocated||0)}`,`ستُنقل المقدمة وتوزيعاتها ومستندها معًا إلى السلة.`]}}
 if(kind==='expense'&&target)return {title:`${target.category} — ${target.code}`,lines:[`قيمة المصروف: ${money(target.amount)}`,`سيُعاد احتساب تكلفة المشروع والهامش والحركة النقدية فورًا.`]};
 if(kind==='opening'&&target)return {title:`رصيد افتتاحي — ${target.client}`,lines:[`القيمة المرجعية: ${money(target.amount)}`,`لا يؤثر حذفه في القبض الفعلي أو عقود المشاريع.`]};
 if(kind==='customer'&&target){const refs=customerProjects(target.name).length+data.claims.filter(c=>R14.claimClient(data,c)===target.name).length+data.clientReceipts.filter(r=>R14.receiptClient(data,r)===target.name).length+data.advances.filter(a=>R14.normName(a.client)===target.name).length;return {title:target.name,lines:[refs?`للعميل ${refs} سجل/مشروع مرتبط؛ سيُؤرشف ويُخفى من القوائم الجديدة مع بقاء حساباته.`:'العميل بلا حسابات مرتبطة؛ سينتقل إلى سلة المحذوفات.',`لن تتغير أي مبالغ تخص عملاء آخرين.`]}}
 if(kind==='photo'&&target)return {title:`صورة مشروع ${projectCode}`,lines:['ستُزال الصورة من بطاقة المشروع وتبقى محفوظة في السلة للاستعادة.']};
 return {title:R23_KIND_LABELS[kind]||'السجل',lines:['سيُنقل السجل إلى سلة المحذوفات، ويمكن استعادته لاحقًا.']};
}
function r23Delete(kind,targetId='',code='',name='',fromArchive=false){
 [kind,targetId,code,name]=[kind,targetId,code,name].map(r23Decode);fromArchive=fromArchive===true||fromArchive==='1';const info=r23Impact(kind,targetId,code,name),encoded=[kind,targetId,code,name].map(x=>r14Encode(x||''));
 if(fromArchive)info.lines=[...info.lines,'سيُنقل السجل المؤرشف إلى المحذوفات، ويمكن استعادته بحالته المؤرشفة.'];
 modal(fromArchive?'حذف سجل مؤرشف':'حذف / أرشفة بشكل آمن',`<form class="r23-delete-form" onsubmit="r23ConfirmDelete(event,'${encoded[0]}','${encoded[1]}','${encoded[2]}','${encoded[3]}','${fromArchive?'1':'0'}')"><div class="r23-impact"><h3>${esc(info.title)}</h3><b>ما الذي سيتغير؟</b><ul>${info.lines.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>${field('r23DeleteReason',fromArchive?'سبب حذف السجل المؤرشف':'سبب الحذف / الأرشفة','','text','required minlength="3" placeholder="مثال: إدخال مكرر أو تصحيح سند"')}<p class="hint">العملية قابلة للاستعادة من «المحذوفات». أرقام المستندات وسجل التدقيق لا تُحذف.</p><div class="modalfoot"><button class="btn danger" type="submit">${fromArchive?'حذف من الأرشيف':'تأكيد ونقل إلى المحذوفات'}</button><button class="btn" type="button" onclick="r20RequestClose()">إلغاء</button></div></form>`)
}
function r23ConfirmDelete(e,kindEnc,targetEnc,codeEnc,nameEnc,fromArchive='0'){
 e.preventDefault();try{
  const kind=r23Decode(kindEnc),targetId=r23Decode(targetEnc),code=r23Decode(codeEnc),name=r23Decode(nameEnc),reason=val('r23DeleteReason').trim(),trashId=r14Id('TRASH');
  if(reason.length<3)throw Error('اكتب سببًا واضحًا للحذف');
  const deletingArchive=fromArchive==='1',result=R17Life.remove(data,{kind,targetId,code,name,reason,id:trashId,at:new Date().toISOString(),fromArchive:deletingArchive});
  if(r14Persist(result.data,result.archived?'أرشفة سجل مرتبط':deletingArchive?'حذف سجل مؤرشف إلى السلة':'حذف سجل إلى السلة',{kind,targetId,code,name,reason,trashId,fromArchive:deletingArchive})){
   projectFocus='';designerFocus='';r14Done(result.archived?'تمت الأرشفة مع حفظ الحسابات':deletingArchive?'حُذف السجل من الأرشيف ونُقل إلى المحذوفات':'نُقل السجل إلى المحذوفات ويمكن استعادته');
  }
 }catch(error){alert(error.message)}
}
function r23ArchivedLabel(kind,targetId='',code='',name=''){
 if(kind==='project'){const p=getP(code);return p?`${p.code} — ${p.name}`:code}if(kind==='assignment')return `${name} / ${code}`;if(kind==='designer')return name;
 if(kind==='customer')return data.customers.find(x=>x.id===targetId)?.name||'العميل';return R23_KIND_LABELS[kind]||'السجل';
}
function r23DeleteArchived(kind,targetId='',code='',name=''){
 [kind,targetId,code,name]=[kind,targetId,code,name].map(r23Decode);const blockers=R17Life.archiveBlockers(data,{kind,targetId,code,name}),label=r23ArchivedLabel(kind,targetId,code,name);
 if(blockers.length)return modal('لا يمكن حذف السجل الآن',`<div class="r23-impact"><h3>${esc(label)}</h3><p>هذا السجل مرتبط بحركات نشطة. احذف أو صحح الحركات التالية أولًا حتى لا تتغير حسابات مشروع أو عميل آخر:</p><ul>${blockers.map(x=>`<li>${esc(x.label)}: <b>${x.count}</b></li>`).join('')}</ul></div><p class="hint">دفعات المصممين المحذوفة سابقًا ليست عائقًا؛ ستنتقل تلقائيًا مع السجل ومستنداتها إلى سلة المحذوفات.</p><div class="modalfoot"><button class="btn" type="button" onclick="closeModal()">إغلاق</button></div>`);
 r23Delete(kind,targetId,code,name,true)
}
function r23ArchiveActions(kind,targetId='',code='',name='',unarchive=''){
 const args=[kind,targetId,code,name].map(x=>r14Encode(x||''));return `<div class="r23-row-actions r23-archive-actions">${unarchive}<button type="button" class="btn danger" onclick="r23DeleteArchived('${args[0]}','${args[1]}','${args[2]}','${args[3]}')">حذف</button></div>`
}
function r23RestoreRecord(enc){
 try{const id=r23Decode(enc),next=R17Life.restore(data,id);if(r14Persist(next,'استعادة سجل من المحذوفات',{trashId:id}))r14Done('تمت استعادة السجل وكل روابطه المحاسبية')}
 catch(error){alert(error.message)}
}
function r23UnarchiveCustomer(enc){
 const id=r23Decode(enc);if(r14Change('إلغاء أرشفة عميل',d=>{const c=d.customers.find(x=>x.id===id);if(!c)throw Error('العميل غير موجود');delete c.archivedAt;delete c.archiveReason},{customerId:id}))r14Done('عاد العميل إلى القوائم النشطة مع بقاء حساباته')
}
function r23TrashMeta(x){
 const payload=x.payload||x.records||{};
 if(x.kind==='project')return {label:x.projects?.map(p=>p.code+' — '+p.name).join('، ')||'مشروع',amount:R14.sum(x.projects||[],'contract')};
 if(x.kind==='assignment'||x.kind==='designer')return {label:x.assignments?.map(a=>a.designer+' / '+a.code).join('، ')||R23_KIND_LABELS[x.kind],amount:R14.sum(x.assignments||[],'fee')};
 if(x.kind==='claim'){const c=payload.claim||payload.record;return {label:c?`${c.id} — ${c.client||''}`:'مطالبة',amount:c?.total||0}}
 if(x.kind==='receipt'){const rows=payload.records||payload.receipts||payload.rows||[];return {label:rows[0]?`${rows[0].ref||rows[0].batchId||rows[0].id} — ${rows[0].client||''}`:'سند قبض',amount:R14.sum(rows,x=>R14.cashReceipt(x))}}
 if(x.kind==='advance'){const a=payload.advance||payload.record;return {label:a?`${a.ref||a.id} — ${a.client}`:'دفعة مقدمة',amount:a?.total||0}}
 if(x.kind==='expense'){const r=payload.expense||payload.record;return {label:r?`${r.category} — ${r.code}`:'مصروف',amount:r?.amount||0}}
 if(x.kind==='opening'){const r=payload.opening||payload.record;return {label:r?`رصيد افتتاحي — ${r.client}`:'رصيد افتتاحي',amount:r?.amount||0}}
 if(x.kind==='customer'){const r=payload.customer||payload.record;return {label:r?.name||'عميل',amount:0}}
 if(x.kind==='photo'){return {label:`صورة مشروع ${payload.projectCode||payload.code||x.code||''}`,amount:0}}
 return {label:R23_KIND_LABELS[x.kind]||x.kind,amount:0};
}
function r23RecycleRows(){
 const rows=data.trashRecords.map(x=>{const m=r23TrashMeta(x);return {type:x.kind,label:m.label,amount:m.amount,reason:x.reason,at:x.at,action:`<button class="btn" onclick="r23RestoreRecord('${r14Encode(x.id)}')">استعادة السجل</button>`}});
 for(const x of data.deletedPayments){rows.push({type:'payment',label:`${x.payment.designer} / ${x.payment.code}`,amount:x.payment.amount,reason:x.reason,at:x.deletedAt,action:`<button class="btn" onclick="r15RestorePayment('${r14Encode(x.payment.id)}')">استعادة</button>`})}
 for(const p of data.projects.filter(x=>x.archivedAt))rows.push({type:'project',label:`${p.code} — ${p.name}`,amount:p.contract,reason:p.archiveReason,at:p.archivedAt,action:r23ArchiveActions('project','',p.code,'',r17ArchiveButton('project',p.code))});
 for(const a of data.assignments.filter(x=>x.archivedAt))rows.push({type:'assignment',label:`${a.designer} / ${a.code}`,amount:a.fee,reason:a.archiveReason,at:a.archivedAt,action:r23ArchiveActions('assignment','',a.code,a.designer,r17ArchiveButton('assignment',a.code,a.designer))});
 for(const x of data.archivedDesigners)rows.push({type:'designer',label:x.name,amount:0,reason:x.reason,at:x.at,action:r23ArchiveActions('designer','','',x.name,r17ArchiveButton('designer','',x.name))});
 for(const c of data.customers.filter(x=>x.archivedAt))rows.push({type:'customer',label:c.name,amount:0,reason:c.archiveReason,at:c.archivedAt,action:r23ArchiveActions('customer',c.id,'','',`<button class="btn" onclick="r23UnarchiveCustomer('${r14Encode(c.id)}')">إلغاء الأرشفة</button>`)});
 return rows.sort((a,b)=>String(b.at||'').localeCompare(String(a.at||'')));
}
function r23RecycleTable(){
 const q=R14.normName($('r23TrashSearch')?.value).toLowerCase(),kind=$('r23TrashKind')?.value||'',rows=r23RecycleRows().filter(x=>(!kind||x.type===kind)&&(!q||(x.label+' '+x.reason).toLowerCase().includes(q)));
 return `<div class="r23-trash-grid">${rows.map(x=>`<article class="r23-trash-card"><div><span class="pill">${esc(R23_KIND_LABELS[x.type]||x.type)}</span><small>${esc(String(x.at||'').replace('T',' ').slice(0,16))}</small></div><h3>${esc(x.label)}</h3>${x.amount?`<strong>${money(x.amount)}</strong>`:''}<p>${esc(x.reason||'—')}</p><div class="actions">${x.action}</div></article>`).join('')||'<p class="empty">لا توجد سجلات مطابقة في المحذوفات أو الأرشيف.</p>'}</div>`
}
function r23FilterTrash(){$('r23TrashRows').innerHTML=r23RecycleTable()}
function r23TrashPage(){const rows=r23RecycleRows();return `<div class="panel"><div class="panel-title"><div><p class="eyebrow">RONIX · إدارة دورة حياة السجلات</p><h2>المحذوفات والأرشيف <span class="pill">${rows.length}</span></h2></div></div><p class="hint">الحذف يستبعد السجل من الحسابات النشطة ويحفظ نسخة كاملة للاستعادة. الأرشفة تخفي السجل المرتبط وتبقي تاريخه المالي.</p><div class="filters r23-trash-filters"><input id="r23TrashSearch" class="field" placeholder="ابحث بالاسم أو السبب" oninput="r23FilterTrash()"><select id="r23TrashKind" class="field" onchange="r23FilterTrash()"><option value="">كل الأنواع</option>${Object.entries(R23_KIND_LABELS).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div><div id="r23TrashRows">${r23RecycleTable()}</div></div>`}

// Claims: one explicit lifecycle action next to print, edit, and matching.
claimTable=function(cs){return `<div class="tablewrap r14-claims-table"><table><colgroup><col style="width:18%"><col style="width:12%"><col style="width:14%"><col style="width:10%"><col style="width:11%"><col style="width:11%"><col style="width:12%"><col style="width:12%"></colgroup><thead><tr><th>المطالبة / العميل</th><th>المشاريع</th><th>التاريخ / الاستحقاق</th><th>الحالة</th><th>القيمة</th><th class="r14-paid">المسدد</th><th class="r14-due">المطلوب سداده</th><th>إجراءات</th></tr></thead><tbody>${cs.map(c=>{const enc=r14Encode(c.id),paid=R14.settled(data,c.id),rest=R14.remaining(data,c),active=R14.active(c);return `<tr><td>${esc(r19Doc('claim',c.id))}<br>${esc(R14.claimClient(data,c))}</td><td>${esc(claimCodes(c).join('، '))}</td><td>${esc(c.date)}<br>${esc(c.due||'غير محدد')}</td><td>${esc(R14.status(c))}${active?'<br>'+(!rest?'مسددة':paid?'مسددة جزئيًا':'غير مسددة'):''}</td><td>${fmt(c.total)}</td><td>${r14Paid(paid)}</td><td>${active?r14Due(rest):'—'}</td><td><div class="r23-row-actions"><button class="link" onclick="printClaim('${enc}')">طباعة</button><button class="link" onclick="openClaim(null,'${enc}')">تعديل</button>${active?`<button class="link" onclick="r14Match('${enc}')">مطابقة</button>`:''}<button class="link danger-link" onclick="r23Delete('claim','${enc}')">حذف</button></div></td></tr>`}).join('')||'<tr><td colspan="8">لا توجد مطالبات</td></tr>'}</tbody></table></div>`};

// A receipt is always presented and removed as one batch, never as allocation fragments.
receiptTable=function(rs){const groups=new Map();for(const row of rs){const id=row.batchId||row.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(row)}return `<div class="tablewrap"><table><thead><tr><th>السند / العميل</th><th>التاريخ</th><th>النوع والطريقة</th><th>التوزيع</th><th class="num">إجمالي السند</th><th>المستند</th><th>إجراءات</th></tr></thead><tbody>${[...groups.entries()].map(([id,rows])=>{const first=rows[0],advance=!!first.sourceAdvanceId,cash=advance?R14.sum(rows):R14.sum(rows,x=>R14.cashReceipt(x)),proof=r14ReceiptProofKey(first),alloc=rows.filter(x=>x.code).map(x=>`${x.code}: ${fmt(x.amount)}`).join(' · '),enc=r14Encode(id);return `<tr><td><b>${esc(r19Ref('receipt',id,first.ref))}</b><br><small>${esc(R14.receiptClient(data,first))}</small></td><td>${esc(first.date)}</td><td>${advance?'توزيع مقدمة':esc(first.method||'—')}</td><td>${esc(alloc||'غير موزع')}</td><td class="num">${advance?fmt(cash):r14Paid(cash)}</td><td>${r14ProofAction('receipt',proof)}</td><td><div class="r23-row-actions">${advance?'':`<button class="link" onclick="editCustomerReceipt('${enc}')">تعديل</button>`}<button class="link danger-link" onclick="r23Delete('receipt','${enc}')">${advance?'عكس التوزيع':'حذف'}</button></div></td></tr>`}).join('')||'<tr><td colspan="7">لا توجد سندات قبض</td></tr>'}</tbody></table></div>`};

const r23ShowCostCenter=showCostCenter;
showCostCenter=function(enc){r23ShowCostCenter(enc);for(const button of document.querySelectorAll('#ccDetail button[onclick^="editProjectExpense("]')){if(button.parentElement.querySelector('.r23-expense-delete'))continue;const match=button.getAttribute('onclick').match(/editProjectExpense\('([^']+)'\)/);if(match)button.insertAdjacentHTML('afterend',`<button class="link danger-link r23-expense-delete" onclick="r23Delete('expense','${match[1]}')">حذف</button>`)}}
const r23OpenAdvancedClient=openAdvancedClient;
openAdvancedClient=function(enc){r23OpenAdvancedClient(enc);const name=r23Decode(enc),adv=clientAdvances(name),rows=[...document.querySelectorAll('#advancedDetail tbody')][0]?.querySelectorAll('tr')||[];adv.forEach((a,i)=>{const cell=rows[i]?.lastElementChild;if(cell)cell.insertAdjacentHTML('beforeend',` <button class="link danger-link" onclick="r23Delete('advance','${r14Encode(a.id)}')">حذف المقدمة</button>`)});const opening=data.openingBalances.find(x=>R14.normName(x.client)===R14.normName(name));if(opening){const hint=$('advancedDetail').querySelector('.hint');hint?.insertAdjacentHTML('beforeend',` <button class="link danger-link" onclick="r23Delete('opening','${r14Encode(name)}')">حذف الافتتاحي</button>`)}}

// Customer directory includes archive/delete and an archived filter.
r18CustomerRows=function(search=$('r18CustomerSearch')?.value||''){
 const query=R18Clients.key(search),includeArchived=$('r23ArchivedCustomers')?.checked;
 const rows=data.customers.filter(c=>(includeArchived||!c.archivedAt)&&R18Clients.key([c.name,c.phone,c.email].join(' ')).includes(query)).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
 return `<div class="tablewrap"><table><thead><tr><th>العميل</th><th>الهاتف</th><th>المشاريع</th><th>قيمة العقود</th><th>القبض الفعلي</th><th>متبقي العقود</th><th>إجراءات</th></tr></thead><tbody>${rows.map(c=>{const t=customerTotals(c.name),id=r14Encode(c.id),name=r14Encode(c.name);return `<tr><td><b>${esc(c.name)}</b>${c.archivedAt?'<br><span class="pill">مؤرشف</span>':''}${c.email?'<br><small>'+esc(c.email)+'</small>':''}</td><td>${esc(c.phone||'—')}</td><td>${customerProjects(c.name).length}</td><td>${fmt(t.contracts)}</td><td>${r14Paid(t.cash)}</td><td>${r14Due(t.contractBalance)}</td><td><div class="r23-row-actions">${c.archivedAt?`<button class="link" onclick="r23UnarchiveCustomer('${id}')">إلغاء الأرشفة</button>`:`<button class="link" onclick="selectClient('${name}')">كشف الحساب</button><button class="link" onclick="r18EditCustomer('${id}')">تعديل</button><button class="link" onclick="r18ProjectForCustomer('${name}')">+ مشروع</button><button class="link" onclick="openCustomerReceipt('${name}')">+ تحصيل</button><button class="link danger-link" onclick="r23Delete('customer','${id}')">حذف / أرشفة</button>`}</div></td></tr>`}).join('')||'<tr><td colspan="7" class="empty">لا توجد نتائج. يمكنك إضافة عميل جديد.</td></tr>'}</tbody></table></div>`;
};
r18CustomerDirectory=function(){return `<div class="panel"><div class="panel-title"><h2>قائمة العملاء <span class="pill">${data.customers.filter(x=>!x.archivedAt).length}</span></h2><div class="actions"><button class="btn primary" onclick="r18EditCustomer()">+ عميل جديد</button><button class="btn" onclick="r18ExportCustomers()">Excel العملاء</button><button class="btn" onclick="r17Trash()">المحذوفات</button></div></div><p class="hint">أضف العميل مرة واحدة، ثم اختره عند إنشاء المشروع أو تسجيل التحصيل. العميل المرتبط يُؤرشف بدل إتلاف حساباته.</p><div class="filters"><input id="r18CustomerSearch" class="field" aria-label="بحث العملاء" placeholder="ابحث باسم العميل أو الهاتف أو البريد" oninput="r18FilterCustomers()"><label><input id="r23ArchivedCustomers" type="checkbox" onchange="r18FilterCustomers()"> إظهار العملاء المؤرشفين</label></div><div id="r18CustomerRows">${r18CustomerRows('')}</div></div>`};

// Project photos use the same reversible trash instead of permanent removal.
removePhoto=function(encoded,id){const code=r23Decode(encoded),p=getP(code);if(!p||!p.photos?.some(x=>x.id===id))return;r23Delete('photo',id,code)};

// Customer statement actions stay reachable without navigating to another report.
r22ClientPaymentRows=function(model){const code=r22ClientProjectFilter,rows=model.payments.filter(x=>!code||x.allocations.some(a=>a.code===code));return rows.map(x=>`<tr><td><bdi>${esc(r19Ref(x.kind==='advance'?'advance':'receipt',x.id,x.ref))}</bdi>${x.kind==='advance'?'<br><small>دفعة مقدمة</small>':''}</td><td><bdi>${esc(x.date)}</bdi></td><td class="r14-paid"><bdi>${fmt(x.cash)}</bdi> ج.م</td><td><div class="r22-allocations">${r22AllocationChips(x,code)||'<span class="hint">لا يوجد توزيع مطابق</span>'}</div></td><td>${esc(x.method)}</td><td>${r14ProofAction('receipt',x.proofKey)}</td><td><div class="r23-row-actions">${x.kind==='receipt'?`<button class="link" onclick="editCustomerReceipt('${r14Encode(x.id)}')">تعديل</button>`:''}<button class="link danger-link" onclick="r23Delete('${x.kind}','${r14Encode(x.id)}')">حذف</button></div></td></tr>`).join('')||'<tr><td colspan="7" class="empty">لا توجد دفعات لهذا الاختيار.</td></tr>'};

titles.trash=['المحذوفات والأرشيف','استعادة السجلات ومراجعة أسباب الحذف والأثر المالي'];
const r23AllClientNames=clientNames;
clientNames=function(){const archived=new Set(data.customers.filter(c=>c.archivedAt).map(c=>R14.normName(c.name)));return r23AllClientNames().filter(name=>!archived.has(R14.normName(name)))};
const r23SaveProject=saveProject;
saveProject=function(e,original){const archived=data.customers.find(c=>c.archivedAt&&R14.normName(c.name)===R14.normName(val('pclient')));if(archived&&!original)return alert('هذا العميل مؤرشف. ألغِ أرشفته قبل إنشاء مشروع جديد.');return r23SaveProject(e,original)};
const r23SaveClaim=saveClaim;
saveClaim=function(e,id){const archived=data.customers.find(c=>c.archivedAt&&R14.normName(c.name)===R14.normName(val('claimClient')));if(archived&&!id)return alert('هذا العميل مؤرشف. ألغِ أرشفته قبل إنشاء مطالبة جديدة.');return r23SaveClaim(e,id)};
const r23TrashNav=document.createElement('button');r23TrashNav.className='nav';r23TrashNav.dataset.page='trash';r23TrashNav.innerHTML='<span>♲</span>المحذوفات';r23TrashNav.onclick=()=>go('trash');document.querySelector('.nav[data-page="reports"]').after(r23TrashNav);
r17Trash=function(){go('trash')};
const r23Render=render;
render=function(){if(page==='trash'&&!projectFocus&&!designerFocus){$('content').innerHTML=r23TrashPage();return}r23Render()};
render();
