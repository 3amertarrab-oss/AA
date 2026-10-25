/* Editable customer picker and a separate, persistent customer directory. */
clientNames=function(){return R18Clients.sourceNames(data)};
function r18CustomerOptions(showAll=false){
  const input=$('pclient'),list=$('r18ClientOptions');if(!input||!list)return;
  const query=showAll?'':R18Clients.key(input.value),names=clientNames().filter(n=>R18Clients.key(n).includes(query));
  list.replaceChildren();input._r18Active=-1;input.removeAttribute('aria-activedescendant');
  for(const [i,name] of names.entries()){
    const button=document.createElement('button');button.type='button';button.className='r18-client-option';button.id='r18-client-option-'+i;button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.textContent=name;
    button.onclick=()=>r18ChooseCustomer(name);list.append(button);
  }
  const typed=R18Clients.clean(input.value),similar=clientNames().some(n=>R18Clients.key(n)===R18Clients.key(typed));
  if(typed&&!similar){
    const button=document.createElement('button');button.type='button';button.className='r18-client-option r18-new-customer';button.id='r18-client-option-new';button.setAttribute('role','option');button.setAttribute('aria-selected','false');button.textContent='+ استخدام عميل جديد: '+typed;button.onclick=()=>r18ChooseCustomer(typed);list.append(button);
  }
  if(!list.childElementCount){const empty=document.createElement('p');empty.className='hint';empty.textContent='اكتب اسم العميل الجديد، وسيُضاف عند حفظ المشروع.';list.append(empty)}
  list.hidden=false;input.setAttribute('aria-expanded','true');r18CustomerHint();
}
function r18CloseCustomerOptions(){const input=$('pclient'),list=$('r18ClientOptions');if(list)list.hidden=true;if(input){input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');input._r18Active=-1}}
function r18CustomerHint(){const input=$('pclient'),hint=$('r18ClientHint');if(!input||!hint)return;const name=R18Clients.clean(input.value),exists=clientNames().some(n=>R18Clients.key(n)===R18Clients.key(name));hint.textContent=!name?'اختر من القائمة أو اكتب اسم عميل جديد.':exists?'العميل موجود في قائمة العملاء.':'سيُضاف هذا العميل إلى القائمة عند حفظ المشروع.'}
function r18ChooseCustomer(name){const input=$('pclient');input.value=name;input.focus();r18CloseCustomerOptions();r18CustomerHint()}
function r18CustomerKey(event){
  const input=event.currentTarget,list=$('r18ClientOptions');
  if(event.key==='Escape'&&list&&!list.hidden){event.preventDefault();event.stopPropagation();r18CloseCustomerOptions();return}
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();if(list.hidden)r18CustomerOptions(true);
    const options=[...list.querySelectorAll('[role=option]')];if(!options.length)return;
    const delta=event.key==='ArrowDown'?1:-1;input._r18Active=((input._r18Active??-1)+delta+options.length)%options.length;
    options.forEach((b,i)=>b.setAttribute('aria-selected',String(i===input._r18Active)));const active=options[input._r18Active];input.setAttribute('aria-activedescendant',active.id);active.scrollIntoView({block:'nearest'});
  }else if(event.key==='Enter'&&!list.hidden&&input._r18Active>=0){event.preventDefault();list.querySelectorAll('[role=option]')[input._r18Active]?.click()}
  else if(event.key==='Tab')r18CloseCustomerOptions();
}
function r18BindCustomerPicker(){
  const input=$('pclient');if(!input)return;
  const wrapper=document.createElement('div');wrapper.className='r18-client-picker';input.before(wrapper);wrapper.append(input);
  input.required=true;input.autocomplete='off';input.setAttribute('role','combobox');input.setAttribute('aria-label','العميل — اختر أو اكتب اسمًا جديدًا');input.setAttribute('aria-controls','r18ClientOptions');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-expanded','false');
  const toggle=document.createElement('button');toggle.type='button';toggle.className='btn r18-client-toggle';toggle.textContent='▾';toggle.setAttribute('aria-label','عرض قائمة العملاء');toggle.onclick=()=>{const open=!$('r18ClientOptions').hidden;if(open)r18CloseCustomerOptions();else r18CustomerOptions(true)};
  const list=document.createElement('div');list.id='r18ClientOptions';list.className='r18-client-options';list.hidden=true;list.setAttribute('role','listbox');list.setAttribute('aria-label','العملاء');wrapper.append(toggle,list);
  const hint=document.createElement('span');hint.id='r18ClientHint';hint.className='hint';hint.setAttribute('aria-live','polite');wrapper.after(hint);
  input.oninput=()=>r18CustomerOptions();input.onfocus=()=>r18CustomerOptions();input.onkeydown=r18CustomerKey;r18CustomerHint();
}
const r18EditProject=editProject;
editProject=function(enc){r18EditProject(enc);r18BindCustomerPicker()};
const r18SaveProject=saveProject;
saveProject=function(e,original){e.preventDefault();try{$('pclient').value=R18Clients.resolveName(data,val('pclient'));return r18SaveProject(e,original)}catch(error){alert(error.message)}};
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.r18-client-picker'))r18CloseCustomerOptions()});
// The form-level Escape guard runs in capture phase; close just this picker first.
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('r18ClientOptions')&&!$('r18ClientOptions').hidden){e.preventDefault();e.stopImmediatePropagation();r18CloseCustomerOptions()}},true);
function r18CustomerRows(search=$('r18CustomerSearch')?.value||''){
  const query=R18Clients.key(search);
  const rows=data.customers.filter(c=>R18Clients.key([c.name,c.phone,c.email].join(' ')).includes(query)).sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  return `<div class="tablewrap"><table><thead><tr><th>العميل</th><th>الهاتف</th><th>المشاريع</th><th>قيمة العقود</th><th>القبض الفعلي</th><th>متبقي العقود</th><th>إجراءات</th></tr></thead><tbody>${rows.map(c=>{const t=customerTotals(c.name),id=r14Encode(c.id),name=r14Encode(c.name);return `<tr><td><b>${esc(c.name)}</b>${c.email?'<br><small>'+esc(c.email)+'</small>':''}</td><td>${esc(c.phone||'—')}</td><td>${customerProjects(c.name).length}</td><td>${fmt(t.contracts)}</td><td>${r14Paid(t.cash)}</td><td>${r14Due(t.contractBalance)}</td><td><button class="link" onclick="selectClient('${name}')">كشف الحساب</button><button class="link" onclick="r18EditCustomer('${id}')">تعديل</button><button class="link" onclick="r18ProjectForCustomer('${name}')">+ مشروع</button><button class="link" onclick="openCustomerReceipt('${name}')">+ تحصيل</button></td></tr>`}).join('')||'<tr><td colspan="7" class="empty">لا توجد نتائج. يمكنك إضافة عميل جديد.</td></tr>'}</tbody></table></div>`;
}
function r18FilterCustomers(){$('r18CustomerRows').innerHTML=r18CustomerRows()}
function r18CustomerDirectory(){return `<div class="panel"><div class="panel-title"><h2>قائمة العملاء <span class="pill">${data.customers.length}</span></h2><div class="actions"><button class="btn primary" onclick="r18EditCustomer()">+ عميل جديد</button><button class="btn" onclick="r18ExportCustomers()">Excel العملاء</button></div></div><p class="hint">أضف العميل مرة واحدة، ثم اختره عند إنشاء المشروع أو تسجيل التحصيل. يمكنك فتح حسابه من هذه القائمة.</p><div class="filters"><input id="r18CustomerSearch" class="field" aria-label="بحث العملاء" placeholder="ابحث باسم العميل أو الهاتف أو البريد" oninput="r18FilterCustomers()"></div><div id="r18CustomerRows">${r18CustomerRows('')}</div></div>`}
function r18EditCustomer(enc=''){
  const c=enc?data.customers.find(c=>c.id===decodeURIComponent(enc)):null;if(enc&&!c)return alert('العميل غير موجود');
  modal(c?'تعديل بيانات العميل':'إضافة عميل جديد',`<form onsubmit="r18SaveCustomer(event,'${c?r14Encode(c.id):''}')"><div class="formgrid">${field('r18CustomerName','اسم العميل',c?.name||'','text','required')}${field('r18CustomerPhone','الهاتف',c?.phone||'','tel')}${field('r18CustomerEmail','البريد الإلكتروني',c?.email||'','email')}<label class="full">ملاحظات<textarea class="field" id="r18CustomerNote" rows="3">${esc(c?.note||'')}</textarea></label></div><p class="hint">${c?'تعديل الاسم يُحدّث اسم العميل في مشاريعه وسنداته ومطالباته مع حفظ المبالغ والروابط. لا يمكن دمج حسابين باسم واحد.':'سيظهر العميل في القوائم حتى إذا لم تُضف له مشروعًا بعد.'}</p><div class="modalfoot"><button class="btn primary" type="submit">حفظ العميل</button><button class="btn" type="button" onclick="closeModal()">إلغاء</button></div></form>`)
}
function r18SaveCustomer(e,enc){e.preventDefault();try{
  const id=enc?decodeURIComponent(enc):'',previous=data.customers.find(c=>c.id===id),name=val('r18CustomerName');
  const next=R18Clients.save(data,{id,name,phone:val('r18CustomerPhone'),email:val('r18CustomerEmail'),note:val('r18CustomerNote')});
  if(r14Persist(next,previous?'تعديل بيانات عميل':'إضافة عميل',{customerId:previous?.id||next.customers.at(-1).id,previousName:previous?.name,name:R18Clients.clean(name)}))r14Done('تم حفظ العميل وتحديث القوائم')
}catch(error){alert(error.message)}}
function r18ProjectForCustomer(enc){editProject();$('pclient').value=decodeURIComponent(enc);r18CloseCustomerOptions();r18CustomerHint()}
function r18CustomerTab(){return ['دليل العملاء',[['العميل','الهاتف','البريد الإلكتروني','الملاحظات','المشاريع','العقود','القبض الفعلي','غير موزع','متبقي العقود'],...data.customers.map(c=>{const t=customerTotals(c.name);return[c.name,c.phone||'',c.email||'',c.note||'',customerProjects(c.name).length,t.contracts,t.cash,t.unallocated,t.contractBalance]})]]}
function r18ExportCustomers(){exportTabs([r18CustomerTab()],'RONIX_Customers')}
const r18ExportAll=exportAllExcel;
exportAllExcel=function(){const original=exportTabs;try{exportTabs=(tabs,name)=>original([...tabs,r18CustomerTab()],name);r18ExportAll()}finally{exportTabs=original}};
const r18PreviewImport=r14PreviewImport;
r14PreviewImport=function(value,name){const next=R18Clients.sync(value);r18PreviewImport(next,name);$('modalBody').insertAdjacentHTML('afterbegin',`<p class="notice">قائمة العملاء: ${next.customers.length} عميل. تُنقل الأسماء الحالية دون دمج أرصدة أو تغيير سجلات الحساب.</p>`)};
titles.customerDirectory=['العملاء','إدارة العملاء واختيارهم في المشاريع والتحصيلات'];
const r18CustomerNav=document.createElement('button');r18CustomerNav.className='nav';r18CustomerNav.dataset.page='customerDirectory';r18CustomerNav.textContent='◉ العملاء';r18CustomerNav.onclick=()=>go('customerDirectory');document.querySelector('.nav[data-page="clients"]').before(r18CustomerNav);
const r18Render=render;
render=function(){if(page==='customerDirectory'&&!projectFocus&&!designerFocus){$('content').innerHTML=r18CustomerDirectory();return}r18Render()};
r15Changes=function(){modal('قائمة العملاء · V18',`<ol><li>قسم مستقل للعملاء مع الإضافة والتعديل والبحث وكشف الحساب.</li><li>قائمة منسدلة قابلة للبحث والكتابة في حقل عميل المشروع.</li><li>العميل الجديد يُحفظ مع المشروع ويظهر في قوائم التحصيل والمطالبات.</li><li>منع تكرار الأسماء الجديدة بسبب المسافات أو اختلاف حالة الأحرف.</li><li>نقل أسماء العملاء القديمة تلقائيًا وحفظ القائمة في JSON وExcel.</li></ol><p>بند الضريبة السابق ما زال بانتظار نوعه ونسبته. ربط Google لم يُفعّل في هذه النسخة.</p>`)};
r15Help.textContent='✓ ما الجديد · V18';r15Help.onclick=r15Changes;
document.title='RONIX V18 | العملاء والمشاريع';document.querySelector('.sublogo').textContent='PROJECT FINANCE · V18';document.querySelector('.sidebar-footer').innerHTML='RONIX V18 · جنيه مصري<br>حفظ محلي على هذا الجهاز والمتصفح';document.querySelector('.footer').textContent='RONIX V18 · احتفظ بنسخة احتياطية بعد جلسة العمل';
render();
