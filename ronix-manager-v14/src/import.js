let r14PendingImport=null;
function r14BytesBase64(bytes){let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s)}
function r14ImportSummary(v){return `${v.projects.length} مشروع · ${v.assignments.length} تكليف مصمم · ${v.payments.length} دفعة مصمم · ${v.claims.length} مطالبة · ${v.clientReceipts.length} سطر تحصيل · ${v.advances.length} مقدمة · ${v.projectExpenses.length} مصروف · ${Object.keys(v.receiptAttachments).length+Object.keys(v.paymentAttachments).length} مرفق`}
function r14PreviewImport(value,name){
  const next=R14.validate(value);r14PendingImport=next;
  const photos=next.projects.reduce((n,p)=>n+(p.photos||[]).length,0);
  const precise=next.projects.filter(p=>Number(p.contract)!==R14.cents(p.contract)/100);
  modal('مراجعة النسخة قبل الاستيراد',`<p><b>${esc(name)}</b></p><div class="notice">${esc(r14ImportSummary(next))}</div><p>${photos} صورة مرتبطة بالمشاريع.</p>${precise.length?`<p class="notice">${precise.length} عقد في النسخة القديمة يحتوي على أجزاء أصغر من القرش. تُحفظ القيم الأصلية كما هي، وتُقرب مبالغ العرض والتسوية لأقرب قرش. المشاريع: ${esc(precise.map(p=>p.code).join('، '))}.</p>`:''}<p>${next.clientReceipts.length?'التحصيلات مستقلة عن دفعات المصممين.':'هذه النسخة لا تحتوي على تحصيلات عملاء؛ دفعات المصممين تبقى في حساباتهم.'}</p><p>الاستيراد يستبدل البيانات الحالية. إذا كانت لديك سجلات حاليًا، سينزّل البرنامج نسخة منها قبل الاستبدال.</p><p class="hint">اختر أحدث نسخة احتياطية لديك. لا تُرفع البيانات إلى الإنترنت.</p><div class="modalfoot"><button class="btn primary" onclick="r14AcceptImport()">استيراد هذه النسخة</button><button class="btn" onclick="r14PendingImport=null;closeModal()">إلغاء</button></div>`);
}
function r14AcceptImport(){
  if(!r14PendingImport)return;
  if(data.projects.length||data.clientReceipts.length||data.payments.length)backup();
  if(r14BootIssue&&r14Disk)r14ExportUnreadable();
  const issue=r14BootIssue;r14BootIssue='';
  if(r14Persist(r14PendingImport,'استيراد نسخة احتياطية')){r14PendingImport=null;closeModal();go('dashboard');notify('تم استيراد البيانات. راجع الأرصدة ثم حمّل نسخة احتياطية V15.')}else r14BootIssue=issue;
}
function r14ExportUnreadable(){if(r14Disk)download('RONIX_Stored_Data_Before_Recovery.json',r14Disk,'application/json')}
async function r14ReadArchive(file){
  if(file.size>40*1024*1024)throw Error('حجم الملف يتجاوز 40 ميجابايت');
  let total=0,entries=0;
  const archive=fflate.unzipSync(new Uint8Array(await file.arrayBuffer()),{filter(entry){
    if(++entries>1000)throw Error('عدد ملفات الأرشيف كبير جدًا');
    if(entry.name.split('/').includes('..')||entry.name.startsWith('/'))throw Error('مسار غير صالح في الأرشيف');
    const wanted=/\.json$/i.test(entry.name)||/\/project_media\/[^/]+\.(?:png|jpe?g|webp|gif)$/i.test('/'+entry.name);
    if(wanted){total+=entry.originalSize;if(total>30*1024*1024||entry.originalSize>20*1024*1024)throw Error('محتوى الأرشيف يتجاوز الحد المدعوم')}
    return wanted;
  }});
  const backups=[];
  for(const [name,bytes] of Object.entries(archive))if(/\.json$/i.test(name)){
    try{const d=JSON.parse(fflate.strFromU8(bytes));if(Array.isArray(d.projects)&&Array.isArray(d.payments)&&Array.isArray(d.assignments))backups.push({name,data:d})}catch{}
  }
  if(!backups.length)throw Error('لا توجد نسخة حسابات JSON داخل الملف. صدّر نسخة احتياطية من البرنامج القديم ثم استوردها هنا.');
  function hydrate(item){const d=R14.normalize(item.data),prefix=item.name.slice(0,item.name.lastIndexOf('/')+1);for(const p of d.projects)for(const photo of p.photos||[]){if(!photo.src.startsWith('project_media/'))continue;const bytes=archive[prefix+photo.src]||archive[photo.src];if(!bytes)throw Error('صورة ناقصة من الأرشيف: '+photo.src);const ext=photo.src.split('.').pop().toLowerCase(),mime=ext==='jpg'?'jpeg':ext;photo.src='data:image/'+mime+';base64,'+r14BytesBase64(bytes)}return d}
  if(backups.length===1){r14PreviewImport(hydrate(backups[0]),file.name);return}
  window.r14ChooseArchive=function(index){try{const item=backups[Number(index)];r14PreviewImport(hydrate(item),item.name);window.r14ChooseArchive=null}catch(e){alert(e.message)}};
  modal('اختر نسخة الحسابات من الأرشيف',`<p>الملف يحتوي على أكثر من نسخة؛ اختر النسخة التي تريد استعادتها.</p><select class="field" id="r14ArchiveChoice">${backups.map((b,i)=>`<option value="${i}">${esc(b.name)} · ${b.data.projects.length} مشروع</option>`).join('')}</select><div class="modalfoot"><button class="btn primary" onclick="r14ChooseArchive(val('r14ArchiveChoice'))">مراجعة النسخة</button></div>`);
}
restoreData=async function(input){const file=input.files?.[0];if(!file)return;input.value='';try{if(file.size>40*1024*1024)throw Error('الملف أكبر من 40 ميجابايت');if(/\.zip$/i.test(file.name))await r14ReadArchive(file);else r14PreviewImport(JSON.parse(await file.text()),file.name)}catch(e){r14PendingImport=null;alert('تعذر الاستيراد دون تغيير البيانات الحالية:\n'+e.message)}};
backup=function(){download('RONIX_V15_Backup_'+r14Today()+'.json',JSON.stringify({...data,schemaVersion:15,currency:'EGP',exportedAt:new Date().toISOString()},null,2),'application/json;charset=utf-8');r14OldNotify('نُزّلت النسخة الاحتياطية بما فيها الصور والمرفقات المحفوظة')};
function r14Help(){modal('بدء العمل على النسخة المحسنة',`<p><b>هذا تحديث للبرنامج الأصلي RONIX V13.</b> جميع الأقسام الأصلية موجودة في القائمة.</p><ol><li>لجلب النسخة التي أرسلتها، اضغط «استيراد» واختر ملف ZIP الأصلي. سينقل الحسابات وصور المشاريع من النسخة الاحتياطية الموجودة فيه.</li><li>إذا عملت على البرنامج القديم بعد تاريخ نسخته الاحتياطية، صدّر منه أحدث ملف JSON واستورده بدلًا منها.</li><li>راجع عدد السجلات ثم اعتمد الاستيراد. افتح «فحص البيانات» وراجع كشف عميل ومصمم.</li><li>سجّل القبض من العملاء ووزعه جزئيًا أو كليًا. الباقي يبقى باسم العميل. سجّل دفعات المصممين في قسم الدفعات.</li><li>من المطالبات، اضغط «مطابقة» واربط المبالغ المقبوضة بالمطالبة المناسبة.</li><li>نزّل نسخة احتياطية بعد جلسة العمل؛ البيانات تحفظ في هذا المتصفح على هذا الجهاز.</li></ol><p>Excel للتقارير، وJSON لاستعادة جميع البيانات. لا تجمع القبض مع المطالبات، ولا تجمع دفعات المصمم مع أتعابه كتكلفة ثانية.</p><div class="modalfoot"><button class="btn primary" onclick="closeModal();$('restore').click()">استيراد ZIP أو JSON</button><button class="btn" onclick="closeModal()">إغلاق</button></div>`)}
const r14Render=render;
render=function(){
  r14Render();
  const content=$('content');
  if(r14BootIssue)content.insertAdjacentHTML('afterbegin',`<div class="panel"><h2>البيانات المحفوظة تحتاج استعادة</h2><p>${esc(r14BootIssue)}</p><button class="btn" onclick="r14ExportUnreadable()">تنزيل البيانات قبل الإصلاح</button><button class="btn primary" onclick="$('restore').click()">استيراد نسخة سليمة</button></div>`);
  else if(!data.projects.length)content.insertAdjacentHTML('afterbegin',`<div class="panel r14-welcome"><h2>برنامجك الأصلي، مع تحسين الحسابات · V15</h2><p>ابدأ باستيراد ملف ZIP القديم لنقل المشاريع والمصممين والدفعات والمطالبات والصور.</p><div class="actions"><button class="btn primary" onclick="$('restore').click()">استيراد برنامجك القديم ZIP / JSON</button><button class="btn" onclick="editProject()">إنشاء أول مشروع</button><button class="btn" onclick="r14Help()">طريقة العمل</button></div><p class="hint">تُقرأ الملفات على جهازك فقط. لا توجد بيانات عملاء مضمنة في ملف التحديث.</p></div>`);
};
const r14Modal=modal;
modal=function(title,body){r14Modal(title.replaceAll('*** ',''),body);for(const input of $('modalBody').querySelectorAll('input[type=number]')){input.step='0.01';if(input.min==='1')input.min='0.01'}$('overlay').setAttribute('role','dialog');$('overlay').setAttribute('aria-modal','true');$('overlay').setAttribute('aria-labelledby','modalTitle')};
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal()});
$('restore').accept='.json,.zip';
document.querySelector('.logo').innerHTML=`<img class="r14-logo" src="${R14_LOGO}" alt="RONIX">`;
document.querySelector('.sublogo').textContent='PROJECT FINANCE · V15';
document.querySelector('.sidebar-footer').innerHTML='RONIX V15 · جنيه مصري<br>حفظ محلي على هذا الجهاز والمتصفح';
const help=document.createElement('button');help.className='nav';help.textContent='؟ بدء العمل والمساعدة';help.onclick=r14Help;document.querySelector('.sidebar-footer').before(help);
document.querySelector('.footer').textContent='RONIX V15 · احتفظ بنسخة احتياطية بعد جلسة العمل';
for(const b of document.querySelectorAll('.nav'))b.innerHTML=b.innerHTML.replaceAll('*** ','');
document.title='RONIX V15 | المشاريع والمصممون والتحصيل والمطالبات';
render();
