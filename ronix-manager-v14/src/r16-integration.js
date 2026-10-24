/* Retain the existing screens, with every linked balance sourced from R16. */
customerTotals=function(name){return R16.client(data,name)};
ccAmounts=function(code){if(!getP(code))return null;const a=R16.project(data,code);return {
 contract:a.contract,receipts:a.received,receiptCash:a.cash,fxDifference:a.fx,committed:a.designers.fees,
 designerCash:a.designers.paid,designerDue:a.designers.due,designerCredit:a.designers.credit,
 extra:a.expenses,verified:a.claims,matched:a.matched,claimDue:a.claimDue,unmatched:a.unmatched,
 contractRemaining:a.contractBalance,projectedProfit:a.profit,operatingCash:a.operatingCash,projectCosts:a.cost
}};
function r16LinkPanel(a){return `<div class="panel r16-links"><h3>ربط التحصيل بالمطالبات</h3><div class="v5-metrics">${v5Metric('قيمة المطالبات',a.claims,'صادرة ومعتمدة فقط')}${v5Metric('مسدد بمطابقة السندات',a.matched,'من التحصيل المسجل؛ دون قبض جديد','good')}${v5Metric('إجمالي المطلوب سداده',a.claimDue,'متبقي المطالبات، مستقل عن باقي العقد','bad')}${v5Metric('قبض لم يربط بمطالبة',a.unmatched,'قد يكون مقدمة أو يحتاج اختيار المطالبة')}</div><p class="hint">يُربط التحصيل تلقائيًا عند وجود مطالبة واحدة متاحة للمشروع والعميل. إذا تعددت المطالبات، اختر «مطابقة». الربط لا يغيّر قيمة العقد أو السند.</p></div>`}
function r16DesignerPanel(code='',name=''){const a=R16.designer(data,code,name);return `<div class="panel r16-designer-balance"><h3>مستحقات المصممين والدفعات الزائدة</h3><div class="v5-metrics">${v5Metric('مستحق للمصممين',a.due,'مجموع الأرصدة الموجبة لكل تكليف','bad')}${v5Metric('دفعات تزيد على الأتعاب',a.credit,'رصيد منفصل للمراجعة؛ لم يخصم من مشاريع أخرى','good')}${v5Metric('صافي رصيد الأتعاب',a.net,'المستحق ناقص الدفعات الزائدة')}</div>${a.rows.filter(x=>x.credit>0).map(x=>`<p>${esc(x.code)} · ${esc(x.designer)}: الأتعاب ${money(x.fee)}، المدفوع ${r14Paid(x.paid,true)}، الزيادة ${r14Paid(x.credit,true)}.</p>`).join('')}</div>`}
const r16ProjectPanel=clientProjectPanel;
clientProjectPanel=function(p){return r16ProjectPanel(p)+r16LinkPanel(R16.project(data,p.code))};
const r16ClientCash=r14ClientCashPanel;
r14ClientCashPanel=function(name){return r16ClientCash(name)+r16LinkPanel(R16.client(data,name))};
const r16RenderDesigner=renderDesigner;
renderDesigner=function(){r16RenderDesigner();$('content').insertAdjacentHTML('beforeend',r16DesignerPanel('',designerFocus))};
const r16CostCenter=showCostCenter;
showCostCenter=function(enc){r16CostCenter(enc);const code=decodeURIComponent(enc);if(getP(code))$('ccDetail').insertAdjacentHTML('beforeend',r16LinkPanel(R16.project(data,code))+r16DesignerPanel(code))};
const r16Dashboard=ccDashboard;
ccDashboard=function(){const cs=data.claims.filter(R14.active),claims=R14.sum(cs,'total'),matched=R14.sum(data.claimSettlements),received=R14.sum(data.clientReceipts.filter(r=>r.code));return r16Dashboard()+r16LinkPanel({claims,matched,claimDue:R14.delta(claims,matched),unmatched:R14.delta(received,matched)})+r16DesignerPanel()};
const r16Match=r14Match;
r14Match=function(enc){r16Match(enc);const c=data.claims.find(c=>c.id===decodeURIComponent(enc));if(!c||!R14.active(c))return;$('modalBody').insertAdjacentHTML('afterbegin',`<p class="notice">طريقة الربط: ${c.matchMode==='manual'?'يدوية — تحفظ اختياراتك دون إعادة توزيع تلقائي':'تلقائية عند وضوح المطالبة'}. حفظ الجدول أدناه يعتمد اختيارك اليدوي.</p>`);$('modalBody').querySelector('.modalfoot')?.insertAdjacentHTML('beforeend',`<button type="button" class="btn" onclick="r16AutomaticMatch('${enc}')">تفعيل الربط التلقائي</button>`)};
function r16AutomaticMatch(enc){const id=decodeURIComponent(enc);if(r14Change('تفعيل ربط مطالبة تلقائي',d=>{const c=d.claims.find(c=>c.id===id);if(!c)throw Error('المطالبة غير موجودة');c.matchMode='auto';d.claimSettlements=d.claimSettlements.filter(s=>s.claimId!==id)},{claimId:id}))r14Done('تم تحديث الربط؛ راجع المتبقي')}
const r16ClaimList=claimList;
claimList=function(){return r16ClaimList().replace('طابق السندات مع المطالبات قبل اعتماد المتأخرات. المطابقة تخص مبلغ كل مشروع على حدة.','الربط التلقائي يحدّث المطالبات الواضحة مع كل حفظ. عند تعدد المطالبات أو الرغبة في تغيير التوزيع، استخدم «مطابقة».')};
const r16ProjectTabs=r15ProjectFinancialTabs;
r15ProjectFinancialTabs=function(ps){return [...r16ProjectTabs(ps),['الربط المحاسبي',[['المشروع','العقد','سداد العقد','متبقي العقد','المطالبات','مسدد المطالبات','متبقي المطالبات','قبض غير مطابق','مستحق المصممين','دفعات زائدة للمصممين','تكلفة والتزامات','هامش تقديري','قبض فعلي','صافي حركة نقدية'],...ps.map(p=>{const a=R16.project(data,p.code);return[p.code,a.contract,a.received,a.contractBalance,a.claims,a.matched,a.claimDue,a.unmatched,a.designers.due,a.designers.credit,a.cost,a.profit,a.cash,a.operatingCash]})]]]};
const r16ExportDesigner=r15ExportDesigner;
r15ExportDesigner=function(enc){const original=exportTabs,a=R16.designer(data,'',decodeURIComponent(enc));try{exportTabs=(tabs,name)=>original([...tabs,['أرصدة مستقلة',[['المشروع','المصمم','الأتعاب','المدفوع','المستحق','الدفعات الزائدة','صافي الرصيد'],...a.rows.map(x=>[x.code,x.designer,x.fee,x.paid,x.due,x.credit,x.net])]]],name);r16ExportDesigner(enc)}finally{exportTabs=original}};
v8Review=function(){const issues=v8Audit(),notes=R16.review(data);modal('فحص الربط الحسابي والصور',`<div class="notice">${issues.length?'أخطاء اتساق: '+issues.length:'فحص اتساق الحسابات ناجح'} · ملاحظات متابعة: ${notes.length}</div>${issues.map(t=>`<p>${esc(t)}</p>`).join('')}<div class="tablewrap"><table><tr><th>المشروع</th><th>الملاحظة</th><th>المبلغ</th></tr>${notes.map(n=>`<tr><td>${esc(n.code)}</td><td>${esc(n.text)}${n.designer?' · '+esc(n.designer):''}</td><td>${n.amount==null?'—':fmt(n.amount)}</td></tr>`).join('')||'<tr><td colspan="3">لا توجد ملاحظات متابعة.</td></tr>'}</table></div><p>تظهر الأرصدة الزائدة والبيانات الناقصة للمراجعة؛ لا تُعدّل قيم السندات أو الأسماء تلقائيًا.</p><div class="modalfoot"><button class="btn" onclick="r16PhotoHelp()">استعادة صور المشاريع</button><button class="btn primary" onclick="backup()">نسخة احتياطية</button></div>`)};v8Btn.onclick=v8Review;
const r16PreviewImport=r14PreviewImport;
r14PreviewImport=function(value,name){const linked=R16.reconcile(value);r16PreviewImport(linked.data,name);r14PendingImport.auditTrail.push(...linked.changes.map(x=>({id:r14Id('AUD'),...x})));const amount=R14.sum(linked.data.claimSettlements),missing=R16.review(linked.data).filter(x=>x.type==='photo').length;$('modalBody').insertAdjacentHTML('afterbegin',`<p class="notice">المسدد المرتبط بالمطالبات: ${money(amount)}. روجعت روابط المطالبات دون تغيير مبالغ التحصيل. ${missing?`${missing} صورة تحتاج استعادتها من ZIP الأصلي عبر زر «استعادة صور المشاريع» بعد الاستيراد.`:'صور المشاريع المخزنة مضمنة في البيانات.'}</p>`)};
function r16RefreshLinks(){if(r14Change('تحديث الروابط الحسابية',()=>{}))r14Done('تم تحديث الروابط الحسابية')}
r15Changes=function(){modal('تحديث الربط الحسابي · V16',`<ol><li>ربط التحصيل والمطالبات تلقائيًا عند وضوح المطالبة، مع اختيار يدوي للحالات المتعددة.</li><li>حساب موحد للعميل والمشروع ومركز التكلفة والتقارير؛ تعديل السند يحدث الربط التلقائي دون تكرار القبض.</li><li>فصل مستحقات المصممين عن الدفعات التي تتجاوز الأتعاب، مع بقاء المستندات وسجل الحذف.</li><li>استعادة صور المشاريع من ZIP الأصلي دون استبدال الحسابات، وتضمين الصور في JSON.</li><li>فحص واضح للأرصدة والروابط والصور والبيانات الناقصة.</li></ol><p>الواجهات الأساسية محفوظة، والتحويل إلى تطبيق مستقل يبقى لمرحلة لاحقة.</p><button class="btn primary" onclick="r16RefreshLinks()">تحديث الروابط الحالية</button>`)};
r15Help.textContent='✓ ما الجديد · V16';r15Help.onclick=r15Changes;
document.title='RONIX V16 | الحسابات المترابطة';
document.querySelector('.sublogo').textContent='PROJECT FINANCE · V16';
document.querySelector('.sidebar-footer').innerHTML='RONIX V16 · جنيه مصري<br>حفظ محلي على هذا الجهاز والمتصفح';
document.querySelector('.footer').textContent='RONIX V16 · احتفظ بنسخة احتياطية بعد جلسة العمل';
// Loading V15 is read-only. Upgrade its links on the first save or explicit refresh.
render();
