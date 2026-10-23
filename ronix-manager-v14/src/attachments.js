/* Transfer evidence is saved atomically with its payment/receipt, and in JSON backups. */
function r14ProofTarget(kind,id){
  if(kind==='payment')return data.payments.find(p=>p.id===id);
  return data.advances.find(a=>a.id===id)||data.clientReceipts.find(r=>(r.batchId||r.id)===id);
}
function r14ProofAction(kind,id){return `<button class="link r14-proof-action" onclick="r14ManageProof('${kind}','${r14Encode(id)}')">${r14ProofFile(kind,id)?'عرض المستند':'إرفاق مستند'}</button>`}
function r14MountProof(form,kind,id=''){
  form._r14Proof={kind,id,file:id?r14ProofFile(kind,id):null,changed:false,loading:false,error:'',version:0};
  const block=document.createElement('section');block.className='r14-proof';
  block.innerHTML=`<h3>مستند التحويل</h3><label>إرفاق صورة التحويل أو ملف PDF<input class="r14-proof-input field" type="file" accept="image/jpeg,image/png,image/webp,image/gif,application/pdf" onchange="r14ChooseProof(this)"></label><p class="hint">اختياري · حتى 2 ميجابايت · يُحفظ مع الحركة والنسخة الاحتياطية.</p><div class="r14-proof-preview" aria-live="polite"></div>`;
  form.querySelector('.modalfoot').before(block);r14RenderProof(form);
}
function r14RenderProof(form){
  const s=form._r14Proof,el=form.querySelector('.r14-proof-preview');if(!s||!el)return;
  const file=s.file,isImage=file?.data.startsWith('data:image/');
  el.innerHTML=`${s.loading?'<p>جارٍ تجهيز المستند…</p>':''}${s.error?`<p class="r14-due" role="alert">${esc(s.error)}</p>`:''}${file?`${isImage?`<img class="r14-proof-image" src="${esc(file.data)}" alt="صورة مستند التحويل">`:'<div class="r14-proof-pdf">مستند PDF</div>'}<p class="r14-proof-name">${esc(file.name||'مستند التحويل')}</p><div class="actions"><button type="button" class="btn" onclick="r14OpenProof(this.closest('form'))">فتح بالحجم الكامل</button><button type="button" class="btn" onclick="r14DownloadProof(this.closest('form'))">تنزيل المستند</button><button type="button" class="btn danger" onclick="r14RemoveProof(this.closest('form'))">إزالة المستند</button></div>`:'<p class="hint">لا يوجد مستند مرفق.</p>'}${s.error&&!file?'<button type="button" class="btn" onclick="r14RemoveProof(this.closest(\'form\'))">إلغاء الملف المحدد</button>':''}`;
  for(const button of form.querySelectorAll('button[type=submit]'))button.disabled=s.loading;
}
async function r14ReadProof(file){
  if(!file.size||file.size>2*1024*1024)throw Error('اختر مستندًا غير فارغ بحجم لا يتجاوز 2 ميجابايت.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const starts=(...v)=>v.every((b,i)=>bytes[i]===b);
  const ascii=(a,b)=>String.fromCharCode(...bytes.slice(a,b));
  let mime=starts(0xff,0xd8,0xff)?'image/jpeg':starts(137,80,78,71,13,10,26,10)?'image/png':ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'?'image/webp':/^GIF8[79]a$/.test(ascii(0,6))?'image/gif':ascii(0,5)==='%PDF-'?'application/pdf':'';
  if(!mime)throw Error('اختر صورة JPG أو PNG أو WebP أو GIF أو ملف PDF صالحًا.');
  const encoded='data:'+mime+';base64,'+r14BytesBase64(bytes);
  if(mime.startsWith('image/')){const img=new Image();img.src=encoded;try{await img.decode()}catch{throw Error('تعذرت قراءة الصورة؛ اختر صورة سليمة.')}}
  return {name:file.name,mime,data:encoded};
}
async function r14ChooseProof(input){
  const file=input.files?.[0],form=input.closest('form'),s=form?._r14Proof;if(!file||!s)return;
  const version=++s.version;s.loading=true;s.error='';r14RenderProof(form);
  try{const ready=await r14ReadProof(file);if(version===s.version){s.file=ready;s.changed=true}}
  catch(e){if(version===s.version)s.error=e.message}
  finally{if(version===s.version){s.loading=false;if(form.isConnected)r14RenderProof(form)}}
}
function r14RemoveProof(form){const s=form._r14Proof;s.version++;s.file=null;s.changed=true;s.loading=false;s.error='';form.querySelector('.r14-proof-input').value='';r14RenderProof(form)}
function r14ProofReady(form){const s=form?._r14Proof;if(s?.loading)throw Error('انتظر حتى يكتمل تجهيز المستند.');if(s?.error)throw Error('صحح المستند المحدد أو ألغِه قبل الحفظ.');return s}
function r14AttachTo(next,form,kind,id){
  const s=r14ProofReady(form);if(!s||!s.changed)return;
  if(s.kind!==kind||(s.id&&s.id!==id))throw Error('المستند لا يخص هذه الحركة.');
  const store=next[r14ProofStore(kind)];
  if(s.file)Object.defineProperty(store,id,{value:R14.copy(s.file),enumerable:true,writable:true,configurable:true});else delete store[id];
}
function r14OpenProof(form){
  const file=form._r14Proof.file;if(!file)return;
  const mime=file.data.slice(5,file.data.indexOf(';')),bytes=Uint8Array.from(atob(file.data.split(',')[1]),c=>c.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}));window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);
}
function r14DownloadProof(form){const file=form._r14Proof.file;if(!file)return;const a=document.createElement('a');a.href=file.data;a.download=file.name||'RONIX-Transfer';document.body.appendChild(a);a.click();a.remove()}
function r14ManageProof(kind,enc){
  const id=decodeURIComponent(enc),record=r14ProofTarget(kind,id);if(!record)return alert('الحركة غير موجودة.');
  const label=kind==='payment'?'دفعة المصمم / '+record.designer:'تحصيل العميل / '+(record.client||getP(record.code)?.client||'');
  modal('مستند التحويل',`<form onsubmit="r14SaveProof(event,'${kind}','${enc}')"><p><b>${esc(label)}</b></p><p>${esc(record.date)}${record.code?' · '+esc(record.code):''}</p><div class="modalfoot"><button type="submit" class="btn primary">حفظ المستند</button><button type="button" class="btn" onclick="closeModal()">إغلاق</button></div></form>`);
  r14MountProof($('modalBody').querySelector('form'),kind,id);
}
function r14SaveProof(e,kind,enc){
  e.preventDefault();try{const id=decodeURIComponent(enc),form=e.target;r14ProofReady(form);if(!r14ProofTarget(kind,id))throw Error('الحركة غير موجودة.');
    if(r14Change('حفظ مستند تحويل',d=>r14AttachTo(d,form,kind,id),{kind,id}))r14Done('تم حفظ مستند التحويل');
  }catch(e){alert(e.message)}
}
const r14PaymentForm=openPayment;
openPayment=function(code,designer,id){r14PaymentForm(code,designer,id);r14MountProof($('modalBody').querySelector('form'),'payment',id?decodeURIComponent(id):'')};
const r14ReceiptForm=openCustomerReceipt;
openCustomerReceipt=function(client='',batch=''){r14ReceiptForm(client,batch);r14MountProof($('modalBody').querySelector('form'),'receipt',batch?decodeURIComponent(batch):'')};
const r14AdvanceForm=openAdvance;
openAdvance=function(){r14AdvanceForm();r14MountProof($('modalBody').querySelector('form'),'receipt')};
// Retain the old advanced-finance upload entry, using the same validation and atomic save.
saveReceiptAttachment=async function(enc,input){
  const file=input.files?.[0];if(!file)return;const id=decodeURIComponent(enc),disk=r14Disk;
  try{const proof=await r14ReadProof(file);if(disk!==r14Disk)throw Error('تغيرت الحسابات أثناء تجهيز المستند؛ اختر الملف مرة أخرى.');if(!r14ProofTarget('receipt',id))throw Error('السند غير موجود.');
    if(r14Change('إرفاق مستند قبض',d=>Object.defineProperty(d.receiptAttachments,id,{value:proof,enumerable:true,writable:true,configurable:true}),{id})){render();notify('تم حفظ مستند القبض')}
  }catch(e){alert(e.message)}finally{input.value=''}
};
showReceiptAttachment=function(enc){r14ManageProof('receipt',enc)};
