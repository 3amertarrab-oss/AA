function r16PhotoHelp(){const missing=R16.review(data).filter(n=>n.type==='photo').length;modal('استعادة صور المشاريع',`<p>صور تحتاج تضمينًا: <b>${missing}</b>.</p><p>اختر ZIP الأصلي الذي يحتوي مجلد project_media. ستُطابق الصور بمساراتها المسجلة وتُضاف إلى بيانات المشاريع الحالية، دون استبدال الحسابات أو استيراد حركات قديمة.</p><label class="btn primary">اختيار ZIP الصور<input class="hide" type="file" accept=".zip" onchange="r16RestorePhotos(this)"></label><p>الصور المضافة حديثًا تبقى كما هي. بعد الاستعادة نزّل JSON جديدًا؛ سيحتوي الصور نفسها.</p>`)}
async function r16RestorePhotos(input){
 const file=input.files?.[0];if(!file)return;input.value='';
 try{
  if(file.size>40*1024*1024)throw Error('حجم ZIP يتجاوز 40 ميجابايت');
  const snapshot=JSON.stringify(data);let count=0,total=0;
  const entries=fflate.unzipSync(new Uint8Array(await file.arrayBuffer()),{filter(e){
   if(++count>1000||e.name.split('/').includes('..')||e.name.startsWith('/'))throw Error('أرشيف غير صالح');
   const wanted=/(?:^|\/)project_media\/[^/]+\.(?:png|jpe?g|webp|gif)$/i.test(e.name);
   if(wanted&&(e.originalSize>15*1024*1024||(total+=e.originalSize)>30*1024*1024))throw Error('صور الأرشيف تتجاوز الحجم المدعوم');
   return wanted;
  }});
  const result=R16Media.recover(data,entries,r14BytesBase64);
  if(!result.restored.length)throw Error(result.missing.length?'لم توجد الصور المطلوبة بمساراتها في الأرشيف.':'الصور الحالية مضمنة بالفعل، أو لا توجد صور مسجلة.');
  for(const item of result.restored){const photo=result.data.projects.find(p=>p.code===item.code).photos.find(ph=>ph.id===item.photoId),image=new Image();image.src=photo.src;await image.decode()}
  if(JSON.stringify(data)!==snapshot)throw Error('تغيرت البيانات أثناء قراءة الصور؛ أعد اختيار الملف');
  if(r14Persist(result.data,'استعادة صور المشاريع دون استبدال الحسابات',{restoredPhotos:result.restored,missingPhotos:result.missing})){
   r14Done('استعيدت '+result.restored.length+' صورة. المتبقي دون مصدر: '+result.missing.length);r16PhotoHelp();
  }
 }catch(e){alert('تعذرت استعادة الصور: '+e.message)}
}
const r16Backup=backup;
backup=function(){r16Backup();const missing=R16.review(data).filter(n=>n.type==='photo').length;if(missing)r14OldNotify('نُزلت الحسابات، لكن '+missing+' صورة مرتبطة بملفات خارجية. استخدم «استعادة صور المشاريع» ثم صدّر نسخة جديدة.')};
const r16PhotoButton=document.createElement('button');r16PhotoButton.className='nav';r16PhotoButton.textContent='▧ استعادة صور المشاريع';r16PhotoButton.onclick=r16PhotoHelp;document.querySelector('.sidebar-footer').before(r16PhotoButton);
// An existing V15 store is upgraded once, with an audit entry and atomic storage.
if(!r14BootIssue&&data.projects.length&&(data.schemaVersion||0)<16){r14Persist(data,'ترقية الروابط الحسابية إلى V16');render()}
